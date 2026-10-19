-- =============================================================================
-- Catalog unify Phase 1 (additive, non-breaking)
--
-- Goal: shared logical product + per-branch stock/price/active overlay.
-- Apps keep reading/writing public.products as today. This migration only:
--   1) creates product_branch + product_id_map
--   2) backfills matches (barcode → external_id → exact_name → singleton)
--   3) dual-writes products ↔ product_branch so the overlay stays fresh
--
-- Cutover of admin/POS/storefront/partner is Phase 2+ (separate migration).
-- Categories stay branch-scoped until a later phase.
-- =============================================================================

-- ---------- tables ----------

CREATE TABLE IF NOT EXISTS public.product_id_map (
  legacy_product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  canonical_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  match_method text NOT NULL
    CHECK (match_method IN ('barcode', 'external_id', 'exact_name', 'singleton')),
  match_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_id_map_canonical
  ON public.product_id_map (canonical_product_id);

COMMENT ON TABLE public.product_id_map IS
  'Phase 1 catalog unify: every products.id → canonical catalog id. Safe for order/POS remapping later.';

CREATE TABLE IF NOT EXISTS public.product_branch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  legacy_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  stock_quantity integer NOT NULL DEFAULT 0,
  price numeric NOT NULL DEFAULT 0,
  original_price numeric,
  cost_price numeric(10,2),
  is_active boolean NOT NULL DEFAULT false,
  is_featured boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, branch_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_branch_legacy_unique
  ON public.product_branch (legacy_product_id)
  WHERE legacy_product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_product_branch_branch
  ON public.product_branch (branch_id);

CREATE INDEX IF NOT EXISTS idx_product_branch_active
  ON public.product_branch (branch_id, is_active)
  WHERE is_active = true;

COMMENT ON TABLE public.product_branch IS
  'Per-branch stock/price/active for a canonical product. Missing branch ⇒ stock 0 + is_active false after rebuild.';

DROP TRIGGER IF EXISTS update_product_branch_updated_at ON public.product_branch;
CREATE TRIGGER update_product_branch_updated_at
  BEFORE UPDATE ON public.product_branch
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.product_id_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_branch ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Catalog map public read" ON public.product_id_map;
CREATE POLICY "Catalog map public read"
  ON public.product_id_map FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Catalog map admin write" ON public.product_id_map;
CREATE POLICY "Catalog map admin write"
  ON public.product_id_map FOR ALL TO authenticated
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

DROP POLICY IF EXISTS "Product branch public read" ON public.product_branch;
CREATE POLICY "Product branch public read"
  ON public.product_branch FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Product branch admin write" ON public.product_branch;
CREATE POLICY "Product branch admin write"
  ON public.product_branch FOR ALL TO authenticated
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

-- ---------- helpers ----------

CREATE OR REPLACE FUNCTION public.catalog_sync_guard()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(nullif(current_setting('app.catalog_sync', true), ''), '') = '1';
$$;

CREATE OR REPLACE FUNCTION public.catalog_pick_canonical(p_ids uuid[])
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT p.id
  FROM public.products p
  JOIN public.branches b ON b.id = p.branch_id
  WHERE p.id = ANY (p_ids)
  ORDER BY
    CASE WHEN p.is_active THEN 0 ELSE 1 END,
    b.created_at ASC NULLS LAST,
    p.created_at ASC NULLS LAST,
    p.id ASC
  LIMIT 1;
$$;

-- Rebuild match map + product_branch overlay from current products rows.
-- Safe to re-run. Does not delete/alter products rows.
CREATE OR REPLACE FUNCTION public.catalog_rebuild_unify_maps()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_barcode_groups int := 0;
  v_ext_groups int := 0;
  v_name_groups int := 0;
  v_singletons int := 0;
  v_pb_rows int := 0;
  r record;
  v_canonical uuid;
  v_ids uuid[];
BEGIN
  PERFORM set_config('app.catalog_sync', '1', true);

  TRUNCATE public.product_branch;
  DELETE FROM public.product_id_map;

  -- Working set of still-unmapped products
  CREATE TEMP TABLE _unmap ON COMMIT DROP AS
  SELECT p.id, p.branch_id, p.barcode, p.external_id, p.name, p.created_at, p.is_active
  FROM public.products p;

  CREATE INDEX ON _unmap (id);
  CREATE INDEX ON _unmap (branch_id, lower(btrim(name)));

  -- 1) Barcode groups (cross-branch + within-branch dups collapse together)
  FOR r IN
    SELECT btrim(barcode) AS k, array_agg(id) AS ids
    FROM _unmap
    WHERE barcode IS NOT NULL AND btrim(barcode) <> ''
    GROUP BY btrim(barcode)
  LOOP
    v_ids := r.ids;
    v_canonical := public.catalog_pick_canonical(v_ids);
    INSERT INTO public.product_id_map (legacy_product_id, canonical_product_id, match_method, match_key)
    SELECT u, v_canonical, 'barcode', r.k
    FROM unnest(v_ids) AS u
    ON CONFLICT (legacy_product_id) DO NOTHING;
    DELETE FROM _unmap WHERE id = ANY (v_ids);
    v_barcode_groups := v_barcode_groups + 1;
  END LOOP;

  -- 2) external_id groups (remaining only)
  FOR r IN
    SELECT btrim(external_id) AS k, array_agg(id) AS ids
    FROM _unmap
    WHERE external_id IS NOT NULL AND btrim(external_id) <> ''
    GROUP BY btrim(external_id)
  LOOP
    v_ids := r.ids;
    v_canonical := public.catalog_pick_canonical(v_ids);
    INSERT INTO public.product_id_map (legacy_product_id, canonical_product_id, match_method, match_key)
    SELECT u, v_canonical, 'external_id', r.k
    FROM unnest(v_ids) AS u
    ON CONFLICT (legacy_product_id) DO NOTHING;
    DELETE FROM _unmap WHERE id = ANY (v_ids);
    v_ext_groups := v_ext_groups + 1;
  END LOOP;

  -- 3) Exact name (historical clone_catalog pairs). Migration-only fallback.
  FOR r IN
    SELECT lower(btrim(name)) AS k, array_agg(id) AS ids
    FROM _unmap
    WHERE name IS NOT NULL AND btrim(name) <> ''
    GROUP BY lower(btrim(name))
    HAVING count(*) >= 1
  LOOP
    v_ids := r.ids;
    v_canonical := public.catalog_pick_canonical(v_ids);
    IF array_length(v_ids, 1) = 1 THEN
      INSERT INTO public.product_id_map (legacy_product_id, canonical_product_id, match_method, match_key)
      VALUES (v_ids[1], v_canonical, 'singleton', NULL)
      ON CONFLICT (legacy_product_id) DO NOTHING;
      v_singletons := v_singletons + 1;
    ELSE
      INSERT INTO public.product_id_map (legacy_product_id, canonical_product_id, match_method, match_key)
      SELECT u, v_canonical, 'exact_name', r.k
      FROM unnest(v_ids) AS u
      ON CONFLICT (legacy_product_id) DO NOTHING;
      v_name_groups := v_name_groups + 1;
    END IF;
    DELETE FROM _unmap WHERE id = ANY (v_ids);
  END LOOP;

  -- Any leftovers without name
  INSERT INTO public.product_id_map (legacy_product_id, canonical_product_id, match_method, match_key)
  SELECT id, id, 'singleton', NULL FROM _unmap
  ON CONFLICT (legacy_product_id) DO NOTHING;

  SELECT count(*) INTO v_singletons
  FROM public.product_id_map
  WHERE match_method = 'singleton';

  -- Best legacy row per (canonical, branch)
  CREATE TEMP TABLE _best_legacy ON COMMIT DROP AS
  SELECT DISTINCT ON (m.canonical_product_id, p.branch_id)
    m.canonical_product_id,
    p.branch_id,
    p.id AS legacy_product_id,
    p.stock_quantity,
    p.price,
    p.original_price,
    p.cost_price,
    p.is_active,
    p.is_featured,
    p.sort_order
  FROM public.product_id_map m
  JOIN public.products p ON p.id = m.legacy_product_id
  ORDER BY
    m.canonical_product_id,
    p.branch_id,
    CASE WHEN p.is_active THEN 0 ELSE 1 END,
    p.stock_quantity DESC NULLS LAST,
    p.created_at ASC,
    p.id ASC;

  CREATE INDEX ON _best_legacy (canonical_product_id, branch_id);

  -- One product_branch row per (canonical × branch)
  INSERT INTO public.product_branch (
    product_id, branch_id, legacy_product_id,
    stock_quantity, price, original_price, cost_price,
    is_active, is_featured, sort_order
  )
  SELECT
    c.canonical_product_id,
    b.id AS branch_id,
    bl.legacy_product_id,
    coalesce(bl.stock_quantity, 0),
    coalesce(bl.price, canon.price, 0),
    coalesce(bl.original_price, canon.original_price),
    coalesce(bl.cost_price, canon.cost_price),
    coalesce(bl.is_active, false),
    coalesce(bl.is_featured, false),
    coalesce(bl.sort_order, canon.sort_order, 0)
  FROM (SELECT DISTINCT canonical_product_id FROM public.product_id_map) c
  CROSS JOIN public.branches b
  JOIN public.products canon ON canon.id = c.canonical_product_id
  LEFT JOIN _best_legacy bl
    ON bl.canonical_product_id = c.canonical_product_id
   AND bl.branch_id = b.id;

  SELECT count(*) INTO v_pb_rows FROM public.product_branch;

  INSERT INTO public.store_settings (key, value, updated_at)
  VALUES (
    'catalog_unify_phase',
    jsonb_build_object(
      'phase', 1,
      'rebuilt_at', now(),
      'barcode_groups', v_barcode_groups,
      'external_id_groups', v_ext_groups,
      'exact_name_groups', v_name_groups,
      'singleton_groups', v_singletons,
      'product_branch_rows', v_pb_rows
    ),
    now()
  )
  ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value, updated_at = now();

  RETURN jsonb_build_object(
    'ok', true,
    'barcode_groups', v_barcode_groups,
    'external_id_groups', v_ext_groups,
    'exact_name_groups', v_name_groups,
    'singleton_groups', v_singletons,
    'product_branch_rows', v_pb_rows,
    'mapped_products', (SELECT count(*) FROM public.product_id_map),
    'canonical_products', (SELECT count(DISTINCT canonical_product_id) FROM public.product_id_map)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_rebuild_unify_maps() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_rebuild_unify_maps() TO authenticated;

-- Verification report (read-only diagnostics)
CREATE OR REPLACE FUNCTION public.catalog_unify_verify()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
BEGIN
  SELECT jsonb_build_object(
    'product_rows', (SELECT count(*) FROM public.products),
    'mapped_rows', (SELECT count(*) FROM public.product_id_map),
    'unmapped_rows', (
      SELECT count(*) FROM public.products p
      WHERE NOT EXISTS (SELECT 1 FROM public.product_id_map m WHERE m.legacy_product_id = p.id)
    ),
    'canonical_count', (SELECT count(DISTINCT canonical_product_id) FROM public.product_id_map),
    'product_branch_rows', (SELECT count(*) FROM public.product_branch),
    'expected_pb_rows', (
      SELECT count(DISTINCT m.canonical_product_id) * (SELECT count(*) FROM public.branches)
      FROM public.product_id_map m
    ),
    'match_methods', (
      SELECT coalesce(jsonb_object_agg(match_method, cnt), '{}'::jsonb)
      FROM (
        SELECT match_method, count(*) AS cnt
        FROM public.product_id_map
        GROUP BY match_method
      ) s
    ),
    'pb_zero_stock_inactive', (
      SELECT count(*) FROM public.product_branch
      WHERE stock_quantity = 0 AND is_active = false AND legacy_product_id IS NULL
    ),
    'pb_legacy_mismatch_branch', (
      SELECT count(*)
      FROM public.product_branch pb
      JOIN public.products p ON p.id = pb.legacy_product_id
      WHERE p.branch_id IS DISTINCT FROM pb.branch_id
    ),
    'orphan_canonical_missing_pb', (
      SELECT count(*)
      FROM (SELECT DISTINCT canonical_product_id AS id FROM public.product_id_map) c
      CROSS JOIN public.branches b
      WHERE NOT EXISTS (
        SELECT 1 FROM public.product_branch pb
        WHERE pb.product_id = c.id AND pb.branch_id = b.id
      )
    ),
    'phase_setting', (
      SELECT value FROM public.store_settings WHERE key = 'catalog_unify_phase'
    )
  ) INTO v;
  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_unify_verify() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_unify_verify() TO authenticated;

-- Dual-write: keep product_branch in sync while products remains source of truth
CREATE OR REPLACE FUNCTION public.catalog_sync_product_branch_from_legacy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_canonical uuid;
  v_branch uuid;
  v_method text;
  v_key text;
  b uuid;
BEGIN
  IF public.catalog_sync_guard() THEN
    RETURN coalesce(NEW, OLD);
  END IF;

  PERFORM set_config('app.catalog_sync', '1', true);

  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.product_branch WHERE legacy_product_id = OLD.id;
    DELETE FROM public.product_id_map WHERE legacy_product_id = OLD.id;
    -- If deleted row was canonical, remap aliases to a new pick when possible
    IF EXISTS (SELECT 1 FROM public.product_id_map WHERE canonical_product_id = OLD.id) THEN
      -- leave aliases; rebuild recommended via catalog_rebuild_unify_maps()
      NULL;
    END IF;
    RETURN OLD;
  END IF;

  v_branch := NEW.branch_id;

  -- Try match existing canonical by barcode then external_id
  v_canonical := NULL;
  IF NEW.barcode IS NOT NULL AND btrim(NEW.barcode) <> '' THEN
    SELECT m.canonical_product_id INTO v_canonical
    FROM public.product_id_map m
    JOIN public.products p ON p.id = m.legacy_product_id
    WHERE btrim(p.barcode) = btrim(NEW.barcode)
      AND m.legacy_product_id <> NEW.id
    ORDER BY m.created_at ASC
    LIMIT 1;
    IF v_canonical IS NOT NULL THEN
      v_method := 'barcode';
      v_key := btrim(NEW.barcode);
    END IF;
  END IF;

  IF v_canonical IS NULL AND NEW.external_id IS NOT NULL AND btrim(NEW.external_id) <> '' THEN
    SELECT m.canonical_product_id INTO v_canonical
    FROM public.product_id_map m
    JOIN public.products p ON p.id = m.legacy_product_id
    WHERE btrim(p.external_id) = btrim(NEW.external_id)
      AND m.legacy_product_id <> NEW.id
    ORDER BY m.created_at ASC
    LIMIT 1;
    IF v_canonical IS NOT NULL THEN
      v_method := 'external_id';
      v_key := btrim(NEW.external_id);
    END IF;
  END IF;

  IF v_canonical IS NULL THEN
    -- New catalog identity (singleton). Other branches get stock 0 / inactive.
    v_canonical := NEW.id;
    v_method := 'singleton';
    v_key := NULL;
  END IF;

  INSERT INTO public.product_id_map (legacy_product_id, canonical_product_id, match_method, match_key)
  VALUES (NEW.id, v_canonical, v_method, v_key)
  ON CONFLICT (legacy_product_id) DO UPDATE
  SET canonical_product_id = EXCLUDED.canonical_product_id,
      match_method = EXCLUDED.match_method,
      match_key = EXCLUDED.match_key;

  -- Upsert overlay for this branch from the legacy row
  INSERT INTO public.product_branch (
    product_id, branch_id, legacy_product_id,
    stock_quantity, price, original_price, cost_price,
    is_active, is_featured, sort_order
  ) VALUES (
    v_canonical, v_branch, NEW.id,
    coalesce(NEW.stock_quantity, 0),
    coalesce(NEW.price, 0),
    NEW.original_price,
    NEW.cost_price,
    coalesce(NEW.is_active, false),
    coalesce(NEW.is_featured, false),
    coalesce(NEW.sort_order, 0)
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
    updated_at = now();

  -- Ensure every other branch has a row (stock 0 if never added)
  FOR b IN SELECT id FROM public.branches WHERE id <> v_branch
  LOOP
    INSERT INTO public.product_branch (
      product_id, branch_id, legacy_product_id,
      stock_quantity, price, original_price, cost_price,
      is_active, is_featured, sort_order
    ) VALUES (
      v_canonical, b, NULL,
      0,
      coalesce(NEW.price, 0),
      NEW.original_price,
      NEW.cost_price,
      false,
      false,
      coalesce(NEW.sort_order, 0)
    )
    ON CONFLICT (product_id, branch_id) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_catalog_sync_product_branch ON public.products;
CREATE TRIGGER trg_catalog_sync_product_branch
  AFTER INSERT OR UPDATE OF
    branch_id, barcode, external_id, stock_quantity, price, original_price, cost_price,
    is_active, is_featured, sort_order, name
  OR DELETE
  ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.catalog_sync_product_branch_from_legacy();

-- When a new branch is created, ensure every canonical gets a zero overlay row
CREATE OR REPLACE FUNCTION public.catalog_on_new_branch_product_branch()
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

  INSERT INTO public.product_branch (
    product_id, branch_id, legacy_product_id,
    stock_quantity, price, original_price, cost_price,
    is_active, is_featured, sort_order
  )
  SELECT
    c.canonical_product_id,
    NEW.id,
    NULL,
    0,
    coalesce(p.price, 0),
    p.original_price,
    p.cost_price,
    false,
    false,
    coalesce(p.sort_order, 0)
  FROM (SELECT DISTINCT canonical_product_id FROM public.product_id_map) c
  JOIN public.products p ON p.id = c.canonical_product_id
  ON CONFLICT (product_id, branch_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_catalog_on_new_branch_pb ON public.branches;
CREATE TRIGGER trg_catalog_on_new_branch_pb
  AFTER INSERT ON public.branches
  FOR EACH ROW
  EXECUTE FUNCTION public.catalog_on_new_branch_product_branch();

-- Initial backfill
DO $$
DECLARE
  v jsonb;
BEGIN
  v := public.catalog_rebuild_unify_maps();
  RAISE NOTICE 'catalog_rebuild_unify_maps => %', v;
END $$;
