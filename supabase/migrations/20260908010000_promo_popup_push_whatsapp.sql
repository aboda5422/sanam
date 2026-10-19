-- Promo kinds + WhatsApp broadcast scaffolding

ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'banner',
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS cta_label text,
  ADD COLUMN IF NOT EXISTS cta_url text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'announcements_kind_check'
  ) THEN
    ALTER TABLE public.announcements
      ADD CONSTRAINT announcements_kind_check
      CHECK (kind IN ('banner', 'popup', 'push'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS announcements_kind_active_idx
  ON public.announcements (kind, is_active, branch_id);

-- WhatsApp blacklist (customer opt-out / admin block)
CREATE TABLE IF NOT EXISTS public.whatsapp_blacklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (phone)
);

CREATE INDEX IF NOT EXISTS whatsapp_blacklist_phone_idx ON public.whatsapp_blacklist (phone);

ALTER TABLE public.whatsapp_blacklist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage whatsapp blacklist" ON public.whatsapp_blacklist;
CREATE POLICY "Admins manage whatsapp blacklist"
  ON public.whatsapp_blacklist FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'site_admin'::app_role)
    OR public.has_role(auth.uid(), 'store_admin'::app_role)
    OR public.has_role(auth.uid(), 'support'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'site_admin'::app_role)
    OR public.has_role(auth.uid(), 'store_admin'::app_role)
    OR public.has_role(auth.uid(), 'support'::app_role)
  );

-- Broadcast drafts / history (actual WhatsApp API keys come later)
CREATE TABLE IF NOT EXISTS public.whatsapp_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  message text NOT NULL,
  media_url text,
  media_name text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'queued', 'sent', 'failed', 'cancelled')),
  recipient_count integer NOT NULL DEFAULT 0,
  excluded_count integer NOT NULL DEFAULT 0,
  error_note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

ALTER TABLE public.whatsapp_broadcasts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage whatsapp broadcasts" ON public.whatsapp_broadcasts;
CREATE POLICY "Admins manage whatsapp broadcasts"
  ON public.whatsapp_broadcasts FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'site_admin'::app_role)
    OR public.has_role(auth.uid(), 'store_admin'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'site_admin'::app_role)
    OR public.has_role(auth.uid(), 'store_admin'::app_role)
  );

-- Helper: active customer phones for a branch (excluding blacklist)
CREATE OR REPLACE FUNCTION public.list_whatsapp_subscriber_phones(p_branch_id uuid DEFAULT NULL)
RETURNS TABLE (phone text, user_id uuid, full_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (regexp_replace(p.phone, '[^0-9]', '', 'g'))
    p.phone,
    p.user_id,
    p.full_name
  FROM public.profiles p
  WHERE p.phone IS NOT NULL
    AND length(regexp_replace(p.phone, '[^0-9]', '', 'g')) >= 9
    AND NOT EXISTS (
      SELECT 1 FROM public.whatsapp_blacklist b
      WHERE regexp_replace(b.phone, '[^0-9]', '', 'g')
          = regexp_replace(p.phone, '[^0-9]', '', 'g')
    )
    AND (
      p_branch_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.user_id = p.user_id AND o.branch_id = p_branch_id
      )
      OR EXISTS (
        SELECT 1 FROM public.user_addresses ua
        WHERE ua.user_id = p.user_id
      )
    )
  ORDER BY regexp_replace(p.phone, '[^0-9]', '', 'g'), p.updated_at DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.list_whatsapp_subscriber_phones(uuid) TO authenticated;
