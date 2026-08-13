-- Extra product fields from supermarket Excel catalog
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS origin_country text,
  ADD COLUMN IF NOT EXISTS size_label text,
  ADD COLUMN IF NOT EXISTS product_form text,
  ADD COLUMN IF NOT EXISTS gallery_urls text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS extra_label text;
