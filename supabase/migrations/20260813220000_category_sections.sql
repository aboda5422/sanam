-- Main category sections (الأقسام الرئيسية), referenced by categories.section
CREATE TABLE IF NOT EXISTS public.category_sections (
  id text PRIMARY KEY,
  title text NOT NULL,
  title_en text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  image text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.category_sections IS 'Main homepage sections; categories.section stores the section id';

INSERT INTO public.category_sections (id, title, title_en, sort_order) VALUES
  ('offers', 'أحدث العروض', 'Latest Offers', 1),
  ('daily', 'الاحتياجات اليومية', 'Daily Essentials', 2),
  ('pantry', 'مقاضي', 'Pantry', 3),
  ('drinks', 'المشروبات', 'Beverages', 4),
  ('snacks', 'السناكات والحلويات', 'Snacks & Sweets', 5),
  ('health', 'التغذية الصحية', 'Healthy Nutrition', 6),
  ('makeup', 'المكياج', 'Makeup', 7),
  ('perfumes', 'العطور', 'Perfumes', 8),
  ('beauty', 'الجمال', 'Beauty', 9),
  ('home', 'العناية بالمنزل', 'Home Care', 10),
  ('electronics', 'الإلكترونيات والعناية بالسيارة', 'Electronics & Car Care', 11),
  ('baby', 'العناية بالطفل', 'Baby Care', 12),
  ('pets', 'الحيوانات الأليفة', 'Pets', 13),
  ('toys', 'الألعاب', 'Toys', 14),
  ('stationery', 'القرطاسية', 'Stationery', 15),
  ('pharmacy', 'الصيدلية والتغذية الصحية', 'Pharmacy & Health', 16)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.category_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read category sections" ON public.category_sections;
CREATE POLICY "Anyone can read category sections"
  ON public.category_sections FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins can manage category sections" ON public.category_sections;
CREATE POLICY "Admins can manage category sections"
  ON public.category_sections FOR ALL
  USING (public.has_role(auth.uid(), 'store_admin') OR public.has_role(auth.uid(), 'site_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'store_admin') OR public.has_role(auth.uid(), 'site_admin'));
