-- Persist real average + ratings count from driver_ratings.

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS ratings_count integer NOT NULL DEFAULT 0
    CHECK (ratings_count >= 0);

COMMENT ON COLUMN public.drivers.ratings_count IS 'Number of rows in driver_ratings for this driver';

CREATE OR REPLACE FUNCTION public.refresh_driver_rating_avg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_id uuid;
  v_avg numeric;
  v_count integer;
BEGIN
  v_driver_id := COALESCE(NEW.driver_id, OLD.driver_id);
  IF v_driver_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT
    ROUND(AVG(r.rating)::numeric, 2),
    COUNT(*)::integer
  INTO v_avg, v_count
  FROM public.driver_ratings r
  WHERE r.driver_id = v_driver_id;

  UPDATE public.drivers d
  SET
    rating = COALESCE(v_avg, 0),
    ratings_count = COALESCE(v_count, 0)
  WHERE d.id = v_driver_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_driver_rating_avg ON public.driver_ratings;
CREATE TRIGGER trg_refresh_driver_rating_avg
  AFTER INSERT OR UPDATE OR DELETE ON public.driver_ratings
  FOR EACH ROW EXECUTE FUNCTION public.refresh_driver_rating_avg();

-- Backfill from source of truth
UPDATE public.drivers d
SET
  rating = COALESCE(s.avg_rating, 0),
  ratings_count = COALESCE(s.cnt, 0)
FROM (
  SELECT
    driver_id,
    ROUND(AVG(rating)::numeric, 2) AS avg_rating,
    COUNT(*)::integer AS cnt
  FROM public.driver_ratings
  GROUP BY driver_id
) s
WHERE d.id = s.driver_id;

UPDATE public.drivers d
SET rating = 0, ratings_count = 0
WHERE NOT EXISTS (
  SELECT 1 FROM public.driver_ratings r WHERE r.driver_id = d.id
);
