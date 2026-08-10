-- 1) Update prices
UPDATE public.products p
SET price = s.price, updated_at = now()
FROM public._price_update_staging s
WHERE p.id = s.id AND p.price IS DISTINCT FROM s.price;

-- 2) Insert new products into "غير مصنّف"
INSERT INTO public.products (name, price, unit, barcode, category_id, is_active)
SELECT s.name, s.price, COALESCE(NULLIF(s.unit,''),'قطعة'), s.barcode,
       '5ee799d1-b4be-4835-87fc-48a7cee3fc54'::uuid, true
FROM public._new_products_staging s;

-- 3) Drop staging
DROP TABLE public._price_update_staging;
DROP TABLE public._new_products_staging;