-- Admin AI assistant alerts + settings seed

INSERT INTO public.store_settings (key, value)
VALUES (
  'admin_assistant',
  jsonb_build_object(
    'enabled', true,
    'low_stock_threshold', 5,
    'stuck_order_hours', 3,
    'scan_interval_minutes', 15,
    'alert_low_stock', true,
    'alert_stuck_orders', true,
    'alert_daily_report', true,
    'alert_monthly_report', true,
    'alert_sales_drop', true,
    'sales_drop_percent', 15,
    'notify_system', true
  )
)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.admin_assistant_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  kind text NOT NULL,
  severity text NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'warning', 'critical')),
  title text NOT NULL,
  body text NOT NULL,
  fingerprint text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_assistant_alerts_fingerprint_uidx
  ON public.admin_assistant_alerts (fingerprint);

CREATE INDEX IF NOT EXISTS admin_assistant_alerts_created_idx
  ON public.admin_assistant_alerts (created_at DESC);

CREATE INDEX IF NOT EXISTS admin_assistant_alerts_unread_idx
  ON public.admin_assistant_alerts (is_read, created_at DESC);

ALTER TABLE public.admin_assistant_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage assistant alerts" ON public.admin_assistant_alerts;
CREATE POLICY "Admins manage assistant alerts"
  ON public.admin_assistant_alerts FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'site_admin'::app_role)
    OR public.has_role(auth.uid(), 'store_admin'::app_role)
    OR public.has_role(auth.uid(), 'support'::app_role)
    OR public.has_role(auth.uid(), 'inventory'::app_role)
    OR public.has_role(auth.uid(), 'accountant'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'site_admin'::app_role)
    OR public.has_role(auth.uid(), 'store_admin'::app_role)
    OR public.has_role(auth.uid(), 'support'::app_role)
    OR public.has_role(auth.uid(), 'inventory'::app_role)
    OR public.has_role(auth.uid(), 'accountant'::app_role)
  );
