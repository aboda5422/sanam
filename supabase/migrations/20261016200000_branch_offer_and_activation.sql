-- A discount belongs to the branch it was saved on.
-- Placeholder rows for the other branches keep the shelf price and no offer.
-- Copied discounts that match the main branch exactly are removed from the other branches.

UPDATE public.product_branch AS dst
SET
  price = CASE WHEN flags.copied_primary THEN dst.original_price ELSE dst.price END,
  original_price = CASE WHEN flags.copied_primary THEN NULL ELSE dst.original_price END,
  alt_price = CASE WHEN flags.copied_alt THEN dst.alt_original_price ELSE dst.alt_price END,
  alt_original_price = CASE WHEN flags.copied_alt THEN NULL ELSE dst.alt_original_price END,
  offer_channel = CASE
    WHEN flags.copied_primary AND (flags.copied_alt OR NOT (dst.alt_original_price > dst.alt_price)) THEN NULL
    WHEN flags.copied_alt AND NOT (dst.original_price > dst.price) THEN NULL
    ELSE dst.offer_channel
  END,
  offer_unit = CASE
    WHEN flags.copied_primary AND flags.copied_alt THEN NULL
    WHEN flags.copied_primary AND dst.alt_original_price > dst.alt_price AND NOT flags.copied_alt THEN 'alt'
    WHEN flags.copied_alt AND dst.original_price > dst.price AND NOT flags.copied_primary THEN 'primary'
    WHEN flags.copied_primary THEN NULL
    WHEN flags.copied_alt THEN NULL
    ELSE dst.offer_unit
  END,
  updated_at = now()
FROM (
  SELECT
    other.id,
    (
      other.original_price IS NOT NULL
      AND other.original_price > other.price
      AND other.price = main.price
      AND other.original_price IS NOT DISTINCT FROM main.original_price
    ) AS copied_primary,
    (
      other.alt_original_price IS NOT NULL
      AND other.alt_original_price > coalesce(other.alt_price, 0)
      AND other.alt_price IS NOT DISTINCT FROM main.alt_price
      AND other.alt_original_price IS NOT DISTINCT FROM main.alt_original_price
    ) AS copied_alt
  FROM public.product_branch AS other
  JOIN public.product_branch AS main
    ON main.product_id = other.product_id
   AND main.branch_id <> other.branch_id
  JOIN public.branches AS main_branch
    ON main_branch.id = main.branch_id
   AND main_branch.name LIKE '%مركز%'
) AS flags
WHERE dst.id = flags.id
  AND (flags.copied_primary OR flags.copied_alt);

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

  -- Other branches get the shelf price only. The discount stays on the branch that saved it.
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
      coalesce(NEW.original_price, NEW.price, 0),
      NULL,
      NEW.cost_price,
      false,
      false,
      coalesce(NEW.sort_order, 0),
      NULL,
      NULL,
      coalesce(NEW.alt_original_price, NEW.alt_price),
      NULL,
      NULL
    )
    ON CONFLICT (product_id, branch_id) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

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

  FOR b IN SELECT id FROM public.branches WHERE id <> p_branch_id
  LOOP
    INSERT INTO public.product_branch (
      product_id, branch_id, legacy_product_id,
      stock_quantity, price, original_price, cost_price,
      is_active, is_featured, sort_order, category_id
    ) VALUES (
      v_canonical, b, NULL,
      0, coalesce(p_original_price, p_price, 0), NULL, p_cost_price,
      false, false, 0, NULL
    )
    ON CONFLICT (product_id, branch_id) DO NOTHING;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'catalog_id', v_canonical,
    'legacy_product_id', v_legacy,
    'branch_id', p_branch_id,
    'id', coalesce(v_legacy, v_canonical)
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
