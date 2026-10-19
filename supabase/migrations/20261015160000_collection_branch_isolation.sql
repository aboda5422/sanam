-- Harden collection hub so branch-scoped staff cannot read/write another branch's
-- POS cash remittances. Site-wide site_admin / unscoped accountant keep full access;
-- UI header filter still scopes their view via scopedBranchIds.

CREATE OR REPLACE FUNCTION public.collection_branch_scope_ok(
  p_branch_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_user_id IS NOT NULL
    AND p_branch_id IS NOT NULL
    AND (
      public.is_super_admin(p_user_id)
      -- Site-wide accountant (no admin_branch_access rows): all branches
      OR (
        public.has_role(p_user_id, 'accountant'::public.app_role)
        AND NOT EXISTS (
          SELECT 1 FROM public.admin_branch_access a WHERE a.user_id = p_user_id
        )
      )
      OR public.can_access_branch(p_user_id, p_branch_id)
    );
$$;

GRANT EXECUTE ON FUNCTION public.collection_branch_scope_ok(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Panel read pos shift cash collections" ON public.pos_shift_cash_collections;
CREATE POLICY "Panel read pos shift cash collections"
  ON public.pos_shift_cash_collections FOR SELECT TO authenticated
  USING (
    public.is_panel_user()
    AND public.collection_branch_scope_ok(branch_id)
  );

DROP POLICY IF EXISTS "Panel insert pos shift cash collections" ON public.pos_shift_cash_collections;
CREATE POLICY "Panel insert pos shift cash collections"
  ON public.pos_shift_cash_collections FOR INSERT TO authenticated
  WITH CHECK (
    public.is_panel_user()
    AND public.collection_branch_scope_ok(branch_id)
  );

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

  IF NOT public.collection_branch_scope_ok(v_shift.branch_id) THEN
    RAISE EXCEPTION 'هذه الوردية خارج نطاق فروعك — لا يُسمح بتداخل التحصيل بين الفروع';
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
    'shift_id', v_shift.id,
    'branch_id', v_shift.branch_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.collect_pos_shift_cash(uuid, numeric, text) TO authenticated;

-- Driver cash settle: branch-scoped accountant may only settle drivers linked to their branches.
CREATE OR REPLACE FUNCTION public.driver_wallet_settle_scope_ok(
  p_driver_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_branch_scope boolean;
BEGIN
  IF p_user_id IS NULL OR p_driver_id IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_super_admin(p_user_id) THEN
    RETURN EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = p_driver_id);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.admin_branch_access a WHERE a.user_id = p_user_id
  ) INTO v_has_branch_scope;

  -- Site-wide accountant (no branch rows): any driver
  IF public.has_role(p_user_id, 'accountant'::public.app_role) AND NOT v_has_branch_scope THEN
    RETURN EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = p_driver_id);
  END IF;

  -- Branch-scoped accountant / store_admin: drivers linked to accessible branches only
  IF public.has_role(p_user_id, 'accountant'::public.app_role)
     OR public.has_role(p_user_id, 'store_admin'::public.app_role) THEN
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
