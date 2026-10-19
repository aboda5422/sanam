-- =============================================================================
-- Catalog unify Phase 3: shared categories + branch overlays
-- Match: slug → exact name → singleton (clone_catalog left perfect slug pairs).
-- product_branch.category_id stays branch-local legacy id when present.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.category_id_map (
  legacy_category_id uuid PRIMARY KEY REFERENCES public.categories(id) ON DELETE CASCADE,
  canonical_category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  match_method text NOT NULL
    CHECK (match_method IN ('slug', 'exact_name', 'singleton')),
  match_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_category_id_map_canonical
  ON public.category_id_map (canonical_category_id);

CREATE TABLE IF NOT EXISTS public.category_branch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  legacy_category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  image text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, branch_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_category_branch_legacy_unique
  ON public.category_branch (legacy_category_id)
  WHERE legacy_category_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_category_branch_branch
  ON public.category_branch (branch_id);

DROP TRIGGER IF EXISTS update_category_branch_updated_at ON public.category_branch;
CREATE TRIGGER update_category_branch_updated_at
  BEFORE UPDATE ON public.category_branch
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.category_id_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_branch ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Category map public read" ON public.category_id_map;
CREATE POLICY "Category map public read"
  ON public.category_id_map FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Category map admin write" ON public.category_id_map;
CREATE POLICY "Category map admin write"
  ON public.category_id_map FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'site_admin'::app_role)
    OR public.has_role(auth.uid(), 'store_admin'::app_role)
    OR public.has_role(auth.uid(), 'inventory'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'site_admin'::app_role)
    OR public.has_role(auth.uid(), 'store_admin'::app_role)
    OR public.has_role(auth.uid(), 'inventory'::app_role)
  );

DROP POLICY IF EXISTS "Category branch public read" ON public.category_branch;
CREATE POLICY "Category branch public read"
  ON public.category_branch FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Category branch admin write" ON public.category_branch;
CREATE POLICY "Category branch admin write"
  ON public.category_branch FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'site_admin'::app_role)
    OR public.has_role(auth.uid(), 'store_admin'::app_role)
    OR public.has_role(auth.uid(), 'inventory'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'site_admin'::app_role)
    OR public.has_role(auth.uid(), 'store_admin'::app_role)
    OR public.has_role(auth.uid(), 'inventory'::app_role)
  );

CREATE OR REPLACE FUNCTION public.catalog_pick_canonical_category(p_ids uuid[])
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT c.id
  FROM public.categories c
  JOIN public.branches b ON b.id = c.branch_id
  WHERE c.id = ANY (p_ids)
  ORDER BY
    CASE WHEN c.is_active THEN 0 ELSE 1 END,
    b.created_at ASC NULLS LAST,
    c.created_at ASC NULLS LAST,
    c.id ASC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.catalog_rebuild_category_maps()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug int := 0;
  v_name int := 0;
  v_singletons int := 0;
  v_cb int := 0;
  r record;
  v_canonical uuid;
  v_ids uuid[];
BEGIN
  PERFORM set_config('app.catalog_sync', '1', true);

  TRUNCATE public.category_branch;
  DELETE FROM public.category_id_map;

  CREATE TEMP TABLE _cunmap ON COMMIT DROP AS
  SELECT c.id, c.branch_id, c.slug, c.name, c.is_active, c.sort_order, c.image, c.created_at
  FROM public.categories c;

  -- 1) slug groups
  FOR r IN
    SELECT btrim(slug) AS k, array_agg(id) AS ids
    FROM _cunmap
    WHERE slug IS NOT NULL AND btrim(slug) <> ''
    GROUP BY btrim(slug)
  LOOP
    v_ids := r.ids;
    v_canonical := public.catalog_pick_canonical_category(v_ids);
    IF array_length(v_ids, 1) = 1 THEN
      INSERT INTO public.category_id_map (legacy_category_id, canonical_category_id, match_method, match_key)
      VALUES (v_ids[1], v_canonical, 'singleton', r.k)
      ON CONFLICT DO NOTHING;
      v_singletons := v_singletons + 1;
    ELSE
      INSERT INTO public.category_id_map (legacy_category_id, canonical_category_id, match_method, match_key)
      SELECT u, v_canonical, 'slug', r.k FROM unnest(v_ids) u
      ON CONFLICT DO NOTHING;
      v_slug := v_slug + 1;
    END IF;
    DELETE FROM _cunmap WHERE id = ANY (v_ids);
  END LOOP;

  -- 2) exact name
  FOR r IN
    SELECT lower(btrim(name)) AS k, array_agg(id) AS ids
    FROM _cunmap
    WHERE name IS NOT NULL AND btrim(name) <> ''
    GROUP BY lower(btrim(name))
  LOOP
    v_ids := r.ids;
    v_canonical := public.catalog_pick_canonical_category(v_ids);
    IF array_length(v_ids, 1) = 1 THEN
      INSERT INTO public.category_id_map (legacy_category_id, canonical_category_id, match_method, match_key)
      VALUES (v_ids[1], v_canonical, 'singleton', r.k)
      ON CONFLICT DO NOTHING;
      v_singletons := v_singletons + 1;
    ELSE
      INSERT INTO public.category_id_map (legacy_category_id, canonical_category_id, match_method, match_key)
      SELECT u, v_canonical, 'exact_name', r.k FROM unnest(v_ids) u
      ON CONFLICT DO NOTHING;
      v_name := v_name + 1;
    END IF;
    DELETE FROM _cunmap WHERE id = ANY (v_ids);
  END LOOP;

  INSERT INTO public.category_id_map (legacy_category_id, canonical_category_id, match_method, match_key)
  SELECT id, id, 'singleton', NULL FROM _cunmap
  ON CONFLICT DO NOTHING;

  SELECT count(*) INTO v_singletons FROM public.category_id_map WHERE match_method = 'singleton';

  CREATE TEMP TABLE _best_cat ON COMMIT DROP AS
  SELECT DISTINCT ON (m.canonical_category_id, c.branch_id)
    m.canonical_category_id,
    c.branch_id,
    c.id AS legacy_category_id,
    c.is_active,
    c.sort_order,
    c.image
  FROM public.category_id_map m
  JOIN public.categories c ON c.id = m.legacy_category_id
  ORDER BY
    m.canonical_category_id,
    c.branch_id,
    CASE WHEN c.is_active THEN 0 ELSE 1 END,
    c.sort_order ASC,
    c.created_at ASC,
    c.id ASC;

  INSERT INTO public.category_branch (
    category_id, branch_id, legacy_category_id, is_active, sort_order, image
  )
  SELECT
    c.canonical_category_id,
    b.id,
    bl.legacy_category_id,
    coalesce(bl.is_active, false),
    coalesce(bl.sort_order, canon.sort_order, 0),
    coalesce(bl.image, canon.image)
  FROM (SELECT DISTINCT canonical_category_id FROM public.category_id_map) c
  CROSS JOIN public.branches b
  JOIN public.categories canon ON canon.id = c.canonical_category_id
  LEFT JOIN _best_cat bl
    ON bl.canonical_category_id = c.canonical_category_id
   AND bl.branch_id = b.id;

  SELECT count(*) INTO v_cb FROM public.category_branch;

  INSERT INTO public.store_settings (key, value, updated_at)
  VALUES (
    'catalog_unify_phase',
    jsonb_build_object(
      'phase', 3,
      'categories_rebuilt_at', now(),
      'category_slug_groups', v_slug,
      'category_name_groups', v_name,
      'category_singletons', v_singletons,
      'category_branch_rows', v_cb
    ),
    now()
  )
  ON CONFLICT (key) DO UPDATE
  SET value = public.store_settings.value || EXCLUDED.value,
      updated_at = now();

  RETURN jsonb_build_object(
    'ok', true,
    'slug_groups', v_slug,
    'exact_name_groups', v_name,
    'singletons', v_singletons,
    'category_branch_rows', v_cb,
    'canonical_categories', (SELECT count(DISTINCT canonical_category_id) FROM public.category_id_map)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_rebuild_category_maps() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_rebuild_category_maps() TO authenticated;

CREATE OR REPLACE VIEW public.catalog_branch_categories
WITH (security_invoker = true)
AS
SELECT
  coalesce(cb.legacy_category_id, cb.category_id) AS id,
  cb.category_id AS catalog_id,
  cb.legacy_category_id,
  cb.branch_id,
  c.name,
  c.name_en,
  coalesce(cb.image, c.image) AS image,
  c.slug,
  c.section,
  cb.is_active,
  cb.sort_order,
  c.created_at,
  cb.updated_at
FROM public.category_branch cb
JOIN public.categories c ON c.id = cb.category_id;

GRANT SELECT ON public.catalog_branch_categories TO anon, authenticated;

-- Dual-write categories → category_branch
CREATE OR REPLACE FUNCTION public.catalog_sync_category_branch_from_legacy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_canonical uuid;
  v_method text;
  v_key text;
  b uuid;
BEGIN
  IF public.catalog_sync_guard() THEN
    RETURN coalesce(NEW, OLD);
  END IF;
  PERFORM set_config('app.catalog_sync', '1', true);

  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.category_branch WHERE legacy_category_id = OLD.id;
    DELETE FROM public.category_id_map WHERE legacy_category_id = OLD.id;
    RETURN OLD;
  END IF;

  v_canonical := NULL;
  IF NEW.slug IS NOT NULL AND btrim(NEW.slug) <> '' THEN
    SELECT m.canonical_category_id INTO v_canonical
    FROM public.category_id_map m
    JOIN public.categories c ON c.id = m.legacy_category_id
    WHERE btrim(c.slug) = btrim(NEW.slug)
      AND m.legacy_category_id <> NEW.id
    LIMIT 1;
    IF v_canonical IS NOT NULL THEN
      v_method := 'slug';
      v_key := btrim(NEW.slug);
    END IF;
  END IF;

  IF v_canonical IS NULL THEN
    v_canonical := NEW.id;
    v_method := 'singleton';
    v_key := nullif(btrim(coalesce(NEW.slug, '')), '');
  END IF;

  INSERT INTO public.category_id_map (legacy_category_id, canonical_category_id, match_method, match_key)
  VALUES (NEW.id, v_canonical, v_method, v_key)
  ON CONFLICT (legacy_category_id) DO UPDATE
  SET canonical_category_id = EXCLUDED.canonical_category_id,
      match_method = EXCLUDED.match_method,
      match_key = EXCLUDED.match_key;

  INSERT INTO public.category_branch (
    category_id, branch_id, legacy_category_id, is_active, sort_order, image
  ) VALUES (
    v_canonical, NEW.branch_id, NEW.id,
    coalesce(NEW.is_active, true), coalesce(NEW.sort_order, 0), NEW.image
  )
  ON CONFLICT (category_id, branch_id) DO UPDATE
  SET
    legacy_category_id = EXCLUDED.legacy_category_id,
    is_active = EXCLUDED.is_active,
    sort_order = EXCLUDED.sort_order,
    image = EXCLUDED.image,
    updated_at = now();

  FOR b IN SELECT id FROM public.branches WHERE id <> NEW.branch_id
  LOOP
    INSERT INTO public.category_branch (
      category_id, branch_id, legacy_category_id, is_active, sort_order, image
    ) VALUES (
      v_canonical, b, NULL, false, coalesce(NEW.sort_order, 0), NEW.image
    )
    ON CONFLICT (category_id, branch_id) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_catalog_sync_category_branch ON public.categories;
CREATE TRIGGER trg_catalog_sync_category_branch
  AFTER INSERT OR UPDATE OF branch_id, slug, name, is_active, sort_order, image
  OR DELETE
  ON public.categories
  FOR EACH ROW
  EXECUTE FUNCTION public.catalog_sync_category_branch_from_legacy();

-- New branch: zero/inactive category overlays for every canonical
CREATE OR REPLACE FUNCTION public.catalog_on_new_branch_category_branch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.catalog_sync_guard() THEN
    RETURN NEW;
  END IF;
  PERFORM set_config('app.catalog_sync', '1', true);

  INSERT INTO public.category_branch (
    category_id, branch_id, legacy_category_id, is_active, sort_order, image
  )
  SELECT
    c.canonical_category_id,
    NEW.id,
    NULL,
    false,
    coalesce(cat.sort_order, 0),
    cat.image
  FROM (SELECT DISTINCT canonical_category_id FROM public.category_id_map) c
  JOIN public.categories cat ON cat.id = c.canonical_category_id
  ON CONFLICT (category_id, branch_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_catalog_on_new_branch_cb ON public.branches;
CREATE TRIGGER trg_catalog_on_new_branch_cb
  AFTER INSERT ON public.branches
  FOR EACH ROW
  EXECUTE FUNCTION public.catalog_on_new_branch_category_branch();

CREATE OR REPLACE FUNCTION public.catalog_unify_verify_categories()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'category_rows', (SELECT count(*) FROM public.categories),
    'mapped', (SELECT count(*) FROM public.category_id_map),
    'unmapped', (
      SELECT count(*) FROM public.categories c
      WHERE NOT EXISTS (
        SELECT 1 FROM public.category_id_map m WHERE m.legacy_category_id = c.id
      )
    ),
    'canonical', (SELECT count(DISTINCT canonical_category_id) FROM public.category_id_map),
    'category_branch_rows', (SELECT count(*) FROM public.category_branch),
    'view_rows', (SELECT count(*) FROM public.catalog_branch_categories),
    'methods', (
      SELECT coalesce(jsonb_object_agg(match_method, cnt), '{}'::jsonb)
      FROM (
        SELECT match_method, count(*) AS cnt FROM public.category_id_map GROUP BY match_method
      ) s
    )
  );
$$;

REVOKE ALL ON FUNCTION public.catalog_unify_verify_categories() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_unify_verify_categories() TO authenticated;

-- Helper: sync product_branch from a legacy products row (for partner / service role)
CREATE OR REPLACE FUNCTION public.catalog_sync_product_overlay(p_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p public.products%ROWTYPE;
  v_canonical uuid;
  b uuid;
BEGIN
  SELECT * INTO v_p FROM public.products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  PERFORM set_config('app.catalog_sync', '1', true);

  SELECT canonical_product_id INTO v_canonical
  FROM public.product_id_map WHERE legacy_product_id = p_product_id;

  IF v_canonical IS NULL AND v_p.barcode IS NOT NULL AND btrim(v_p.barcode) <> '' THEN
    SELECT m.canonical_product_id INTO v_canonical
    FROM public.product_id_map m
    JOIN public.products x ON x.id = m.legacy_product_id
    WHERE btrim(x.barcode) = btrim(v_p.barcode)
    LIMIT 1;
  END IF;

  IF v_canonical IS NULL THEN
    v_canonical := v_p.id;
  END IF;

  INSERT INTO public.product_id_map (legacy_product_id, canonical_product_id, match_method, match_key)
  VALUES (
    v_p.id, v_canonical,
    CASE WHEN v_p.barcode IS NOT NULL AND btrim(v_p.barcode) <> '' THEN 'barcode' ELSE 'singleton' END,
    nullif(btrim(coalesce(v_p.barcode, '')), '')
  )
  ON CONFLICT (legacy_product_id) DO UPDATE
  SET canonical_product_id = EXCLUDED.canonical_product_id;

  INSERT INTO public.product_branch (
    product_id, branch_id, legacy_product_id,
    stock_quantity, price, original_price, cost_price,
    is_active, is_featured, sort_order, category_id
  ) VALUES (
    v_canonical, v_p.branch_id, v_p.id,
    coalesce(v_p.stock_quantity, 0), coalesce(v_p.price, 0), v_p.original_price, v_p.cost_price,
    coalesce(v_p.is_active, false), coalesce(v_p.is_featured, false), coalesce(v_p.sort_order, 0),
    v_p.category_id
  )
  ON CONFLICT (product_id, branch_id) DO UPDATE
  SET
    legacy_product_id = EXCLUDED.legacy_product_id,
    stock_quantity = EXCLUDED.stock_quantity,
    price = EXCLUDED.price,
    original_price = EXCLUDED.original_price,
    cost_price = EXCLUDED.cost_price,
    is_active = EXCLUDED.is_active,
    is_featured = EXCLUDED.is_featured,
    sort_order = EXCLUDED.sort_order,
    category_id = coalesce(EXCLUDED.category_id, public.product_branch.category_id),
    updated_at = now();

  FOR b IN SELECT id FROM public.branches WHERE id <> v_p.branch_id
  LOOP
    INSERT INTO public.product_branch (
      product_id, branch_id, legacy_product_id,
      stock_quantity, price, original_price, cost_price,
      is_active, is_featured, sort_order, category_id
    ) VALUES (
      v_canonical, b, NULL,
      0, coalesce(v_p.price, 0), v_p.original_price, v_p.cost_price,
      false, false, coalesce(v_p.sort_order, 0), NULL
    )
    ON CONFLICT (product_id, branch_id) DO NOTHING;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'catalog_id', v_canonical, 'legacy_product_id', v_p.id);
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_sync_product_overlay(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_sync_product_overlay(uuid) TO authenticated, service_role;

DO $$
DECLARE
  v jsonb;
BEGIN
  v := public.catalog_rebuild_category_maps();
  RAISE NOTICE 'catalog_rebuild_category_maps => %', v;
END $$;
