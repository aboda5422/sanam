ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS id_number text;

CREATE OR REPLACE FUNCTION public.create_site_staff(
  p_full_name text,
  p_username text,
  p_password text,
  p_role text,
  p_phone text DEFAULT NULL,
  p_contact_email text DEFAULT NULL,
  p_id_number text DEFAULT NULL,
  p_branch_ids uuid[] DEFAULT '{}'::uuid[]
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
  v_role app_role;
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_contact text := nullif(trim(coalesce(p_contact_email, '')), '');
  v_id_number text := nullif(trim(coalesce(p_id_number, '')), '');
  v_caller_super boolean;
  v_caller_store boolean;
  v_bid uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'صلاحيات غير كافية';
  END IF;

  v_caller_super := public.has_role(auth.uid(), 'site_admin'::app_role);
  v_caller_store := public.has_role(auth.uid(), 'store_admin'::app_role);
  IF NOT v_caller_super AND NOT v_caller_store THEN
    RAISE EXCEPTION 'صلاحيات غير كافية';
  END IF;

  IF p_role NOT IN ('site_admin', 'accountant', 'inventory', 'support') THEN
    RAISE EXCEPTION 'صلاحية غير مدعومة';
  END IF;
  v_role := p_role::app_role;

  IF p_role = 'site_admin' AND NOT v_caller_super THEN
    RAISE EXCEPTION 'تعيين مدير الموقع متاح لمدير الموقع فقط';
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

  IF p_role = 'site_admin' THEN
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

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, v_role)
  ON CONFLICT (user_id, role) DO NOTHING;

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

  RETURN jsonb_build_object('success', true, 'user_id', v_user_id, 'username', v_username);
END;
$$;

REVOKE ALL ON FUNCTION public.create_site_staff(text, text, text, text, text, text, text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_site_staff(text, text, text, text, text, text, text, uuid[]) TO authenticated;
