-- Delivery fee: one tier on SUM of store→customer distances + extra_stop per additional point.
-- extra_km_fee is no longer used in calculations (kept column for compatibility, forced unused).

COMMENT ON COLUMN public.branches.extra_km_fee IS
  'مهجور — لم يعد مستخدماً. الرسوم من شريحة إجمالي المسافات + extra_stop_fee';

UPDATE public.branches SET extra_km_fee = 0 WHERE extra_km_fee <> 0;

COMMENT ON COLUMN public.branches.extra_stop_fee IS
  'رسوم تُضاف لكل نقطة شراء بعد الأولى (ر.س)';

-- Single leg: tier for that leg distance only (no per-km overage)
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
  fallback numeric;
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

  SELECT r.fee INTO rate_fee
  FROM public.branch_delivery_rates r
  WHERE r.branch_id = p_branch_id
  ORDER BY r.max_distance_km DESC
  LIMIT 1;

  IF rate_fee IS NOT NULL THEN
    RETURN rate_fee;
  END IF;

  SELECT COALESCE(b.delivery_fee, 15) INTO fallback
  FROM public.branches b
  WHERE b.id = p_branch_id;

  RETURN COALESCE(fallback, 15);
END;
$$;

-- Order: tier(sum of distances) + (n-1)*extra_stop_fee
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
  total_km double precision := 0;
  d double precision;
  base_fee numeric;
  stop_fee numeric := 0;
  fallback numeric := 15;
  last_fee numeric;
BEGIN
  IF p_branch_id IS NULL OR p_customer_lat IS NULL OR p_customer_lng IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT public.is_within_branch_zone(p_customer_lat, p_customer_lng, p_branch_id) THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(b.extra_stop_fee, 0), COALESCE(b.delivery_fee, 15)
  INTO stop_fee, fallback
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
    d := public.haversine_km(
      (pt->>'lat')::double precision,
      (pt->>'lng')::double precision,
      p_customer_lat,
      p_customer_lng
    );
    total_km := total_km + d;
    n := n + 1;
  END LOOP;

  IF n = 0 THEN
    RETURN 0;
  END IF;

  SELECT r.fee INTO base_fee
  FROM public.branch_delivery_rates r
  WHERE r.branch_id = p_branch_id
    AND r.max_distance_km >= total_km
  ORDER BY r.max_distance_km ASC
  LIMIT 1;

  IF base_fee IS NULL THEN
    SELECT r.fee INTO last_fee
    FROM public.branch_delivery_rates r
    WHERE r.branch_id = p_branch_id
    ORDER BY r.max_distance_km DESC
    LIMIT 1;
    base_fee := COALESCE(last_fee, fallback);
  END IF;

  IF n > 1 THEN
    base_fee := base_fee + (n - 1) * COALESCE(stop_fee, 0);
  END IF;

  RETURN ROUND(base_fee::numeric, 2);
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_leg_delivery_fee(
  uuid, double precision, double precision, double precision, double precision
) TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.calculate_order_delivery_fee(
  uuid, double precision, double precision, jsonb
) TO anon, authenticated, service_role;
