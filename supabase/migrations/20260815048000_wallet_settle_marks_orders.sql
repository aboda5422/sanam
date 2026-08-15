-- Link wallet cash settlement to sales "ترحيل" status (orders.cash_settled_at).

CREATE OR REPLACE FUNCTION public.settle_driver_wallet(p_driver_id uuid, p_method text DEFAULT 'cash')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount numeric := 0;
  v_method text := lower(trim(coalesce(p_method, 'cash')));
  v_orders int := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'store_admin') THEN
    RAISE EXCEPTION 'تسوية محفظة المندوب متاحة لمدير الفرع فقط';
  END IF;

  IF v_method NOT IN ('cash', 'card') THEN
    RAISE EXCEPTION 'طريقة التسوية غير صحيحة';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.driver_branches db
    WHERE db.driver_id = p_driver_id
      AND db.branch_id IN (SELECT public.admin_branch_ids(auth.uid()))
  ) THEN
    RAISE EXCEPTION 'هذا المندوب ليس ضمن فروعك';
  END IF;

  SELECT balance INTO v_amount
  FROM public.driver_wallet
  WHERE driver_id = p_driver_id
  FOR UPDATE;

  IF v_amount IS NULL THEN
    RAISE EXCEPTION 'محفظة المندوب غير موجودة';
  END IF;
  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('success', true, 'amount', 0, 'orders', 0);
  END IF;

  UPDATE public.orders
  SET cash_settled_at = now()
  WHERE driver_id = p_driver_id
    AND status = 'delivered'
    AND payment_method = 'cash'
    AND COALESCE(collected_amount, 0) > 0
    AND cash_settled_at IS NULL
    AND (
      branch_id IS NULL
      OR branch_id IN (SELECT public.admin_branch_ids(auth.uid()))
    );

  GET DIAGNOSTICS v_orders = ROW_COUNT;

  UPDATE public.driver_wallet
  SET balance = 0
  WHERE driver_id = p_driver_id;

  INSERT INTO public.wallet_transactions (driver_id, type, amount, notes)
  VALUES (
    p_driver_id,
    'settlement',
    v_amount,
    CASE WHEN v_method = 'card' THEN 'تسوية عبر الشبكة' ELSE 'تسوية نقدية' END
  );

  RETURN jsonb_build_object('success', true, 'amount', v_amount, 'method', v_method, 'orders', v_orders);
END;
$$;

-- Backfill: orders delivered before the last wallet settlement are already remitted.
UPDATE public.orders o
SET cash_settled_at = s.last_at
FROM (
  SELECT driver_id, MAX(created_at) AS last_at
  FROM public.wallet_transactions
  WHERE type = 'settlement'
  GROUP BY driver_id
) s
WHERE o.driver_id = s.driver_id
  AND o.status = 'delivered'
  AND o.payment_method = 'cash'
  AND COALESCE(o.collected_amount, 0) > 0
  AND o.cash_settled_at IS NULL
  AND COALESCE(o.delivered_at, o.created_at) <= s.last_at;
