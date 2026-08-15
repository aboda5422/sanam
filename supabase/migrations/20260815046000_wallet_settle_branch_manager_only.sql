-- Settlement (wallet cash + driver pay) is branch-manager only.
-- Site admins can still view wallets.

CREATE OR REPLACE FUNCTION public.settle_driver_pay(p_driver_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount numeric := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'store_admin') THEN
    RAISE EXCEPTION 'سداد أجور المندوب متاح لمدير الفرع فقط';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.driver_branches db
    WHERE db.driver_id = p_driver_id
      AND db.branch_id IN (SELECT public.admin_branch_ids(auth.uid()))
  ) THEN
    RAISE EXCEPTION 'هذا المندوب ليس ضمن فروعك';
  END IF;

  SELECT unpaid_delivery_pay INTO v_amount
  FROM public.drivers
  WHERE id = p_driver_id
  FOR UPDATE;

  IF v_amount IS NULL THEN
    RAISE EXCEPTION 'المندوب غير موجود';
  END IF;
  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('success', true, 'amount', 0);
  END IF;

  UPDATE public.drivers
  SET unpaid_delivery_pay = 0
  WHERE id = p_driver_id;

  INSERT INTO public.wallet_transactions (driver_id, type, amount, notes)
  VALUES (p_driver_id, 'settlement', v_amount, 'سداد أجور التوصيل وتصفير المستحق');

  RETURN jsonb_build_object('success', true, 'amount', v_amount);
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_driver_wallet(p_driver_id uuid, p_method text DEFAULT 'cash')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount numeric := 0;
  v_method text := lower(trim(coalesce(p_method, 'cash')));
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
    RETURN jsonb_build_object('success', true, 'amount', 0);
  END IF;

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

  RETURN jsonb_build_object('success', true, 'amount', v_amount, 'method', v_method);
END;
$$;

GRANT EXECUTE ON FUNCTION public.settle_driver_wallet(uuid, text) TO authenticated;

DROP POLICY IF EXISTS "Admins manage wallets" ON public.driver_wallet;
CREATE POLICY "Branch managers manage wallets"
  ON public.driver_wallet FOR ALL
  USING (public.has_role(auth.uid(), 'store_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'store_admin'));

DROP POLICY IF EXISTS "Admins manage transactions" ON public.wallet_transactions;
CREATE POLICY "Branch managers manage transactions"
  ON public.wallet_transactions FOR ALL
  USING (public.has_role(auth.uid(), 'store_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'store_admin'));
