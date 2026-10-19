-- A product is catalog-active when any branch still has it switched on.
-- The all-branches admin counters use this so a closed branch does not
-- turn the shared catalog into a pile of "inactive" rows.

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
  EXISTS (
    SELECT 1
    FROM public.product_branch x
    WHERE x.product_id = pb.product_id
      AND x.is_active
  ) AS catalog_is_active,
  p.created_at,
  pb.updated_at
FROM public.product_branch pb
JOIN public.products p ON p.id = pb.product_id;

GRANT SELECT ON public.catalog_branch_products TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
