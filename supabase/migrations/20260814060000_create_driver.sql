CREATE OR REPLACE FUNCTION public.create_driver(
  p_full_name text,
  p_username text,
  p_password text,
  p_phone text DEFAULT NULL,
  p_id_number text DEFAULT NULL,
  p_vehicle_type text DEFAULT 'car'
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
  v_driver_id uuid;
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_id_number text := nullif(trim(coalesce(p_id_number, '')), '');
  v_vehicle text := coalesce(nullif(trim(p_vehicle_type), ''), 'car');
BEGIN
  IF auth.uid() IS NULL OR (
    NOT public.has_role(auth.uid(), 'site_admin'::app_role)
    AND NOT public.has_role(auth.uid(), 'store_admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'صلاحيات غير كافية';
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
    jsonb_build_object('full_name', v_name, 'username', v_username),
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
  VALUES (v_user_id, 'driver'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.profiles SET full_name = v_name WHERE user_id = v_user_id;

  INSERT INTO public.drivers (user_id, full_name, phone, email, id_number, vehicle_type, is_available, status)
  VALUES (v_user_id, v_name, v_phone, v_email, v_id_number, v_vehicle, true, 'active')
  RETURNING id INTO v_driver_id;

  INSERT INTO public.driver_wallet (driver_id)
  VALUES (v_driver_id)
  ON CONFLICT (driver_id) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'user_id', v_user_id, 'driver_id', v_driver_id, 'username', v_username);
END;
$$;

REVOKE ALL ON FUNCTION public.create_driver(text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_driver(text, text, text, text, text, text) TO authenticated;
