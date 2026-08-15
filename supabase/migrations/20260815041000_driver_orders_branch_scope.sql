-- Drivers may only see and claim pending orders for branches they are assigned to.

CREATE OR REPLACE FUNCTION public.driver_assigned_branch_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT db.branch_id
  FROM public.driver_branches db
  INNER JOIN public.drivers d ON d.id = db.driver_id
  WHERE d.user_id = _user_id;
$$;

GRANT EXECUTE ON FUNCTION public.driver_assigned_branch_ids(uuid) TO authenticated;

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
        status = 'pending'
        AND driver_id IS NULL
        AND branch_id IN (SELECT public.driver_assigned_branch_ids(auth.uid()))
      )
    )
  );

DROP POLICY IF EXISTS "Drivers can update their assigned orders" ON public.orders;
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
        status = 'pending'
        AND driver_id IS NULL
        AND branch_id IN (SELECT public.driver_assigned_branch_ids(auth.uid()))
      )
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'driver')
    AND driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid())
  );
