CREATE TABLE IF NOT EXISTS public._product_categorization_staging (
  product_id uuid PRIMARY KEY,
  category_id uuid NOT NULL
);
ALTER TABLE public._product_categorization_staging ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role full" ON public._product_categorization_staging FOR ALL USING (true) WITH CHECK (true);