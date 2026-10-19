-- FCM / device push tokens for lock-screen notifications

CREATE TABLE IF NOT EXISTS public.device_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  token text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  app_role text,
  topics text[] NOT NULL DEFAULT ARRAY['sanam_all']::text[],
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS device_push_tokens_user_idx ON public.device_push_tokens (user_id);
CREATE INDEX IF NOT EXISTS device_push_tokens_platform_idx ON public.device_push_tokens (platform);
CREATE INDEX IF NOT EXISTS device_push_tokens_branch_idx ON public.device_push_tokens (branch_id);
CREATE INDEX IF NOT EXISTS device_push_tokens_last_seen_idx ON public.device_push_tokens (last_seen_at DESC);

ALTER TABLE public.device_push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users upsert own push tokens" ON public.device_push_tokens;
CREATE POLICY "Users upsert own push tokens"
  ON public.device_push_tokens FOR ALL TO authenticated
  USING (user_id IS NULL OR user_id = auth.uid())
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS "Admins read push tokens" ON public.device_push_tokens;
CREATE POLICY "Admins read push tokens"
  ON public.device_push_tokens FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'site_admin'::app_role)
    OR public.has_role(auth.uid(), 'store_admin'::app_role)
    OR public.has_role(auth.uid(), 'support'::app_role)
  );

-- Allow anon/authenticated insert of device token before login (guest browsing)
DROP POLICY IF EXISTS "Anyone register device token" ON public.device_push_tokens;
CREATE POLICY "Anyone register device token"
  ON public.device_push_tokens FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone update device token by token" ON public.device_push_tokens;
CREATE POLICY "Anyone update device token by token"
  ON public.device_push_tokens FOR UPDATE TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.upsert_device_push_token(
  p_token text,
  p_platform text,
  p_branch_id uuid DEFAULT NULL,
  p_app_role text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 10 THEN
    RAISE EXCEPTION 'invalid token';
  END IF;
  IF p_platform NOT IN ('ios', 'android', 'web') THEN
    RAISE EXCEPTION 'invalid platform';
  END IF;

  INSERT INTO public.device_push_tokens (user_id, token, platform, branch_id, app_role, last_seen_at)
  VALUES (auth.uid(), trim(p_token), p_platform, p_branch_id, p_app_role, now())
  ON CONFLICT (token) DO UPDATE SET
    user_id = COALESCE(EXCLUDED.user_id, public.device_push_tokens.user_id),
    platform = EXCLUDED.platform,
    branch_id = COALESCE(EXCLUDED.branch_id, public.device_push_tokens.branch_id),
    app_role = COALESCE(EXCLUDED.app_role, public.device_push_tokens.app_role),
    last_seen_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_device_push_token(text, text, uuid, text) TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.push_send_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid REFERENCES public.announcements(id) ON DELETE SET NULL,
  title text NOT NULL,
  body text,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  target_count integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  failure_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.push_send_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage push logs" ON public.push_send_logs;
CREATE POLICY "Admins manage push logs"
  ON public.push_send_logs FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'site_admin'::app_role)
    OR public.has_role(auth.uid(), 'store_admin'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'site_admin'::app_role)
    OR public.has_role(auth.uid(), 'store_admin'::app_role)
  );
