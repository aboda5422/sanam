-- Ninja catalog: section grouping for homepage sections
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS section text;

COMMENT ON COLUMN public.categories.section IS 'Homepage section id (offers, daily, pantry, ...) matching store-data categorySections';
