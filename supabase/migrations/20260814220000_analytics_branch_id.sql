-- Scope storefront analytics to a branch (dashboard filter).
ALTER TABLE public.page_views
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;

ALTER TABLE public.abandoned_carts
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_page_views_branch_created
  ON public.page_views (branch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_abandoned_carts_branch_updated
  ON public.abandoned_carts (branch_id, updated_at DESC);
