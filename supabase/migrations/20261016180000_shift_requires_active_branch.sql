-- A deactivated branch must not open a shift or take a sale.
-- Station is_active alone was enough before, so كاشير 2 stayed usable after فرع رقم 2 was turned off.

CREATE OR REPLACE FUNCTION public.pos_start_shift(
  p_station_id uuid,
  p_opening_cash numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_station public.pos_stations%ROWTYPE;
  v_shift_id uuid;
  v_branch_active boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول';
  END IF;
  IF NOT public.is_cashier() THEN
    RAISE EXCEPTION 'غير مصرح — يتطلب صلاحية كاشير';
  END IF;
  IF NOT COALESCE(public.pos_feature_enabled(), false) THEN
    RAISE EXCEPTION 'نظام الكاشير غير مفعّل';
  END IF;

  SELECT * INTO v_station FROM public.pos_stations WHERE id = p_station_id AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'محطة غير موجودة أو غير نشطة';
  END IF;

  SELECT is_active INTO v_branch_active
  FROM public.branches
  WHERE id = v_station.branch_id;
  IF NOT COALESCE(v_branch_active, false) THEN
    RAISE EXCEPTION 'لا يمكن فتح وردية لفرع معطّل';
  END IF;

  IF NOT public.has_role(auth.uid(), 'site_admin')
     AND NOT public.has_role(auth.uid(), 'store_admin') THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.admin_branch_access
      WHERE user_id = auth.uid() AND branch_id = v_station.branch_id
    ) THEN
      RAISE EXCEPTION 'لا تملك صلاحية على فرع هذه المحطة';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pos_shifts
    WHERE cashier_id = auth.uid() AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'لديك وردية مفتوحة مسبقاً. أغلقها أولاً قبل فتح وردية جديدة';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pos_shifts
    WHERE station_id = p_station_id AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'هذه المحطة لديها وردية مفتوحة مسبقاً. أغلق الوردية الحالية أولاً ثم أعد المحاولة';
  END IF;

  INSERT INTO public.pos_shifts (branch_id, station_id, cashier_id, opening_cash, status)
  VALUES (v_station.branch_id, p_station_id, auth.uid(), COALESCE(p_opening_cash, 0), 'open')
  RETURNING id INTO v_shift_id;

  RETURN jsonb_build_object(
    'shift_id', v_shift_id,
    'branch_id', v_station.branch_id,
    'station_id', p_station_id,
    'opening_cash', COALESCE(p_opening_cash, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.pos_reject_inactive_branch_sale()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.branches b
    WHERE b.id = NEW.branch_id AND b.is_active
  ) THEN
    RAISE EXCEPTION 'لا يمكن البيع من فرع معطّل';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pos_sales_require_active_branch ON public.pos_sales;
CREATE TRIGGER pos_sales_require_active_branch
  BEFORE INSERT ON public.pos_sales
  FOR EACH ROW
  EXECUTE FUNCTION public.pos_reject_inactive_branch_sale();

NOTIFY pgrst, 'reload schema';
