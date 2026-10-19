-- Stop a driver from receiving a new order when active orders or unsettled cash exceed their limits.
-- Settlement (driver_wallet.balance back under the cap) or finishing active orders lifts the block.

CREATE OR REPLACE FUNCTION public.enforce_driver_receive_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_defaults jsonb;
  v_enforce_orders boolean;
  v_enforce_cash boolean;
  v_max_orders integer;
  v_max_cash numeric;
  v_active integer;
  v_balance numeric;
BEGIN
  IF NEW.driver_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.driver_id IS NOT DISTINCT FROM NEW.driver_id THEN
    RETURN NEW;
  END IF;

  SELECT value INTO v_defaults
  FROM public.store_settings
  WHERE key = 'driver_limits';

  v_defaults := COALESCE(v_defaults, '{}'::jsonb);
  v_enforce_orders := COALESCE((v_defaults->>'enforce_active_orders')::boolean, true);
  v_enforce_cash := COALESCE((v_defaults->>'enforce_cash_limit')::boolean, true);

  SELECT
    GREATEST(1, COALESCE(d.max_active_orders, NULLIF(v_defaults->>'max_active_orders', '')::integer, 4)),
    GREATEST(0, COALESCE(d.max_cash_on_hand, NULLIF(v_defaults->>'max_cash_on_hand', '')::numeric, 1000))
  INTO v_max_orders, v_max_cash
  FROM public.drivers d
  WHERE d.id = NEW.driver_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF v_enforce_orders THEN
    SELECT COUNT(*)::integer INTO v_active
    FROM public.orders o
    WHERE o.driver_id = NEW.driver_id
      AND o.id IS DISTINCT FROM NEW.id
      AND o.status::text IN (
        'assigned',
        'preparing',
        'ready',
        'on_the_way',
        'awaiting_price_approval',
        'price_approved'
      );

    IF v_active >= v_max_orders THEN
      RAISE EXCEPTION 'تجاوز المندوب حد الطلبات النشطة (%). أكمل الطلبات الحالية قبل استلام طلب جديد', v_max_orders
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF v_enforce_cash THEN
    SELECT COALESCE(w.balance, 0) INTO v_balance
    FROM public.driver_wallet w
    WHERE w.driver_id = NEW.driver_id;

    IF COALESCE(v_balance, 0) > v_max_cash THEN
      RAISE EXCEPTION 'تجاوز المندوب حد النقد غير المسوّى (% ر.س). يلزم تسوية العهدة قبل استلام طلب جديد', trim(to_char(v_max_cash, 'FM999999990.00'))
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_enforce_driver_receive_limits ON public.orders;
CREATE TRIGGER orders_enforce_driver_receive_limits
  BEFORE INSERT OR UPDATE OF driver_id ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_driver_receive_limits();
