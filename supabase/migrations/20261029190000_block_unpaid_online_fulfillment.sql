-- Prevent drivers (and status progression) from fulfilling non-cash orders
-- before payment_status = paid. Checkout may leave payment_method=online +
-- payment_status=pending while awaiting Moyasar; those must not enter the
-- driver pool or be marked delivered.

CREATE OR REPLACE FUNCTION public.order_payment_allows_driver_work(
  p_payment_method text,
  p_payment_status public.payment_status
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    COALESCE(p_payment_method, '') = 'cash'
    OR p_payment_status = 'paid'::public.payment_status;
$$;

COMMENT ON FUNCTION public.order_payment_allows_driver_work(text, public.payment_status) IS
  'Cash COD always OK; card/online/transfer require payment_status=paid';

GRANT EXECUTE ON FUNCTION public.order_payment_allows_driver_work(text, public.payment_status) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_order_payment_before_fulfillment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.order_payment_allows_driver_work(NEW.payment_method, NEW.payment_status) THEN
    RETURN NEW;
  END IF;

  -- Already delivered unpaid (legacy bad rows): allow non-fulfillment field updates
  IF TG_OP = 'UPDATE'
     AND OLD.status = 'delivered'::public.order_status
     AND NEW.status = 'delivered'::public.order_status THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.driver_id IS NOT NULL
     AND OLD.driver_id IS DISTINCT FROM NEW.driver_id THEN
    RAISE EXCEPTION 'لا يمكن إسناد طلب إلكتروني للمندوب قبل إتمام الدفع'
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.status::text IN ('assigned', 'preparing', 'ready', 'on_the_way', 'delivered')
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    RAISE EXCEPTION 'لا يمكن تنفيذ أو تسليم طلب إلكتروني قبل إتمام الدفع'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_enforce_payment_before_fulfillment ON public.orders;
CREATE TRIGGER orders_enforce_payment_before_fulfillment
  BEFORE INSERT OR UPDATE OF driver_id, status, payment_method, payment_status
  ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_order_payment_before_fulfillment();

-- Pool visibility: unpaid online/transfer never appear as available
DROP POLICY IF EXISTS "Drivers can view available and assigned orders" ON public.orders;
CREATE POLICY "Drivers can view available and assigned orders"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'driver')
    AND (
      driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid())
      OR (
        public.driver_is_available(auth.uid())
        AND status IN ('pending', 'preparing', 'ready')
        AND driver_id IS NULL
        AND public.order_payment_allows_driver_work(payment_method, payment_status)
        AND branch_id IN (SELECT public.driver_assigned_branch_ids(auth.uid()))
      )
    )
  );

-- Claim: same payment gate on unassigned rows
DROP POLICY IF EXISTS "Drivers can claim and update orders" ON public.orders;
CREATE POLICY "Drivers can claim and update orders"
  ON public.orders
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'driver')
    AND (
      driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid())
      OR (
        public.driver_is_available(auth.uid())
        AND status IN ('pending', 'ready')
        AND driver_id IS NULL
        AND public.order_payment_allows_driver_work(payment_method, payment_status)
        AND branch_id IN (SELECT public.driver_assigned_branch_ids(auth.uid()))
      )
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'driver')
    AND driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid())
  );

-- Patch delivery RPC: reject unpaid non-cash before any side effects.
-- Full body kept in sync with 20261017190000 + payment gate.
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
  v_fee numeric := 0;
  v_site numeric := 0;
  v_signed numeric := 0;
  v_method text := 'card';
  v_clearing jsonb;
  v_clearing_note text;
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

  IF NOT public.order_payment_allows_driver_work(v_order.payment_method, v_order.payment_status) THEN
    RAISE EXCEPTION 'لا يمكن تسليم طلب إلكتروني قبل إتمام الدفع'
      USING ERRCODE = 'P0001';
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
      AND o.status::text IN (
        'assigned',
        'preparing',
        'ready',
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

  v_fee := ROUND(GREATEST(COALESCE(v_order.delivery_fee, 0), 0), 2);
  v_site := ROUND(GREATEST(v_fee - v_wage, 0), 2);
  v_method := CASE WHEN v_order.payment_method = 'cash' THEN 'cash' ELSE 'card' END;

  IF v_method = 'cash' THEN
    v_signed := ROUND(v_wage - v_fee, 2);
    IF v_driver.pay_type = 'per_order' THEN
      v_clearing_note := format(
        'كاش: أجرة التوصيل %s − أجر المندوب %s = حصة الموقع %s',
        to_char(v_fee, 'FM999999990.00'),
        to_char(v_wage, 'FM999999990.00'),
        to_char(v_site, 'FM999999990.00')
      );
    ELSE
      v_clearing_note := format(
        'كاش · راتب: أجرة التوصيل %s كاملة على المندوب',
        to_char(v_fee, 'FM999999990.00')
      );
    END IF;
  ELSE
    v_signed := ROUND(v_wage, 2);
    IF v_driver.pay_type = 'per_order' THEN
      v_clearing_note := format(
        'شبكة: أجرة التوصيل %s وصلت للموقع، وأجر المندوب %s مستحق له',
        to_char(v_fee, 'FM999999990.00'),
        to_char(v_wage, 'FM999999990.00')
      );
    ELSE
      v_clearing_note := format(
        'شبكة · راتب: أجرة التوصيل %s وصلت للموقع، ولا تُحمَّل على المندوب',
        to_char(v_fee, 'FM999999990.00')
      );
    END IF;
  END IF;

  v_clearing := NULL;
  IF v_fee > 0 OR v_wage > 0 THEN
    v_clearing := public.post_driver_clearing(
      v_driver.id,
      p_order_id,
      'allocation',
      COALESCE(v_driver.pay_type, 'salary'),
      v_method,
      v_fee,
      v_wage,
      v_site,
      v_signed,
      NULL,
      'posted',
      v_clearing_note,
      auth.uid()
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'collected', v_collect,
    'wage', v_wage,
    'wage_is_extra', v_is_extra,
    'wage_km', v_total_km,
    'wage_points', v_points,
    'wage_tier', v_base,
    'delivery_fee', v_fee,
    'site_share', v_site,
    'clearing_signed', v_signed,
    'clearing_balance', COALESCE(v_clearing->>'balance_after', NULL),
    'clearing_receipt', v_clearing->>'receipt_no'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_driver_delivery(uuid) TO authenticated;
