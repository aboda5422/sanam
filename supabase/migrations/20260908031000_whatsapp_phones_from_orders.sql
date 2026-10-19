-- Expand WhatsApp subscriber phone source: profiles + orders

CREATE OR REPLACE FUNCTION public.list_whatsapp_subscriber_phones(p_branch_id uuid DEFAULT NULL)
RETURNS TABLE (phone text, user_id uuid, full_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH raw AS (
    -- Profiles with phone
    SELECT
      p.phone AS phone,
      p.user_id AS user_id,
      COALESCE(NULLIF(p.full_name, ''), 'عميل') AS full_name,
      p.updated_at AS sort_at
    FROM public.profiles p
    WHERE p.phone IS NOT NULL
      AND length(regexp_replace(p.phone, '[^0-9]', '', 'g')) >= 9
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

    UNION ALL

    -- Order checkout phones (covers guests / profiles without phone)
    SELECT
      o.customer_phone AS phone,
      o.user_id AS user_id,
      COALESCE(NULLIF(o.customer_name, ''), 'عميل') AS full_name,
      o.created_at AS sort_at
    FROM public.orders o
    WHERE o.customer_phone IS NOT NULL
      AND length(regexp_replace(o.customer_phone, '[^0-9]', '', 'g')) >= 9
      AND (p_branch_id IS NULL OR o.branch_id = p_branch_id)
  ),
  cleaned AS (
    SELECT
      phone,
      user_id,
      full_name,
      sort_at,
      regexp_replace(phone, '[^0-9]', '', 'g') AS digits
    FROM raw
  )
  SELECT DISTINCT ON (c.digits)
    c.phone,
    c.user_id,
    c.full_name
  FROM cleaned c
  WHERE NOT EXISTS (
    SELECT 1 FROM public.whatsapp_blacklist b
    WHERE regexp_replace(b.phone, '[^0-9]', '', 'g') = c.digits
  )
  ORDER BY c.digits, c.sort_at DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.list_whatsapp_subscriber_phones(uuid) TO authenticated;
