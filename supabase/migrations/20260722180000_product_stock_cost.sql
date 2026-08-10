-- Admin-only product fields: stock quantity and cost price
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS stock_quantity INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10, 2) NULL;
