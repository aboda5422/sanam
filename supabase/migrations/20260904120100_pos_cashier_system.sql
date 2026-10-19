-- POS / Cashier system: stations, shifts, sales, stock RPC, feature flags
-- (role enum value added in 20260904120000_pos_cashier_role.sql)

-- ─── Feature settings (seed) ───────────────────────────────────────────────
INSERT INTO public.store_settings (key, value)
VALUES (
  'pos_features',
  jsonb_build_object(
    'enabled', false,
    'tax_rate', 15,
    'prices_include_tax', true,
    'allow_negative_stock', false,
    'require_shift', true,
    'receipt_footer', 'شكراً لتسوقكم من سنام',
    'zatca_ready', false,
    'automation_daily_report', true,
    'automation_low_stock_whatsapp', true,
    'low_stock_threshold', 5
  )
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.store_settings (key, value)
VALUES (
  'pos_integrations',
  jsonb_build_object(
    'enabled', false,
    'providers', jsonb_build_array()
  )
)
ON CONFLICT (key) DO NOTHING;

-- ─── Stations (4–7 cashiers per branch) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pos_stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  printer_name text,
  printer_bridge_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, code)
);

CREATE INDEX IF NOT EXISTS idx_pos_stations_branch ON public.pos_stations(branch_id);

-- ─── Shifts ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pos_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  station_id uuid NOT NULL REFERENCES public.pos_stations(id) ON DELETE RESTRICT,
  cashier_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  opening_cash numeric(12,2) NOT NULL DEFAULT 0,
  closing_cash numeric(12,2),
  expected_cash numeric(12,2),
  cash_difference numeric(12,2),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_shifts_branch_status ON public.pos_shifts(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_pos_shifts_cashier ON public.pos_shifts(cashier_id, status);

-- Only one open shift per station
CREATE UNIQUE INDEX IF NOT EXISTS uq_pos_shifts_open_station
  ON public.pos_shifts(station_id)
  WHERE status = 'open';

-- ─── Sales ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pos_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  station_id uuid NOT NULL REFERENCES public.pos_stations(id) ON DELETE RESTRICT,
  shift_id uuid NOT NULL REFERENCES public.pos_shifts(id) ON DELETE RESTRICT,
  cashier_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  sale_number bigserial,
  invoice_number text,
  status text NOT NULL DEFAULT 'completed'
    CHECK (status IN ('completed', 'voided', 'returned')),
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  discount_total numeric(12,2) NOT NULL DEFAULT 0,
  tax_total numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  tax_rate numeric(5,2) NOT NULL DEFAULT 15,
  prices_include_tax boolean NOT NULL DEFAULT true,
  customer_name text,
  customer_phone text,
  customer_vat text,
  notes text,
  receipt_payload jsonb,
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_sales_branch_created ON public.pos_sales(branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_sales_shift ON public.pos_sales(shift_id);

CREATE TABLE IF NOT EXISTS public.pos_sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.pos_sales(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  barcode text,
  unit_price numeric(12,2) NOT NULL,
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  discount numeric(12,2) NOT NULL DEFAULT 0,
  tax_amount numeric(12,2) NOT NULL DEFAULT 0,
  line_total numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_sale_items_sale ON public.pos_sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_pos_sale_items_product ON public.pos_sale_items(product_id);

CREATE TABLE IF NOT EXISTS public.pos_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.pos_sales(id) ON DELETE CASCADE,
  method text NOT NULL CHECK (method IN ('cash', 'card', 'transfer', 'other')),
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_payments_sale ON public.pos_payments(sale_id);

-- Partner API keys for external POS sync
CREATE TABLE IF NOT EXISTS public.pos_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  provider text NOT NULL DEFAULT 'custom',
  key_prefix text NOT NULL,
  key_hash text NOT NULL,
  scopes text[] NOT NULL DEFAULT ARRAY['products:read','stock:read','prices:read'],
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_api_keys_prefix ON public.pos_api_keys(key_prefix);

-- Automation outbox (daily reports / low-stock WhatsApp)
CREATE TABLE IF NOT EXISTS public.pos_automation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  error text,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_automation_pending
  ON public.pos_automation_events(status, scheduled_for);

-- ─── RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE public.pos_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_automation_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_cashier(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'cashier'::app_role)
      OR public.has_role(_user_id, 'store_admin'::app_role)
      OR public.has_role(_user_id, 'site_admin'::app_role);
$$;

CREATE OR REPLACE FUNCTION public.pos_feature_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((value->>'enabled')::boolean, false)
  FROM public.store_settings
  WHERE key = 'pos_features';
$$;

-- Stations policies
DROP POLICY IF EXISTS "POS stations select" ON public.pos_stations;
CREATE POLICY "POS stations select" ON public.pos_stations FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'site_admin')
    OR public.has_role(auth.uid(), 'store_admin')
    OR public.has_role(auth.uid(), 'cashier')
    OR public.has_role(auth.uid(), 'accountant')
  );

DROP POLICY IF EXISTS "POS stations manage" ON public.pos_stations;
CREATE POLICY "POS stations manage" ON public.pos_stations FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'site_admin')
    OR public.has_role(auth.uid(), 'store_admin')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'site_admin')
    OR public.has_role(auth.uid(), 'store_admin')
  );

DROP POLICY IF EXISTS "POS shifts select" ON public.pos_shifts;
CREATE POLICY "POS shifts select" ON public.pos_shifts FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'site_admin')
    OR public.has_role(auth.uid(), 'store_admin')
    OR public.has_role(auth.uid(), 'accountant')
    OR cashier_id = auth.uid()
  );

DROP POLICY IF EXISTS "POS sales select" ON public.pos_sales;
CREATE POLICY "POS sales select" ON public.pos_sales FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'site_admin')
    OR public.has_role(auth.uid(), 'store_admin')
    OR public.has_role(auth.uid(), 'accountant')
    OR cashier_id = auth.uid()
  );

DROP POLICY IF EXISTS "POS sale items select" ON public.pos_sale_items;
CREATE POLICY "POS sale items select" ON public.pos_sale_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pos_sales s
      WHERE s.id = sale_id
        AND (
          public.has_role(auth.uid(), 'site_admin')
          OR public.has_role(auth.uid(), 'store_admin')
          OR public.has_role(auth.uid(), 'accountant')
          OR s.cashier_id = auth.uid()
        )
    )
  );

DROP POLICY IF EXISTS "POS payments select" ON public.pos_payments;
CREATE POLICY "POS payments select" ON public.pos_payments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pos_sales s
      WHERE s.id = sale_id
        AND (
          public.has_role(auth.uid(), 'site_admin')
          OR public.has_role(auth.uid(), 'store_admin')
          OR public.has_role(auth.uid(), 'accountant')
          OR s.cashier_id = auth.uid()
        )
    )
  );

DROP POLICY IF EXISTS "POS api keys manage" ON public.pos_api_keys;
CREATE POLICY "POS api keys manage" ON public.pos_api_keys FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'site_admin')
    OR public.has_role(auth.uid(), 'store_admin')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'site_admin')
    OR public.has_role(auth.uid(), 'store_admin')
  );

DROP POLICY IF EXISTS "POS automation select" ON public.pos_automation_events;
CREATE POLICY "POS automation select" ON public.pos_automation_events FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'site_admin')
    OR public.has_role(auth.uid(), 'store_admin')
    OR public.has_role(auth.uid(), 'accountant')
  );

-- ─── Helper: next invoice number per branch ───────────────────────────────
CREATE OR REPLACE FUNCTION public.pos_next_invoice_number(p_branch_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count bigint;
  v_slug text;
BEGIN
  SELECT COALESCE(slug, 'BR') INTO v_slug FROM public.branches WHERE id = p_branch_id;
  SELECT COUNT(*) + 1 INTO v_count FROM public.pos_sales WHERE branch_id = p_branch_id;
  RETURN upper(v_slug) || '-POS-' || to_char(now(), 'YYMMDD') || '-' || lpad(v_count::text, 5, '0');
END;
$$;

-- ─── Start shift ──────────────────────────────────────────────────────────
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
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_cashier() THEN
    RAISE EXCEPTION 'صلاحيات غير كافية';
  END IF;
  IF NOT COALESCE(public.pos_feature_enabled(), false) THEN
    RAISE EXCEPTION 'نظام الكاشير غير مفعّل';
  END IF;

  SELECT * INTO v_station FROM public.pos_stations WHERE id = p_station_id AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'محطة غير موجودة أو غير نشطة';
  END IF;

  -- Cashiers must have branch access (or be store/site admin)
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
    RAISE EXCEPTION 'لديك وردية مفتوحة مسبقاً';
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

GRANT EXECUTE ON FUNCTION public.pos_start_shift(uuid, numeric) TO authenticated;

-- ─── End shift ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pos_end_shift(
  p_shift_id uuid,
  p_closing_cash numeric DEFAULT 0,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shift public.pos_shifts%ROWTYPE;
  v_cash_sales numeric(12,2);
  v_expected numeric(12,2);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_cashier() THEN
    RAISE EXCEPTION 'صلاحيات غير كافية';
  END IF;

  SELECT * INTO v_shift FROM public.pos_shifts WHERE id = p_shift_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الوردية غير موجودة'; END IF;
  IF v_shift.status <> 'open' THEN RAISE EXCEPTION 'الوردية مغلقة مسبقاً'; END IF;
  IF v_shift.cashier_id <> auth.uid()
     AND NOT public.has_role(auth.uid(), 'site_admin')
     AND NOT public.has_role(auth.uid(), 'store_admin') THEN
    RAISE EXCEPTION 'لا يمكنك إغلاق وردية كاشير آخر';
  END IF;

  SELECT COALESCE(SUM(p.amount), 0) INTO v_cash_sales
  FROM public.pos_payments p
  JOIN public.pos_sales s ON s.id = p.sale_id
  WHERE s.shift_id = p_shift_id
    AND s.status = 'completed'
    AND p.method = 'cash';

  v_expected := v_shift.opening_cash + v_cash_sales;

  UPDATE public.pos_shifts
  SET
    status = 'closed',
    closed_at = now(),
    closing_cash = COALESCE(p_closing_cash, 0),
    expected_cash = v_expected,
    cash_difference = COALESCE(p_closing_cash, 0) - v_expected,
    notes = NULLIF(trim(COALESCE(p_notes, '')), '')
  WHERE id = p_shift_id;

  RETURN jsonb_build_object(
    'shift_id', p_shift_id,
    'opening_cash', v_shift.opening_cash,
    'cash_sales', v_cash_sales,
    'expected_cash', v_expected,
    'closing_cash', COALESCE(p_closing_cash, 0),
    'difference', COALESCE(p_closing_cash, 0) - v_expected
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.pos_end_shift(uuid, numeric, text) TO authenticated;

-- ─── Create sale (atomic stock decrement) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.pos_create_sale(
  p_shift_id uuid,
  p_items jsonb,
  p_payments jsonb,
  p_discount_total numeric DEFAULT 0,
  p_customer_name text DEFAULT NULL,
  p_customer_phone text DEFAULT NULL,
  p_customer_vat text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shift public.pos_shifts%ROWTYPE;
  v_feat jsonb;
  v_tax_rate numeric(5,2) := 15;
  v_include_tax boolean := true;
  v_allow_neg boolean := false;
  v_item jsonb;
  v_pay jsonb;
  v_product public.products%ROWTYPE;
  v_qty numeric(12,3);
  v_unit numeric(12,2);
  v_line_disc numeric(12,2);
  v_line_net numeric(12,2);
  v_line_tax numeric(12,2);
  v_line_total numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_tax_total numeric(12,2) := 0;
  v_discount numeric(12,2) := COALESCE(p_discount_total, 0);
  v_total numeric(12,2);
  v_pay_sum numeric(12,2) := 0;
  v_sale_id uuid;
  v_invoice text;
  v_stock numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_cashier() THEN
    RAISE EXCEPTION 'صلاحيات غير كافية';
  END IF;
  IF NOT COALESCE(public.pos_feature_enabled(), false) THEN
    RAISE EXCEPTION 'نظام الكاشير غير مفعّل';
  END IF;

  SELECT * INTO v_shift FROM public.pos_shifts WHERE id = p_shift_id FOR UPDATE;
  IF NOT FOUND OR v_shift.status <> 'open' THEN
    RAISE EXCEPTION 'لا توجد وردية مفتوحة';
  END IF;
  IF v_shift.cashier_id <> auth.uid()
     AND NOT public.has_role(auth.uid(), 'site_admin')
     AND NOT public.has_role(auth.uid(), 'store_admin') THEN
    RAISE EXCEPTION 'الوردية لا تخصك';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'السلة فارغة';
  END IF;
  IF p_payments IS NULL OR jsonb_typeof(p_payments) <> 'array' OR jsonb_array_length(p_payments) = 0 THEN
    RAISE EXCEPTION 'أضف طريقة دفع واحدة على الأقل';
  END IF;

  SELECT value INTO v_feat FROM public.store_settings WHERE key = 'pos_features';
  IF v_feat IS NOT NULL THEN
    v_tax_rate := COALESCE((v_feat->>'tax_rate')::numeric, 15);
    v_include_tax := COALESCE((v_feat->>'prices_include_tax')::boolean, true);
    v_allow_neg := COALESCE((v_feat->>'allow_negative_stock')::boolean, false);
  END IF;

  -- Validate + compute lines, lock products
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := COALESCE((v_item->>'quantity')::numeric, 0);
    IF v_qty <= 0 THEN RAISE EXCEPTION 'كمية غير صالحة'; END IF;

    SELECT * INTO v_product
    FROM public.products
    WHERE id = (v_item->>'product_id')::uuid
      AND branch_id = v_shift.branch_id
      AND is_active = true
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'منتج غير متوفر في الفرع';
    END IF;

    v_stock := COALESCE(v_product.stock_quantity, 0);
    IF NOT v_allow_neg AND v_stock < v_qty THEN
      RAISE EXCEPTION 'المخزون غير كافٍ للمنتج: %', v_product.name;
    END IF;

    v_unit := COALESCE((v_item->>'unit_price')::numeric, v_product.price);
    v_line_disc := COALESCE((v_item->>'discount')::numeric, 0);
    v_line_total := ROUND((v_unit * v_qty) - v_line_disc, 2);
    IF v_include_tax THEN
      v_line_tax := ROUND(v_line_total - (v_line_total / (1 + v_tax_rate / 100.0)), 2);
      v_line_net := v_line_total - v_line_tax;
    ELSE
      v_line_tax := ROUND(v_line_total * (v_tax_rate / 100.0), 2);
      v_line_net := v_line_total;
      v_line_total := v_line_total + v_line_tax;
    END IF;

    v_subtotal := v_subtotal + v_line_net;
    v_tax_total := v_tax_total + v_line_tax;
  END LOOP;

  v_total := ROUND(v_subtotal + v_tax_total - v_discount, 2);
  IF v_total < 0 THEN RAISE EXCEPTION 'الإجمالي غير صالح'; END IF;

  FOR v_pay IN SELECT * FROM jsonb_array_elements(p_payments)
  LOOP
    v_pay_sum := v_pay_sum + COALESCE((v_pay->>'amount')::numeric, 0);
  END LOOP;
  IF ROUND(v_pay_sum, 2) < v_total THEN
    RAISE EXCEPTION 'مبلغ الدفع أقل من الإجمالي';
  END IF;

  v_invoice := public.pos_next_invoice_number(v_shift.branch_id);

  INSERT INTO public.pos_sales (
    branch_id, station_id, shift_id, cashier_id, invoice_number, status,
    subtotal, discount_total, tax_total, total, tax_rate, prices_include_tax,
    customer_name, customer_phone, customer_vat, notes
  ) VALUES (
    v_shift.branch_id, v_shift.station_id, p_shift_id, auth.uid(), v_invoice, 'completed',
    v_subtotal, v_discount, v_tax_total, v_total, v_tax_rate, v_include_tax,
    NULLIF(trim(COALESCE(p_customer_name, '')), ''),
    NULLIF(trim(COALESCE(p_customer_phone, '')), ''),
    NULLIF(trim(COALESCE(p_customer_vat, '')), ''),
    NULLIF(trim(COALESCE(p_notes, '')), '')
  )
  RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_product
    FROM public.products
    WHERE id = (v_item->>'product_id')::uuid
    FOR UPDATE;

    v_qty := (v_item->>'quantity')::numeric;
    v_unit := COALESCE((v_item->>'unit_price')::numeric, v_product.price);
    v_line_disc := COALESCE((v_item->>'discount')::numeric, 0);
    v_line_total := ROUND((v_unit * v_qty) - v_line_disc, 2);
    IF v_include_tax THEN
      v_line_tax := ROUND(v_line_total - (v_line_total / (1 + v_tax_rate / 100.0)), 2);
    ELSE
      v_line_tax := ROUND(v_line_total * (v_tax_rate / 100.0), 2);
      v_line_total := v_line_total + v_line_tax;
    END IF;

    INSERT INTO public.pos_sale_items (
      sale_id, product_id, product_name, barcode, unit_price, quantity, discount, tax_amount, line_total
    ) VALUES (
      v_sale_id, v_product.id, v_product.name, v_product.barcode, v_unit, v_qty, v_line_disc, v_line_tax, v_line_total
    );

    UPDATE public.products
    SET stock_quantity = COALESCE(stock_quantity, 0) - v_qty,
        updated_at = now()
    WHERE id = v_product.id;
  END LOOP;

  FOR v_pay IN SELECT * FROM jsonb_array_elements(p_payments)
  LOOP
    INSERT INTO public.pos_payments (sale_id, method, amount, reference)
    VALUES (
      v_sale_id,
      COALESCE(v_pay->>'method', 'cash'),
      (v_pay->>'amount')::numeric,
      NULLIF(v_pay->>'reference', '')
    );
  END LOOP;

  -- Queue low-stock automation for sold products under threshold
  INSERT INTO public.pos_automation_events (branch_id, event_type, payload)
  SELECT
    v_shift.branch_id,
    'low_stock',
    jsonb_build_object(
      'product_id', p.id,
      'product_name', p.name,
      'stock', p.stock_quantity,
      'barcode', p.barcode
    )
  FROM public.pos_sale_items i
  JOIN public.products p ON p.id = i.product_id
  WHERE i.sale_id = v_sale_id
    AND COALESCE(p.stock_quantity, 0) <= COALESCE((v_feat->>'low_stock_threshold')::numeric, 5);

  RETURN jsonb_build_object(
    'sale_id', v_sale_id,
    'invoice_number', v_invoice,
    'subtotal', v_subtotal,
    'tax_total', v_tax_total,
    'discount_total', v_discount,
    'total', v_total,
    'change', ROUND(v_pay_sum - v_total, 2)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.pos_create_sale(uuid, jsonb, jsonb, numeric, text, text, text, text) TO authenticated;

-- ─── Create cashier staff ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_cashier(
  p_full_name text,
  p_username text,
  p_password text,
  p_branch_id uuid,
  p_phone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_name text := trim(p_full_name);
  v_username text := lower(trim(p_username));
  v_email text;
  v_user_id uuid := gen_random_uuid();
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
BEGIN
  IF auth.uid() IS NULL
     OR (
       NOT public.has_role(auth.uid(), 'site_admin'::app_role)
       AND NOT public.has_role(auth.uid(), 'store_admin'::app_role)
     ) THEN
    RAISE EXCEPTION 'صلاحيات غير كافية';
  END IF;

  IF v_name IS NULL OR v_name = '' THEN RAISE EXCEPTION 'الاسم مطلوب'; END IF;
  IF v_username IS NULL OR v_username = '' THEN RAISE EXCEPTION 'اسم المستخدم مطلوب'; END IF;
  IF p_password IS NULL OR char_length(p_password) < 6 THEN
    RAISE EXCEPTION 'كلمة المرور قصيرة';
  END IF;
  IF p_branch_id IS NULL THEN RAISE EXCEPTION 'الفرع مطلوب'; END IF;

  IF position('@' in v_username) > 0 THEN
    v_email := v_username;
  ELSE
    v_email := v_username || '@staff.sanam';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_email) THEN
    RAISE EXCEPTION 'اسم المستخدم مستخدم مسبقاً';
  END IF;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    is_sso_user, is_anonymous
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id, 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object('full_name', v_name, 'username', v_username),
    now(), now(), '', '', '', '', false, false
  );

  INSERT INTO auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) VALUES (
    v_user_id::text, v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
    'email', now(), now(), now()
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'cashier'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.profiles
  SET full_name = v_name, phone = v_phone
  WHERE user_id = v_user_id;

  INSERT INTO public.admin_branch_access (user_id, branch_id)
  VALUES (v_user_id, p_branch_id)
  ON CONFLICT (user_id, branch_id) DO NOTHING;

  RETURN jsonb_build_object('user_id', v_user_id, 'email', v_email);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_cashier(text, text, text, uuid, text) TO authenticated;

-- Daily report snapshot helper (queues WhatsApp/email payload)
CREATE OR REPLACE FUNCTION public.pos_queue_daily_report(p_branch_id uuid, p_day date DEFAULT CURRENT_DATE)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_payload jsonb;
BEGIN
  SELECT jsonb_build_object(
    'branch_id', p_branch_id,
    'day', p_day,
    'sales_count', COUNT(*)::int,
    'gross_total', COALESCE(SUM(total), 0),
    'tax_total', COALESCE(SUM(tax_total), 0),
    'discount_total', COALESCE(SUM(discount_total), 0),
    'cash_total', COALESCE((
      SELECT SUM(p.amount) FROM public.pos_payments p
      JOIN public.pos_sales s2 ON s2.id = p.sale_id
      WHERE s2.branch_id = p_branch_id
        AND s2.status = 'completed'
        AND p.method = 'cash'
        AND s2.created_at::date = p_day
    ), 0),
    'card_total', COALESCE((
      SELECT SUM(p.amount) FROM public.pos_payments p
      JOIN public.pos_sales s2 ON s2.id = p.sale_id
      WHERE s2.branch_id = p_branch_id
        AND s2.status = 'completed'
        AND p.method = 'card'
        AND s2.created_at::date = p_day
    ), 0)
  )
  INTO v_payload
  FROM public.pos_sales s
  WHERE s.branch_id = p_branch_id
    AND s.status = 'completed'
    AND s.created_at::date = p_day;

  INSERT INTO public.pos_automation_events (branch_id, event_type, payload, status)
  VALUES (p_branch_id, 'daily_report', COALESCE(v_payload, '{}'::jsonb), 'pending')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pos_queue_daily_report(uuid, date) TO authenticated;

-- Seed default stations for existing branches (3 each)
INSERT INTO public.pos_stations (branch_id, name, code)
SELECT b.id, 'كاشير ' || gs.n, 'C' || gs.n
FROM public.branches b
CROSS JOIN generate_series(1, 3) AS gs(n)
ON CONFLICT (branch_id, code) DO NOTHING;
