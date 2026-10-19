-- Partner Catalog API: external id, branch code alias, audit log, key helpers

-- ERP / partner item code (optional; barcode remains primary match key)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS external_id text;

CREATE INDEX IF NOT EXISTS idx_products_branch_external_id
  ON public.products (branch_id, external_id)
  WHERE external_id IS NOT NULL AND external_id <> '';

-- Prefer unique barcode per branch when present (skip rows with empty barcode)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_products_branch_barcode_unique'
  ) THEN
    -- Only create if no duplicates exist
    IF NOT EXISTS (
      SELECT 1
      FROM public.products
      WHERE barcode IS NOT NULL AND btrim(barcode) <> ''
      GROUP BY branch_id, btrim(barcode)
      HAVING COUNT(*) > 1
    ) THEN
      CREATE UNIQUE INDEX idx_products_branch_barcode_unique
        ON public.products (branch_id, (btrim(barcode)))
        WHERE barcode IS NOT NULL AND btrim(barcode) <> '';
    ELSE
      RAISE NOTICE 'Skipped unique barcode index — duplicate (branch_id, barcode) rows exist';
    END IF;
  END IF;
END $$;

-- Explicit partner branch code (defaults from slug for existing rows)
ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS partner_code text;

UPDATE public.branches
SET partner_code = upper(replace(slug, '-', '_'))
WHERE partner_code IS NULL AND slug IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_branches_partner_code_unique
  ON public.branches (partner_code)
  WHERE partner_code IS NOT NULL AND partner_code <> '';

-- Audit trail for partner API calls
CREATE TABLE IF NOT EXISTS public.partner_api_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid REFERENCES public.pos_api_keys(id) ON DELETE SET NULL,
  provider text,
  method text NOT NULL,
  path text NOT NULL,
  status_code int NOT NULL,
  branch_code text,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partner_api_audit_created
  ON public.partner_api_audit (created_at DESC);

ALTER TABLE public.partner_api_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Partner API audit admin read" ON public.partner_api_audit;
CREATE POLICY "Partner API audit admin read" ON public.partner_api_audit
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'site_admin')
    OR public.has_role(auth.uid(), 'store_admin')
  );

-- Expand default scopes comment on keys (no schema change required)
COMMENT ON TABLE public.pos_api_keys IS
  'Partner API keys (sanam_live_…). Scopes: products:read|write, stock:read|write, prices:write, offers:write, categories:read, branches:read';
