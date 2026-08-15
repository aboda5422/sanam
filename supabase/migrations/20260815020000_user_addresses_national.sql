-- Customer addresses: national short address and/or map pin.
ALTER TABLE public.user_addresses
  ADD COLUMN IF NOT EXISTS national_address text;

ALTER TABLE public.user_addresses
  ALTER COLUMN lat DROP NOT NULL;

ALTER TABLE public.user_addresses
  ALTER COLUMN lng DROP NOT NULL;

ALTER TABLE public.user_addresses
  DROP CONSTRAINT IF EXISTS user_addresses_location_or_national;

ALTER TABLE public.user_addresses
  ADD CONSTRAINT user_addresses_location_or_national CHECK (
    (national_address IS NOT NULL AND length(btrim(national_address)) >= 8)
    OR (lat IS NOT NULL AND lng IS NOT NULL)
  );
