-- Offer visibility channel: app (storefront) vs cashier (POS) vs both.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS offer_channel text;

ALTER TABLE public.product_branch
  ADD COLUMN IF NOT EXISTS offer_channel text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_offer_channel_check'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_offer_channel_check
      CHECK (offer_channel IS NULL OR offer_channel IN ('app', 'cashier', 'both'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'product_branch_offer_channel_check'
  ) THEN
    ALTER TABLE public.product_branch
      ADD CONSTRAINT product_branch_offer_channel_check
      CHECK (offer_channel IS NULL OR offer_channel IN ('app', 'cashier', 'both'));
  END IF;
END $$;

-- Existing offers (original_price > price) default to both channels
UPDATE public.products
SET offer_channel = 'both'
WHERE original_price IS NOT NULL
  AND original_price > price
  AND offer_channel IS NULL;

UPDATE public.product_branch pb
SET offer_channel = 'both'
WHERE original_price IS NOT NULL
  AND original_price > price
  AND offer_channel IS NULL;

UPDATE public.product_branch pb
SET offer_channel = p.offer_channel
FROM public.products p
WHERE pb.legacy_product_id = p.id
  AND p.offer_channel IS NOT NULL
  AND (pb.offer_channel IS DISTINCT FROM p.offer_channel);

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
  p.created_at,
  pb.updated_at
FROM public.product_branch pb
JOIN public.products p ON p.id = pb.product_id;

GRANT SELECT ON public.catalog_branch_products TO anon, authenticated;

-- Extend dual-write to include offer_channel
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
    is_active, is_featured, sort_order, category_id, offer_channel
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
    NEW.offer_channel
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
    updated_at = now();

  FOR b IN SELECT id FROM public.branches WHERE id <> v_branch
  LOOP
    INSERT INTO public.product_branch (
      product_id, branch_id, legacy_product_id,
      stock_quantity, price, original_price, cost_price,
      is_active, is_featured, sort_order, category_id, offer_channel
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
    is_active, is_featured, sort_order, name, category_id, offer_channel
  OR DELETE
  ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.catalog_sync_product_branch_from_legacy();

NOTIFY pgrst, 'reload schema';
