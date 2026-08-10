-- Multi-branch: slugs, per-branch geofences, distance delivery rates,
-- national address, admin branch access, nearest-branch helpers.

-- ─── 1) Branches: slug + city ───────────────────────────────────────────────
ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS city text;

UPDATE public.branches
SET slug = COALESCE(slug, 'branch-' || substr(id::text, 1, 8))
WHERE slug IS NULL;

ALTER TABLE public.branches
  ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS branches_slug_unique ON public.branches (slug);

-- ─── 2) Delivery zones belong to a branch ───────────────────────────────────
ALTER TABLE public.delivery_zones
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS delivery_zones_branch_idx ON public.delivery_zones (branch_id);

-- ─── 3) Distance-based delivery rates per branch ────────────────────────────
CREATE TABLE IF NOT EXISTS public.branch_delivery_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  max_distance_km numeric NOT NULL CHECK (max_distance_km > 0),
  fee numeric NOT NULL CHECK (fee >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, max_distance_km)
);

ALTER TABLE public.branch_delivery_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view delivery rates" ON public.branch_delivery_rates;
CREATE POLICY "Anyone can view delivery rates"
  ON public.branch_delivery_rates FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Admins manage delivery rates" ON public.branch_delivery_rates;
CREATE POLICY "Admins manage delivery rates"
  ON public.branch_delivery_rates FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'store_admin'::app_role)
    OR has_role(auth.uid(), 'site_admin'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'store_admin'::app_role)
    OR has_role(auth.uid(), 'site_admin'::app_role)
  );

-- ─── 4) Admin ↔ branch assignment (branch managers) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_branch_access (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, branch_id)
);

ALTER TABLE public.admin_branch_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins view own branch access" ON public.admin_branch_access;
CREATE POLICY "Admins view own branch access"
  ON public.admin_branch_access FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR has_role(auth.uid(), 'site_admin'::app_role)
  );

DROP POLICY IF EXISTS "Super admins manage branch access" ON public.admin_branch_access;
CREATE POLICY "Super admins manage branch access"
  ON public.admin_branch_access FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'site_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'site_admin'::app_role));

-- ─── 5) Orders: national short address ──────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS national_address text;

-- ─── 6) Helpers ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'site_admin'::app_role);
$$;

CREATE OR REPLACE FUNCTION public.admin_branch_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT branch_id FROM public.admin_branch_access WHERE user_id = _user_id;
$$;

CREATE OR REPLACE FUNCTION public.can_access_branch(_user_id uuid, _branch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.admin_branch_access a
      WHERE a.user_id = _user_id AND a.branch_id = _branch_id
    );
$$;

CREATE OR REPLACE FUNCTION public.haversine_km(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 6371 * 2 * ASIN(SQRT(
    POWER(SIN(RADIANS(lat2 - lat1) / 2), 2) +
    COS(RADIANS(lat1)) * COS(RADIANS(lat2)) *
    POWER(SIN(RADIANS(lng2 - lng1) / 2), 2)
  ));
$$;

-- Coverage check for a specific branch (fail-open if branch has no active zones)
CREATE OR REPLACE FUNCTION public.is_within_branch_zone(
  p_lat double precision,
  p_lng double precision,
  p_branch_id uuid
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
  IF p_lat IS NULL OR p_lng IS NULL OR p_branch_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT count(*) INTO active_count
  FROM public.delivery_zones
  WHERE is_active = true AND branch_id = p_branch_id;

  IF active_count = 0 THEN
    RETURN true;
  END IF;

  FOR zone_rec IN
    SELECT polygon FROM public.delivery_zones
    WHERE is_active = true AND branch_id = p_branch_id
  LOOP
    IF public.point_in_polygon(p_lat, p_lng, zone_rec.polygon) THEN
      RETURN true;
    END IF;
  END LOOP;

  RETURN false;
END;
$$;

-- Delivery fee by distance tiers for a branch; NULL if outside zone / no rate
CREATE OR REPLACE FUNCTION public.calculate_branch_delivery_fee(
  p_branch_id uuid,
  p_lat double precision,
  p_lng double precision
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b record;
  dist_km double precision;
  rate_fee numeric;
BEGIN
  IF p_branch_id IS NULL OR p_lat IS NULL OR p_lng IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT public.is_within_branch_zone(p_lat, p_lng, p_branch_id) THEN
    RETURN NULL;
  END IF;

  SELECT lat, lng INTO b FROM public.branches WHERE id = p_branch_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  dist_km := public.haversine_km(b.lat, b.lng, p_lat, p_lng);

  SELECT r.fee INTO rate_fee
  FROM public.branch_delivery_rates r
  WHERE r.branch_id = p_branch_id
    AND r.max_distance_km >= dist_km
  ORDER BY r.max_distance_km ASC
  LIMIT 1;

  -- If beyond all tiers but still inside polygon, use highest tier fee
  IF rate_fee IS NULL THEN
    SELECT r.fee INTO rate_fee
    FROM public.branch_delivery_rates r
    WHERE r.branch_id = p_branch_id
    ORDER BY r.max_distance_km DESC
    LIMIT 1;
  END IF;

  RETURN COALESCE(rate_fee, 15);
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_branch_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_branch(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.haversine_km(double precision, double precision, double precision, double precision) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_within_branch_zone(double precision, double precision, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calculate_branch_delivery_fee(uuid, double precision, double precision) TO anon, authenticated, service_role;

-- Update global coverage helper: any active branch zone OR fail-open
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

-- Enforce zone for the order's branch when branch_id is set
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

  IF NEW.branch_id IS NOT NULL THEN
    IF NOT public.is_within_branch_zone(
      NEW.delivery_lat::double precision,
      NEW.delivery_lng::double precision,
      NEW.branch_id
    ) THEN
      RAISE EXCEPTION 'عذراً، موقع التوصيل خارج نطاق خدمة هذا الفرع'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NOT public.is_within_delivery_zone(
    NEW.delivery_lat::double precision,
    NEW.delivery_lng::double precision
  ) THEN
    RAISE EXCEPTION 'عذراً، موقع التوصيل خارج نطاق الخدمة الحالي'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- ─── 7) Seed / normalize 3 Sanam branches ───────────────────────────────────
-- Upsert canonical branches by slug (preserve IDs when possible)
INSERT INTO public.branches (name, address, city, slug, lat, lng, phone, is_active) VALUES
  (
    U&'\0641\0631\0639 \0645\0643\0629 \0627\0644\0634\0631\0627\064A\0639 7',
    U&'\0645\0643\0629 \0627\0644\0645\0643\0631\0645\0629 - \0627\0644\0634\0631\0627\064A\0639 \0645\062E\0637\0637 7',
    U&'\0645\0643\0629 \0627\0644\0645\0643\0631\0645\0629',
    'makkah-sharia-7',
    21.4520, 39.8570, '0502291213', true
  ),
  (
    U&'\0641\0631\0639 \0645\0643\0629 \0627\0644\0634\0631\0627\064A\0639 5',
    U&'\0645\0643\0629 \0627\0644\0645\0643\0631\0645\0629 - \0627\0644\0634\0631\0627\064A\0639 \0645\062E\0637\0637 5',
    U&'\0645\0643\0629 \0627\0644\0645\0643\0631\0645\0629',
    'makkah-sharia-5',
    21.4380, 39.8350, '0502291213', true
  ),
  (
    U&'\0641\0631\0639 \0627\0644\0631\064A\0627\0636 \0627\0644\0631\0645\0627\0644',
    U&'\0627\0644\0631\064A\0627\0636 - \062D\064A \0627\0644\0631\0645\0627\0644',
    U&'\0627\0644\0631\064A\0627\0636',
    'riyadh-rimal',
    24.7920, 46.8050, '0502291218', true
  )
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  address = EXCLUDED.address,
  city = EXCLUDED.city,
  lat = EXCLUDED.lat,
  lng = EXCLUDED.lng,
  phone = EXCLUDED.phone,
  is_active = true;

-- Deactivate any leftover non-canonical branches
UPDATE public.branches
SET is_active = false
WHERE slug NOT IN ('makkah-sharia-7', 'makkah-sharia-5', 'riyadh-rimal');

-- Replace zones/rates for the three active branches
DELETE FROM public.branch_delivery_rates
WHERE branch_id IN (SELECT id FROM public.branches WHERE slug IN ('makkah-sharia-7','makkah-sharia-5','riyadh-rimal'));

DELETE FROM public.delivery_zones
WHERE branch_id IN (SELECT id FROM public.branches WHERE slug IN ('makkah-sharia-7','makkah-sharia-5','riyadh-rimal'))
   OR branch_id IS NULL;

INSERT INTO public.delivery_zones (name, branch_id, polygon, is_active, color, sort_order)
SELECT
  b.name,
  b.id,
  CASE b.slug
    WHEN 'makkah-sharia-7' THEN '[
      {"lat": 21.52, "lng": 39.78},
      {"lat": 21.52, "lng": 39.94},
      {"lat": 21.38, "lng": 39.94},
      {"lat": 21.38, "lng": 39.78}
    ]'::jsonb
    WHEN 'makkah-sharia-5' THEN '[
      {"lat": 21.50, "lng": 39.76},
      {"lat": 21.50, "lng": 39.92},
      {"lat": 21.36, "lng": 39.92},
      {"lat": 21.36, "lng": 39.76}
    ]'::jsonb
    ELSE '[
      {"lat": 24.86, "lng": 46.72},
      {"lat": 24.86, "lng": 46.90},
      {"lat": 24.72, "lng": 46.90},
      {"lat": 24.72, "lng": 46.72}
    ]'::jsonb
  END,
  true,
  '#EE8820',
  0
FROM public.branches b
WHERE b.slug IN ('makkah-sharia-7', 'makkah-sharia-5', 'riyadh-rimal');

INSERT INTO public.branch_delivery_rates (branch_id, max_distance_km, fee, sort_order)
SELECT b.id, t.max_km, t.fee, t.sort_order
FROM public.branches b
CROSS JOIN (VALUES
  (3::numeric, 10::numeric, 0),
  (7::numeric, 18::numeric, 1),
  (15::numeric, 28::numeric, 2)
) AS t(max_km, fee, sort_order)
WHERE b.slug IN ('makkah-sharia-7', 'makkah-sharia-5', 'riyadh-rimal');
