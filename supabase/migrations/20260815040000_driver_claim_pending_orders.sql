-- Allow drivers to accept unassigned pending orders (previously UPDATE RLS
-- required driver_id to already be themselves, so "قبول الطلب" was a no-op).

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
        AND (
          branch_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM public.driver_branches db
            JOIN public.drivers d ON d.id = db.driver_id
            WHERE d.user_id = auth.uid()
              AND db.branch_id = orders.branch_id
          )
        )
      )
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'driver')
    AND driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid())
  );
