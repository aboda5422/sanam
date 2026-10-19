-- عمولة الخدمة لكل فرع (نسبة مئوية، مثل 8 = 8%)
ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS service_commission_percent numeric NOT NULL DEFAULT 8
  CHECK (service_commission_percent >= 0 AND service_commission_percent <= 100);

COMMENT ON COLUMN public.branches.service_commission_percent IS
  'Service commission percent applied on product subtotal (e.g. 8 = 8%)';
