-- Backfill payments rows for online orders already marked paid without a payments record.
-- Caused by Moyasar.js checkout never calling create-moyasar-payment (verify/webhook only updated).

INSERT INTO public.payments (
  order_id,
  user_id,
  amount,
  currency,
  method,
  status,
  moyasar_payment_id,
  created_at,
  updated_at
)
SELECT
  o.id,
  o.user_id,
  o.total,
  'SAR',
  COALESCE(NULLIF(o.payment_method, ''), 'online'),
  'paid'::public.payment_status,
  NULL,
  o.created_at,
  now()
FROM public.orders o
WHERE o.payment_status = 'paid'::public.payment_status
  AND COALESCE(o.payment_method, '') IS DISTINCT FROM 'cash'
  AND NOT EXISTS (
    SELECT 1 FROM public.payments p WHERE p.order_id = o.id
  );

UPDATE public.orders o
SET payment_id = p.id
FROM public.payments p
WHERE p.order_id = o.id
  AND o.payment_id IS NULL;
