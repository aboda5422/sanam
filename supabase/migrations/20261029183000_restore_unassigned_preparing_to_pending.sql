-- Paid online (and other) orders were incorrectly moved to `preparing` on Moyasar
-- verify/webhook while preparer mode is off. Drivers only list/claim `pending`,
-- so those orders vanished from «متاحة». Restore unassigned, unclaimed ones.

UPDATE public.orders
SET status = 'pending'::public.order_status,
    updated_at = now()
WHERE status = 'preparing'::public.order_status
  AND driver_id IS NULL
  AND preparer_id IS NULL;
