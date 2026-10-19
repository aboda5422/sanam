-- Retail collection hub: who may settle driver cash wallets / wages (no wholesale roles).

CREATE OR REPLACE FUNCTION public.can_settle_driver_wallet_action(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_user_id IS NOT NULL
    AND (
      public.has_role(p_user_id, 'site_admin'::public.app_role)
      OR public.has_role(p_user_id, 'store_admin'::public.app_role)
      OR public.has_role(p_user_id, 'accountant'::public.app_role)
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_settle_driver_wallet_action(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_settle_driver_wages_action(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_user_id IS NOT NULL
    AND (
      public.has_role(p_user_id, 'site_admin'::public.app_role)
      OR public.has_role(p_user_id, 'store_admin'::public.app_role)
      OR public.has_role(p_user_id, 'accountant'::public.app_role)
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_settle_driver_wages_action(uuid) TO authenticated;

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
  IF NOT public.can_settle_driver_wallet_action(auth.uid()) THEN
    RAISE EXCEPTION 'تسوية محفظة المندوب متاحة لمدير الموقع أو المحاسب من مركز التحصيل';
  END IF;

  IF v_method NOT IN ('cash', 'card') THEN
    RAISE EXCEPTION 'طريقة التسوية غير صحيحة';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = p_driver_id) THEN
    RAISE EXCEPTION 'المندوب غير موجود';
  END IF;

  -- Branch managers historically scoped by branch; accountants/site_admin see all.
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
      public.has_role(auth.uid(), 'site_admin')
      OR public.has_role(auth.uid(), 'accountant')
      OR branch_id IS NULL
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

GRANT EXECUTE ON FUNCTION public.settle_driver_wallet(uuid, text) TO authenticated;
