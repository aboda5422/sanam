-- =============================================================================
-- Catalog unify Phase 2: branch-scoped read view + POS deduct + admin save RPC
-- Apps switch readers to catalog_branch_products; writers use catalog_admin_save_product.
-- Legacy products rows remain for history FKs; dual-write from Phase 1 still helps.
-- =============================================================================

-- Per-branch category until categories are unified later
ALTER TABLE public.product_branch
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL;

UPDATE public.product_branch pb
SET category_id = p.category_id
FROM public.products p
WHERE pb.legacy_product_id = p.id
  AND pb.category_id IS NULL
  AND p.category_id IS NOT NULL;

UPDATE public.product_branch pb
SET category_id = p.category_id
FROM public.products p
WHERE pb.product_id = p.id
  AND pb.legacy_product_id IS NULL
  AND pb.category_id IS NULL
  AND p.category_id IS NOT NULL;

-- Flat, branch-scoped catalog (compatible with Product type)
CREATE OR REPLACE VIEW public.catalog_branch_products
WITH (security_invoker = true)
AS
SELECT
  coalesce(pb.legacy_product_id, pb.product_id) AS id,
  pb.product_id AS catalog_id,
  pb.legacy_product_id,
  pb.branch_id,
  p.name,
  p.name_en,
  pb.price,
  pb.original_price,
  p.image,
  coalesce(pb.category_id, p.category_id) AS category_id,
  p.unit,
  p.description,
  pb.is_active,
  pb.is_featured,
  pb.sort_order,
  p.barcode,
  p.brand,
  p.origin_country,
  p.size_label,
  p.product_form,
  p.gallery_urls,
  p.extra_label,
  pb.stock_quantity,
  pb.cost_price,
  p.external_id,
  p.created_at,
  pb.updated_at
FROM public.product_branch pb
JOIN public.products p ON p.id = pb.product_id;

GRANT SELECT ON public.catalog_branch_products TO anon, authenticated;

COMMENT ON VIEW public.catalog_branch_products IS
  'Phase 2: one row per (canonical product × branch) with branch stock/price/active. id = legacy or canonical.';

-- Resolve product_branch row for a branch given legacy or canonical id
CREATE OR REPLACE FUNCTION public.catalog_resolve_branch_product(p_branch_id uuid, p_product_id uuid)
RETURNS public.product_branch
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pb public.product_branch%ROWTYPE;
BEGIN
  SELECT * INTO v_pb
  FROM public.product_branch
  WHERE branch_id = p_branch_id
    AND legacy_product_id = p_product_id
  LIMIT 1;
  IF FOUND THEN RETURN v_pb; END IF;

  SELECT * INTO v_pb
  FROM public.product_branch
  WHERE branch_id = p_branch_id
    AND product_id = p_product_id
  LIMIT 1;
  IF FOUND THEN RETURN v_pb; END IF;

  -- Map legacy → canonical then overlay
  SELECT pb.* INTO v_pb
  FROM public.product_id_map m
  JOIN public.product_branch pb
    ON pb.product_id = m.canonical_product_id
   AND pb.branch_id = p_branch_id
  WHERE m.legacy_product_id = p_product_id
  LIMIT 1;

  RETURN v_pb; -- may be NULL rowtype if not found
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_resolve_branch_product(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_resolve_branch_product(uuid, uuid) TO authenticated;

-- Admin save: shared catalog + per-branch overlay (price/stock/active/category)
CREATE OR REPLACE FUNCTION public.catalog_admin_save_product(
  p_branch_id uuid,
  p_product_id uuid DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_name_en text DEFAULT NULL,
  p_price numeric DEFAULT 0,
  p_original_price numeric DEFAULT NULL,
  p_image text DEFAULT NULL,
  p_unit text DEFAULT 'قطعة',
  p_description text DEFAULT NULL,
  p_barcode text DEFAULT NULL,
  p_stock_quantity integer DEFAULT 0,
  p_cost_price numeric DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_is_active boolean DEFAULT true,
  p_is_featured boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_canonical uuid;
  v_legacy uuid;
  v_barcode text := nullif(btrim(coalesce(p_barcode, '')), '');
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  b uuid;
BEGIN
  IF v_caller IS NULL
     OR (
       NOT public.has_role(v_caller, 'site_admin'::app_role)
       AND NOT public.has_role(v_caller, 'store_admin'::app_role)
       AND NOT public.has_role(v_caller, 'inventory'::app_role)
     ) THEN
    RAISE EXCEPTION 'صلاحيات غير كافية';
  END IF;

  IF p_branch_id IS NULL THEN RAISE EXCEPTION 'الفرع مطلوب'; END IF;
  IF v_name IS NULL THEN RAISE EXCEPTION 'اسم المنتج مطلوب'; END IF;

  IF public.has_role(v_caller, 'store_admin'::app_role)
     AND NOT public.has_role(v_caller, 'site_admin'::app_role) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.admin_branch_access a
      WHERE a.user_id = v_caller AND a.branch_id = p_branch_id
    ) THEN
      RAISE EXCEPTION 'لا يمكنك التعديل على هذا الفرع';
    END IF;
  END IF;

  PERFORM set_config('app.catalog_sync', '1', true);

  -- Resolve canonical
  IF p_product_id IS NOT NULL THEN
    SELECT canonical_product_id INTO v_canonical
    FROM public.product_id_map
    WHERE legacy_product_id = p_product_id;
    IF v_canonical IS NULL THEN
      v_canonical := p_product_id;
    END IF;
  ELSIF v_barcode IS NOT NULL THEN
    SELECT m.canonical_product_id INTO v_canonical
    FROM public.product_id_map m
    JOIN public.products p ON p.id = m.legacy_product_id
    WHERE btrim(p.barcode) = v_barcode
    ORDER BY m.created_at
    LIMIT 1;
  END IF;

  IF v_canonical IS NULL THEN
    -- Brand-new catalog product (owned by this branch as canonical row)
    INSERT INTO public.products (
      name, name_en, price, original_price, image, unit, description, barcode,
      stock_quantity, cost_price, category_id, is_active, is_featured, branch_id
    ) VALUES (
      v_name, nullif(btrim(coalesce(p_name_en, '')), ''), coalesce(p_price, 0), p_original_price,
      nullif(p_image, ''), coalesce(nullif(btrim(p_unit), ''), 'قطعة'),
      nullif(p_description, ''), v_barcode,
      coalesce(p_stock_quantity, 0), p_cost_price, p_category_id,
      coalesce(p_is_active, true), coalesce(p_is_featured, false), p_branch_id
    )
    RETURNING id INTO v_canonical;

    v_legacy := v_canonical;

    INSERT INTO public.product_id_map (legacy_product_id, canonical_product_id, match_method, match_key)
    VALUES (
      v_canonical, v_canonical, 'singleton',
      CASE WHEN v_barcode IS NOT NULL THEN v_barcode ELSE NULL END
    )
    ON CONFLICT (legacy_product_id) DO UPDATE
    SET canonical_product_id = EXCLUDED.canonical_product_id;

  ELSE
    -- Update shared catalog fields on canonical
    UPDATE public.products
    SET
      name = v_name,
      name_en = nullif(btrim(coalesce(p_name_en, '')), ''),
      image = nullif(p_image, ''),
      unit = coalesce(nullif(btrim(p_unit), ''), unit, 'قطعة'),
      description = nullif(p_description, ''),
      barcode = coalesce(v_barcode, barcode),
      updated_at = now()
    WHERE id = v_canonical;

    -- Legacy row for this branch (if any)
    SELECT pb.legacy_product_id INTO v_legacy
    FROM public.product_branch pb
    WHERE pb.product_id = v_canonical AND pb.branch_id = p_branch_id;

    IF v_legacy IS NULL THEN
      SELECT m.legacy_product_id INTO v_legacy
      FROM public.product_id_map m
      JOIN public.products p ON p.id = m.legacy_product_id
      WHERE m.canonical_product_id = v_canonical AND p.branch_id = p_branch_id
      ORDER BY CASE WHEN p.is_active THEN 0 ELSE 1 END, p.created_at
      LIMIT 1;
    END IF;

    IF v_legacy IS NOT NULL THEN
      UPDATE public.products
      SET
        name = v_name,
        name_en = nullif(btrim(coalesce(p_name_en, '')), ''),
        price = coalesce(p_price, 0),
        original_price = p_original_price,
        image = nullif(p_image, ''),
        unit = coalesce(nullif(btrim(p_unit), ''), unit, 'قطعة'),
        description = nullif(p_description, ''),
        barcode = coalesce(v_barcode, barcode),
        stock_quantity = coalesce(p_stock_quantity, 0),
        cost_price = p_cost_price,
        category_id = coalesce(p_category_id, category_id),
        is_active = coalesce(p_is_active, is_active),
        is_featured = coalesce(p_is_featured, is_featured),
        updated_at = now()
      WHERE id = v_legacy;
    ELSIF coalesce(p_is_active, false) OR coalesce(p_stock_quantity, 0) <> 0 THEN
      -- First time this branch carries the product → create branch-local legacy for FK/compat
      INSERT INTO public.products (
        name, name_en, price, original_price, image, unit, description, barcode,
        stock_quantity, cost_price, category_id, is_active, is_featured, branch_id
      )
      SELECT
        v_name, nullif(btrim(coalesce(p_name_en, '')), ''), coalesce(p_price, 0), p_original_price,
        coalesce(nullif(p_image, ''), image), coalesce(nullif(btrim(p_unit), ''), unit, 'قطعة'),
        coalesce(nullif(p_description, ''), description), coalesce(v_barcode, barcode),
        coalesce(p_stock_quantity, 0), p_cost_price, p_category_id,
        coalesce(p_is_active, true), coalesce(p_is_featured, false), p_branch_id
      FROM public.products WHERE id = v_canonical
      RETURNING id INTO v_legacy;

      INSERT INTO public.product_id_map (legacy_product_id, canonical_product_id, match_method, match_key)
      VALUES (
        v_legacy, v_canonical,
        CASE WHEN v_barcode IS NOT NULL THEN 'barcode' ELSE 'exact_name' END,
        coalesce(v_barcode, lower(v_name))
      )
      ON CONFLICT (legacy_product_id) DO NOTHING;
    END IF;
  END IF;

  -- Upsert this branch overlay
  INSERT INTO public.product_branch (
    product_id, branch_id, legacy_product_id,
    stock_quantity, price, original_price, cost_price,
    is_active, is_featured, sort_order, category_id
  ) VALUES (
    v_canonical, p_branch_id, v_legacy,
    coalesce(p_stock_quantity, 0), coalesce(p_price, 0), p_original_price, p_cost_price,
    coalesce(p_is_active, true), coalesce(p_is_featured, false), 0, p_category_id
  )
  ON CONFLICT (product_id, branch_id) DO UPDATE
  SET
    legacy_product_id = coalesce(EXCLUDED.legacy_product_id, public.product_branch.legacy_product_id),
    stock_quantity = EXCLUDED.stock_quantity,
    price = EXCLUDED.price,
    original_price = EXCLUDED.original_price,
    cost_price = EXCLUDED.cost_price,
    is_active = EXCLUDED.is_active,
    is_featured = EXCLUDED.is_featured,
    category_id = coalesce(EXCLUDED.category_id, public.product_branch.category_id),
    updated_at = now();

  -- Ensure other branches have a zero placeholder
  FOR b IN SELECT id FROM public.branches WHERE id <> p_branch_id
  LOOP
    INSERT INTO public.product_branch (
      product_id, branch_id, legacy_product_id,
      stock_quantity, price, original_price, cost_price,
      is_active, is_featured, sort_order, category_id
    ) VALUES (
      v_canonical, b, NULL,
      0, coalesce(p_price, 0), p_original_price, p_cost_price,
      false, false, 0, NULL
    )
    ON CONFLICT (product_id, branch_id) DO NOTHING;
  END LOOP;

  INSERT INTO public.store_settings (key, value, updated_at)
  VALUES ('catalog_unify_phase', jsonb_build_object('phase', 2, 'updated_at', now()), now())
  ON CONFLICT (key) DO UPDATE
  SET value = public.store_settings.value || jsonb_build_object('phase', 2, 'updated_at', now()),
      updated_at = now();

  RETURN jsonb_build_object(
    'ok', true,
    'catalog_id', v_canonical,
    'legacy_product_id', v_legacy,
    'branch_id', p_branch_id,
    'id', coalesce(v_legacy, v_canonical)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_admin_save_product(
  uuid, uuid, text, text, numeric, numeric, text, text, text, text, integer, numeric, uuid, boolean, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_admin_save_product(
  uuid, uuid, text, text, numeric, numeric, text, text, text, text, integer, numeric, uuid, boolean, boolean
) TO authenticated;

-- Toggle active/featured for a specific branch overlay
CREATE OR REPLACE FUNCTION public.catalog_admin_set_branch_flag(
  p_branch_id uuid,
  p_product_id uuid,
  p_field text,
  p_value boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_pb public.product_branch%ROWTYPE;
BEGIN
  IF v_caller IS NULL
     OR (
       NOT public.has_role(v_caller, 'site_admin'::app_role)
       AND NOT public.has_role(v_caller, 'store_admin'::app_role)
       AND NOT public.has_role(v_caller, 'inventory'::app_role)
     ) THEN
    RAISE EXCEPTION 'صلاحيات غير كافية';
  END IF;
  IF p_field NOT IN ('is_active', 'is_featured') THEN
    RAISE EXCEPTION 'حقل غير مدعوم';
  END IF;

  PERFORM set_config('app.catalog_sync', '1', true);
  v_pb := public.catalog_resolve_branch_product(p_branch_id, p_product_id);
  IF v_pb.id IS NULL THEN
    RAISE EXCEPTION 'المنتج غير موجود في هذا الفرع';
  END IF;

  IF p_field = 'is_active' THEN
    UPDATE public.product_branch SET is_active = p_value, updated_at = now() WHERE id = v_pb.id;
  ELSE
    UPDATE public.product_branch SET is_featured = p_value, updated_at = now() WHERE id = v_pb.id;
  END IF;

  IF v_pb.legacy_product_id IS NOT NULL THEN
    IF p_field = 'is_active' THEN
      UPDATE public.products SET is_active = p_value, updated_at = now() WHERE id = v_pb.legacy_product_id;
    ELSE
      UPDATE public.products SET is_featured = p_value, updated_at = now() WHERE id = v_pb.legacy_product_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'product_id', v_pb.product_id, 'branch_id', p_branch_id, p_field, p_value);
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_admin_set_branch_flag(uuid, uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_admin_set_branch_flag(uuid, uuid, text, boolean) TO authenticated;

-- ---------- pos_create_sale: resolve + deduct via product_branch ----------
CREATE OR REPLACE FUNCTION public.pos_create_sale(
  p_shift_id uuid,
  p_items jsonb,
  p_payments jsonb,
  p_discount_total numeric DEFAULT 0,
  p_customer_name text DEFAULT NULL::text,
  p_customer_phone text DEFAULT NULL::text,
  p_customer_vat text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text,
  p_coupon_code text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_shift public.pos_shifts%ROWTYPE;
  v_feat jsonb;
  v_tax_rate numeric(5,2) := 15;
  v_include_tax boolean := true;
  v_allow_neg boolean := false;
  v_item jsonb;
  v_pay jsonb;
  v_product public.products%ROWTYPE;
  v_pb public.product_branch%ROWTYPE;
  v_sale_product_id uuid;
  v_qty numeric(12,3);
  v_unit numeric(12,2);
  v_line_disc numeric(12,2);
  v_line_net numeric(12,2);
  v_line_tax numeric(12,2);
  v_line_total numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_tax_total numeric(12,2) := 0;
  v_manual_discount numeric(12,2) := GREATEST(0, COALESCE(p_discount_total, 0));
  v_coupon_discount numeric(12,2) := 0;
  v_discount numeric(12,2);
  v_total numeric(12,2);
  v_pay_sum numeric(12,2) := 0;
  v_sale_id uuid;
  v_invoice text;
  v_stock numeric;
  v_coupon public.coupons%ROWTYPE;
  v_coupon_id uuid := NULL;
  v_coupon_code_out text := NULL;
  v_preview jsonb;
  v_new_balance numeric(12,2);
  v_payable_before_coupon numeric(12,2);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_cashier() THEN
    RAISE EXCEPTION 'صلاحيات غير كافية';
  END IF;
  IF NOT COALESCE(public.pos_feature_enabled(), false) THEN
    RAISE EXCEPTION 'نظام الكاشير غير مفعّل';
  END IF;

  SELECT * INTO v_shift FROM public.pos_shifts WHERE id = p_shift_id FOR UPDATE;
  IF NOT FOUND OR v_shift.status <> 'open' THEN
    RAISE EXCEPTION 'لا توجد وردية مفتوحة';
  END IF;
  IF v_shift.cashier_id <> auth.uid()
     AND NOT public.has_role(auth.uid(), 'site_admin')
     AND NOT public.has_role(auth.uid(), 'store_admin') THEN
    RAISE EXCEPTION 'الوردية لا تخصك';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'السلة فارغة';
  END IF;
  IF p_payments IS NULL OR jsonb_typeof(p_payments) <> 'array' OR jsonb_array_length(p_payments) = 0 THEN
    RAISE EXCEPTION 'أضف طريقة دفع واحدة على الأقل';
  END IF;

  SELECT value INTO v_feat FROM public.store_settings WHERE key = 'pos_features';
  IF v_feat IS NOT NULL THEN
    v_tax_rate := COALESCE((v_feat->>'tax_rate')::numeric, 15);
    v_include_tax := COALESCE((v_feat->>'prices_include_tax')::boolean, true);
    v_allow_neg := COALESCE((v_feat->>'allow_negative_stock')::boolean, false);
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := COALESCE((v_item->>'quantity')::numeric, 0);
    IF v_qty <= 0 THEN RAISE EXCEPTION 'كمية غير صالحة'; END IF;

    v_pb := public.catalog_resolve_branch_product(
      v_shift.branch_id,
      (v_item->>'product_id')::uuid
    );

    IF v_pb.id IS NULL OR v_pb.is_active IS NOT TRUE THEN
      -- Fallback: legacy direct row (pre-unify / dual-write lag)
      SELECT * INTO v_product
      FROM public.products
      WHERE id = (v_item->>'product_id')::uuid
        AND branch_id = v_shift.branch_id
        AND is_active = true
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'منتج غير متوفر في الفرع';
      END IF;
      v_stock := COALESCE(v_product.stock_quantity, 0);
      v_unit := COALESCE((v_item->>'unit_price')::numeric, v_product.price);
    ELSE
      SELECT * INTO v_product FROM public.products WHERE id = v_pb.product_id FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'منتج غير متوفر في الفرع';
      END IF;
      SELECT * INTO v_pb FROM public.product_branch WHERE id = v_pb.id FOR UPDATE;
      v_stock := COALESCE(v_pb.stock_quantity, 0);
      v_unit := COALESCE((v_item->>'unit_price')::numeric, v_pb.price);
    END IF;

    IF NOT v_allow_neg AND v_stock < v_qty THEN
      RAISE EXCEPTION 'المخزون غير كافٍ للمنتج: %', v_product.name;
    END IF;

    v_line_disc := COALESCE((v_item->>'discount')::numeric, 0);
    v_line_total := ROUND((v_unit * v_qty) - v_line_disc, 2);
    IF v_include_tax THEN
      v_line_tax := ROUND(v_line_total - (v_line_total / (1 + v_tax_rate / 100.0)), 2);
      v_line_net := v_line_total - v_line_tax;
    ELSE
      v_line_tax := ROUND(v_line_total * (v_tax_rate / 100.0), 2);
      v_line_net := v_line_total;
      v_line_total := v_line_total + v_line_tax;
    END IF;

    v_subtotal := v_subtotal + v_line_net;
    v_tax_total := v_tax_total + v_line_tax;
  END LOOP;

  v_payable_before_coupon := ROUND(GREATEST(0, v_subtotal + v_tax_total - v_manual_discount), 2);

  IF p_coupon_code IS NOT NULL AND btrim(p_coupon_code) <> '' THEN
    SELECT * INTO v_coupon
    FROM public.coupons
    WHERE lower(code) = lower(btrim(p_coupon_code))
    FOR UPDATE;

    IF NOT FOUND OR v_coupon.is_active IS NOT TRUE THEN
      RAISE EXCEPTION 'كود القسيمة غير صالح';
    END IF;
    IF v_coupon.kind = 'free_delivery' THEN
      RAISE EXCEPTION 'قسيمة التوصيل المجاني غير متاحة في الكاشير';
    END IF;

    v_preview := public.preview_coupon_code(v_coupon.code, v_payable_before_coupon, 0);
    v_coupon_discount := COALESCE((v_preview->>'product_discount')::numeric, 0);
    IF v_coupon_discount <= 0 THEN
      RAISE EXCEPTION 'لا يمكن تطبيق القسيمة على هذه الفاتورة';
    END IF;

    IF v_coupon.kind = 'prepaid' THEN
      IF v_coupon.prepaid_balance < v_coupon_discount THEN
        RAISE EXCEPTION 'رصيد الكوبون غير كافٍ';
      END IF;
    END IF;

    v_coupon_id := v_coupon.id;
    v_coupon_code_out := v_coupon.code;
  END IF;

  v_discount := ROUND(v_manual_discount + v_coupon_discount, 2);
  v_total := ROUND(v_subtotal + v_tax_total - v_discount, 2);
  IF v_total < 0 THEN RAISE EXCEPTION 'الإجمالي غير صالح'; END IF;

  FOR v_pay IN SELECT * FROM jsonb_array_elements(p_payments)
  LOOP
    v_pay_sum := v_pay_sum + COALESCE((v_pay->>'amount')::numeric, 0);
  END LOOP;
  IF ROUND(v_pay_sum, 2) < v_total THEN
    RAISE EXCEPTION 'مبلغ الدفع أقل من الإجمالي';
  END IF;

  v_invoice := public.pos_next_invoice_number(v_shift.branch_id);

  INSERT INTO public.pos_sales (
    branch_id, station_id, shift_id, cashier_id, invoice_number, status,
    subtotal, discount_total, tax_total, total, tax_rate, prices_include_tax,
    customer_name, customer_phone, customer_vat, notes,
    coupon_id, coupon_code, coupon_discount_amount
  ) VALUES (
    v_shift.branch_id, v_shift.station_id, p_shift_id, auth.uid(), v_invoice, 'completed',
    v_subtotal, v_discount, v_tax_total, v_total, v_tax_rate, v_include_tax,
    NULLIF(trim(COALESCE(p_customer_name, '')), ''),
    NULLIF(trim(COALESCE(p_customer_phone, '')), ''),
    NULLIF(trim(COALESCE(p_customer_vat, '')), ''),
    NULLIF(trim(COALESCE(p_notes, '')), ''),
    v_coupon_id,
    v_coupon_code_out,
    v_coupon_discount
  )
  RETURNING id INTO v_sale_id;

  PERFORM set_config('app.catalog_sync', '1', true);

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_pb := public.catalog_resolve_branch_product(
      v_shift.branch_id,
      (v_item->>'product_id')::uuid
    );
    v_qty := (v_item->>'quantity')::numeric;

    IF v_pb.id IS NOT NULL THEN
      SELECT * INTO v_product FROM public.products WHERE id = v_pb.product_id;
      SELECT * INTO v_pb FROM public.product_branch WHERE id = v_pb.id FOR UPDATE;
      v_unit := COALESCE((v_item->>'unit_price')::numeric, v_pb.price);
      v_sale_product_id := coalesce(v_pb.legacy_product_id, v_pb.product_id);
    ELSE
      SELECT * INTO v_product
      FROM public.products
      WHERE id = (v_item->>'product_id')::uuid
      FOR UPDATE;
      v_unit := COALESCE((v_item->>'unit_price')::numeric, v_product.price);
      v_sale_product_id := v_product.id;
    END IF;

    v_line_disc := COALESCE((v_item->>'discount')::numeric, 0);
    v_line_total := ROUND((v_unit * v_qty) - v_line_disc, 2);
    IF v_include_tax THEN
      v_line_tax := ROUND(v_line_total - (v_line_total / (1 + v_tax_rate / 100.0)), 2);
    ELSE
      v_line_tax := ROUND(v_line_total * (v_tax_rate / 100.0), 2);
      v_line_total := v_line_total + v_line_tax;
    END IF;

    INSERT INTO public.pos_sale_items (
      sale_id, product_id, product_name, barcode, unit_price, quantity, discount, tax_amount, line_total
    ) VALUES (
      v_sale_id, v_sale_product_id, v_product.name, v_product.barcode, v_unit, v_qty, v_line_disc, v_line_tax, v_line_total
    );

    IF v_pb.id IS NOT NULL THEN
      UPDATE public.product_branch
      SET stock_quantity = COALESCE(stock_quantity, 0) - v_qty,
          updated_at = now()
      WHERE id = v_pb.id;

      IF v_pb.legacy_product_id IS NOT NULL THEN
        UPDATE public.products
        SET stock_quantity = COALESCE(stock_quantity, 0) - v_qty,
            updated_at = now()
        WHERE id = v_pb.legacy_product_id;
      END IF;
    ELSE
      UPDATE public.products
      SET stock_quantity = COALESCE(stock_quantity, 0) - v_qty,
          updated_at = now()
      WHERE id = v_product.id;
    END IF;
  END LOOP;

  FOR v_pay IN SELECT * FROM jsonb_array_elements(p_payments)
  LOOP
    INSERT INTO public.pos_payments (sale_id, method, amount, reference)
    VALUES (
      v_sale_id,
      COALESCE(v_pay->>'method', 'cash'),
      (v_pay->>'amount')::numeric,
      NULLIF(v_pay->>'reference', '')
    );
  END LOOP;

  IF v_coupon_id IS NOT NULL AND v_coupon_discount > 0 THEN
    INSERT INTO public.coupon_redemptions (
      user_coupon_id, coupon_id, order_id, pos_sale_id, user_id, discount_amount, delivery_waived
    ) VALUES (
      NULL, v_coupon_id, NULL, v_sale_id, auth.uid(), v_coupon_discount, 0
    );

    IF v_coupon.kind = 'prepaid' THEN
      v_new_balance := ROUND(v_coupon.prepaid_balance - v_coupon_discount, 2);
      UPDATE public.coupons
      SET
        prepaid_balance = v_new_balance,
        is_active = CASE
          WHEN prepaid_single_use THEN false
          WHEN v_new_balance <= 0 THEN false
          ELSE is_active
        END,
        updated_at = now()
      WHERE id = v_coupon_id;
    ELSIF v_coupon.max_total_claims IS NOT NULL THEN
      UPDATE public.coupons c
      SET is_active = false, updated_at = now()
      WHERE c.id = v_coupon_id
        AND (
          SELECT count(*)::int FROM public.coupon_redemptions r WHERE r.coupon_id = c.id
        ) >= v_coupon.max_total_claims;
    END IF;
  END IF;

  INSERT INTO public.pos_automation_events (branch_id, event_type, payload)
  SELECT
    v_shift.branch_id,
    'low_stock',
    jsonb_build_object(
      'product_id', coalesce(pb.legacy_product_id, pb.product_id),
      'product_name', p.name,
      'stock', pb.stock_quantity,
      'barcode', p.barcode
    )
  FROM public.pos_sale_items i
  JOIN public.product_branch pb
    ON pb.branch_id = v_shift.branch_id
   AND (pb.legacy_product_id = i.product_id OR pb.product_id = i.product_id)
  JOIN public.products p ON p.id = pb.product_id
  WHERE i.sale_id = v_sale_id
    AND COALESCE(pb.stock_quantity, 0) <= COALESCE((v_feat->>'low_stock_threshold')::numeric, 5);

  RETURN jsonb_build_object(
    'sale_id', v_sale_id,
    'invoice_number', v_invoice,
    'subtotal', v_subtotal,
    'tax_total', v_tax_total,
    'discount_total', v_discount,
    'coupon_discount_amount', v_coupon_discount,
    'coupon_code', v_coupon_code_out,
    'total', v_total,
    'change', ROUND(v_pay_sum - v_total, 2)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.pos_create_sale(
  uuid, jsonb, jsonb, numeric, text, text, text, text, text
) TO authenticated;
