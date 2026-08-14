CREATE OR REPLACE FUNCTION public.is_panel_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN (
        'site_admin'::app_role,
        'store_admin'::app_role,
        'accountant'::app_role,
        'inventory'::app_role,
        'support'::app_role
      )
  );
$$;

DROP POLICY IF EXISTS "Panel staff view orders" ON public.orders;
CREATE POLICY "Panel staff view orders"
  ON public.orders FOR SELECT TO authenticated
  USING (public.is_panel_user());

DROP POLICY IF EXISTS "Panel staff view order items" ON public.order_items;
CREATE POLICY "Panel staff view order items"
  ON public.order_items FOR SELECT TO authenticated
  USING (public.is_panel_user());

DROP POLICY IF EXISTS "Accountant view payments" ON public.payments;
CREATE POLICY "Accountant view payments"
  ON public.payments FOR SELECT TO authenticated
  USING (public.is_panel_user());

DROP POLICY IF EXISTS "Support manage complaints" ON public.complaints;
CREATE POLICY "Support manage complaints"
  ON public.complaints FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'support'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'support'::app_role));

DROP POLICY IF EXISTS "Inventory manage products" ON public.products;
CREATE POLICY "Inventory manage products"
  ON public.products FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'inventory'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'inventory'::app_role));

DROP POLICY IF EXISTS "Inventory manage categories" ON public.categories;
CREATE POLICY "Inventory manage categories"
  ON public.categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'inventory'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'inventory'::app_role));

DROP POLICY IF EXISTS "Inventory manage branch inventory" ON public.branch_inventory;
CREATE POLICY "Inventory manage branch inventory"
  ON public.branch_inventory FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'inventory'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'inventory'::app_role));

DROP POLICY IF EXISTS "Panel staff view profiles" ON public.profiles;
CREATE POLICY "Panel staff view profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'accountant'::app_role)
    OR public.has_role(auth.uid(), 'inventory'::app_role)
    OR public.has_role(auth.uid(), 'support'::app_role)
  );

DROP POLICY IF EXISTS "Admins delete staff roles" ON public.user_roles;
CREATE POLICY "Admins delete staff roles"
  ON public.user_roles FOR DELETE TO authenticated
  USING (
    (
      public.has_role(auth.uid(), 'site_admin'::app_role)
      AND role IN ('accountant'::app_role, 'inventory'::app_role, 'support'::app_role, 'site_admin'::app_role)
    )
    OR (
      public.has_role(auth.uid(), 'store_admin'::app_role)
      AND role IN ('accountant'::app_role, 'inventory'::app_role, 'support'::app_role)
    )
  );

DROP POLICY IF EXISTS "Store admins view branch access" ON public.admin_branch_access;
CREATE POLICY "Store admins view branch access"
  ON public.admin_branch_access FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'store_admin'::app_role));

DROP POLICY IF EXISTS "Store admins delete staff branch access" ON public.admin_branch_access;
CREATE POLICY "Store admins delete staff branch access"
  ON public.admin_branch_access FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'store_admin'::app_role)
    AND branch_id IN (SELECT public.admin_branch_ids(auth.uid()))
  );
