-- Distinct selling units for the admin product filter.

CREATE OR REPLACE FUNCTION public.catalog_unit_options(p_branch uuid)
RETURNS TABLE(unit text, n integer)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT u, count(*)::int
  FROM (
    SELECT btrim(b.unit) AS u
    FROM public.catalog_branch_products b
    WHERE (p_branch IS NULL OR b.branch_id = p_branch)
      AND b.unit IS NOT NULL
      AND btrim(b.unit) <> ''
    UNION ALL
    SELECT btrim(b.alt_unit)
    FROM public.catalog_branch_products b
    WHERE (p_branch IS NULL OR b.branch_id = p_branch)
      AND b.alt_unit IS NOT NULL
      AND btrim(b.alt_unit) <> ''
  ) s
  GROUP BY u
  ORDER BY count(*) DESC, u;
$$;

GRANT EXECUTE ON FUNCTION public.catalog_unit_options(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
