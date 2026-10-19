-- Unassigned order claims require drivers.is_available = true.
-- Already-assigned orders remain updatable while offline so in-progress work can finish.

CREATE OR REPLACE FUNCTION public.driver_is_available(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT d.is_available FROM public.drivers d WHERE d.user_id = _user_id LIMIT 1),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.driver_is_available(uuid) TO authenticated;

DROP POLICY IF EXISTS "Drivers can view available and assigned orders" ON public.orders;
CREATE POLICY "Drivers can view available and assigned orders"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'driver')
    AND (
      driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid())
      OR (
        public.driver_is_available(auth.uid())
        AND status IN ('pending', 'preparing', 'ready')
        AND driver_id IS NULL
        AND branch_id IN (SELECT public.driver_assigned_branch_ids(auth.uid()))
      )
    )
  );

DROP POLICY IF EXISTS "Drivers can claim and update orders" ON public.orders;
CREATE POLICY "Drivers can claim and update orders"
  ON public.orders
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'driver')
    AND (
      driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid())
      OR (
        public.driver_is_available(auth.uid())
        AND status IN ('pending', 'ready')
        AND driver_id IS NULL
        AND branch_id IN (SELECT public.driver_assigned_branch_ids(auth.uid()))
      )
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'driver')
    AND driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid())
  );
