-- أجر المندوب على نفس شرائح مسافة العميل (سعر منفصل قابل للتعديل)

ALTER TABLE public.branch_delivery_rates
  ADD COLUMN IF NOT EXISTS driver_fee numeric(10,2) NOT NULL DEFAULT 0
    CHECK (driver_fee >= 0);

COMMENT ON COLUMN public.branch_delivery_rates.driver_fee IS
  'أجر المندوب لهذه الشريحة (من المتجر) — مستقل عن رسوم العميل fee';

-- تهيئة أولية: أجر المندوب ≈ 70% من رسوم العميل إن كان صفراً
UPDATE public.branch_delivery_rates
SET driver_fee = ROUND(GREATEST(0, fee * 0.7), 2)
WHERE driver_fee = 0 AND fee > 0;

ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS driver_extra_stop_fee numeric(10,2) NOT NULL DEFAULT 0
    CHECK (driver_extra_stop_fee >= 0);

COMMENT ON COLUMN public.branches.driver_extra_stop_fee IS
  'أجر المندوب لكل نقطة شراء بعد الأولى (مقابل extra_stop_fee على العميل)';

UPDATE public.branches
SET driver_extra_stop_fee = ROUND(GREATEST(0, COALESCE(extra_stop_fee, 0) * 0.7), 2)
WHERE driver_extra_stop_fee = 0 AND COALESCE(extra_stop_fee, 0) > 0;

-- احتساب أجر الشريحة من إجمالي المسافة
CREATE OR REPLACE FUNCTION public.driver_fee_for_distance(
  p_branch_id uuid,
  p_distance_km numeric,
  p_fallback numeric DEFAULT 0
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_fee numeric;
BEGIN
  SELECT r.driver_fee INTO v_fee
  FROM public.branch_delivery_rates r
  WHERE r.branch_id = p_branch_id
    AND r.max_distance_km >= GREATEST(0, coalesce(p_distance_km, 0))
  ORDER BY r.max_distance_km ASC
  LIMIT 1;

  IF v_fee IS NULL THEN
    SELECT r.driver_fee INTO v_fee
    FROM public.branch_delivery_rates r
    WHERE r.branch_id = p_branch_id
    ORDER BY r.max_distance_km DESC
    LIMIT 1;
  END IF;

  RETURN ROUND(COALESCE(v_fee, p_fallback, 0), 2);
END;
$$;

GRANT EXECUTE ON FUNCTION public.driver_fee_for_distance(uuid, numeric, numeric) TO authenticated;

-- أجر التسليم: شريحة مسافة الفرع + نقاط إضافية (وليس ر.س/كم خطي)
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
  v_stop_fee numeric := 0;
  v_stop_part numeric := 0;
  v_branch_stop numeric := 0;
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

    -- شريحة المسافة من فرع الطلب (نفس كم العميل، سعر المندوب)
    v_base := public.driver_fee_for_distance(
      v_order.branch_id,
      v_total_km,
      COALESCE(v_driver.per_delivery_fee, 0)
    );

    -- عند تعدد الطلبات النشطة يمكن استبدال الأساس ببدل ثابت إن وُجد
    IF v_is_extra AND COALESCE(v_driver.extra_order_fee, 0) > 0 THEN
      v_base := v_driver.extra_order_fee;
    END IF;

    SELECT COALESCE(b.driver_extra_stop_fee, 0) INTO v_branch_stop
    FROM public.branches b
    WHERE b.id = v_order.branch_id;

    v_stop_fee := CASE
      WHEN COALESCE(v_driver.extra_stop_fee, 0) > 0 THEN v_driver.extra_stop_fee
      ELSE COALESCE(v_branch_stop, 0)
    END;
    v_stop_part := GREATEST(0, v_points - 1) * v_stop_fee;
    v_wage := ROUND(v_base + v_stop_part, 2);

    v_wage_note := format(
      'أجر توصيل: شريحة %s كم = %s + %s نقطة إضافية × %s',
      to_char(COALESCE(v_total_km, 0), 'FM999999990.0'),
      to_char(v_base, 'FM999999990.00'),
      GREATEST(0, v_points - 1)::text,
      to_char(v_stop_fee, 'FM999999990.00')
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
    'wage_points', v_points,
    'wage_tier', v_base
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_driver_delivery(uuid) TO authenticated;

-- تحديث أجر المندوب: لا يشترط أجراً أساسياً إن وُجدت شرائح الفرع
CREATE OR REPLACE FUNCTION public.update_driver_pay(
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
  v_branch uuid;
  v_has_tiers boolean := false;
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

  SELECT db.branch_id INTO v_branch
  FROM public.driver_branches db
  WHERE db.driver_id = p_driver_id
  LIMIT 1;

  IF v_branch IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.branch_delivery_rates r WHERE r.branch_id = v_branch
    ) INTO v_has_tiers;
  END IF;

  IF v_pay = 'per_order' AND v_fee <= 0 AND NOT v_has_tiers THEN
    RAISE EXCEPTION 'حدد أجراً أساسياً أو أضف شرائح أجر المندوب من إعدادات التوصيل';
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

-- create_driver: يسمح حسب الطلب عند وجود شرائح
CREATE OR REPLACE FUNCTION public.create_driver(
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
  v_has_tiers boolean := false;
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

  SELECT EXISTS (
    SELECT 1 FROM public.branch_delivery_rates r WHERE r.branch_id = v_branch
  ) INTO v_has_tiers;

  IF v_pay = 'per_order' AND v_fee <= 0 AND NOT v_has_tiers THEN
    RAISE EXCEPTION 'حدد أجراً أساسياً أو أضف شرائح أجر المندوب من إعدادات التوصيل';
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
    v_pay, v_fee, v_extra, 0, v_stop, 0,
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
