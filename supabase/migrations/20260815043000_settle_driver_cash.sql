ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cash_settled_at timestamptz;

COMMENT ON COLUMN public.orders.cash_settled_at IS 'When cash collected by the driver was remitted to the store';

CREATE OR REPLACE FUNCTION public.settle_driver_cash(p_order_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_count int := 0;
  v_amount numeric := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_panel_user() THEN
    RAISE EXCEPTION 'غير مصرح';
  END IF;

  IF p_order_ids IS NULL OR array_length(p_order_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('settled', 0, 'amount', 0);
  END IF;

  FOR v_order IN
    SELECT *
    FROM public.orders
    WHERE id = ANY (p_order_ids)
      AND status = 'delivered'
      AND payment_method = 'cash'
      AND COALESCE(collected_amount, 0) > 0
      AND cash_settled_at IS NULL
      AND driver_id IS NOT NULL
    FOR UPDATE
  LOOP
    UPDATE public.orders
    SET cash_settled_at = now()
    WHERE id = v_order.id;

    UPDATE public.driver_wallet
    SET balance = GREATEST(0, balance - v_order.collected_amount)
    WHERE driver_id = v_order.driver_id;

    INSERT INTO public.wallet_transactions (driver_id, order_id, type, amount, notes)
    VALUES (
      v_order.driver_id,
      v_order.id,
      'settlement',
      v_order.collected_amount,
      'استلام مبلغ الطلب #' || v_order.order_number::text
    );

    v_count := v_count + 1;
    v_amount := v_amount + v_order.collected_amount;
  END LOOP;

  RETURN jsonb_build_object('settled', v_count, 'amount', v_amount);
END;
$$;

GRANT EXECUTE ON FUNCTION public.settle_driver_cash(uuid[]) TO authenticated;
