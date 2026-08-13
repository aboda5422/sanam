-- Persist the customer account discount on each order so payment and invoices stay consistent.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS discount_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0;
