CREATE TABLE IF NOT EXISTS public._price_update_staging (id uuid, price numeric);
CREATE TABLE IF NOT EXISTS public._new_products_staging (name text, price numeric, unit text, barcode text);
ALTER TABLE public._price_update_staging ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._new_products_staging ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service insert" ON public._price_update_staging FOR INSERT WITH CHECK (true);
CREATE POLICY "service select" ON public._price_update_staging FOR SELECT USING (true);
CREATE POLICY "service insert2" ON public._new_products_staging FOR INSERT WITH CHECK (true);
CREATE POLICY "service select2" ON public._new_products_staging FOR SELECT USING (true);