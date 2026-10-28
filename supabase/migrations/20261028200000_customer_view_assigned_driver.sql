-- Allow customers to see limited driver contact/location for their own orders.
-- Fixes storefront order tracking when a driver is assigned (previously RLS hid the row).

DROP POLICY IF EXISTS "Customers can view drivers on their orders" ON public.drivers;
CREATE POLICY "Customers can view drivers on their orders"
  ON public.drivers
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.driver_id = drivers.id
        AND o.user_id = auth.uid()
    )
  );
