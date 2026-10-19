-- Allow available drivers to also SEE unassigned preparing orders (preparer silent list).
-- Claim/update of unassigned remains pending|ready only.

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
