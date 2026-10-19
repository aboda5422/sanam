-- One product, two sellable units (carton + piece) sharing one stock balance.
-- Stock is stored in the smaller unit once units_per_pack is set.
-- Selling the primary unit deducts quantity * units_per_pack.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS alt_unit text,
  ADD COLUMN IF NOT EXISTS alt_barcode text,
  ADD COLUMN IF NOT EXISTS alt_image text,
  ADD COLUMN IF NOT EXISTS units_per_pack integer,
  ADD COLUMN IF NOT EXISTS alt_price numeric,
  ADD COLUMN IF NOT EXISTS alt_original_price numeric,
  ADD COLUMN IF NOT EXISTS offer_unit text;

ALTER TABLE public.product_branch
  ADD COLUMN IF NOT EXISTS alt_price numeric,
  ADD COLUMN IF NOT EXISTS alt_original_price numeric,
  ADD COLUMN IF NOT EXISTS offer_unit text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_units_per_pack_check') THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_units_per_pack_check
      CHECK (units_per_pack IS NULL OR units_per_pack >= 2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_offer_unit_check') THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_offer_unit_check
      CHECK (offer_unit IS NULL OR offer_unit IN ('primary', 'alt', 'both'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_branch_offer_unit_check') THEN
    ALTER TABLE public.product_branch
      ADD CONSTRAINT product_branch_offer_unit_check
      CHECK (offer_unit IS NULL OR offer_unit IN ('primary', 'alt', 'both'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_alt_barcode
  ON public.products (branch_id, alt_barcode)
  WHERE alt_barcode IS NOT NULL AND btrim(alt_barcode) <> '';

DROP VIEW IF EXISTS public.catalog_branch_products;
CREATE VIEW public.catalog_branch_products
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
  coalesce(pb.offer_channel, p.offer_channel) AS offer_channel,
  p.alt_unit,
  p.alt_barcode,
  p.alt_image,
  p.units_per_pack,
  pb.alt_price,
  pb.alt_original_price,
  pb.offer_unit,
  (
    (
      coalesce(pb.offer_unit, 'primary') IN ('primary', 'both')
      AND pb.original_price IS NOT NULL
      AND pb.original_price > pb.price
    )
    OR (
      pb.offer_unit IN ('alt', 'both')
      AND pb.alt_original_price IS NOT NULL
      AND pb.alt_original_price > pb.alt_price
    )
  ) AS has_offer,
  p.created_at,
  pb.updated_at
FROM public.product_branch pb
JOIN public.products p ON p.id = pb.product_id;

GRANT SELECT ON public.catalog_branch_products TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.catalog_sync_product_branch_from_legacy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_canonical uuid;
  v_branch uuid;
  v_method text;
  v_key text;
  b uuid;
BEGIN
  IF public.catalog_sync_guard() THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  PERFORM set_config('app.catalog_sync', '1', true);

  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.product_branch WHERE legacy_product_id = OLD.id;
    DELETE FROM public.product_id_map WHERE legacy_product_id = OLD.id;
    RETURN OLD;
  END IF;

  v_branch := NEW.branch_id;
  v_canonical := NULL;

  IF NEW.barcode IS NOT NULL AND btrim(NEW.barcode) <> '' THEN
    SELECT m.canonical_product_id INTO v_canonical
    FROM public.product_id_map m
    JOIN public.products p ON p.id = m.legacy_product_id
    WHERE btrim(p.barcode) = btrim(NEW.barcode)
      AND m.legacy_product_id <> NEW.id
    ORDER BY m.created_at ASC
    LIMIT 1;
    IF v_canonical IS NOT NULL THEN
      v_method := 'barcode';
      v_key := btrim(NEW.barcode);
    END IF;
  END IF;

  IF v_canonical IS NULL AND NEW.external_id IS NOT NULL AND btrim(NEW.external_id) <> '' THEN
    SELECT m.canonical_product_id INTO v_canonical
    FROM public.product_id_map m
    JOIN public.products p ON p.id = m.legacy_product_id
    WHERE btrim(p.external_id) = btrim(NEW.external_id)
      AND m.legacy_product_id <> NEW.id
    ORDER BY m.created_at ASC
    LIMIT 1;
    IF v_canonical IS NOT NULL THEN
      v_method := 'external_id';
      v_key := btrim(NEW.external_id);
    END IF;
  END IF;

  IF v_canonical IS NULL THEN
    v_canonical := NEW.id;
    v_method := 'singleton';
    v_key := NULL;
  END IF;

  INSERT INTO public.product_id_map (legacy_product_id, canonical_product_id, match_method, match_key)
  VALUES (NEW.id, v_canonical, v_method, v_key)
  ON CONFLICT (legacy_product_id) DO UPDATE
  SET canonical_product_id = EXCLUDED.canonical_product_id,
      match_method = EXCLUDED.match_method,
      match_key = EXCLUDED.match_key;

  INSERT INTO public.product_branch (
    product_id, branch_id, legacy_product_id,
    stock_quantity, price, original_price, cost_price,
    is_active, is_featured, sort_order, category_id, offer_channel,
    alt_price, alt_original_price, offer_unit
  ) VALUES (
    v_canonical, v_branch, NEW.id,
    coalesce(NEW.stock_quantity, 0),
    coalesce(NEW.price, 0),
    NEW.original_price,
    NEW.cost_price,
    coalesce(NEW.is_active, false),
    coalesce(NEW.is_featured, false),
    coalesce(NEW.sort_order, 0),
    NEW.category_id,
    NEW.offer_channel,
    NEW.alt_price,
    NEW.alt_original_price,
    NEW.offer_unit
  )
  ON CONFLICT (product_id, branch_id) DO UPDATE
  SET
    legacy_product_id = EXCLUDED.legacy_product_id,
    stock_quantity = EXCLUDED.stock_quantity,
    price = EXCLUDED.price,
    original_price = EXCLUDED.original_price,
    cost_price = EXCLUDED.cost_price,
    is_active = EXCLUDED.is_active,
    is_featured = EXCLUDED.is_featured,
    sort_order = EXCLUDED.sort_order,
    category_id = coalesce(EXCLUDED.category_id, public.product_branch.category_id),
    offer_channel = EXCLUDED.offer_channel,
    alt_price = EXCLUDED.alt_price,
    alt_original_price = EXCLUDED.alt_original_price,
    offer_unit = EXCLUDED.offer_unit,
    updated_at = now();

  FOR b IN SELECT id FROM public.branches WHERE id <> v_branch
  LOOP
    INSERT INTO public.product_branch (
      product_id, branch_id, legacy_product_id,
      stock_quantity, price, original_price, cost_price,
      is_active, is_featured, sort_order, category_id, offer_channel,
      alt_price, alt_original_price, offer_unit
    ) VALUES (
      v_canonical, b, NULL,
      0,
      coalesce(NEW.price, 0),
      NEW.original_price,
      NEW.cost_price,
      false,
      false,
      coalesce(NEW.sort_order, 0),
      NULL,
      NULL,
      NEW.alt_price,
      NULL,
      NULL
    )
    ON CONFLICT (product_id, branch_id) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_catalog_sync_product_branch ON public.products;
CREATE TRIGGER trg_catalog_sync_product_branch
  AFTER INSERT OR UPDATE OF
    branch_id, barcode, external_id, stock_quantity, price, original_price, cost_price,
    is_active, is_featured, sort_order, name, category_id, offer_channel,
    alt_price, alt_original_price, offer_unit
  OR DELETE
  ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.catalog_sync_product_branch_from_legacy();

CREATE OR REPLACE FUNCTION public.dual_unit_base_qty(
  p_units_per_pack integer,
  p_sell_unit text,
  p_qty numeric
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN coalesce(p_units_per_pack, 0) >= 2
      AND coalesce(nullif(btrim(p_sell_unit), ''), 'primary') = 'primary'
      THEN p_qty * p_units_per_pack
    ELSE p_qty
  END;
$$;

CREATE OR REPLACE FUNCTION public.catalog_admin_set_dual_unit(
  p_branch_id uuid,
  p_product_id uuid,
  p_enabled boolean,
  p_alt_unit text DEFAULT NULL,
  p_alt_barcode text DEFAULT NULL,
  p_alt_image text DEFAULT NULL,
  p_units_per_pack integer DEFAULT NULL,
  p_alt_price numeric DEFAULT NULL,
  p_alt_original_price numeric DEFAULT NULL,
  p_stock_quantity integer DEFAULT NULL
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
  v_pb public.product_branch%ROWTYPE;
  v_pack integer;
  v_alt_unit text := nullif(btrim(coalesce(p_alt_unit, '')), '');
  v_alt_barcode text := nullif(btrim(coalesce(p_alt_barcode, '')), '');
  v_primary_barcode text;
  v_stock integer;
BEGIN
  IF v_caller IS NULL
     OR (
       NOT public.has_role(v_caller, 'site_admin'::app_role)
       AND NOT public.has_role(v_caller, 'store_admin'::app_role)
       AND NOT public.has_role(v_caller, 'inventory'::app_role)
     ) THEN
    RAISE EXCEPTION 'صلاحيات غير كافية';
  END IF;
  IF p_branch_id IS NULL OR p_product_id IS NULL THEN
    RAISE EXCEPTION 'الفرع والمنتج مطلوبان';
  END IF;

  SELECT canonical_product_id INTO v_canonical
  FROM public.product_id_map
  WHERE legacy_product_id = p_product_id;
  IF v_canonical IS NULL THEN
    v_canonical := p_product_id;
  END IF;

  SELECT * INTO v_pb
  FROM public.product_branch
  WHERE product_id = v_canonical AND branch_id = p_branch_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'المنتج غير موجود في هذا الفرع';
  END IF;

  v_legacy := coalesce(v_pb.legacy_product_id, v_canonical);
  SELECT barcode, units_per_pack, stock_quantity
    INTO v_primary_barcode, v_pack, v_stock
  FROM public.products
  WHERE id = v_canonical;

  IF NOT coalesce(p_enabled, false) THEN
    IF coalesce(v_pack, 0) >= 2 AND coalesce(v_pb.stock_quantity, 0) % v_pack <> 0 THEN
      RAISE EXCEPTION 'يوجد حبات مفتوحة في المخزون. بعها أو أكمل الكرتون قبل إزالة الوحدة الثانية';
    END IF;
    PERFORM set_config('app.catalog_sync', '1', true);
    UPDATE public.products
    SET alt_unit = NULL, alt_barcode = NULL, alt_image = NULL, units_per_pack = NULL,
        alt_price = NULL, alt_original_price = NULL,
        offer_unit = CASE WHEN offer_unit = 'alt' THEN NULL WHEN offer_unit = 'both' THEN 'primary' ELSE offer_unit END,
        stock_quantity = CASE
          WHEN id = v_legacy AND coalesce(v_pack, 0) >= 2 THEN coalesce(v_pb.stock_quantity, 0) / v_pack
          ELSE stock_quantity
        END,
        updated_at = now()
    WHERE id IN (v_canonical, v_legacy);
    UPDATE public.product_branch
    SET alt_price = NULL,
        alt_original_price = NULL,
        offer_unit = CASE WHEN offer_unit = 'alt' THEN NULL WHEN offer_unit = 'both' THEN 'primary' ELSE offer_unit END,
        stock_quantity = CASE WHEN coalesce(v_pack, 0) >= 2 THEN coalesce(stock_quantity, 0) / v_pack ELSE stock_quantity END,
        updated_at = now()
    WHERE id = v_pb.id;
    RETURN jsonb_build_object('ok', true, 'enabled', false);
  END IF;

  IF v_alt_unit IS NULL THEN
    RAISE EXCEPTION 'اسم الوحدة الثانية مطلوب';
  END IF;
  IF p_units_per_pack IS NULL OR p_units_per_pack < 2 THEN
    RAISE EXCEPTION 'عدد الحبات داخل الكرتون يجب أن يكون 2 أو أكثر';
  END IF;
  IF v_alt_barcode IS NOT NULL AND v_alt_barcode = btrim(coalesce(v_primary_barcode, '')) THEN
    RAISE EXCEPTION 'باركود الوحدة الثانية يطابق باركود الوحدة الأولى';
  END IF;
  IF v_alt_barcode IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.branch_id = p_branch_id
      AND p.id <> ALL (ARRAY[v_canonical, v_legacy])
      AND coalesce(p.is_active, false)
      AND (
        btrim(coalesce(p.barcode, '')) = v_alt_barcode
        OR btrim(coalesce(p.alt_barcode, '')) = v_alt_barcode
      )
  ) THEN
    RAISE EXCEPTION 'هذا الباركود مستخدم لمنتج آخر في الفرع';
  END IF;

  PERFORM set_config('app.catalog_sync', '1', true);
  UPDATE public.products
  SET
    alt_unit = v_alt_unit,
    alt_barcode = v_alt_barcode,
    alt_image = nullif(p_alt_image, ''),
    units_per_pack = p_units_per_pack,
    alt_price = CASE WHEN id = v_legacy THEN p_alt_price ELSE alt_price END,
    alt_original_price = CASE WHEN id = v_legacy THEN p_alt_original_price ELSE alt_original_price END,
    stock_quantity = CASE WHEN id = v_legacy AND p_stock_quantity IS NOT NULL THEN p_stock_quantity ELSE stock_quantity END,
    updated_at = now()
  WHERE id IN (v_canonical, v_legacy);

  UPDATE public.product_branch
  SET
    alt_price = p_alt_price,
    alt_original_price = p_alt_original_price,
    stock_quantity = coalesce(p_stock_quantity, stock_quantity),
    updated_at = now()
  WHERE id = v_pb.id;

  RETURN jsonb_build_object('ok', true, 'enabled', true, 'stock_quantity', coalesce(p_stock_quantity, v_pb.stock_quantity));
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_admin_set_dual_unit(uuid, uuid, boolean, text, text, text, integer, numeric, numeric, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_admin_set_dual_unit(uuid, uuid, boolean, text, text, text, integer, numeric, numeric, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.catalog_merge_product_units(
  p_branch_id uuid,
  p_keep_id uuid,
  p_drop_id uuid,
  p_units_per_pack integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_keep public.products%ROWTYPE;
  v_drop public.products%ROWTYPE;
  v_keep_can uuid;
  v_drop_can uuid;
  v_keep_pb public.product_branch%ROWTYPE;
  v_drop_pb public.product_branch%ROWTYPE;
  v_base integer;
  v_offer text;
  v_alt_barcode text;
BEGIN
  IF v_caller IS NULL
     OR (
       NOT public.has_role(v_caller, 'site_admin'::app_role)
       AND NOT public.has_role(v_caller, 'store_admin'::app_role)
       AND NOT public.has_role(v_caller, 'inventory'::app_role)
     ) THEN
    RAISE EXCEPTION 'صلاحيات غير كافية';
  END IF;
  IF p_keep_id IS NULL OR p_drop_id IS NULL OR p_keep_id = p_drop_id THEN
    RAISE EXCEPTION 'اختر منتجين مختلفين';
  END IF;
  IF p_units_per_pack IS NULL OR p_units_per_pack < 2 THEN
    RAISE EXCEPTION 'عدد الحبات داخل الكرتون يجب أن يكون 2 أو أكثر';
  END IF;

  SELECT * INTO v_keep FROM public.products WHERE id = p_keep_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'منتج الكرتون غير موجود';
  END IF;
  SELECT * INTO v_drop FROM public.products WHERE id = p_drop_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'منتج الحبة غير موجود';
  END IF;
  IF v_keep.branch_id IS DISTINCT FROM p_branch_id OR v_drop.branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'المنتجان يجب أن يكونا في نفس الفرع';
  END IF;
  IF coalesce(v_keep.units_per_pack, 0) >= 2 OR coalesce(v_drop.units_per_pack, 0) >= 2 THEN
    RAISE EXCEPTION 'أحد المنتجين لديه وحدة ثانية بالفعل';
  END IF;

  SELECT canonical_product_id INTO v_keep_can FROM public.product_id_map WHERE legacy_product_id = p_keep_id;
  SELECT canonical_product_id INTO v_drop_can FROM public.product_id_map WHERE legacy_product_id = p_drop_id;
  v_keep_can := coalesce(v_keep_can, p_keep_id);
  v_drop_can := coalesce(v_drop_can, p_drop_id);

  SELECT * INTO v_keep_pb FROM public.product_branch
  WHERE branch_id = p_branch_id AND (legacy_product_id = p_keep_id OR product_id = v_keep_can)
  ORDER BY CASE WHEN legacy_product_id = p_keep_id THEN 0 ELSE 1 END
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'تعذر قراءة مخزون الكرتون';
  END IF;
  SELECT * INTO v_drop_pb FROM public.product_branch
  WHERE branch_id = p_branch_id AND (legacy_product_id = p_drop_id OR product_id = v_drop_can)
  ORDER BY CASE WHEN legacy_product_id = p_drop_id THEN 0 ELSE 1 END
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'تعذر قراءة مخزون الحبة';
  END IF;
  IF v_keep_pb.id = v_drop_pb.id THEN
    RAISE EXCEPTION 'المنتجان مرتبطان بنفس الصنف بالفعل';
  END IF;

  v_alt_barcode := nullif(btrim(coalesce(v_drop.barcode, '')), '');
  IF v_alt_barcode IS NOT NULL AND v_alt_barcode = btrim(coalesce(v_keep.barcode, '')) THEN
    RAISE EXCEPTION 'المنتجان يحملان نفس الباركود';
  END IF;
  IF v_alt_barcode IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.branch_id = p_branch_id
      AND p.id <> ALL (ARRAY[p_keep_id, p_drop_id, v_keep_can, v_drop_can])
      AND coalesce(p.is_active, false)
      AND (
        btrim(coalesce(p.barcode, '')) = v_alt_barcode
        OR btrim(coalesce(p.alt_barcode, '')) = v_alt_barcode
      )
  ) THEN
    RAISE EXCEPTION 'باركود الحبة مستخدم لمنتج آخر';
  END IF;

  v_base := coalesce(v_keep_pb.stock_quantity, 0) * p_units_per_pack + coalesce(v_drop_pb.stock_quantity, 0);
  v_offer := CASE
    WHEN v_keep_pb.original_price IS NOT NULL AND v_keep_pb.original_price > v_keep_pb.price
      AND v_drop_pb.original_price IS NOT NULL AND v_drop_pb.original_price > v_drop_pb.price THEN 'both'
    WHEN v_drop_pb.original_price IS NOT NULL AND v_drop_pb.original_price > v_drop_pb.price THEN 'alt'
    WHEN v_keep_pb.original_price IS NOT NULL AND v_keep_pb.original_price > v_keep_pb.price THEN 'primary'
    ELSE NULL
  END;

  PERFORM set_config('app.catalog_sync', '1', true);

  UPDATE public.products
  SET
    alt_unit = v_drop.unit,
    alt_barcode = v_alt_barcode,
    alt_image = nullif(v_drop.image, ''),
    units_per_pack = p_units_per_pack,
    alt_price = CASE WHEN id = p_keep_id THEN v_drop_pb.price ELSE alt_price END,
    alt_original_price = CASE WHEN id = p_keep_id THEN v_drop_pb.original_price ELSE alt_original_price END,
    offer_unit = CASE WHEN id = p_keep_id THEN v_offer ELSE offer_unit END,
    stock_quantity = CASE WHEN id = p_keep_id THEN v_base ELSE stock_quantity END,
    updated_at = now()
  WHERE id IN (p_keep_id, v_keep_can);

  UPDATE public.product_branch
  SET
    stock_quantity = v_base,
    alt_price = v_drop_pb.price,
    alt_original_price = v_drop_pb.original_price,
    offer_unit = v_offer,
    updated_at = now()
  WHERE id = v_keep_pb.id;

  UPDATE public.products
  SET is_active = false, barcode = NULL, alt_barcode = NULL, stock_quantity = 0, updated_at = now()
  WHERE id = p_drop_id;

  UPDATE public.product_branch
  SET is_active = false, stock_quantity = 0, updated_at = now()
  WHERE id = v_drop_pb.id;

  RETURN jsonb_build_object(
    'ok', true,
    'keep_id', p_keep_id,
    'stock_quantity', v_base,
    'units_per_pack', p_units_per_pack
  );
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_merge_product_units(uuid, uuid, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_merge_product_units(uuid, uuid, uuid, integer) TO authenticated;

-- POS: deduct shared base stock (a carton removes units_per_pack pieces).
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
  v_base numeric(12,3);
  v_need numeric(12,3);
  v_sell_unit text;
  v_key text;
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
  v_line_name text;
  v_line_barcode text;
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

  DROP TABLE IF EXISTS _pos_base_need;
  CREATE TEMP TABLE _pos_base_need (
    stock_key text PRIMARY KEY,
    need numeric NOT NULL
  ) ON COMMIT DROP;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := COALESCE((v_item->>'quantity')::numeric, 0);
    IF v_qty <= 0 THEN RAISE EXCEPTION 'كمية غير صالحة'; END IF;
    v_sell_unit := coalesce(nullif(btrim(v_item->>'sell_unit'), ''), 'primary');

    v_pb := public.catalog_resolve_branch_product(
      v_shift.branch_id,
      (v_item->>'product_id')::uuid
    );

    IF v_pb.id IS NULL OR v_pb.is_active IS NOT TRUE THEN
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
      v_key := v_product.id::text;
      IF v_sell_unit = 'alt' THEN
        v_unit := COALESCE((v_item->>'unit_price')::numeric, v_product.alt_price, 0);
      ELSE
        v_unit := COALESCE((v_item->>'unit_price')::numeric, v_product.price);
      END IF;
    ELSE
      SELECT * INTO v_product FROM public.products WHERE id = v_pb.product_id FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'منتج غير متوفر في الفرع';
      END IF;
      SELECT * INTO v_pb FROM public.product_branch WHERE id = v_pb.id FOR UPDATE;
      v_stock := COALESCE(v_pb.stock_quantity, 0);
      v_key := v_pb.id::text;
      IF v_sell_unit = 'alt' THEN
        v_unit := COALESCE((v_item->>'unit_price')::numeric, v_pb.alt_price, v_product.alt_price, 0);
      ELSE
        v_unit := COALESCE((v_item->>'unit_price')::numeric, v_pb.price);
      END IF;
    END IF;

    v_base := public.dual_unit_base_qty(v_product.units_per_pack, v_sell_unit, v_qty);
    INSERT INTO _pos_base_need (stock_key, need)
    VALUES (v_key, v_base)
    ON CONFLICT (stock_key) DO UPDATE
    SET need = _pos_base_need.need + EXCLUDED.need
    RETURNING need INTO v_need;

    IF NOT v_allow_neg AND v_stock < v_need THEN
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
    v_sell_unit := coalesce(nullif(btrim(v_item->>'sell_unit'), ''), 'primary');

    IF v_pb.id IS NOT NULL THEN
      SELECT * INTO v_product FROM public.products WHERE id = v_pb.product_id;
      SELECT * INTO v_pb FROM public.product_branch WHERE id = v_pb.id FOR UPDATE;
      IF v_sell_unit = 'alt' THEN
        v_unit := COALESCE((v_item->>'unit_price')::numeric, v_pb.alt_price, v_product.alt_price, 0);
      ELSE
        v_unit := COALESCE((v_item->>'unit_price')::numeric, v_pb.price);
      END IF;
      v_sale_product_id := coalesce(v_pb.legacy_product_id, v_pb.product_id);
    ELSE
      SELECT * INTO v_product
      FROM public.products
      WHERE id = (v_item->>'product_id')::uuid
      FOR UPDATE;
      IF v_sell_unit = 'alt' THEN
        v_unit := COALESCE((v_item->>'unit_price')::numeric, v_product.alt_price, 0);
      ELSE
        v_unit := COALESCE((v_item->>'unit_price')::numeric, v_product.price);
      END IF;
      v_sale_product_id := v_product.id;
    END IF;

    v_base := public.dual_unit_base_qty(v_product.units_per_pack, v_sell_unit, v_qty);
    v_line_disc := COALESCE((v_item->>'discount')::numeric, 0);
    v_line_total := ROUND((v_unit * v_qty) - v_line_disc, 2);
    IF v_include_tax THEN
      v_line_tax := ROUND(v_line_total - (v_line_total / (1 + v_tax_rate / 100.0)), 2);
    ELSE
      v_line_tax := ROUND(v_line_total * (v_tax_rate / 100.0), 2);
      v_line_total := v_line_total + v_line_tax;
    END IF;

    IF coalesce(v_product.units_per_pack, 0) >= 2 THEN
      v_line_name := v_product.name || ' (' || CASE WHEN v_sell_unit = 'alt' THEN coalesce(v_product.alt_unit, 'حبة') ELSE coalesce(v_product.unit, 'كرتون') END || ')';
      v_line_barcode := CASE WHEN v_sell_unit = 'alt' THEN coalesce(v_product.alt_barcode, v_product.barcode) ELSE v_product.barcode END;
    ELSE
      v_line_name := v_product.name;
      v_line_barcode := v_product.barcode;
    END IF;

    INSERT INTO public.pos_sale_items (
      sale_id, product_id, product_name, barcode, unit_price, quantity, discount, tax_amount, line_total
    ) VALUES (
      v_sale_id, v_sale_product_id, v_line_name, v_line_barcode, v_unit, v_qty, v_line_disc, v_line_tax, v_line_total
    );

    IF v_pb.id IS NOT NULL THEN
      UPDATE public.product_branch
      SET stock_quantity = COALESCE(stock_quantity, 0) - v_base,
          updated_at = now()
      WHERE id = v_pb.id;

      IF v_pb.legacy_product_id IS NOT NULL THEN
        UPDATE public.products
        SET stock_quantity = COALESCE(stock_quantity, 0) - v_base,
            updated_at = now()
        WHERE id = v_pb.legacy_product_id;
      END IF;
    ELSE
      UPDATE public.products
      SET stock_quantity = COALESCE(stock_quantity, 0) - v_base,
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

NOTIFY pgrst, 'reload schema';
