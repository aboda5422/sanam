-- Allow admins to read customer login emails for the customers table.
CREATE OR REPLACE FUNCTION public.admin_customer_emails()
RETURNS TABLE(user_id uuid, email text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT u.id, u.email
  FROM auth.users u
  WHERE public.has_role(auth.uid(), 'site_admin'::app_role)
     OR public.has_role(auth.uid(), 'store_admin'::app_role);
$$;

REVOKE ALL ON FUNCTION public.admin_customer_emails() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_customer_emails() TO authenticated;
