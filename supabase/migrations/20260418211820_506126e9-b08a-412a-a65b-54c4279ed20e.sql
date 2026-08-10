
INSERT INTO public.categories (name, name_en, slug, sort_order, is_active) VALUES
  ('قسم البلاستيكات', 'Plastics', 'plastics-section', 200, true),
  ('قسم الفحم والغاز', 'Charcoal & Gas', 'charcoal-gas', 201, true),
  ('قسم المحمصة (بالميزان)', 'Roastery (By Weight)', 'roastery-weighed', 202, true),
  ('قسم الأجبان والمخللات (بالميزان)', 'Cheese & Pickles (By Weight)', 'cheese-pickles-weighed', 203, true),
  ('قسم أدوات الطهي', 'Cooking Tools', 'cooking-tools', 204, true),
  ('قسم خردوات المصيف', 'Summer Resort Goods', 'summer-resort-goods', 205, true)
ON CONFLICT (slug) DO NOTHING;
