-- Allow site_admin to view all user_roles (needed for AdminUsersSection list)
CREATE POLICY "Site admins view all roles"
  ON public.user_roles FOR SELECT
  USING (has_role(auth.uid(), 'site_admin'::app_role) OR has_role(auth.uid(), 'store_admin'::app_role));

-- Allow site_admin to view all profiles already exists, but ensure profile lookup by admin works
-- (already covered by "Admins can view all profiles")