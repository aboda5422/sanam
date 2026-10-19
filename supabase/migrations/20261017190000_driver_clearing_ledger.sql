-- محاصة أجرة التوصيل بين المندوب والموقع، مع سند تصفية لا يُحذف.
-- الرصيد السالب = على المندوب للموقع. الرصيد الموجب = للمندوب على الموقع.
-- كاش + نسبة: أجرة التوصيل تُخصم ثم يُطرح منها أجر المندوب (15 − 10 = 5 على المندوب).
-- كاش + راتب: أجرة التوصيل كاملة تبقى على المندوب.
-- شبكة + نسبة: الأجرة وصلت للموقع، ويُثبت أجر المندوب له.
-- شبكة + راتب: الأجرة وصلت للموقع، ولا تُحمَّل على مندوب الراتب.

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS clearing_balance numeric(12,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.driver_clearing_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  receipt_no text NOT NULL UNIQUE,
  entry_kind text NOT NULL CHECK (entry_kind IN ('allocation', 'settlement')),
  pay_type text NOT NULL,
  collection_method text NOT NULL CHECK (collection_method IN ('cash', 'card')),
  delivery_fee numeric(12,2) NOT NULL DEFAULT 0,
  driver_wage numeric(12,2) NOT NULL DEFAULT 0,
  site_share numeric(12,2) NOT NULL DEFAULT 0,
  signed_amount numeric(12,2) NOT NULL,
  balance_after numeric(12,2) NOT NULL,
  settlement_method text CHECK (settlement_method IS NULL OR settlement_method IN ('cash', 'card')),
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'issued', 'acknowledged', 'disputed')),
  note text,
  dispute_note text,
  created_by uuid,
  acknowledged_at timestamptz,
  disputed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS driver_clearing_entries_driver_created_idx
  ON public.driver_clearing_entries (driver_id, created_at DESC);

CREATE SEQUENCE IF NOT EXISTS public.driver_clearing_receipt_seq;

CREATE OR REPLACE FUNCTION public.driver_clearing_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'سجل التصفية لا يُحذف';
  END IF;

  IF NEW.driver_id IS DISTINCT FROM OLD.driver_id
     OR NEW.order_id IS DISTINCT FROM OLD.order_id
     OR NEW.receipt_no IS DISTINCT FROM OLD.receipt_no
     OR NEW.entry_kind IS DISTINCT FROM OLD.entry_kind
     OR NEW.pay_type IS DISTINCT FROM OLD.pay_type
     OR NEW.collection_method IS DISTINCT FROM OLD.collection_method
     OR NEW.delivery_fee IS DISTINCT FROM OLD.delivery_fee
     OR NEW.driver_wage IS DISTINCT FROM OLD.driver_wage
     OR NEW.site_share IS DISTINCT FROM OLD.site_share
     OR NEW.signed_amount IS DISTINCT FROM OLD.signed_amount
     OR NEW.balance_after IS DISTINCT FROM OLD.balance_after
     OR NEW.settlement_method IS DISTINCT FROM OLD.settlement_method
     OR NEW.note IS DISTINCT FROM OLD.note
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'مبالغ التصفية وبيانات السند لا تُعدَّل';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS driver_clearing_entries_guard ON public.driver_clearing_entries;
CREATE TRIGGER driver_clearing_entries_guard
  BEFORE UPDATE OR DELETE ON public.driver_clearing_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.driver_clearing_guard();

CREATE OR REPLACE FUNCTION public.post_driver_clearing(
  p_driver_id uuid,
  p_order_id uuid,
  p_entry_kind text,
  p_pay_type text,
  p_collection_method text,
  p_delivery_fee numeric,
  p_driver_wage numeric,
  p_site_share numeric,
  p_signed numeric,
  p_settlement_method text,
  p_status text,
  p_note text,
  p_created_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance numeric;
  v_after numeric;
  v_receipt text;
  v_id uuid;
BEGIN
  SELECT clearing_balance INTO v_balance
  FROM public.drivers
  WHERE id = p_driver_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'المندوب غير موجود';
  END IF;

  v_after := ROUND(COALESCE(v_balance, 0) + COALESCE(p_signed, 0), 2);
  v_receipt := 'TS-' || to_char(now(), 'YYMMDD') || '-' || lpad(nextval('public.driver_clearing_receipt_seq')::text, 4, '0');

  INSERT INTO public.driver_clearing_entries (
    driver_id, order_id, receipt_no, entry_kind, pay_type, collection_method,
    delivery_fee, driver_wage, site_share, signed_amount, balance_after,
    settlement_method, status, note, created_by
  ) VALUES (
    p_driver_id,
    p_order_id,
    v_receipt,
    p_entry_kind,
    p_pay_type,
    p_collection_method,
    ROUND(COALESCE(p_delivery_fee, 0), 2),
    ROUND(COALESCE(p_driver_wage, 0), 2),
    ROUND(COALESCE(p_site_share, 0), 2),
    ROUND(COALESCE(p_signed, 0), 2),
    v_after,
    p_settlement_method,
    p_status,
    p_note,
    p_created_by
  )
  RETURNING id INTO v_id;

  UPDATE public.drivers
  SET clearing_balance = v_after
  WHERE id = p_driver_id;

  RETURN jsonb_build_object(
    'id', v_id,
    'receipt_no', v_receipt,
    'balance_after', v_after,
    'signed_amount', ROUND(COALESCE(p_signed, 0), 2)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.post_driver_clearing(uuid, uuid, text, text, text, numeric, numeric, numeric, numeric, text, text, text, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.settle_driver_clearing(
  p_driver_id uuid,
  p_amount numeric,
  p_method text DEFAULT 'cash',
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver public.drivers%ROWTYPE;
  v_amount numeric := ROUND(COALESCE(p_amount, 0), 2);
  v_method text := lower(trim(COALESCE(p_method, 'cash')));
  v_signed numeric;
  v_note text;
BEGIN
  IF NOT public.can_settle_driver_wallet_action(auth.uid()) THEN
    RAISE EXCEPTION 'تصفية حساب المندوب متاحة لمدير الموقع أو مدير الفرع أو المحاسب';
  END IF;

  IF v_method NOT IN ('cash', 'card') THEN
    RAISE EXCEPTION 'طريقة التصفية: كاش أو شبكة';
  END IF;

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'أدخل مبلغ تصفية أكبر من صفر';
  END IF;

  SELECT * INTO v_driver FROM public.drivers WHERE id = p_driver_id;
  IF v_driver.id IS NULL THEN
    RAISE EXCEPTION 'المندوب غير موجود';
  END IF;

  IF public.has_role(auth.uid(), 'store_admin')
     AND NOT public.has_role(auth.uid(), 'site_admin')
     AND NOT public.has_role(auth.uid(), 'accountant') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.driver_branches db
      WHERE db.driver_id = p_driver_id
        AND db.branch_id IN (SELECT public.admin_branch_ids(auth.uid()))
    ) THEN
      RAISE EXCEPTION 'هذا المندوب ليس ضمن فروعك';
    END IF;
  END IF;

  IF ABS(COALESCE(v_driver.clearing_balance, 0)) < 0.005 THEN
    RAISE EXCEPTION 'حساب المحاصة مصفّى بالفعل';
  END IF;

  IF v_amount - ABS(v_driver.clearing_balance) > 0.009 THEN
    RAISE EXCEPTION 'المبلغ أكبر من الرصيد المطلوب تصفيته';
  END IF;

  IF v_driver.clearing_balance < 0 THEN
    v_signed := v_amount;
    v_note := 'تصفية: المندوب سلّم المبلغ للموقع';
  ELSE
    v_signed := -v_amount;
    v_note := 'تصفية: الموقع سلّم الأجر للمندوب';
  END IF;

  IF NULLIF(trim(COALESCE(p_note, '')), '') IS NOT NULL THEN
    v_note := v_note || ' — ' || trim(p_note);
  END IF;

  RETURN public.post_driver_clearing(
    p_driver_id,
    NULL,
    'settlement',
    COALESCE(v_driver.pay_type, 'salary'),
    v_method,
    0,
    0,
    0,
    v_signed,
    v_method,
    'issued',
    v_note,
    auth.uid()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.settle_driver_clearing(uuid, numeric, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.acknowledge_driver_clearing(p_entry_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_id uuid;
BEGIN
  SELECT d.id INTO v_driver_id FROM public.drivers d WHERE d.user_id = auth.uid();
  IF v_driver_id IS NULL THEN
    RAISE EXCEPTION 'ليس لديك حساب مندوب';
  END IF;

  UPDATE public.driver_clearing_entries
  SET status = 'acknowledged', acknowledged_at = now(), dispute_note = NULL, disputed_at = NULL
  WHERE id = p_entry_id
    AND driver_id = v_driver_id
    AND entry_kind = 'settlement'
    AND status IN ('issued', 'disputed');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'لا يوجد سند تصفية بانتظار إقرارك';
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.acknowledge_driver_clearing(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.dispute_driver_clearing(p_entry_id uuid, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_id uuid;
  v_note text := NULLIF(trim(COALESCE(p_note, '')), '');
BEGIN
  IF v_note IS NULL THEN
    RAISE EXCEPTION 'اكتب سبب الاعتراض';
  END IF;

  SELECT d.id INTO v_driver_id FROM public.drivers d WHERE d.user_id = auth.uid();
  IF v_driver_id IS NULL THEN
    RAISE EXCEPTION 'ليس لديك حساب مندوب';
  END IF;

  UPDATE public.driver_clearing_entries
  SET status = 'disputed', disputed_at = now(), dispute_note = v_note, acknowledged_at = NULL
  WHERE id = p_entry_id
    AND driver_id = v_driver_id
    AND entry_kind = 'settlement'
    AND status IN ('issued', 'acknowledged');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'لا يمكن الاعتراض على هذا السند';
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.dispute_driver_clearing(uuid, text) TO authenticated;

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

ALTER TABLE public.driver_clearing_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read driver clearing entries" ON public.driver_clearing_entries;
CREATE POLICY "Read driver clearing entries"
  ON public.driver_clearing_entries
  FOR SELECT
  TO authenticated
  USING (
    driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid())
    OR public.has_role(auth.uid(), 'site_admin')
    OR public.has_role(auth.uid(), 'accountant')
    OR (
      public.has_role(auth.uid(), 'store_admin')
      AND driver_id IN (
        SELECT db.driver_id
        FROM public.driver_branches db
        WHERE db.branch_id IN (SELECT public.admin_branch_ids(auth.uid()))
      )
    )
  );

GRANT SELECT ON public.driver_clearing_entries TO authenticated;
