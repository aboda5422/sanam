-- Record cash collection and delivery counts when a driver marks an order delivered.
-- Previously collected_amount stayed 0 and increment_driver_deliveries did not exist.

CREATE OR REPLACE FUNCTION public.complete_driver_delivery(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_id uuid;
  v_order public.orders%ROWTYPE;
  v_collect numeric := 0;
BEGIN
  SELECT id INTO v_driver_id FROM public.drivers WHERE user_id = auth.uid();
  IF v_driver_id IS NULL THEN
    RAISE EXCEPTION 'ليس لديك حساب مندوب';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الطلب غير موجود';
  END IF;

  IF v_order.driver_id IS DISTINCT FROM v_driver_id THEN
    RAISE EXCEPTION 'هذا الطلب غير معيّن لك';
  END IF;

  IF v_order.status = 'delivered' THEN
    RETURN jsonb_build_object('success', true, 'already', true, 'collected', COALESCE(v_order.collected_amount, 0));
  END IF;

  IF v_order.status IS DISTINCT FROM 'on_the_way'::public.order_status THEN
    RAISE EXCEPTION 'يجب أن يكون الطلب في الطريق قبل تأكيد التسليم';
  END IF;

  IF v_order.payment_method = 'cash' THEN
    v_collect := COALESCE(v_order.total, 0);
  END IF;

  UPDATE public.orders
  SET
    status = 'delivered',
    delivered_at = COALESCE(delivered_at, now()),
    collected_amount = v_collect,
    payment_status = CASE
      WHEN v_order.payment_method = 'cash' THEN 'paid'::public.payment_status
      ELSE payment_status
    END
  WHERE id = p_order_id;

  UPDATE public.drivers
  SET
    total_deliveries = total_deliveries + 1,
    total_earnings = total_earnings + v_collect
  WHERE id = v_driver_id;

  IF v_collect > 0 THEN
    INSERT INTO public.driver_wallet (driver_id, balance, total_collected)
    VALUES (v_driver_id, v_collect, v_collect)
    ON CONFLICT (driver_id) DO UPDATE SET
      balance = public.driver_wallet.balance + EXCLUDED.balance,
      total_collected = public.driver_wallet.total_collected + EXCLUDED.total_collected;

    INSERT INTO public.wallet_transactions (driver_id, order_id, type, amount, notes)
    VALUES (v_driver_id, p_order_id, 'collection', v_collect, 'تحصيل نقدي عند التسليم');
  END IF;

  RETURN jsonb_build_object('success', true, 'collected', v_collect);
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_driver_delivery(uuid) TO authenticated;

-- Backfill cash deliveries that were marked delivered without recording collection.
UPDATE public.orders
SET
  collected_amount = total,
  payment_status = 'paid'
WHERE status = 'delivered'
  AND payment_method = 'cash'
  AND COALESCE(collected_amount, 0) = 0
  AND driver_id IS NOT NULL;

INSERT INTO public.wallet_transactions (driver_id, order_id, type, amount, notes)
SELECT o.driver_id, o.id, 'collection'::public.wallet_transaction_type, o.collected_amount, 'تحصيل نقدي عند التسليم'
FROM public.orders o
WHERE o.status = 'delivered'
  AND o.driver_id IS NOT NULL
  AND COALESCE(o.collected_amount, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.wallet_transactions wt
    WHERE wt.order_id = o.id AND wt.type = 'collection'
  );

UPDATE public.drivers d
SET
  total_deliveries = COALESCE(sub.cnt, 0),
  total_earnings = COALESCE(sub.collected, 0)
FROM (
  SELECT driver_id, COUNT(*)::integer AS cnt, COALESCE(SUM(collected_amount), 0) AS collected
  FROM public.orders
  WHERE status = 'delivered' AND driver_id IS NOT NULL
  GROUP BY driver_id
) sub
WHERE d.id = sub.driver_id;

UPDATE public.driver_wallet w
SET
  total_collected = COALESCE((
    SELECT SUM(amount) FROM public.wallet_transactions
    WHERE driver_id = w.driver_id AND type = 'collection'
  ), 0),
  balance = COALESCE((
    SELECT SUM(
      CASE
        WHEN type = 'collection' THEN amount
        WHEN type = 'settlement' THEN -amount
        ELSE 0
      END
    )
    FROM public.wallet_transactions
    WHERE driver_id = w.driver_id
  ), 0);
