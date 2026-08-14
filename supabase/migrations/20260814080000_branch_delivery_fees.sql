ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS delivery_fee numeric NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS free_delivery_threshold numeric NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS min_order numeric NOT NULL DEFAULT 20;
