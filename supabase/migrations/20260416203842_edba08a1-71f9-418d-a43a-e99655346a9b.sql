
-- Page views tracking
CREATE TABLE public.page_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id UUID,
  path TEXT NOT NULL,
  referrer TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_page_views_created_at ON public.page_views(created_at DESC);
CREATE INDEX idx_page_views_session ON public.page_views(session_id);

ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert page views"
  ON public.page_views FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins view page views"
  ON public.page_views FOR SELECT
  USING (has_role(auth.uid(), 'store_admin'::app_role) OR has_role(auth.uid(), 'site_admin'::app_role));

-- Abandoned carts tracking
CREATE TABLE public.abandoned_carts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  user_id UUID,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total NUMERIC NOT NULL DEFAULT 0,
  items_count INTEGER NOT NULL DEFAULT 0,
  reached_checkout BOOLEAN NOT NULL DEFAULT false,
  converted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_abandoned_carts_updated ON public.abandoned_carts(updated_at DESC);
CREATE INDEX idx_abandoned_carts_converted ON public.abandoned_carts(converted, reached_checkout);

ALTER TABLE public.abandoned_carts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can upsert their cart"
  ON public.abandoned_carts FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update their cart by session"
  ON public.abandoned_carts FOR UPDATE
  USING (true);

CREATE POLICY "Admins view abandoned carts"
  ON public.abandoned_carts FOR SELECT
  USING (has_role(auth.uid(), 'store_admin'::app_role) OR has_role(auth.uid(), 'site_admin'::app_role));

CREATE TRIGGER update_abandoned_carts_updated_at
  BEFORE UPDATE ON public.abandoned_carts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
