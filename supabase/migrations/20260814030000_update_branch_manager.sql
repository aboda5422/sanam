-- Read / update branch manager login (name, username, optional password).

CREATE OR REPLACE FUNCTION public.get_branch_manager_account(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email text;
  v_name text;
  v_username text;
  v_meta jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'site_admin'::app_role) THEN
    RAISE EXCEPTION 'صلاحيات غير كافية - يتطلب مدير موقع';
  END IF;

  SELECT u.email, u.raw_user_meta_data, p.full_name
    INTO v_email, v_meta, v_name
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.user_id = u.id
  WHERE u.id = p_user_id;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'المدير غير موجود';
  END IF;

  v_username := nullif(trim(v_meta->>'username'), '');
  IF v_username IS NULL THEN
    IF v_email LIKE '%@staff.sanam' THEN
      v_username := split_part(v_email, '@', 1);
    ELSE
      v_username := v_email;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'full_name', coalesce(v_name, ''),
    'username', v_username
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_branch_manager(
  p_user_id uuid,
  p_full_name text,
  p_username text,
  p_password text DEFAULT NULL
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
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'site_admin'::app_role) THEN
    RAISE EXCEPTION 'صلاحيات غير كافية - يتطلب مدير موقع';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'المدير مطلوب';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'المدير غير موجود';
  END IF;
  IF v_name IS NULL OR v_name = '' THEN
    RAISE EXCEPTION 'الاسم مطلوب';
  END IF;
  IF v_username IS NULL OR v_username = '' THEN
    RAISE EXCEPTION 'اسم المستخدم مطلوب';
  END IF;
  IF position('@' in v_username) = 0 AND v_username !~ '^[a-z0-9._-]{3,32}$' THEN
    RAISE EXCEPTION 'اسم المستخدم يجب أن يكون 3–32 حرفاً (أحرف إنجليزية أو أرقام أو . _ -)';
  END IF;
  IF v_pass IS NOT NULL AND char_length(v_pass) < 6 THEN
    RAISE EXCEPTION 'كلمة المرور يجب ألا تقل عن 6 أحرف';
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
  SET full_name = v_name
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object('success', true, 'user_id', p_user_id, 'username', v_username);
END;
$$;

REVOKE ALL ON FUNCTION public.get_branch_manager_account(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_branch_manager_account(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.update_branch_manager(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_branch_manager(uuid, text, text, text) TO authenticated;
