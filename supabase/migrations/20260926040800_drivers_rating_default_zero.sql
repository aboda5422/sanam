-- New drivers should not show 5.00 before any merchant/customer rating.
ALTER TABLE public.drivers
  ALTER COLUMN rating SET DEFAULT 0;

UPDATE public.drivers d
SET rating = 0, ratings_count = 0
WHERE COALESCE(d.ratings_count, 0) = 0
  AND d.rating IS DISTINCT FROM 0;
