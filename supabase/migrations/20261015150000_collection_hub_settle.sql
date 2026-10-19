-- Collection hub: driver cash settle (site_admin / accountant) + POS cashier cash remittance.
-- Branch managers keep wage settle only; they no longer settle driver cash wallets.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

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
      public.has_role(p_user_id, 'store_admin'::public.app_role)
      OR public.has_role(p_user_id, 'site_admin'::public.app_role)
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_settle_driver_wages_action(uuid) TO authenticated;

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
      OR public.has_role(p_user_id, 'accountant'::public.app_role)
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_settle_driver_wallet_action(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.driver_wallet_settle_scope_ok(p_driver_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR p_driver_id IS NULL THEN
    RETURN false;
  END IF;

  -- Hub collectors (site_admin / accountant): any driver
  IF public.can_settle_driver_wallet_action(p_user_id) THEN
    RETURN EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = p_driver_id);
  END IF;

  -- Branch managers (wages): drivers linked to their branches
  IF public.has_role(p_user_id, 'store_admin'::public.app_role) THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.driver_branches db
      WHERE db.driver_id = p_driver_id
        AND db.branch_id IN (SELECT public.admin_branch_ids(p_user_id))
    );
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.driver_wallet_settle_scope_ok(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- settle_driver_pay (wages) — store_admin (branch scope) + site_admin
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.settle_driver_pay(p_driver_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount numeric := 0;
BEGIN
  IF NOT public.can_settle_driver_wages_action(auth.uid()) THEN
    RAISE EXCEPTION 'سداد أجور المندوب غير متاح لهذا الحساب';
  END IF;

  IF NOT public.driver_wallet_settle_scope_ok(p_driver_id, auth.uid()) THEN
    RAISE EXCEPTION 'هذا المندوب ليس ضمن نطاقك';
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

-- ---------------------------------------------------------------------------
-- settle_driver_wallet (cash) — site_admin / accountant only
-- ---------------------------------------------------------------------------

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
    RAISE EXCEPTION 'تسوية محفظة المندوب غير متاحة لهذا الحساب';
  END IF;

  IF v_method NOT IN ('cash', 'card') THEN
    RAISE EXCEPTION 'طريقة التسوية غير صحيحة';
  END IF;

  IF NOT public.driver_wallet_settle_scope_ok(p_driver_id, auth.uid()) THEN
    RAISE EXCEPTION 'هذا المندوب ليس ضمن نطاقك';
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

  -- Hub roles mark all matching orders for this driver
  UPDATE public.orders
  SET cash_settled_at = now()
  WHERE driver_id = p_driver_id
    AND status = 'delivered'
    AND payment_method = 'cash'
    AND COALESCE(collected_amount, 0) > 0
    AND cash_settled_at IS NULL;

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

-- Allow panel staff (incl. accountant) to read wallets for the hub UI
DROP POLICY IF EXISTS "Admins view all wallets" ON public.driver_wallet;
CREATE POLICY "Admins view all wallets"
  ON public.driver_wallet FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'store_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'site_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'accountant'::public.app_role)
  );

DROP POLICY IF EXISTS "Admins view all transactions" ON public.wallet_transactions;
CREATE POLICY "Admins view all transactions"
  ON public.wallet_transactions FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'store_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'site_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'accountant'::public.app_role)
  );

-- Accountant needs driver names when joining wallets / settlements in the hub
DROP POLICY IF EXISTS "Admins can view all drivers" ON public.drivers;
CREATE POLICY "Admins can view all drivers"
  ON public.drivers FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'store_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'site_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'accountant'::public.app_role)
  );

-- ---------------------------------------------------------------------------
-- POS shift cash collections
-- ---------------------------------------------------------------------------

ALTER TABLE public.pos_shifts
  ADD COLUMN IF NOT EXISTS cash_collected_total NUMERIC(12,2) NOT NULL DEFAULT 0
    CHECK (cash_collected_total >= 0);

COMMENT ON COLUMN public.pos_shifts.cash_collected_total IS
  'Total cash remitted to collection hub from this shift';

CREATE TABLE IF NOT EXISTS public.pos_shift_cash_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID NOT NULL REFERENCES public.pos_shifts(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  station_id UUID NOT NULL REFERENCES public.pos_stations(id) ON DELETE RESTRICT,
  cashier_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  collected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_shift_cash_collections_shift
  ON public.pos_shift_cash_collections(shift_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pos_shift_cash_collections_created
  ON public.pos_shift_cash_collections(created_at DESC);

ALTER TABLE public.pos_shift_cash_collections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Panel read pos shift cash collections" ON public.pos_shift_cash_collections;
CREATE POLICY "Panel read pos shift cash collections"
  ON public.pos_shift_cash_collections FOR SELECT TO authenticated
  USING (public.is_panel_user());

DROP POLICY IF EXISTS "Panel insert pos shift cash collections" ON public.pos_shift_cash_collections;
CREATE POLICY "Panel insert pos shift cash collections"
  ON public.pos_shift_cash_collections FOR INSERT TO authenticated
  WITH CHECK (public.is_panel_user());

CREATE OR REPLACE FUNCTION public.can_collect_pos_cash_action(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_settle_driver_wallet_action(p_user_id);
$$;

GRANT EXECUTE ON FUNCTION public.can_collect_pos_cash_action(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.pos_shift_cash_sales(p_shift_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(p.amount), 0)
  FROM public.pos_payments p
  INNER JOIN public.pos_sales s ON s.id = p.sale_id
  WHERE s.shift_id = p_shift_id
    AND s.status = 'completed'
    AND p.method = 'cash';
$$;

GRANT EXECUTE ON FUNCTION public.pos_shift_cash_sales(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.pos_shift_cash_pending(p_shift_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shift public.pos_shifts%ROWTYPE;
  v_sales numeric := 0;
  v_base numeric := 0;
BEGIN
  SELECT * INTO v_shift FROM public.pos_shifts WHERE id = p_shift_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  v_sales := public.pos_shift_cash_sales(p_shift_id);

  IF v_shift.status = 'open' THEN
    v_base := COALESCE(v_shift.opening_cash, 0) + v_sales;
  ELSE
    v_base := COALESCE(
      v_shift.expected_cash,
      v_shift.closing_cash,
      COALESCE(v_shift.opening_cash, 0) + v_sales
    );
  END IF;

  RETURN GREATEST(0, round(v_base - COALESCE(v_shift.cash_collected_total, 0), 2));
END;
$$;

GRANT EXECUTE ON FUNCTION public.pos_shift_cash_pending(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.collect_pos_shift_cash(
  p_shift_id uuid,
  p_amount numeric DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shift public.pos_shifts%ROWTYPE;
  v_pending numeric := 0;
  v_amount numeric := 0;
  v_collection_id uuid;
BEGIN
  IF NOT public.can_collect_pos_cash_action(auth.uid()) THEN
    RAISE EXCEPTION 'استلام نقد الكاشير غير متاح لهذا الحساب';
  END IF;

  SELECT * INTO v_shift FROM public.pos_shifts WHERE id = p_shift_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الوردية غير موجودة';
  END IF;

  v_pending := public.pos_shift_cash_pending(p_shift_id);
  v_amount := round(COALESCE(p_amount, v_pending), 2);

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'لا يوجد نقد بانتظار الاستلام من هذه الوردية';
  END IF;
  IF v_amount > v_pending + 0.001 THEN
    RAISE EXCEPTION 'المبلغ أكبر من العهدة المتبقية (% ر.س)', v_pending;
  END IF;

  INSERT INTO public.pos_shift_cash_collections (
    shift_id, branch_id, station_id, cashier_id, amount, collected_by, note
  ) VALUES (
    v_shift.id,
    v_shift.branch_id,
    v_shift.station_id,
    v_shift.cashier_id,
    v_amount,
    auth.uid(),
    NULLIF(trim(COALESCE(p_note, '')), '')
  )
  RETURNING id INTO v_collection_id;

  UPDATE public.pos_shifts
  SET cash_collected_total = COALESCE(cash_collected_total, 0) + v_amount
  WHERE id = v_shift.id;

  RETURN jsonb_build_object(
    'success', true,
    'collection_id', v_collection_id,
    'amount', v_amount,
    'pending_after', public.pos_shift_cash_pending(p_shift_id),
    'shift_id', v_shift.id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.collect_pos_shift_cash(uuid, numeric, text) TO authenticated;
