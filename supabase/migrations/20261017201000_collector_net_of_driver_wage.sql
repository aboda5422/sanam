-- المحصل يستلم من الكاش ما تبقى بعد أجر المندوب، لا كامل قيمة الطلب.
-- طلب الشبكة: قيمة الطلب عند البنك، والمحصل يصرف للمندوب أجره فقط.

CREATE OR REPLACE FUNCTION public.settle_driver_wallet(p_driver_id uuid, p_method text DEFAULT 'cash')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gross numeric := 0;
  v_wage numeric := 0;
  v_remit numeric := 0;
  v_method text := lower(trim(coalesce(p_method, 'cash')));
  v_orders int := 0;
BEGIN
  IF NOT public.can_settle_driver_wallet_action(auth.uid()) THEN
    RAISE EXCEPTION 'تسوية محفظة المندوب متاحة لمدير الموقع أو المحاسب من مركز التحصيل';
  END IF;

  IF v_method NOT IN ('cash', 'card') THEN
    RAISE EXCEPTION 'طريقة التسوية غير صحيحة';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = p_driver_id) THEN
    RAISE EXCEPTION 'المندوب غير موجود';
  END IF;

  IF public.has_role(auth.uid(), 'store_admin')
     AND NOT public.has_role(auth.uid(), 'site_admin')
     AND NOT public.has_role(auth.uid(), 'accountant') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.driver_branches db
      WHERE db.driver_id = p_driver_id
        AND db.branch_id IN (SELECT public.admin_branch_ids(auth.uid()))
    ) THEN
      RAISE EXCEPTION 'هذا المندوب ليس ضمن فروعك';
    END IF;
  END IF;

  PERFORM 1
  FROM public.driver_wallet
  WHERE driver_id = p_driver_id
  FOR UPDATE;

  SELECT COALESCE(SUM(GREATEST(COALESCE(o.collected_amount, o.total, 0), 0)), 0)
  INTO v_gross
  FROM public.orders o
  WHERE o.driver_id = p_driver_id
    AND o.status = 'delivered'
    AND o.payment_method = 'cash'
    AND o.cash_settled_at IS NULL
    AND GREATEST(COALESCE(o.collected_amount, o.total, 0), 0) > 0
    AND (
      public.has_role(auth.uid(), 'site_admin')
      OR public.has_role(auth.uid(), 'accountant')
      OR o.branch_id IS NULL
      OR o.branch_id IN (SELECT public.admin_branch_ids(auth.uid()))
    );

  SELECT COALESCE(SUM(wt.amount), 0)
  INTO v_wage
  FROM public.wallet_transactions wt
  WHERE wt.driver_id = p_driver_id
    AND wt.type = 'commission'
    AND wt.order_id IN (
      SELECT o.id
      FROM public.orders o
      WHERE o.driver_id = p_driver_id
        AND o.status = 'delivered'
        AND o.payment_method = 'cash'
        AND o.cash_settled_at IS NULL
    );

  v_remit := ROUND(GREATEST(v_gross - v_wage, 0), 2);

  UPDATE public.orders
  SET cash_settled_at = now()
  WHERE driver_id = p_driver_id
    AND status = 'delivered'
    AND payment_method = 'cash'
    AND COALESCE(collected_amount, 0) > 0
    AND cash_settled_at IS NULL
    AND (
      public.has_role(auth.uid(), 'site_admin')
      OR public.has_role(auth.uid(), 'accountant')
      OR branch_id IS NULL
      OR branch_id IN (SELECT public.admin_branch_ids(auth.uid()))
    );

  GET DIAGNOSTICS v_orders = ROW_COUNT;

  IF v_orders = 0 THEN
    RETURN jsonb_build_object('success', true, 'amount', 0, 'orders', 0);
  END IF;

  UPDATE public.driver_wallet
  SET balance = GREATEST(0, balance - v_gross)
  WHERE driver_id = p_driver_id;

  UPDATE public.drivers
  SET unpaid_delivery_pay = GREATEST(0, COALESCE(unpaid_delivery_pay, 0) - ROUND(v_wage, 2))
  WHERE id = p_driver_id;

  IF v_remit > 0 THEN
    INSERT INTO public.wallet_transactions (driver_id, type, amount, notes)
    VALUES (
      p_driver_id,
      'settlement',
      v_remit,
      CASE WHEN v_method = 'card' THEN 'تسوية عبر الشبكة' ELSE 'تسوية نقدية' END
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'amount', v_remit,
    'gross', v_gross,
    'wage_kept', ROUND(v_wage, 2),
    'method', v_method,
    'orders', v_orders
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.pay_driver_network_wages(p_driver_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount numeric := 0;
  v_orders int := 0;
BEGIN
  IF NOT public.can_settle_driver_wallet_action(auth.uid()) THEN
    RAISE EXCEPTION 'صرف أجر الشبكة متاح لمدير الموقع أو المحاسب من مركز التحصيل';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = p_driver_id) THEN
    RAISE EXCEPTION 'المندوب غير موجود';
  END IF;

  IF public.has_role(auth.uid(), 'store_admin')
     AND NOT public.has_role(auth.uid(), 'site_admin')
     AND NOT public.has_role(auth.uid(), 'accountant') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.driver_branches db
      WHERE db.driver_id = p_driver_id
        AND db.branch_id IN (SELECT public.admin_branch_ids(auth.uid()))
    ) THEN
      RAISE EXCEPTION 'هذا المندوب ليس ضمن فروعك';
    END IF;
  END IF;

  SELECT COALESCE(SUM(ROUND(w.wage, 2)), 0), COUNT(*)
  INTO v_amount, v_orders
  FROM public.orders o
  JOIN (
    SELECT order_id, SUM(amount) AS wage
    FROM public.wallet_transactions
    WHERE driver_id = p_driver_id
      AND type = 'commission'
      AND order_id IS NOT NULL
    GROUP BY order_id
  ) w ON w.order_id = o.id
  WHERE o.driver_id = p_driver_id
    AND o.status = 'delivered'
    AND o.payment_method IS DISTINCT FROM 'cash'
    AND COALESCE(w.wage, 0) > 0
    AND NOT EXISTS (
      SELECT 1
      FROM public.wallet_transactions paid
      WHERE paid.driver_id = p_driver_id
        AND paid.order_id = o.id
        AND paid.type = 'settlement'
        AND COALESCE(paid.notes, '') LIKE '%صرف أجر%'
    );

  IF v_orders = 0 OR v_amount <= 0 THEN
    RETURN jsonb_build_object('success', true, 'amount', 0, 'orders', 0);
  END IF;

  INSERT INTO public.wallet_transactions (driver_id, order_id, type, amount, notes)
  SELECT
    p_driver_id,
    o.id,
    'settlement',
    ROUND(COALESCE(w.wage, 0), 2),
    'صرف أجر شبكة — للمندوب'
  FROM public.orders o
  JOIN (
    SELECT order_id, SUM(amount) AS wage
    FROM public.wallet_transactions
    WHERE driver_id = p_driver_id
      AND type = 'commission'
      AND order_id IS NOT NULL
    GROUP BY order_id
  ) w ON w.order_id = o.id
  WHERE o.driver_id = p_driver_id
    AND o.status = 'delivered'
    AND o.payment_method IS DISTINCT FROM 'cash'
    AND COALESCE(w.wage, 0) > 0
    AND NOT EXISTS (
      SELECT 1
      FROM public.wallet_transactions paid
      WHERE paid.driver_id = p_driver_id
        AND paid.order_id = o.id
        AND paid.type = 'settlement'
        AND COALESCE(paid.notes, '') LIKE '%صرف أجر%'
    );

  UPDATE public.drivers
  SET unpaid_delivery_pay = GREATEST(0, COALESCE(unpaid_delivery_pay, 0) - ROUND(v_amount, 2))
  WHERE id = p_driver_id;

  RETURN jsonb_build_object('success', true, 'amount', ROUND(v_amount, 2), 'orders', v_orders);
END;
$$;

GRANT EXECUTE ON FUNCTION public.pay_driver_network_wages(uuid) TO authenticated;
