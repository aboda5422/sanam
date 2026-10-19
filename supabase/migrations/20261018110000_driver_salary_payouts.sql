-- الراتب المتفق يُحفظ على المندوب. الصرف الفعلي سجل مستقل ويُحسب مصروفاً في الحسابات.

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS salary_amount numeric NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.driver_salary_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  period_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_by uuid
);

CREATE INDEX IF NOT EXISTS idx_driver_salary_payouts_driver
  ON public.driver_salary_payouts (driver_id, created_at DESC);

ALTER TABLE public.driver_salary_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff view salary payouts" ON public.driver_salary_payouts;
CREATE POLICY "Staff view salary payouts"
  ON public.driver_salary_payouts
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'site_admin')
    OR public.has_role(auth.uid(), 'store_admin')
    OR public.has_role(auth.uid(), 'accountant')
    OR driver_id IN (SELECT d.id FROM public.drivers d WHERE d.user_id = auth.uid())
  );

DROP FUNCTION IF EXISTS public.update_driver_pay(uuid, text, numeric);
DROP FUNCTION IF EXISTS public.update_driver_pay(uuid, text, numeric, numeric);
DROP FUNCTION IF EXISTS public.update_driver_pay(uuid, text, numeric, numeric, numeric, numeric);

CREATE OR REPLACE FUNCTION public.update_driver_pay(
  p_driver_id uuid,
  p_pay_type text,
  p_per_delivery_fee numeric DEFAULT 0,
  p_extra_order_fee numeric DEFAULT 0,
  p_wage_per_km numeric DEFAULT 0,
  p_extra_stop_fee numeric DEFAULT 0,
  p_salary_amount numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pay text := lower(trim(coalesce(p_pay_type, 'salary')));
  v_fee numeric := GREATEST(0, coalesce(p_per_delivery_fee, 0));
  v_extra numeric := GREATEST(0, coalesce(p_extra_order_fee, 0));
  v_per_km numeric := GREATEST(0, coalesce(p_wage_per_km, 0));
  v_stop numeric := GREATEST(0, coalesce(p_extra_stop_fee, 0));
  v_salary numeric := GREATEST(0, coalesce(p_salary_amount, 0));
  v_branch uuid;
  v_has_tiers boolean := false;
BEGIN
  IF auth.uid() IS NULL OR (
    NOT public.has_role(auth.uid(), 'store_admin')
    AND NOT public.has_role(auth.uid(), 'site_admin')
    AND NOT public.has_role(auth.uid(), 'accountant')
  ) THEN
    RAISE EXCEPTION 'صلاحيات غير كافية';
  END IF;

  IF v_pay NOT IN ('salary', 'per_order') THEN
    RAISE EXCEPTION 'اختر نوع الأجر: راتب أو حسب الطلب';
  END IF;

  SELECT db.branch_id INTO v_branch
  FROM public.driver_branches db
  WHERE db.driver_id = p_driver_id
  LIMIT 1;

  IF v_branch IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.branch_delivery_rates r WHERE r.branch_id = v_branch
    ) INTO v_has_tiers;
  END IF;

  IF v_pay = 'per_order' AND v_fee <= 0 AND NOT v_has_tiers THEN
    RAISE EXCEPTION 'حدد أجراً أساسياً أو أضف شرائح أجر المندوب من إعدادات التوصيل';
  END IF;
  IF v_pay = 'salary' THEN
    v_fee := 0;
    v_extra := 0;
    v_per_km := 0;
    v_stop := 0;
  END IF;

  UPDATE public.drivers
  SET
    pay_type = v_pay,
    per_delivery_fee = v_fee,
    extra_order_fee = v_extra,
    wage_per_km = v_per_km,
    extra_stop_fee = v_stop,
    salary_amount = CASE WHEN v_pay = 'salary' THEN v_salary ELSE salary_amount END
  WHERE id = p_driver_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'المندوب غير موجود';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'pay_type', v_pay,
    'per_delivery_fee', v_fee,
    'extra_order_fee', v_extra,
    'wage_per_km', v_per_km,
    'extra_stop_fee', v_stop,
    'salary_amount', v_salary
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_driver_pay(uuid, text, numeric, numeric, numeric, numeric, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.pay_driver_salary(
  p_driver_id uuid,
  p_amount numeric,
  p_period_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount numeric := ROUND(GREATEST(coalesce(p_amount, 0), 0), 2);
  v_note text := nullif(left(trim(coalesce(p_period_note, '')), 80), '');
  v_pay text;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR (
    NOT public.has_role(auth.uid(), 'site_admin')
    AND NOT public.has_role(auth.uid(), 'store_admin')
    AND NOT public.has_role(auth.uid(), 'accountant')
  ) THEN
    RAISE EXCEPTION 'صلاحيات غير كافية';
  END IF;

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'أدخل مبلغ الصرف';
  END IF;

  SELECT pay_type INTO v_pay FROM public.drivers WHERE id = p_driver_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'المندوب غير موجود';
  END IF;
  IF lower(coalesce(v_pay, '')) <> 'salary' THEN
    RAISE EXCEPTION 'صرف الراتب متاح لمندوب الراتب فقط';
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
      RAISE EXCEPTION 'المندوب خارج فرعك';
    END IF;
  END IF;

  INSERT INTO public.driver_salary_payouts (driver_id, amount, period_note, paid_by)
  VALUES (p_driver_id, v_amount, v_note, auth.uid())
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_id,
    'amount', v_amount,
    'period_note', v_note
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.pay_driver_salary(uuid, numeric, text) TO authenticated;
