-- Admin update / delete cashier accounts + auth meta for activity stats.

CREATE OR REPLACE FUNCTION public.admin_staff_auth_meta()
RETURNS TABLE(user_id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT u.id, u.email, u.created_at, u.last_sign_in_at
  FROM auth.users u
  WHERE public.has_role(auth.uid(), 'site_admin'::app_role)
     OR public.has_role(auth.uid(), 'store_admin'::app_role);
$$;

REVOKE ALL ON FUNCTION public.admin_staff_auth_meta() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_staff_auth_meta() TO authenticated;

CREATE OR REPLACE FUNCTION public.update_cashier(
  p_user_id uuid,
  p_full_name text,
  p_username text,
  p_branch_id uuid,
  p_password text DEFAULT NULL,
  p_phone text DEFAULT NULL
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
  v_pass text := nullif(p_password, '');
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL
     OR (
       NOT public.has_role(v_caller, 'site_admin'::app_role)
       AND NOT public.has_role(v_caller, 'store_admin'::app_role)
     ) THEN
    RAISE EXCEPTION 'صلاحيات غير كافية';
  END IF;

  IF p_user_id IS NULL THEN RAISE EXCEPTION 'الكاشير مطلوب'; END IF;
  IF NOT public.has_role(p_user_id, 'cashier'::app_role) THEN
    RAISE EXCEPTION 'المستخدم ليس كاشيراً';
  END IF;
  IF v_name IS NULL OR v_name = '' THEN RAISE EXCEPTION 'الاسم مطلوب'; END IF;
  IF v_username IS NULL OR v_username = '' THEN RAISE EXCEPTION 'اسم المستخدم مطلوب'; END IF;
  IF p_branch_id IS NULL THEN RAISE EXCEPTION 'الفرع مطلوب'; END IF;
  IF position('@' in v_username) = 0 AND v_username !~ '^[a-z0-9._-]{3,32}$' THEN
    RAISE EXCEPTION 'اسم المستخدم يجب أن يكون 3–32 حرفاً (أحرف إنجليزية أو أرقام أو . _ -)';
  END IF;
  IF v_pass IS NOT NULL AND char_length(v_pass) < 6 THEN
    RAISE EXCEPTION 'كلمة المرور يجب ألا تقل عن 6 أحرف';
  END IF;

  IF public.has_role(v_caller, 'store_admin'::app_role)
     AND NOT public.has_role(v_caller, 'site_admin'::app_role) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.admin_branch_access a
      WHERE a.user_id = v_caller AND a.branch_id = p_branch_id
    ) THEN
      RAISE EXCEPTION 'لا يمكنك تعيين فرع خارج صلاحياتك';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.admin_branch_access a
      WHERE a.user_id = p_user_id
        AND a.branch_id IN (SELECT branch_id FROM public.admin_branch_access WHERE user_id = v_caller)
    ) THEN
      RAISE EXCEPTION 'الكاشير خارج فروعك';
    END IF;
  END IF;

  IF position('@' in v_username) > 0 THEN
    v_email := v_username;
  ELSE
    v_email := v_username || '@staff.sanam';
  END IF;

  IF EXISTS (
    SELECT 1 FROM auth.users
    WHERE lower(email) = v_email AND id <> p_user_id
  ) THEN
    RAISE EXCEPTION 'اسم المستخدم مستخدم مسبقاً';
  END IF;

  UPDATE auth.users
  SET
    email = v_email,
    raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object('full_name', v_name, 'username', v_username),
    encrypted_password = CASE
      WHEN v_pass IS NULL THEN encrypted_password
      ELSE extensions.crypt(v_pass, extensions.gen_salt('bf'))
    END,
    updated_at = now()
  WHERE id = p_user_id;

  UPDATE auth.identities
  SET
    identity_data = coalesce(identity_data, '{}'::jsonb)
      || jsonb_build_object('email', v_email, 'sub', p_user_id::text, 'email_verified', true),
    updated_at = now()
  WHERE user_id = p_user_id AND provider = 'email';

  UPDATE public.profiles
  SET full_name = v_name, phone = v_phone
  WHERE user_id = p_user_id;

  DELETE FROM public.admin_branch_access WHERE user_id = p_user_id;
  INSERT INTO public.admin_branch_access (user_id, branch_id)
  VALUES (p_user_id, p_branch_id)
  ON CONFLICT (user_id, branch_id) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'user_id', p_user_id, 'username', v_username);
END;
$$;

REVOKE ALL ON FUNCTION public.update_cashier(uuid, text, text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_cashier(uuid, text, text, uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_cashier(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_has_sales boolean;
  v_open_shift boolean;
BEGIN
  IF v_caller IS NULL
     OR (
       NOT public.has_role(v_caller, 'site_admin'::app_role)
       AND NOT public.has_role(v_caller, 'store_admin'::app_role)
     ) THEN
    RAISE EXCEPTION 'صلاحيات غير كافية';
  END IF;

  IF p_user_id IS NULL THEN RAISE EXCEPTION 'الكاشير مطلوب'; END IF;
  IF NOT public.has_role(p_user_id, 'cashier'::app_role) THEN
    RAISE EXCEPTION 'المستخدم ليس كاشيراً';
  END IF;

  IF public.has_role(v_caller, 'store_admin'::app_role)
     AND NOT public.has_role(v_caller, 'site_admin'::app_role) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.admin_branch_access a
      WHERE a.user_id = p_user_id
        AND a.branch_id IN (SELECT branch_id FROM public.admin_branch_access WHERE user_id = v_caller)
    ) THEN
      RAISE EXCEPTION 'الكاشير خارج فروعك';
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.pos_shifts WHERE cashier_id = p_user_id AND status = 'open'
  ) INTO v_open_shift;
  IF v_open_shift THEN
    RAISE EXCEPTION 'لا يمكن الحذف: لدى الكاشير وردية مفتوحة';
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id = p_user_id AND role = 'cashier'::app_role;

  DELETE FROM public.admin_branch_access WHERE user_id = p_user_id;

  SELECT EXISTS (
    SELECT 1 FROM public.pos_sales WHERE cashier_id = p_user_id
    UNION ALL
    SELECT 1 FROM public.pos_shifts WHERE cashier_id = p_user_id
  ) INTO v_has_sales;

  IF NOT v_has_sales THEN
    DELETE FROM auth.identities WHERE user_id = p_user_id;
    DELETE FROM auth.users WHERE id = p_user_id;
    DELETE FROM public.profiles WHERE user_id = p_user_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'auth_deleted', NOT v_has_sales
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_cashier(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_cashier(uuid) TO authenticated;
