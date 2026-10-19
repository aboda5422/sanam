-- أجر الكاش يُخصم عند التحصيل. لا يبقى مستحقاً للصرف بعد تسوية الطلب.
-- المستحق غير المسدد = أجور الشبكة التي لم تُصرف بعد فقط.

UPDATE public.drivers d
SET unpaid_delivery_pay = COALESCE((
  SELECT ROUND(SUM(w.wage), 2)
  FROM public.orders o
  JOIN (
    SELECT order_id, SUM(amount) AS wage
    FROM public.wallet_transactions
    WHERE type = 'commission'
      AND order_id IS NOT NULL
    GROUP BY order_id
  ) w ON w.order_id = o.id
  WHERE o.driver_id = d.id
    AND o.status = 'delivered'
    AND o.payment_method IS DISTINCT FROM 'cash'
    AND COALESCE(w.wage, 0) > 0
    AND NOT EXISTS (
      SELECT 1
      FROM public.wallet_transactions paid
      WHERE paid.driver_id = d.id
        AND paid.order_id = o.id
        AND paid.type = 'settlement'
        AND COALESCE(paid.notes, '') LIKE '%صرف أجر%'
    )
), 0)
WHERE COALESCE(d.unpaid_delivery_pay, 0) <> COALESCE((
  SELECT ROUND(SUM(w.wage), 2)
  FROM public.orders o
  JOIN (
    SELECT order_id, SUM(amount) AS wage
    FROM public.wallet_transactions
    WHERE type = 'commission'
      AND order_id IS NOT NULL
    GROUP BY order_id
  ) w ON w.order_id = o.id
  WHERE o.driver_id = d.id
    AND o.status = 'delivered'
    AND o.payment_method IS DISTINCT FROM 'cash'
    AND COALESCE(w.wage, 0) > 0
    AND NOT EXISTS (
      SELECT 1
      FROM public.wallet_transactions paid
      WHERE paid.driver_id = d.id
        AND paid.order_id = o.id
        AND paid.type = 'settlement'
        AND COALESCE(paid.notes, '') LIKE '%صرف أجر%'
    )
), 0);
