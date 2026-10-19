-- أجر كل مندوب خاص به (نفس مسافات شرائح العميل، أسعار مستقلة)

CREATE TABLE IF NOT EXISTS public.driver_wage_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  max_distance_km numeric(10,2) NOT NULL CHECK (max_distance_km > 0),
  fee numeric(10,2) NOT NULL DEFAULT 0 CHECK (fee >= 0),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (driver_id, max_distance_km)
);

CREATE INDEX IF NOT EXISTS idx_driver_wage_rates_driver ON public.driver_wage_rates(driver_id);

COMMENT ON TABLE public.driver_wage_rates IS
  'شرائح أجر المندوب — المسافات تُزامَن من branch_delivery_rates؛ السعر خاص بكل مندوب';

ALTER TABLE public.driver_wage_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage driver wage rates" ON public.driver_wage_rates;
CREATE POLICY "Admins manage driver wage rates"
  ON public.driver_wage_rates FOR ALL
  USING (
    public.has_role(auth.uid(), 'site_admin'::app_role)
    OR public.has_role(auth.uid(), 'store_admin'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'site_admin'::app_role)
    OR public.has_role(auth.uid(), 'store_admin'::app_role)
  );

DROP POLICY IF EXISTS "Drivers read own wage rates" ON public.driver_wage_rates;
CREATE POLICY "Drivers read own wage rates"
  ON public.driver_wage_rates FOR SELECT
  USING (
    driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid())
  );

-- تهيئة من أسعار الفرع الحالية (إن وُجدت) لكل مندوب حسب فرعه
INSERT INTO public.driver_wage_rates (driver_id, max_distance_km, fee, sort_order)
SELECT
  db.driver_id,
  r.max_distance_km,
  CASE
    WHEN COALESCE(r.driver_fee, 0) > 0 THEN r.driver_fee
    ELSE ROUND(GREATEST(0, r.fee * 0.7), 2)
  END,
  COALESCE(r.sort_order, 0)
FROM public.driver_branches db
JOIN public.branch_delivery_rates r ON r.branch_id = db.branch_id
ON CONFLICT (driver_id, max_distance_km) DO NOTHING;

-- مزامنة المسافات عند إضافة/حذف/تعديل شريحة العميل
CREATE OR REPLACE FUNCTION public.sync_driver_wage_rates_from_branch_rate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branch uuid;
  v_old_km numeric;
  v_new_km numeric;
  v_seed numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_branch := OLD.branch_id;
    v_old_km := OLD.max_distance_km;
    DELETE FROM public.driver_wage_rates dwr
    USING public.driver_branches db
    WHERE dwr.driver_id = db.driver_id
      AND db.branch_id = v_branch
      AND dwr.max_distance_km = v_old_km;
    RETURN OLD;
  END IF;

  v_branch := NEW.branch_id;
  v_new_km := NEW.max_distance_km;
  v_seed := CASE
    WHEN COALESCE(NEW.driver_fee, 0) > 0 THEN NEW.driver_fee
    ELSE ROUND(GREATEST(0, NEW.fee * 0.7), 2)
  END;

  IF TG_OP = 'UPDATE' AND OLD.max_distance_km IS DISTINCT FROM NEW.max_distance_km THEN
    UPDATE public.driver_wage_rates dwr
    SET max_distance_km = v_new_km,
        sort_order = COALESCE(NEW.sort_order, dwr.sort_order),
        updated_at = now()
    FROM public.driver_branches db
    WHERE dwr.driver_id = db.driver_id
      AND db.branch_id = v_branch
      AND dwr.max_distance_km = OLD.max_distance_km;
  END IF;

  -- أدرج الشريحة الجديدة لكل مناديب الفرع دون تغيير أسعارهم الحالية إن وُجدت
  INSERT INTO public.driver_wage_rates (driver_id, max_distance_km, fee, sort_order)
  SELECT db.driver_id, v_new_km, v_seed, COALESCE(NEW.sort_order, 0)
  FROM public.driver_branches db
  WHERE db.branch_id = v_branch
  ON CONFLICT (driver_id, max_distance_km) DO UPDATE
    SET sort_order = EXCLUDED.sort_order,
        updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_driver_wage_rates ON public.branch_delivery_rates;
CREATE TRIGGER trg_sync_driver_wage_rates
  AFTER INSERT OR UPDATE OF max_distance_km, sort_order OR DELETE
  ON public.branch_delivery_rates
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_driver_wage_rates_from_branch_rate();

-- أجر المندوب من شرائحه الخاصة (مع احتياطي فرع ثم أساسي المندوب)
CREATE OR REPLACE FUNCTION public.driver_fee_for_distance(
  p_driver_id uuid,
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
  SELECT r.fee INTO v_fee
  FROM public.driver_wage_rates r
  WHERE r.driver_id = p_driver_id
    AND r.max_distance_km >= GREATEST(0, coalesce(p_distance_km, 0))
  ORDER BY r.max_distance_km ASC
  LIMIT 1;

  IF v_fee IS NULL THEN
    SELECT r.fee INTO v_fee
    FROM public.driver_wage_rates r
    WHERE r.driver_id = p_driver_id
    ORDER BY r.max_distance_km DESC
    LIMIT 1;
  END IF;

  IF v_fee IS NULL AND p_branch_id IS NOT NULL THEN
    SELECT r.driver_fee INTO v_fee
    FROM public.branch_delivery_rates r
    WHERE r.branch_id = p_branch_id
      AND r.max_distance_km >= GREATEST(0, coalesce(p_distance_km, 0))
    ORDER BY r.max_distance_km ASC
    LIMIT 1;
  END IF;

  IF v_fee IS NULL AND p_branch_id IS NOT NULL THEN
    SELECT r.driver_fee INTO v_fee
    FROM public.branch_delivery_rates r
    WHERE r.branch_id = p_branch_id
    ORDER BY r.max_distance_km DESC
    LIMIT 1;
  END IF;

  RETURN ROUND(COALESCE(v_fee, p_fallback, 0), 2);
END;
$$;

-- drop old 3-arg overload if present
DROP FUNCTION IF EXISTS public.driver_fee_for_distance(uuid, numeric, numeric);

GRANT EXECUTE ON FUNCTION public.driver_fee_for_distance(uuid, uuid, numeric, numeric) TO authenticated;

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

    v_base := public.driver_fee_for_distance(
      v_driver.id,
      v_order.branch_id,
      v_total_km,
      COALESCE(v_driver.per_delivery_fee, 0)
    );

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
      'أجر توصيل: شريحة المندوب %s كم = %s + %s نقطة إضافية × %s',
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

-- عند إنشاء مندوب: انسخ مسافات الفرع بأسعار ابتدائية خاصة به
CREATE OR REPLACE FUNCTION public.seed_driver_wage_rates(p_driver_id uuid, p_branch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.driver_wage_rates (driver_id, max_distance_km, fee, sort_order)
  SELECT
    p_driver_id,
    r.max_distance_km,
    CASE
      WHEN COALESCE(r.driver_fee, 0) > 0 THEN r.driver_fee
      ELSE ROUND(GREATEST(0, r.fee * 0.7), 2)
    END,
    COALESCE(r.sort_order, 0)
  FROM public.branch_delivery_rates r
  WHERE r.branch_id = p_branch_id
  ON CONFLICT (driver_id, max_distance_km) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_driver_wage_rates(uuid, uuid) TO authenticated;
