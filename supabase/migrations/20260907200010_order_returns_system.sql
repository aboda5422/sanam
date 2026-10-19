-- Full return flow: admin approve → driver pickup → refund settlement

CREATE TABLE IF NOT EXISTS public.order_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  complaint_id uuid REFERENCES public.complaints(id) ON DELETE SET NULL,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'awaiting_pickup'
    CHECK (status IN (
      'awaiting_pickup',
      'assigned',
      'picked_up',
      'refunded',
      'cancelled',
      'refund_failed'
    )),
  refund_amount numeric NOT NULL CHECK (refund_amount > 0),
  refund_mode text NOT NULL DEFAULT 'auto'
    CHECK (refund_mode IN ('auto', 'manual', 'cash_adjust')),
  driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  assigned_at timestamptz,
  picked_up_at timestamptz,
  refunded_at timestamptz,
  admin_note text,
  customer_note text,
  refund_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_returns_status_branch
  ON public.order_returns(status, branch_id);
CREATE INDEX IF NOT EXISTS idx_order_returns_driver
  ON public.order_returns(driver_id) WHERE driver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_returns_order
  ON public.order_returns(order_id);

ALTER TABLE public.order_returns ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_order_returns_updated_at ON public.order_returns;
CREATE TRIGGER update_order_returns_updated_at
  BEFORE UPDATE ON public.order_returns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "Admins manage order returns" ON public.order_returns;
CREATE POLICY "Admins manage order returns"
  ON public.order_returns FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'site_admin'::app_role)
    OR public.has_role(auth.uid(), 'store_admin'::app_role)
    OR public.has_role(auth.uid(), 'support'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'site_admin'::app_role)
    OR public.has_role(auth.uid(), 'store_admin'::app_role)
    OR public.has_role(auth.uid(), 'support'::app_role)
  );

DROP POLICY IF EXISTS "Drivers view branch returns" ON public.order_returns;
CREATE POLICY "Drivers view branch returns"
  ON public.order_returns FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'driver'::app_role)
    AND (
      driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid())
      OR (
        status IN ('awaiting_pickup', 'assigned')
        AND branch_id IN (
          SELECT db.branch_id
          FROM public.driver_branches db
          JOIN public.drivers d ON d.id = db.driver_id
          WHERE d.user_id = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS "Drivers update claimed returns" ON public.order_returns;
CREATE POLICY "Drivers update claimed returns"
  ON public.order_returns FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'driver'::app_role)
    AND (
      driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid())
      OR (
        status = 'awaiting_pickup'
        AND branch_id IN (
          SELECT db.branch_id
          FROM public.driver_branches db
          JOIN public.drivers d ON d.id = db.driver_id
          WHERE d.user_id = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS "Customers view own returns" ON public.order_returns;
CREATE POLICY "Customers view own returns"
  ON public.order_returns FOR SELECT TO authenticated
  USING (
    order_id IN (SELECT id FROM public.orders WHERE user_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.approve_order_return(
  p_complaint_id uuid DEFAULT NULL,
  p_order_id uuid DEFAULT NULL,
  p_refund_amount numeric DEFAULT NULL,
  p_admin_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_complaint public.complaints%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_amount numeric;
  v_row public.order_returns%ROWTYPE;
  v_note text := nullif(trim(coalesce(p_admin_note, '')), '');
BEGIN
  IF v_uid IS NULL
     OR (
       NOT public.has_role(v_uid, 'site_admin'::app_role)
       AND NOT public.has_role(v_uid, 'store_admin'::app_role)
       AND NOT public.has_role(v_uid, 'support'::app_role)
     ) THEN
    RAISE EXCEPTION 'صلاحيات غير كافية';
  END IF;

  IF p_complaint_id IS NOT NULL THEN
    SELECT * INTO v_complaint FROM public.complaints WHERE id = p_complaint_id;
    IF v_complaint.id IS NULL THEN RAISE EXCEPTION 'الشكوى غير موجودة'; END IF;
    IF v_complaint.order_id IS NULL THEN RAISE EXCEPTION 'الشكوى غير مربوطة بطلب'; END IF;
    p_order_id := v_complaint.order_id;
  END IF;

  IF p_order_id IS NULL THEN RAISE EXCEPTION 'order_id مطلوب'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'الطلب غير موجود'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.order_returns r
    WHERE r.order_id = v_order.id
      AND r.status IN ('awaiting_pickup', 'assigned', 'picked_up')
  ) THEN
    RAISE EXCEPTION 'يوجد طلب إرجاع نشط لهذا الطلب مسبقاً';
  END IF;

  v_amount := COALESCE(p_refund_amount, v_order.total);
  IF v_amount IS NULL OR v_amount <= 0 OR v_amount > v_order.total THEN
    RAISE EXCEPTION 'مبلغ الاسترداد غير صالح';
  END IF;

  INSERT INTO public.order_returns (
    order_id, complaint_id, branch_id, status, refund_amount, refund_mode,
    approved_by, approved_at, admin_note, customer_note
  ) VALUES (
    v_order.id,
    v_complaint.id,
    COALESCE(v_complaint.branch_id, v_order.branch_id),
    'awaiting_pickup',
    v_amount,
    CASE WHEN v_order.payment_method = 'cash' THEN 'cash_adjust' ELSE 'auto' END,
    v_uid,
    now(),
    v_note,
    CASE WHEN v_complaint.id IS NOT NULL THEN v_complaint.message ELSE NULL END
  )
  RETURNING * INTO v_row;

  IF v_complaint.id IS NOT NULL THEN
    UPDATE public.complaints
    SET
      status = 'in_progress',
      type = 'return'::public.complaint_type,
      admin_reply = COALESCE(
        v_note,
        'تمت الموافقة على الإرجاع — بانتظار استلام المندوب للمنتجات من العميل ثم الاسترداد'
      ),
      replied_at = now()
    WHERE id = v_complaint.id;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'status', v_row.status,
    'order_id', v_row.order_id,
    'refund_amount', v_row.refund_amount
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_order_return(uuid, uuid, numeric, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.driver_claim_return(p_return_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_driver_id uuid;
  v_row public.order_returns%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'driver'::app_role) THEN
    RAISE EXCEPTION 'غير مصرح';
  END IF;

  SELECT id INTO v_driver_id FROM public.drivers WHERE user_id = v_uid LIMIT 1;
  IF v_driver_id IS NULL THEN RAISE EXCEPTION 'حساب المندوب غير موجود'; END IF;

  UPDATE public.order_returns r
  SET
    driver_id = v_driver_id,
    status = 'assigned',
    assigned_at = now()
  WHERE r.id = p_return_id
    AND r.status = 'awaiting_pickup'
    AND r.driver_id IS NULL
    AND r.branch_id IN (
      SELECT branch_id FROM public.driver_branches WHERE driver_id = v_driver_id
    )
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'تعذر استلام مهمة الإرجاع (قد تكون مأخوذة)';
  END IF;

  RETURN jsonb_build_object('id', v_row.id, 'status', v_row.status, 'order_id', v_row.order_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.driver_claim_return(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.driver_mark_return_picked_up(p_return_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_driver_id uuid;
  v_row public.order_returns%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;

  SELECT id INTO v_driver_id FROM public.drivers WHERE user_id = v_uid LIMIT 1;

  UPDATE public.order_returns r
  SET
    status = 'picked_up',
    picked_up_at = now()
  WHERE r.id = p_return_id
    AND r.status = 'assigned'
    AND (
      r.driver_id = v_driver_id
      OR public.has_role(v_uid, 'site_admin'::app_role)
      OR public.has_role(v_uid, 'store_admin'::app_role)
    )
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'تعذر تأكيد الاستلام';
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'status', v_row.status,
    'order_id', v_row.order_id,
    'refund_amount', v_row.refund_amount,
    'refund_mode', v_row.refund_mode
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.driver_mark_return_picked_up(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_order_return_refunded(
  p_return_id uuid,
  p_ok boolean,
  p_error text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.order_returns%ROWTYPE;
  v_order public.orders%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.order_returns WHERE id = p_return_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'طلب الإرجاع غير موجود'; END IF;

  IF p_ok THEN
    UPDATE public.order_returns
    SET status = 'refunded', refunded_at = now(), refund_error = NULL
    WHERE id = p_return_id
    RETURNING * INTO v_row;

    SELECT * INTO v_order FROM public.orders WHERE id = v_row.order_id;
    IF v_row.refund_amount >= v_order.total THEN
      UPDATE public.orders
      SET status = 'cancelled', payment_status = 'refunded'
      WHERE id = v_order.id;
    ELSE
      UPDATE public.orders
      SET payment_status = CASE
        WHEN payment_method = 'cash' THEN payment_status
        ELSE 'refunded'
      END
      WHERE id = v_order.id;
    END IF;

    IF v_row.complaint_id IS NOT NULL THEN
      UPDATE public.complaints
      SET
        status = 'resolved',
        admin_reply = trim(both E'\n' FROM COALESCE(admin_reply, '') || E'\nتم استلام المرتجع وإتمام الاسترداد.'),
        replied_at = now()
      WHERE id = v_row.complaint_id;
    END IF;
  ELSE
    UPDATE public.order_returns
    SET status = 'refund_failed', refund_error = left(coalesce(p_error, 'فشل الاسترداد'), 500)
    WHERE id = p_return_id
    RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object('id', v_row.id, 'status', v_row.status);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_order_return_refunded(uuid, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_order_return_refunded(uuid, boolean, text) TO authenticated;
