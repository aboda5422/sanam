-- Track when a driver actually starts the delivery trip (status → on_the_way).
-- Enables real average trip duration: delivered_at - on_the_way_at.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS on_the_way_at timestamptz;

COMMENT ON COLUMN public.orders.on_the_way_at IS
  'When the driver marked the order as on the way (trip start).';

CREATE OR REPLACE FUNCTION public.orders_set_on_the_way_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'on_the_way'::public.order_status
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'on_the_way'::public.order_status) THEN
    NEW.on_the_way_at := coalesce(NEW.on_the_way_at, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_set_on_the_way_at ON public.orders;
CREATE TRIGGER trg_orders_set_on_the_way_at
  BEFORE INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.orders_set_on_the_way_at();

-- Best-effort backfill for already-delivered trips that lack on_the_way_at:
-- use assigned_at when present (conservative lower bound for trip start).
UPDATE public.orders
SET on_the_way_at = coalesce(assigned_at, created_at)
WHERE status = 'delivered'
  AND delivered_at IS NOT NULL
  AND on_the_way_at IS NULL
  AND coalesce(assigned_at, created_at) IS NOT NULL
  AND coalesce(assigned_at, created_at) < delivered_at;
