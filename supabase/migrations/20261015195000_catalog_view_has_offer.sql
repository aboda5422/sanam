-- Expose has_offer for server-side admin filters (avoids loading full catalog).

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
  (pb.original_price IS NOT NULL AND pb.original_price > pb.price) AS has_offer,
  p.created_at,
  pb.updated_at
FROM public.product_branch pb
JOIN public.products p ON p.id = pb.product_id;

GRANT SELECT ON public.catalog_branch_products TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
