-- PostgREST cannot call overloaded RPCs unambiguously.
-- Keep only the coupon-aware signature of pos_create_sale.

DROP FUNCTION IF EXISTS public.pos_create_sale(uuid, jsonb, jsonb, numeric, text, text, text, text);

GRANT EXECUTE ON FUNCTION public.pos_create_sale(uuid, jsonb, jsonb, numeric, text, text, text, text, text) TO authenticated;
