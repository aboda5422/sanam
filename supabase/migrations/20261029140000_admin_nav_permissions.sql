-- Per-user admin sidebar (nav icon) permissions

CREATE TABLE IF NOT EXISTS public.admin_nav_permissions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, path),
  CONSTRAINT admin_nav_permissions_path_check CHECK (path ~ '^/admin(/.*)?$')
);

CREATE INDEX IF NOT EXISTS admin_nav_permissions_user_idx
  ON public.admin_nav_permissions (user_id);

ALTER TABLE public.admin_nav_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own nav permissions" ON public.admin_nav_permissions;
CREATE POLICY "Users read own nav permissions"
  ON public.admin_nav_permissions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'site_admin'::public.app_role));

DROP POLICY IF EXISTS "Site admins manage nav permissions" ON public.admin_nav_permissions;
CREATE POLICY "Site admins manage nav permissions"
  ON public.admin_nav_permissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'site_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'site_admin'::public.app_role));

DROP POLICY IF EXISTS "Store admins read staff nav" ON public.admin_nav_permissions;
CREATE POLICY "Store admins read staff nav"
  ON public.admin_nav_permissions FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'store_admin'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.admin_branch_access a
      WHERE a.user_id = admin_nav_permissions.user_id
        AND a.branch_id IN (
          SELECT branch_id FROM public.admin_branch_access WHERE user_id = auth.uid()
        )
    )
  );

-- Known assignable paths (dashboard always implied when any selected)
CREATE OR REPLACE FUNCTION public.admin_nav_known_paths()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY[
    '/admin',
    '/admin/orders',
    '/admin/products',
    '/admin/categories',
    '/admin/branches',
    '/admin/customers',
    '/admin/drivers',
    '/admin/delivery',
    '/admin/complaints',
    '/admin/ratings',
    '/admin/pos',
    '/admin/sales',
    '/admin/collections',
    '/admin/payments',
    '/admin/announcements',
    '/admin/settings'
  ]::text[];
$$;

CREATE OR REPLACE FUNCTION public.sync_staff_roles_from_nav(p_user_id uuid, p_nav_paths text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paths text[] := COALESCE(p_nav_paths, '{}'::text[]);
  v_need_inventory boolean := false;
  v_need_support boolean := false;
  v_need_accountant boolean := false;
  v_need_store boolean := false;
  v_path text;
BEGIN
  -- Drop synced staff roles (keep site_admin untouched here)
  DELETE FROM public.user_roles
  WHERE user_id = p_user_id
    AND role IN (
      'accountant'::public.app_role,
      'inventory'::public.app_role,
      'support'::public.app_role,
      'store_admin'::public.app_role
    );

  IF public.has_role(p_user_id, 'site_admin'::public.app_role) THEN
    RETURN;
  END IF;

  FOREACH v_path IN ARRAY v_paths LOOP
    IF v_path IN ('/admin/products', '/admin/categories') THEN
      v_need_inventory := true;
    ELSIF v_path IN ('/admin/customers', '/admin/complaints', '/admin/ratings') THEN
      v_need_support := true;
    ELSIF v_path IN ('/admin/sales', '/admin/payments', '/admin/collections', '/admin/pos', '/admin/drivers') THEN
      v_need_accountant := true;
    ELSIF v_path IN (
      '/admin/orders', '/admin/branches', '/admin/delivery',
      '/admin/announcements', '/admin/settings', '/admin/home'
    ) THEN
      v_need_store := true;
    END IF;
  END LOOP;

  -- If only /admin selected, still need a panel role for login
  IF NOT v_need_inventory AND NOT v_need_support AND NOT v_need_accountant AND NOT v_need_store THEN
    IF array_length(v_paths, 1) IS NOT NULL THEN
      v_need_support := true;
    END IF;
  END IF;

  IF v_need_inventory THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (p_user_id, 'inventory'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  IF v_need_support THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (p_user_id, 'support'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  IF v_need_accountant THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (p_user_id, 'accountant'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  IF v_need_store THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (p_user_id, 'store_admin'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_admin_nav_permissions(p_user_id uuid, p_nav_paths text[])
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_known text[] := public.admin_nav_known_paths();
  v_clean text[] := '{}'::text[];
  v_path text;
BEGIN
  IF p_nav_paths IS NOT NULL THEN
    FOREACH v_path IN ARRAY p_nav_paths LOOP
      v_path := regexp_replace(trim(v_path), '/+$', '');
      IF v_path = '' THEN v_path := '/admin'; END IF;
      IF v_path = ANY (v_known) AND NOT (v_path = ANY (v_clean)) THEN
        v_clean := array_append(v_clean, v_path);
      END IF;
    END LOOP;
  END IF;

  IF array_length(v_clean, 1) IS NOT NULL AND NOT ('/admin' = ANY (v_clean)) THEN
    v_clean := array_prepend('/admin', v_clean);
  END IF;

  DELETE FROM public.admin_nav_permissions WHERE user_id = p_user_id;
  IF array_length(v_clean, 1) IS NOT NULL THEN
    INSERT INTO public.admin_nav_permissions (user_id, path)
    SELECT p_user_id, unnest(v_clean);
  END IF;

  RETURN v_clean;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_site_staff(
  p_full_name text,
  p_username text,
  p_password text,
  p_role text,
  p_phone text DEFAULT NULL,
  p_contact_email text DEFAULT NULL,
  p_id_number text DEFAULT NULL,
  p_branch_ids uuid[] DEFAULT '{}'::uuid[],
  p_nav_paths text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_name text := trim(p_full_name);
  v_username text := lower(trim(p_username));
  v_email text;
  v_user_id uuid := gen_random_uuid();
  v_role text := coalesce(nullif(trim(p_role), ''), 'support');
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_contact text := nullif(trim(coalesce(p_contact_email, '')), '');
  v_id_number text := nullif(trim(coalesce(p_id_number, '')), '');
  v_caller_super boolean;
  v_caller_store boolean;
  v_bid uuid;
  v_nav text[];
  v_is_site_admin boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'صلاحيات غير كافية';
  END IF;

  v_caller_super := public.has_role(auth.uid(), 'site_admin'::public.app_role);
  v_caller_store := public.has_role(auth.uid(), 'store_admin'::public.app_role);
  IF NOT v_caller_super AND NOT v_caller_store THEN
    RAISE EXCEPTION 'صلاحيات غير كافية';
  END IF;

  v_is_site_admin := (v_role = 'site_admin');

  IF v_is_site_admin AND NOT v_caller_super THEN
    RAISE EXCEPTION 'تعيين مدير الموقع متاح لمدير الموقع فقط';
  END IF;

  IF NOT v_is_site_admin THEN
    IF p_nav_paths IS NULL OR array_length(p_nav_paths, 1) IS NULL THEN
      RAISE EXCEPTION 'حدد أيقونة واحدة على الأقل من قائمة اللوحة';
    END IF;
  END IF;

  IF v_name IS NULL OR v_name = '' THEN
    RAISE EXCEPTION 'الاسم الكامل مطلوب';
  END IF;
  IF v_username IS NULL OR v_username = '' THEN
    RAISE EXCEPTION 'اسم المستخدم مطلوب';
  END IF;
  IF p_password IS NULL OR char_length(p_password) < 6 THEN
    RAISE EXCEPTION 'كلمة المرور يجب ألا تقل عن 6 أحرف';
  END IF;
  IF position('@' in v_username) = 0 AND v_username !~ '^[a-z0-9._-]{3,32}$' THEN
    RAISE EXCEPTION 'اسم المستخدم يجب أن يكون 3–32 حرفاً (أحرف إنجليزية أو أرقام أو . _ -)';
  END IF;

  IF v_is_site_admin THEN
    p_branch_ids := '{}'::uuid[];
  ELSIF NOT v_caller_super THEN
    IF p_branch_ids IS NULL OR array_length(p_branch_ids, 1) IS NULL THEN
      RAISE EXCEPTION 'يجب تحديد فرع واحد على الأقل';
    END IF;
    FOREACH v_bid IN ARRAY p_branch_ids LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.admin_branch_access
        WHERE user_id = auth.uid() AND branch_id = v_bid
      ) THEN
        RAISE EXCEPTION 'لا يمكنك تعيين مستخدم خارج فروعك';
      END IF;
    END LOOP;
  END IF;

  IF position('@' in v_username) > 0 THEN
    v_email := v_username;
  ELSE
    v_email := v_username || '@staff.sanam';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_email) THEN
    RAISE EXCEPTION 'اسم المستخدم مستخدم مسبقاً';
  END IF;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    is_sso_user, is_anonymous
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id,
    'authenticated',
    'authenticated',
    v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object(
      'full_name', v_name,
      'username', v_username,
      'id_number', v_id_number
    ),
    now(), now(), '', '', '', '', false, false
  );

  INSERT INTO auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) VALUES (
    v_user_id::text,
    v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    'email',
    now(), now(), now()
  );

  IF v_is_site_admin THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, 'site_admin'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
    DELETE FROM public.admin_nav_permissions WHERE user_id = v_user_id;
  ELSE
    v_nav := public.replace_admin_nav_permissions(v_user_id, p_nav_paths);
    IF array_length(v_nav, 1) IS NULL THEN
      RAISE EXCEPTION 'حدد أيقونة واحدة على الأقل من قائمة اللوحة';
    END IF;
    PERFORM public.sync_staff_roles_from_nav(v_user_id, v_nav);
  END IF;

  UPDATE public.profiles
  SET
    full_name = v_name,
    phone = v_phone,
    contact_email = v_contact,
    id_number = v_id_number
  WHERE user_id = v_user_id;

  IF p_branch_ids IS NOT NULL THEN
    FOREACH v_bid IN ARRAY p_branch_ids LOOP
      INSERT INTO public.admin_branch_access (user_id, branch_id)
      VALUES (v_user_id, v_bid)
      ON CONFLICT (user_id, branch_id) DO NOTHING;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'username', v_username,
    'nav_paths', COALESCE(v_nav, '{}'::text[])
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_site_staff_nav(
  p_user_id uuid,
  p_nav_paths text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_super boolean;
  v_caller_store boolean;
  v_nav text[];
  v_is_site_admin boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'صلاحيات غير كافية';
  END IF;

  v_caller_super := public.has_role(auth.uid(), 'site_admin'::public.app_role);
  v_caller_store := public.has_role(auth.uid(), 'store_admin'::public.app_role);
  IF NOT v_caller_super AND NOT v_caller_store THEN
    RAISE EXCEPTION 'صلاحيات غير كافية';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'المستخدم غير موجود';
  END IF;

  v_is_site_admin := public.has_role(p_user_id, 'site_admin'::public.app_role);
  IF v_is_site_admin THEN
    DELETE FROM public.admin_nav_permissions WHERE user_id = p_user_id;
    RETURN jsonb_build_object('success', true, 'nav_paths', '{}'::text[], 'site_admin', true);
  END IF;

  IF NOT v_caller_super THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.admin_branch_access a
      WHERE a.user_id = p_user_id
        AND a.branch_id IN (SELECT branch_id FROM public.admin_branch_access WHERE user_id = auth.uid())
    ) THEN
      RAISE EXCEPTION 'لا يمكنك تعديل مستخدم خارج فروعك';
    END IF;
  END IF;

  v_nav := public.replace_admin_nav_permissions(p_user_id, p_nav_paths);
  IF array_length(v_nav, 1) IS NULL THEN
    RAISE EXCEPTION 'حدد أيقونة واحدة على الأقل من قائمة اللوحة';
  END IF;

  PERFORM public.sync_staff_roles_from_nav(p_user_id, v_nav);

  RETURN jsonb_build_object('success', true, 'nav_paths', v_nav, 'site_admin', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_site_staff(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_super boolean;
  v_caller_store boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'صلاحيات غير كافية';
  END IF;

  v_caller_super := public.has_role(auth.uid(), 'site_admin'::public.app_role);
  v_caller_store := public.has_role(auth.uid(), 'store_admin'::public.app_role);
  IF NOT v_caller_super AND NOT v_caller_store THEN
    RAISE EXCEPTION 'صلاحيات غير كافية';
  END IF;

  IF public.has_role(p_user_id, 'site_admin'::public.app_role) AND NOT v_caller_super THEN
    RAISE EXCEPTION 'لا يمكن إزالة مدير الموقع';
  END IF;

  IF NOT v_caller_super THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.admin_branch_access a
      WHERE a.user_id = p_user_id
        AND a.branch_id IN (SELECT branch_id FROM public.admin_branch_access WHERE user_id = auth.uid())
    ) THEN
      RAISE EXCEPTION 'لا يمكنك إزالة مستخدم خارج فروعك';
    END IF;
  END IF;

  DELETE FROM public.admin_nav_permissions WHERE user_id = p_user_id;
  DELETE FROM public.admin_branch_access WHERE user_id = p_user_id;
  DELETE FROM public.user_roles
  WHERE user_id = p_user_id
    AND role IN (
      'site_admin'::public.app_role,
      'accountant'::public.app_role,
      'inventory'::public.app_role,
      'support'::public.app_role,
      'store_admin'::public.app_role
    );

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.create_site_staff(text, text, text, text, text, text, text, uuid[], text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_site_staff(text, text, text, text, text, text, text, uuid[], text[]) TO authenticated;

-- Keep old 8-arg overload working by replacing it to call new logic with null nav
-- Drop old signature if present and recreate wrapper
DROP FUNCTION IF EXISTS public.create_site_staff(text, text, text, text, text, text, text, uuid[]);

REVOKE ALL ON FUNCTION public.set_site_staff_nav(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_site_staff_nav(uuid, text[]) TO authenticated;

REVOKE ALL ON FUNCTION public.remove_site_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_site_staff(uuid) TO authenticated;
