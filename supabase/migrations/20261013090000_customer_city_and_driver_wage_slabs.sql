-- 1) Stop defaulting every new profile to مكة المكرمة
ALTER TABLE public.profiles
  ALTER COLUMN city DROP DEFAULT;

ALTER TABLE public.profiles
  ALTER COLUMN city SET DEFAULT NULL;

-- Backfill city from latest order national-address prefix / branch city when still the placeholder
WITH latest AS (
  SELECT DISTINCT ON (o.user_id)
    o.user_id,
    o.national_address,
    o.delivery_lat,
    o.delivery_lng,
    b.city AS branch_city
  FROM public.orders o
  LEFT JOIN public.branches b ON b.id = o.branch_id
  WHERE o.user_id IS NOT NULL
  ORDER BY o.user_id, o.created_at DESC
),
inferred AS (
  SELECT
    l.user_id,
    CASE
      WHEN upper(trim(coalesce(l.national_address, ''))) ~ '^(GIZ|JZN)' THEN 'جازان'
      WHEN upper(trim(coalesce(l.national_address, ''))) ~ '^(MEK|MAK)' THEN 'مكة المكرمة'
      WHEN upper(trim(coalesce(l.national_address, ''))) ~ '^JED' THEN 'جدة'
      WHEN upper(trim(coalesce(l.national_address, ''))) ~ '^RUH' THEN 'الرياض'
      WHEN upper(trim(coalesce(l.national_address, ''))) ~ '^MED' THEN 'المدينة المنورة'
      WHEN upper(trim(coalesce(l.national_address, ''))) ~ '^DMM' THEN 'الدمام'
      WHEN upper(trim(coalesce(l.national_address, ''))) ~ '^ABH' THEN 'أبها'
      WHEN upper(trim(coalesce(l.national_address, ''))) ~ '^TAI' THEN 'الطائف'
      WHEN nullif(trim(coalesce(l.branch_city, '')), '') IS NOT NULL THEN trim(l.branch_city)
      ELSE NULL
    END AS city_guess
  FROM latest l
)
UPDATE public.profiles p
SET city = i.city_guess
FROM inferred i
WHERE p.user_id = i.user_id
  AND i.city_guess IS NOT NULL
  AND (
    p.city IS NULL
    OR trim(p.city) = ''
    OR p.city IN ('مكة المكرمة', 'مكة', 'Makkah', 'Mecca')
  );

-- Clear leftover placeholder for users with no delivery evidence
UPDATE public.profiles
SET city = NULL
WHERE city IN ('مكة المكرمة', 'مكة', 'Makkah', 'Mecca')
  AND user_id NOT IN (
    SELECT DISTINCT user_id FROM public.orders WHERE user_id IS NOT NULL
  );

-- 2) Driver wage slabs: base + per km + extra purchase-point stop
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS wage_per_km numeric(10,2) NOT NULL DEFAULT 0
    CHECK (wage_per_km >= 0);

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS extra_stop_fee numeric(10,2) NOT NULL DEFAULT 0
    CHECK (extra_stop_fee >= 0);

COMMENT ON COLUMN public.drivers.per_delivery_fee IS
  'أجر أساسي للتوصيلة (من المتجر للمندوب)';
COMMENT ON COLUMN public.drivers.wage_per_km IS
  'أجر إضافي لكل كم من إجمالي مسافات نقاط الشراء';
COMMENT ON COLUMN public.drivers.extra_stop_fee IS
  'أجر لكل نقطة شراء بعد الأولى (طلب إضافي في نفس التوصيلة)';
COMMENT ON COLUMN public.drivers.extra_order_fee IS
  'بدل عند وجود طلبات نشطة أخرى لنفس المندوب — يُستخدم كأساس بدل الأساسي إن > 0';

-- Protect new pay columns
CREATE OR REPLACE FUNCTION public.protect_driver_pay_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND NOT public.has_role(auth.uid(), 'site_admin')
     AND NOT public.has_role(auth.uid(), 'store_admin') THEN
    NEW.pay_type := OLD.pay_type;
    NEW.per_delivery_fee := OLD.per_delivery_fee;
    NEW.extra_order_fee := OLD.extra_order_fee;
    NEW.wage_per_km := OLD.wage_per_km;
    NEW.extra_stop_fee := OLD.extra_stop_fee;
    NEW.unpaid_delivery_pay := OLD.unpaid_delivery_pay;
  END IF;
  RETURN NEW;
END;
$$;

-- update_driver_pay: include wage_per_km + extra_stop_fee
DROP FUNCTION IF EXISTS public.update_driver_pay(uuid, text, numeric);
DROP FUNCTION IF EXISTS public.update_driver_pay(uuid, text, numeric, numeric);
DROP FUNCTION IF EXISTS public.update_driver_pay(uuid, text, numeric, numeric, numeric, numeric);

CREATE FUNCTION public.update_driver_pay(
  p_driver_id uuid,
  p_pay_type text,
  p_per_delivery_fee numeric DEFAULT 0,
  p_extra_order_fee numeric DEFAULT 0,
  p_wage_per_km numeric DEFAULT 0,
  p_extra_stop_fee numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pay text := lower(trim(coalesce(p_pay_type, 'salary')));
  v_fee numeric := GREATEST(0, coalesce(p_per_delivery_fee, 0));
  v_extra numeric := GREATEST(0, coalesce(p_extra_order_fee, 0));
  v_per_km numeric := GREATEST(0, coalesce(p_wage_per_km, 0));
  v_stop numeric := GREATEST(0, coalesce(p_extra_stop_fee, 0));
BEGIN
  IF auth.uid() IS NULL OR (
    NOT public.has_role(auth.uid(), 'store_admin')
    AND NOT public.has_role(auth.uid(), 'site_admin')
  ) THEN
    RAISE EXCEPTION 'صلاحيات غير كافية';
  END IF;

  IF v_pay NOT IN ('salary', 'per_order') THEN
    RAISE EXCEPTION 'اختر نوع الأجر: راتب أو حسب الطلب';
  END IF;
  IF v_pay = 'per_order' AND v_fee <= 0 AND v_per_km <= 0 THEN
    RAISE EXCEPTION 'حدد أجر أساسي أو أجراً لكل كم للمندوب';
  END IF;
  IF v_pay = 'salary' THEN
    v_fee := 0;
    v_extra := 0;
    v_per_km := 0;
    v_stop := 0;
  END IF;

  UPDATE public.drivers
  SET
    pay_type = v_pay,
    per_delivery_fee = v_fee,
    extra_order_fee = v_extra,
    wage_per_km = v_per_km,
    extra_stop_fee = v_stop
  WHERE id = p_driver_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'المندوب غير موجود';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'pay_type', v_pay,
    'per_delivery_fee', v_fee,
    'extra_order_fee', v_extra,
    'wage_per_km', v_per_km,
    'extra_stop_fee', v_stop
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_driver_pay(uuid, text, numeric, numeric, numeric, numeric) TO authenticated;

-- Accrue wage from base + km + extra purchase points
CREATE OR REPLACE FUNCTION public.complete_driver_delivery(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver public.drivers%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_collect numeric := 0;
  v_wage numeric := 0;
  v_other_active integer := 0;
  v_is_extra boolean := false;
  v_wage_note text := 'أجر توصيل من المتجر';
  v_total_km numeric := 0;
  v_points integer := 0;
  v_base numeric := 0;
  v_km_part numeric := 0;
  v_stop_part numeric := 0;
BEGIN
  SELECT * INTO v_driver FROM public.drivers WHERE user_id = auth.uid();
  IF v_driver.id IS NULL THEN
    RAISE EXCEPTION 'ليس لديك حساب مندوب';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الطلب غير موجود';
  END IF;

  IF v_order.driver_id IS DISTINCT FROM v_driver.id THEN
    RAISE EXCEPTION 'هذا الطلب غير معيّن لك';
  END IF;

  IF v_order.status = 'delivered' THEN
    RETURN jsonb_build_object('success', true, 'already', true, 'collected', COALESCE(v_order.collected_amount, 0));
  END IF;

  IF v_order.status IS DISTINCT FROM 'on_the_way'::public.order_status THEN
    RAISE EXCEPTION 'يجب أن يكون الطلب في الطريق قبل تأكيد التسليم';
  END IF;

  IF v_order.payment_method = 'cash' THEN
    v_collect := COALESCE(v_order.total, 0);
  END IF;

  IF v_driver.pay_type = 'per_order' THEN
    SELECT
      coalesce(sum(opp.distance_km), 0),
      count(*)::integer
    INTO v_total_km, v_points
    FROM public.order_purchase_points opp
    WHERE opp.order_id = p_order_id;

    IF v_points IS NULL OR v_points < 1 THEN
      v_points := 1;
      v_total_km := 0;
    END IF;

    SELECT count(*)::integer INTO v_other_active
    FROM public.orders o
    WHERE o.driver_id = v_driver.id
      AND o.id IS DISTINCT FROM p_order_id
      AND o.status IN (
        'assigned',
        'preparing',
        'awaiting_price_approval',
        'price_approved',
        'on_the_way'
      );

    v_is_extra := v_other_active > 0;
    IF v_is_extra AND COALESCE(v_driver.extra_order_fee, 0) > 0 THEN
      v_base := v_driver.extra_order_fee;
    ELSE
      v_base := COALESCE(v_driver.per_delivery_fee, 0);
    END IF;

    v_km_part := ROUND(COALESCE(v_total_km, 0) * COALESCE(v_driver.wage_per_km, 0), 2);
    v_stop_part := GREATEST(0, v_points - 1) * COALESCE(v_driver.extra_stop_fee, 0);
    v_wage := ROUND(v_base + v_km_part + v_stop_part, 2);

    v_wage_note := format(
      'أجر توصيل: أساسي %s + %s كم × %s + %s نقطة إضافية',
      to_char(v_base, 'FM999999990.00'),
      to_char(COALESCE(v_total_km, 0), 'FM999999990.0'),
      to_char(COALESCE(v_driver.wage_per_km, 0), 'FM999999990.00'),
      GREATEST(0, v_points - 1)::text
    );
  END IF;

  UPDATE public.orders
  SET
    status = 'delivered',
    delivered_at = COALESCE(delivered_at, now()),
    collected_amount = v_collect,
    payment_status = CASE
      WHEN v_order.payment_method = 'cash' THEN 'paid'::public.payment_status
      ELSE payment_status
    END
  WHERE id = p_order_id;

  UPDATE public.drivers
  SET
    total_deliveries = total_deliveries + 1,
    total_earnings = total_earnings + v_collect,
    unpaid_delivery_pay = unpaid_delivery_pay + v_wage
  WHERE id = v_driver.id;

  IF v_collect > 0 THEN
    INSERT INTO public.driver_wallet (driver_id, balance, total_collected)
    VALUES (v_driver.id, v_collect, v_collect)
    ON CONFLICT (driver_id) DO UPDATE SET
      balance = public.driver_wallet.balance + EXCLUDED.balance,
      total_collected = public.driver_wallet.total_collected + EXCLUDED.total_collected;

    INSERT INTO public.wallet_transactions (driver_id, order_id, type, amount, notes)
    VALUES (v_driver.id, p_order_id, 'collection', v_collect, 'تحصيل نقدي عند التسليم');
  END IF;

  IF v_wage > 0 THEN
    INSERT INTO public.wallet_transactions (driver_id, order_id, type, amount, notes)
    VALUES (v_driver.id, p_order_id, 'commission', v_wage, v_wage_note);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'collected', v_collect,
    'wage', v_wage,
    'wage_is_extra', v_is_extra,
    'wage_km', v_total_km,
    'wage_points', v_points
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_driver_delivery(uuid) TO authenticated;

-- create_driver: accept wage_per_km + extra_stop_fee
DROP FUNCTION IF EXISTS public.create_driver(text, text, text, text, text, text, uuid, text, numeric, integer, numeric);
DROP FUNCTION IF EXISTS public.create_driver(text, text, text, text, text, text, uuid, text, numeric, integer, numeric, numeric);
DROP FUNCTION IF EXISTS public.create_driver(text, text, text, text, text, text, uuid, text, numeric, integer, numeric, numeric, numeric, numeric);

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
  p_max_cash_on_hand numeric DEFAULT NULL,
  p_extra_order_fee numeric DEFAULT 0,
  p_wage_per_km numeric DEFAULT 0,
  p_extra_stop_fee numeric DEFAULT 0
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
  v_extra numeric := GREATEST(0, coalesce(p_extra_order_fee, 0));
  v_per_km numeric := GREATEST(0, coalesce(p_wage_per_km, 0));
  v_stop numeric := GREATEST(0, coalesce(p_extra_stop_fee, 0));
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
  IF v_pay = 'per_order' AND v_fee <= 0 AND v_per_km <= 0 THEN
    RAISE EXCEPTION 'حدد أجر أساسي أو أجراً لكل كم للمندوب';
  END IF;
  IF v_pay = 'salary' THEN
    v_fee := 0;
    v_extra := 0;
    v_per_km := 0;
    v_stop := 0;
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

  UPDATE public.profiles SET full_name = v_name, city = NULL WHERE user_id = v_user_id;

  INSERT INTO public.drivers (
    user_id, full_name, phone, email, id_number, vehicle_type, is_available, status,
    pay_type, per_delivery_fee, extra_order_fee, wage_per_km, extra_stop_fee, unpaid_delivery_pay,
    max_active_orders, max_cash_on_hand
  )
  VALUES (
    v_user_id, v_name, v_phone, v_email, v_id_number, v_vehicle, true, 'active',
    v_pay, v_fee, v_extra, v_per_km, v_stop, 0,
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

GRANT EXECUTE ON FUNCTION public.create_driver(text, text, text, text, text, text, uuid, text, numeric, integer, numeric, numeric, numeric, numeric) TO authenticated;
