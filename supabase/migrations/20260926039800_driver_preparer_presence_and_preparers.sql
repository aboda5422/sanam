-- Driver/preparer presence columns + retail order_preparers roster (no wholesale audience).

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_idle_at timestamptz,
  ADD COLUMN IF NOT EXISTS app_foreground boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.order_preparers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone text,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  scope text NOT NULL DEFAULT 'individual'
    CHECK (scope IN ('individual', 'general')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  last_seen_at timestamptz,
  last_idle_at timestamptz,
  app_foreground boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_preparers_branch_status
  ON public.order_preparers (branch_id, status);

COMMENT ON COLUMN public.order_preparers.scope IS
  'individual=أفراد, general=كل طلبات التجزئة';

-- Backfill from existing order_preparer role holders
INSERT INTO public.order_preparers (user_id, full_name, phone, branch_id, scope, status)
SELECT
  ur.user_id,
  COALESCE(NULLIF(trim(p.full_name), ''), split_part(au.email, '@', 1), 'محضّر'),
  p.phone,
  aba.branch_id,
  'individual',
  'active'
FROM public.user_roles ur
JOIN public.admin_branch_access aba ON aba.user_id = ur.user_id
LEFT JOIN public.profiles p ON p.user_id = ur.user_id
LEFT JOIN auth.users au ON au.id = ur.user_id
WHERE ur.role = 'order_preparer'::app_role
  AND NOT EXISTS (
    SELECT 1 FROM public.order_preparers op WHERE op.user_id = ur.user_id
  )
ON CONFLICT (user_id) DO NOTHING;

ALTER TABLE public.order_preparers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Panel manage order preparers" ON public.order_preparers;
CREATE POLICY "Panel manage order preparers"
  ON public.order_preparers FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'site_admin'::app_role)
    OR public.has_role(auth.uid(), 'store_admin'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'site_admin'::app_role)
    OR public.has_role(auth.uid(), 'store_admin'::app_role)
  );

DROP POLICY IF EXISTS "Preparers view own row" ON public.order_preparers;
CREATE POLICY "Preparers view own row"
  ON public.order_preparers FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Keep create_order_preparer in sync with roster table
CREATE OR REPLACE FUNCTION public.create_order_preparer(
  p_full_name text,
  p_username text,
  p_password text,
  p_branch_id uuid,
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
  v_user_id uuid := gen_random_uuid();
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
BEGIN
  IF auth.uid() IS NULL
     OR (
       NOT public.has_role(auth.uid(), 'site_admin'::app_role)
       AND NOT public.has_role(auth.uid(), 'store_admin'::app_role)
     ) THEN
    RAISE EXCEPTION 'صلاحيات غير كافية';
  END IF;

  IF v_name IS NULL OR v_name = '' THEN RAISE EXCEPTION 'الاسم مطلوب'; END IF;
  IF v_username IS NULL OR v_username = '' THEN RAISE EXCEPTION 'اسم المستخدم مطلوب'; END IF;
  IF p_password IS NULL OR char_length(p_password) < 6 THEN
    RAISE EXCEPTION 'كلمة المرور قصيرة';
  END IF;
  IF p_branch_id IS NULL THEN RAISE EXCEPTION 'الفرع مطلوب'; END IF;

  IF position('@' in v_username) > 0 THEN
    v_email := v_username;
  ELSE
    v_email := v_username || '@staff.tomo';
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
    v_user_id, 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object('full_name', v_name, 'username', v_username),
    now(), now(), '', '', '', '', false, false
  );

  INSERT INTO auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) VALUES (
    v_user_id::text, v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
    'email', now(), now(), now()
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'order_preparer'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.profiles
  SET full_name = v_name, phone = v_phone
  WHERE user_id = v_user_id;

  INSERT INTO public.admin_branch_access (user_id, branch_id)
  VALUES (v_user_id, p_branch_id)
  ON CONFLICT (user_id, branch_id) DO NOTHING;

  INSERT INTO public.order_preparers (user_id, full_name, phone, branch_id, scope, status)
  VALUES (v_user_id, v_name, v_phone, p_branch_id, 'individual', 'active')
  ON CONFLICT (user_id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      phone = EXCLUDED.phone,
      branch_id = EXCLUDED.branch_id,
      status = 'active',
      updated_at = now();

  RETURN jsonb_build_object('user_id', v_user_id, 'email', v_email);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_order_preparer(text, text, text, uuid, text) TO authenticated;
