CREATE TABLE IF NOT EXISTS public.ai_shopping_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  session_id text NOT NULL,
  user_id uuid,
  branch_id uuid,
  variant text NOT NULL DEFAULT 'smart',
  event text NOT NULL,
  source text,
  intent text,
  conversation_id text,
  basket_items integer,
  basket_total numeric,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_ai_shopping_events_created
  ON public.ai_shopping_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_shopping_events_event
  ON public.ai_shopping_events (event, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_shopping_events_session
  ON public.ai_shopping_events (session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_shopping_events_variant
  ON public.ai_shopping_events (variant, event, created_at DESC);

ALTER TABLE public.ai_shopping_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can insert ai shopping events" ON public.ai_shopping_events;
CREATE POLICY "Anyone can insert ai shopping events"
  ON public.ai_shopping_events FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins view ai shopping events" ON public.ai_shopping_events;
CREATE POLICY "Admins view ai shopping events"
  ON public.ai_shopping_events FOR SELECT
  USING (
    public.has_role(auth.uid(), 'store_admin'::app_role)
    OR public.has_role(auth.uid(), 'site_admin'::app_role)
    OR public.has_role(auth.uid(), 'accountant'::app_role)
  );

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shopping_source text;

COMMENT ON COLUMN public.orders.shopping_source IS 'assistant | store — how the basket was built';
COMMENT ON TABLE public.ai_shopping_events IS 'Funnel events for Sanam AI shopping assistant and A/B variant';
