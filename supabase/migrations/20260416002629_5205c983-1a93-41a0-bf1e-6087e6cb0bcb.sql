
-- Store settings key-value table
CREATE TABLE public.store_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage settings" ON public.store_settings
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'store_admin'::app_role) OR has_role(auth.uid(), 'site_admin'::app_role));

CREATE POLICY "Anyone can view settings" ON public.store_settings
  FOR SELECT TO public
  USING (true);

CREATE TRIGGER update_store_settings_updated_at
  BEFORE UPDATE ON public.store_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add image_urls to complaints
ALTER TABLE public.complaints ADD COLUMN image_urls text[] DEFAULT '{}';
