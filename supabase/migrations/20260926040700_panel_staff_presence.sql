-- Panel staff presence (admin / collector / sales / warehouse) — foreground heartbeat only

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS panel_last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS panel_last_idle_at timestamptz,
  ADD COLUMN IF NOT EXISTS panel_app_foreground boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.staff_presence_heartbeat(
  p_kind text,
  p_foreground boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind text := lower(trim(coalesce(p_kind, '')));
  v_fg boolean := coalesce(p_foreground, false);
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'غير مصرح';
  END IF;

  IF v_kind = 'driver' THEN
    SELECT id INTO v_id FROM public.drivers WHERE user_id = auth.uid() LIMIT 1;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'حساب المندوب غير موجود';
    END IF;
    IF v_fg THEN
      UPDATE public.drivers SET
        app_foreground = true,
        last_seen_at = now(),
        updated_at = now()
      WHERE id = v_id;
    ELSE
      UPDATE public.drivers SET
        app_foreground = false,
        last_idle_at = now(),
        last_seen_at = now(),
        is_available = false,
        updated_at = now()
      WHERE id = v_id;
    END IF;
  ELSIF v_kind = 'preparer' THEN
    SELECT id INTO v_id FROM public.order_preparers WHERE user_id = auth.uid() LIMIT 1;
    IF v_id IS NULL THEN
      RETURN jsonb_build_object('success', true, 'skipped', true);
    END IF;
    IF v_fg THEN
      UPDATE public.order_preparers SET
        app_foreground = true,
        last_seen_at = now(),
        updated_at = now()
      WHERE id = v_id;
    ELSE
      UPDATE public.order_preparers SET
        app_foreground = false,
        last_idle_at = now(),
        last_seen_at = now(),
        updated_at = now()
      WHERE id = v_id;
    END IF;
  ELSIF v_kind = 'panel' THEN
    IF NOT public.is_panel_user() THEN
      RAISE EXCEPTION 'حساب لوحة التحكم غير موجود';
    END IF;
    IF v_fg THEN
      UPDATE public.profiles SET
        panel_app_foreground = true,
        panel_last_seen_at = now(),
        updated_at = now()
      WHERE user_id = auth.uid();
    ELSE
      UPDATE public.profiles SET
        panel_app_foreground = false,
        panel_last_idle_at = now(),
        panel_last_seen_at = now(),
        updated_at = now()
      WHERE user_id = auth.uid();
    END IF;
  ELSE
    RAISE EXCEPTION 'نوع غير مدعوم';
  END IF;

  RETURN jsonb_build_object('success', true, 'foreground', v_fg);
END;
$$;

COMMENT ON COLUMN public.profiles.panel_last_seen_at IS
  'Last admin panel heartbeat while app/tab in foreground (store-safe presence)';
