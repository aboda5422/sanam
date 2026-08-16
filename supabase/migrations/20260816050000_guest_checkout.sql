-- Guest checkout: numbered guest profiles (ضيف #N)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_guest boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS guest_number integer;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_guest_number_uidx
  ON public.profiles (guest_number)
  WHERE guest_number IS NOT NULL;

CREATE SEQUENCE IF NOT EXISTS public.guest_number_seq START 1;

CREATE OR REPLACE FUNCTION public.setup_guest_profile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  n int;
  label text;
  prefix text := U&'\0636\064A\0641 #';
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'guests only';
  END IF;

  SELECT guest_number INTO n
  FROM public.profiles
  WHERE user_id = uid;

  IF n IS NOT NULL THEN
    label := prefix || n::text;
    UPDATE public.profiles
    SET is_guest = true,
        full_name = coalesce(nullif(full_name, ''), label)
    WHERE user_id = uid;
    RETURN jsonb_build_object('guest_number', n, 'full_name', label);
  END IF;

  n := nextval('public.guest_number_seq')::int;
  label := prefix || n::text;

  UPDATE public.profiles
  SET is_guest = true,
      guest_number = n,
      full_name = label
  WHERE user_id = uid;

  IF NOT FOUND THEN
    INSERT INTO public.profiles (user_id, full_name, is_guest, guest_number)
    VALUES (uid, label, true, n)
    ON CONFLICT (user_id) DO UPDATE
      SET is_guest = true,
          guest_number = coalesce(public.profiles.guest_number, EXCLUDED.guest_number),
          full_name = coalesce(nullif(public.profiles.full_name, ''), EXCLUDED.full_name);
    SELECT guest_number, full_name INTO n, label
    FROM public.profiles WHERE user_id = uid;
  END IF;

  RETURN jsonb_build_object('guest_number', n, 'full_name', label);
END;
$$;

REVOKE ALL ON FUNCTION public.setup_guest_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.setup_guest_profile() TO authenticated;

CREATE OR REPLACE FUNCTION public.convert_guest_to_customer(p_full_name text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  UPDATE public.profiles
  SET is_guest = false,
      full_name = CASE
        WHEN nullif(trim(p_full_name), '') IS NOT NULL THEN trim(p_full_name)
        ELSE full_name
      END
  WHERE user_id = uid;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.convert_guest_to_customer(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.convert_guest_to_customer(text) TO authenticated;

INSERT INTO public.store_settings (key, value)
VALUES (
  'security',
  jsonb_build_object(
    'require_email_verification', true,
    'max_login_attempts', 5,
    'session_timeout_hours', 24,
    'allow_guest_checkout', true
  )
)
ON CONFLICT (key) DO UPDATE
SET value = coalesce(public.store_settings.value, '{}'::jsonb)
  || jsonb_build_object('allow_guest_checkout', true);
