-- Retail ops: item notes, preparer ratings, complaint suggestion, driver limit defaults.

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS item_note TEXT;

CREATE TABLE IF NOT EXISTS public.preparer_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  preparer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_preparer_ratings_low
  ON public.preparer_ratings (rating, created_at DESC)
  WHERE rating < 3;

CREATE INDEX IF NOT EXISTS idx_driver_ratings_low
  ON public.driver_ratings (rating, created_at DESC)
  WHERE rating < 3;

ALTER TABLE public.preparer_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can rate preparers" ON public.preparer_ratings;
CREATE POLICY "Users can rate preparers" ON public.preparer_ratings
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users view own preparer ratings" ON public.preparer_ratings;
CREATE POLICY "Users view own preparer ratings" ON public.preparer_ratings
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Panel view preparer ratings" ON public.preparer_ratings;
CREATE POLICY "Panel view preparer ratings" ON public.preparer_ratings
  FOR SELECT TO authenticated
  USING (public.is_panel_user());

DROP POLICY IF EXISTS "Panel manage preparer ratings" ON public.preparer_ratings;
CREATE POLICY "Panel manage preparer ratings" ON public.preparer_ratings
  FOR ALL TO authenticated
  USING (public.is_panel_user())
  WITH CHECK (public.is_panel_user());

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.preparer_ratings;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_ratings;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE public.complaint_type ADD VALUE IF NOT EXISTS 'suggestion';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO public.store_settings (key, value)
VALUES (
  'driver_limits',
  jsonb_build_object(
    'max_active_orders', 4,
    'max_cash_on_hand', 1000,
    'enforce_active_orders', true,
    'enforce_cash_limit', true,
    'low_rating_threshold', 3
  )
)
ON CONFLICT (key) DO NOTHING;

UPDATE public.store_settings
SET value = COALESCE(value, '{}'::jsonb) || jsonb_build_object('whatsapp', COALESCE(value->>'whatsapp', ''))
WHERE key = 'store_info';
