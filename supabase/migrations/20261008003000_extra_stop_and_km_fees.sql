-- Extra purchase-point fee + per-km beyond last distance tier (admin-controlled)

ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS extra_stop_fee numeric NOT NULL DEFAULT 0
    CHECK (extra_stop_fee >= 0);

ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS extra_km_fee numeric NOT NULL DEFAULT 0
    CHECK (extra_km_fee >= 0);

COMMENT ON COLUMN public.branches.extra_stop_fee IS
  'رسوم تُضاف لكل نقطة شراء / طلب بعد الأولى (ر.س)';
COMMENT ON COLUMN public.branches.extra_km_fee IS
  'رسوم لكل كم مسافة طريق يزيد عن أعلى شريحة (ر.س/كم) — ليس وزن';

-- Leg fee: tier fee + overage km * extra_km_fee
CREATE OR REPLACE FUNCTION public.calculate_leg_delivery_fee(
  p_branch_id uuid,
  p_from_lat double precision,
  p_from_lng double precision,
  p_to_lat double precision,
  p_to_lng double precision
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dist_km double precision;
  rate_fee numeric;
  last_max numeric;
  last_fee numeric;
  extra_km numeric;
  over_km double precision;
BEGIN
  IF p_branch_id IS NULL
     OR p_from_lat IS NULL OR p_from_lng IS NULL
     OR p_to_lat IS NULL OR p_to_lng IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT public.is_within_branch_zone(p_to_lat, p_to_lng, p_branch_id) THEN
    RETURN NULL;
  END IF;

  dist_km := public.haversine_km(p_from_lat, p_from_lng, p_to_lat, p_to_lng);

  SELECT r.fee INTO rate_fee
  FROM public.branch_delivery_rates r
  WHERE r.branch_id = p_branch_id
    AND r.max_distance_km >= dist_km
  ORDER BY r.max_distance_km ASC
  LIMIT 1;

  IF rate_fee IS NOT NULL THEN
    RETURN rate_fee;
  END IF;

  SELECT r.fee, r.max_distance_km INTO last_fee, last_max
  FROM public.branch_delivery_rates r
  WHERE r.branch_id = p_branch_id
  ORDER BY r.max_distance_km DESC
  LIMIT 1;

  SELECT COALESCE(b.extra_km_fee, 0), COALESCE(b.delivery_fee, 15)
  INTO extra_km, rate_fee
  FROM public.branches b
  WHERE b.id = p_branch_id;

  IF last_fee IS NULL THEN
    RETURN rate_fee;
  END IF;

  over_km := GREATEST(0, dist_km - last_max);
  RETURN ROUND((last_fee + over_km * COALESCE(extra_km, 0))::numeric, 2);
END;
$$;

-- Full order delivery: Σ legs + (n_points - 1) * extra_stop_fee
CREATE OR REPLACE FUNCTION public.calculate_order_delivery_fee(
  p_branch_id uuid,
  p_customer_lat double precision,
  p_customer_lng double precision,
  p_points jsonb
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pt jsonb;
  n int := 0;
  leg numeric;
  total numeric := 0;
  stop_fee numeric := 0;
BEGIN
  IF p_branch_id IS NULL OR p_customer_lat IS NULL OR p_customer_lng IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT public.is_within_branch_zone(p_customer_lat, p_customer_lng, p_branch_id) THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(b.extra_stop_fee, 0) INTO stop_fee
  FROM public.branches b
  WHERE b.id = p_branch_id;

  IF p_points IS NULL OR jsonb_typeof(p_points) <> 'array' THEN
    RETURN 0;
  END IF;

  FOR pt IN SELECT * FROM jsonb_array_elements(p_points)
  LOOP
    IF (pt->>'lat') IS NULL OR (pt->>'lng') IS NULL THEN
      CONTINUE;
    END IF;
    leg := public.calculate_leg_delivery_fee(
      p_branch_id,
      (pt->>'lat')::double precision,
      (pt->>'lng')::double precision,
      p_customer_lat,
      p_customer_lng
    );
    IF leg IS NULL THEN
      RETURN NULL;
    END IF;
    total := total + leg;
    n := n + 1;
  END LOOP;

  IF n > 1 THEN
    total := total + (n - 1) * COALESCE(stop_fee, 0);
  END IF;

  RETURN ROUND(total::numeric, 2);
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_leg_delivery_fee(
  uuid, double precision, double precision, double precision, double precision
) TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.calculate_order_delivery_fee(
  uuid, double precision, double precision, jsonb
) TO anon, authenticated, service_role;
