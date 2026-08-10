-- Delivery coverage zones (geofence polygons)
-- Additive only: does not alter existing orders or addresses.

CREATE TABLE public.delivery_zones (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  polygon jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  color text NOT NULL DEFAULT '#22c55e',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT delivery_zones_polygon_is_array CHECK (jsonb_typeof(polygon) = 'array')
);

CREATE INDEX delivery_zones_active_idx ON public.delivery_zones (is_active) WHERE is_active = true;

ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view delivery zones"
  ON public.delivery_zones FOR SELECT TO public
  USING (true);

CREATE POLICY "Admins can manage delivery zones"
  ON public.delivery_zones FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'store_admin'::app_role)
    OR has_role(auth.uid(), 'site_admin'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'store_admin'::app_role)
    OR has_role(auth.uid(), 'site_admin'::app_role)
  );

CREATE TRIGGER update_delivery_zones_updated_at
  BEFORE UPDATE ON public.delivery_zones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Ray-casting point-in-polygon (lat/lng). No PostGIS required.
CREATE OR REPLACE FUNCTION public.point_in_polygon(
  p_lat double precision,
  p_lng double precision,
  p_polygon jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  n integer;
  i integer;
  j integer;
  yi double precision;
  xi double precision;
  yj double precision;
  xj double precision;
  inside boolean := false;
  vi jsonb;
  vj jsonb;
BEGIN
  IF p_polygon IS NULL OR jsonb_typeof(p_polygon) <> 'array' THEN
    RETURN false;
  END IF;

  n := jsonb_array_length(p_polygon);
  IF n < 3 THEN
    RETURN false;
  END IF;

  j := n - 1;
  FOR i IN 0..n - 1 LOOP
    vi := p_polygon -> i;
    vj := p_polygon -> j;
    yi := (vi ->> 'lat')::double precision;
    xi := (vi ->> 'lng')::double precision;
    yj := (vj ->> 'lat')::double precision;
    xj := (vj ->> 'lng')::double precision;

    IF ((yi > p_lat) <> (yj > p_lat))
       AND (p_lng < ((xj - xi) * (p_lat - yi) / NULLIF(yj - yi, 0)) + xi) THEN
      inside := NOT inside;
    END IF;

    j := i;
  END LOOP;

  RETURN inside;
END;
$$;

-- Returns true when there are no active zones (fail-open) OR the point is inside any active zone.
CREATE OR REPLACE FUNCTION public.is_within_delivery_zone(
  p_lat double precision,
  p_lng double precision
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_count integer;
  zone_rec record;
BEGIN
  IF p_lat IS NULL OR p_lng IS NULL THEN
    RETURN false;
  END IF;

  SELECT count(*) INTO active_count
  FROM public.delivery_zones
  WHERE is_active = true;

  -- Fail-open: if admin has not configured any active zone, do not block orders.
  IF active_count = 0 THEN
    RETURN true;
  END IF;

  FOR zone_rec IN
    SELECT polygon FROM public.delivery_zones WHERE is_active = true
  LOOP
    IF public.point_in_polygon(p_lat, p_lng, zone_rec.polygon) THEN
      RETURN true;
    END IF;
  END LOOP;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_within_delivery_zone(double precision, double precision) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.point_in_polygon(double precision, double precision, jsonb) TO anon, authenticated, service_role;

-- Server-side guard on new/updated orders (does not touch historical rows).
CREATE OR REPLACE FUNCTION public.enforce_delivery_zone_on_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.delivery_lat IS NULL OR NEW.delivery_lng IS NULL THEN
    RAISE EXCEPTION 'موقع التوصيل مطلوب'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.is_within_delivery_zone(NEW.delivery_lat::double precision, NEW.delivery_lng::double precision) THEN
    RAISE EXCEPTION 'عذراً، موقع التوصيل خارج نطاق الخدمة الحالي'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_delivery_zone_on_order
  BEFORE INSERT OR UPDATE OF delivery_lat, delivery_lng ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_delivery_zone_on_order();

-- Default coverage: مكة المكرمة (تقريبي). يمكن تعديلها من لوحة التحكم على الخريطة.
INSERT INTO public.delivery_zones (name, polygon, is_active, color, sort_order)
VALUES (
  'مكة المكرمة',
  '[
    {"lat": 21.55, "lng": 39.70},
    {"lat": 21.55, "lng": 39.95},
    {"lat": 21.30, "lng": 39.95},
    {"lat": 21.30, "lng": 39.70}
  ]'::jsonb,
  true,
  '#EE8820',
  0
);
