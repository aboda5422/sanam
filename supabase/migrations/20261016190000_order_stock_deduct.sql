-- App orders deduct shared catalog stock when the order is sent.
-- Cart does not reserve stock. Cancellation before preparation puts it back.
-- Cashier sales already deduct inside pos_create_sale.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS stock_restored boolean NOT NULL DEFAULT false;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS stock_units integer;

CREATE OR REPLACE FUNCTION public.create_order_with_stock(
  p_order jsonb,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_branch_id uuid;
  v_order public.orders%ROWTYPE;
  v_item jsonb;
  v_product_id uuid;
  v_qty integer;
  v_name text;
  v_image text;
  v_unit_price numeric;
  v_unit text;
  v_barcode text;
  v_sell text;
  v_pack integer;
  v_alt_unit text;
  v_legacy uuid;
  v_canonical uuid;
  v_base integer;
  v_available integer;
  v_available_sell integer;
  v_unavailable jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول لإرسال الطلب';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'السلة فارغة';
  END IF;

  IF (p_order->>'user_id') IS DISTINCT FROM v_uid::text THEN
    RAISE EXCEPTION 'لا يمكن إنشاء طلب لمستخدم آخر';
  END IF;

  v_branch_id := NULLIF(p_order->>'branch_id', '')::uuid;
  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'الفرع مطلوب';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.branches WHERE id = v_branch_id AND is_active
  ) THEN
    RAISE EXCEPTION 'الفرع غير مفعّل';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := NULLIF(v_item->>'product_id', '')::uuid;
    v_qty := GREATEST(COALESCE((v_item->>'quantity')::integer, 0), 0);
    IF v_product_id IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'عنصر الطلب غير صالح';
    END IF;

    SELECT
      pb.legacy_product_id,
      pb.stock_quantity,
      p.units_per_pack,
      p.alt_unit,
      p.name
    INTO v_legacy, v_available, v_pack, v_alt_unit, v_name
    FROM public.product_branch pb
    JOIN public.products p ON p.id = pb.product_id
    WHERE pb.branch_id = v_branch_id
      AND pb.is_active
      AND (
        pb.legacy_product_id = v_product_id
        OR pb.product_id = v_product_id
      )
    ORDER BY CASE WHEN pb.legacy_product_id = v_product_id THEN 0 ELSE 1 END
    LIMIT 1;

    v_unit := NULLIF(btrim(coalesce(v_item->>'unit', '')), '');
    v_sell := CASE
      WHEN coalesce(v_item->>'sell_unit', '') = 'alt' THEN 'alt'
      WHEN v_alt_unit IS NOT NULL AND v_unit IS NOT NULL AND v_unit = btrim(v_alt_unit) THEN 'alt'
      ELSE 'primary'
    END;
    v_base := public.dual_unit_base_qty(v_pack, v_sell, v_qty);
    v_available_sell := CASE
      WHEN v_sell = 'alt' THEN COALESCE(v_available, 0)
      WHEN COALESCE(v_pack, 1) >= 2 THEN COALESCE(v_available, 0) / v_pack
      ELSE COALESCE(v_available, 0)
    END;

    IF v_legacy IS NULL OR COALESCE(v_available, 0) < v_base THEN
      v_unavailable := v_unavailable || jsonb_build_array(
        jsonb_build_object(
          'id', v_product_id,
          'name', COALESCE(v_name, NULLIF(v_item->>'product_name', ''), 'منتج'),
          'requested', v_qty,
          'available', COALESCE(v_available_sell, 0)
        )
      );
    END IF;
  END LOOP;

  IF jsonb_array_length(v_unavailable) > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'out_of_stock',
      'unavailable', v_unavailable
    );
  END IF;

  PERFORM set_config('app.catalog_sync', '1', true);

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::integer;
    v_unit := NULLIF(btrim(coalesce(v_item->>'unit', '')), '');

    SELECT
      pb.product_id,
      pb.legacy_product_id,
      p.units_per_pack,
      p.alt_unit,
      p.name
    INTO v_canonical, v_legacy, v_pack, v_alt_unit, v_name
    FROM public.product_branch pb
    JOIN public.products p ON p.id = pb.product_id
    WHERE pb.branch_id = v_branch_id
      AND (
        pb.legacy_product_id = v_product_id
        OR pb.product_id = v_product_id
      )
    ORDER BY CASE WHEN pb.legacy_product_id = v_product_id THEN 0 ELSE 1 END
    LIMIT 1
    FOR UPDATE OF pb;

    v_sell := CASE
      WHEN coalesce(v_item->>'sell_unit', '') = 'alt' THEN 'alt'
      WHEN v_alt_unit IS NOT NULL AND v_unit IS NOT NULL AND v_unit = btrim(v_alt_unit) THEN 'alt'
      ELSE 'primary'
    END;
    v_base := public.dual_unit_base_qty(v_pack, v_sell, v_qty);

    UPDATE public.product_branch
    SET stock_quantity = stock_quantity - v_base
    WHERE product_id = v_canonical
      AND branch_id = v_branch_id
      AND stock_quantity >= v_base;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'OUT_OF_STOCK:%',
        jsonb_build_object(
          'success', false,
          'code', 'out_of_stock',
          'unavailable', jsonb_build_array(
            jsonb_build_object(
              'id', v_product_id,
              'name', COALESCE(v_name, 'منتج'),
              'requested', v_qty,
              'available', 0
            )
          )
        )::text;
    END IF;

    UPDATE public.products
    SET stock_quantity = GREATEST(stock_quantity - v_base, 0)
    WHERE id = COALESCE(v_legacy, v_canonical);
  END LOOP;

  INSERT INTO public.orders (
    user_id, customer_name, customer_phone, delivery_address, delivery_lat, delivery_lng,
    subtotal, discount_percent, discount_amount, delivery_fee, total, status, payment_method,
    branch_id, national_address, notes, customer_note, shopping_source, stock_restored
  ) VALUES (
    v_uid,
    NULLIF(p_order->>'customer_name', ''),
    NULLIF(p_order->>'customer_phone', ''),
    NULLIF(p_order->>'delivery_address', ''),
    NULLIF(p_order->>'delivery_lat', '')::double precision,
    NULLIF(p_order->>'delivery_lng', '')::double precision,
    COALESCE((p_order->>'subtotal')::numeric, 0),
    COALESCE((p_order->>'discount_percent')::numeric, 0),
    COALESCE((p_order->>'discount_amount')::numeric, 0),
    COALESCE((p_order->>'delivery_fee')::numeric, 0),
    COALESCE((p_order->>'total')::numeric, 0),
    COALESCE(NULLIF(p_order->>'status', ''), 'pending')::public.order_status,
    COALESCE(NULLIF(p_order->>'payment_method', ''), 'cash'),
    v_branch_id,
    NULLIF(p_order->>'national_address', ''),
    NULLIF(p_order->>'notes', ''),
    NULLIF(p_order->>'customer_note', ''),
    NULLIF(p_order->>'shopping_source', ''),
    false
  )
  RETURNING * INTO v_order;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::integer;
    v_name := COALESCE(NULLIF(v_item->>'product_name', ''), 'منتج');
    v_image := NULLIF(v_item->>'product_image', '');
    v_unit_price := COALESCE((v_item->>'unit_price')::numeric, 0);
    v_barcode := NULLIF(v_item->>'barcode', '');
    v_unit := NULLIF(btrim(coalesce(v_item->>'unit', '')), '');

    SELECT p.units_per_pack, p.alt_unit
    INTO v_pack, v_alt_unit
    FROM public.product_branch pb
    JOIN public.products p ON p.id = pb.product_id
    WHERE pb.branch_id = v_branch_id
      AND (pb.legacy_product_id = v_product_id OR pb.product_id = v_product_id)
    ORDER BY CASE WHEN pb.legacy_product_id = v_product_id THEN 0 ELSE 1 END
    LIMIT 1;

    v_sell := CASE
      WHEN coalesce(v_item->>'sell_unit', '') = 'alt' THEN 'alt'
      WHEN v_alt_unit IS NOT NULL AND v_unit IS NOT NULL AND v_unit = btrim(v_alt_unit) THEN 'alt'
      ELSE 'primary'
    END;
    v_base := public.dual_unit_base_qty(v_pack, v_sell, v_qty);

    INSERT INTO public.order_items (
      order_id, product_id, barcode, product_name, product_image,
      quantity, unit_price, total_price, stock_units
    ) VALUES (
      v_order.id,
      v_product_id,
      v_barcode,
      v_name,
      v_image,
      v_qty,
      v_unit_price,
      COALESCE((v_item->>'total_price')::numeric, v_unit_price * v_qty),
      v_base
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'order', to_jsonb(v_order));
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_order_stock(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_item record;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'not_found');
  END IF;

  IF v_order.stock_restored THEN
    RETURN jsonb_build_object('success', true, 'already', true);
  END IF;

  IF v_order.status IN (
    'preparing'::public.order_status,
    'ready'::public.order_status,
    'assigned'::public.order_status,
    'on_the_way'::public.order_status,
    'delivered'::public.order_status
  ) THEN
    RETURN jsonb_build_object('success', false, 'code', 'not_restorable');
  END IF;

  FOR v_item IN
    SELECT product_id, quantity, stock_units
    FROM public.order_items
    WHERE order_id = p_order_id AND product_id IS NOT NULL
  LOOP
    UPDATE public.products
    SET stock_quantity = stock_quantity + COALESCE(v_item.stock_units, v_item.quantity, 0)
    WHERE id = v_item.product_id;
  END LOOP;

  UPDATE public.orders
  SET
    stock_restored = true,
    status = CASE
      WHEN status = 'pending'::public.order_status THEN 'cancelled'::public.order_status
      ELSE status
    END
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'restored', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_order_with_stock(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_order_stock(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_order_stock(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
