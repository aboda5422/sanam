-- Per-driver active-order and cash-on-hand limits (defaults from store_settings.driver_limits).

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS max_active_orders integer NOT NULL DEFAULT 4
    CHECK (max_active_orders >= 1),
  ADD COLUMN IF NOT EXISTS max_cash_on_hand numeric(12,2) NOT NULL DEFAULT 1000
    CHECK (max_cash_on_hand >= 0);

COMMENT ON COLUMN public.drivers.max_active_orders IS 'Max concurrent active delivery orders for this driver';
COMMENT ON COLUMN public.drivers.max_cash_on_hand IS 'Max unsettled cash this driver may hold before accepting new orders';

DO $$
DECLARE
  v_max_orders integer;
  v_max_cash numeric;
BEGIN
  SELECT
    GREATEST(1, coalesce((value->>'max_active_orders')::integer, 4)),
    GREATEST(0, coalesce((value->>'max_cash_on_hand')::numeric, 1000))
  INTO v_max_orders, v_max_cash
  FROM public.store_settings
  WHERE key = 'driver_limits'
  LIMIT 1;

  IF v_max_orders IS NOT NULL THEN
    UPDATE public.drivers
    SET
      max_active_orders = v_max_orders,
      max_cash_on_hand = v_max_cash
    WHERE TRUE;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.create_driver(text, text, text, text, text, text, uuid, text, numeric);
DROP FUNCTION IF EXISTS public.create_driver(text, text, text, text, text, text, uuid, text, numeric, integer, numeric);

CREATE FUNCTION public.create_driver(
  p_full_name text,
  p_username text,
  p_password text,
  p_phone text DEFAULT NULL,
  p_id_number text DEFAULT NULL,
  p_vehicle_type text DEFAULT 'car',
  p_branch_id uuid DEFAULT NULL,
  p_pay_type text DEFAULT 'salary',
  p_per_delivery_fee numeric DEFAULT 0,
  p_max_active_orders integer DEFAULT NULL,
  p_max_cash_on_hand numeric DEFAULT NULL
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
  v_branch uuid := p_branch_id;
  v_pay text := lower(trim(coalesce(p_pay_type, 'salary')));
  v_fee numeric := GREATEST(0, coalesce(p_per_delivery_fee, 0));
  v_max_orders integer;
  v_max_cash numeric;
  v_defaults jsonb;
BEGIN
  IF auth.uid() IS NULL OR (
    NOT public.has_role(auth.uid(), 'site_admin'::app_role)
    AND NOT public.has_role(auth.uid(), 'store_admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'صلاحيات غير كافية';
  END IF;

  IF v_pay NOT IN ('salary', 'per_order') THEN
    RAISE EXCEPTION 'اختر نوع الأجر: راتب أو حسب الطلب';
  END IF;
  IF v_pay = 'per_order' AND v_fee <= 0 THEN
    RAISE EXCEPTION 'حدد أجر التوصيلة للمندوب';
  END IF;
  IF v_pay = 'salary' THEN
    v_fee := 0;
  END IF;

  SELECT value INTO v_defaults
  FROM public.store_settings
  WHERE key = 'driver_limits'
  LIMIT 1;

  v_max_orders := GREATEST(1, coalesce(
    p_max_active_orders,
    (v_defaults->>'max_active_orders')::integer,
    4
  ));
  v_max_cash := GREATEST(0, coalesce(
    p_max_cash_on_hand,
    (v_defaults->>'max_cash_on_hand')::numeric,
    1000
  ));

  IF public.has_role(auth.uid(), 'store_admin')
     AND NOT public.has_role(auth.uid(), 'site_admin') THEN
    IF v_branch IS NULL THEN
      SELECT a.branch_id INTO v_branch
      FROM public.admin_branch_access a
      WHERE a.user_id = auth.uid()
      LIMIT 1;
    END IF;
    IF v_branch IS NULL OR v_branch NOT IN (SELECT public.admin_branch_ids(auth.uid())) THEN
      RAISE EXCEPTION 'يجب إسناد المندوب إلى فرعك';
    END IF;
  ELSIF v_branch IS NULL THEN
    RAISE EXCEPTION 'يجب تحديد الفرع الذي سيُسند إليه المندوب';
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
    jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now()
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'driver'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.profiles SET full_name = v_name WHERE user_id = v_user_id;

  INSERT INTO public.drivers (
    user_id, full_name, phone, email, id_number, vehicle_type, is_available, status,
    pay_type, per_delivery_fee, unpaid_delivery_pay,
    max_active_orders, max_cash_on_hand
  )
  VALUES (
    v_user_id, v_name, v_phone, v_email, v_id_number, v_vehicle, true, 'active',
    v_pay, v_fee, 0,
    v_max_orders, v_max_cash
  )
  RETURNING id INTO v_driver_id;

  INSERT INTO public.driver_wallet (driver_id)
  VALUES (v_driver_id)
  ON CONFLICT (driver_id) DO NOTHING;

  INSERT INTO public.driver_branches (driver_id, branch_id)
  VALUES (v_driver_id, v_branch)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('success', true, 'user_id', v_user_id, 'driver_id', v_driver_id, 'username', v_username);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_driver(text, text, text, text, text, text, uuid, text, numeric, integer, numeric) TO authenticated;
