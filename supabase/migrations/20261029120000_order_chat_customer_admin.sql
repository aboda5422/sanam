-- Customer ↔ site order chat (extend preparer order_messages) + cancel/edit request RPCs

-- 1) Extend order_messages for images / typed messages / staff role
ALTER TABLE public.order_messages
  ALTER COLUMN body DROP NOT NULL;

ALTER TABLE public.order_messages
  ADD COLUMN IF NOT EXISTS image_urls text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'text';

DO $$
BEGIN
  ALTER TABLE public.order_messages DROP CONSTRAINT IF EXISTS order_messages_sender_role_check;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

ALTER TABLE public.order_messages
  DROP CONSTRAINT IF EXISTS order_messages_sender_role_check;

ALTER TABLE public.order_messages
  ADD CONSTRAINT order_messages_sender_role_check
  CHECK (sender_role IN ('customer', 'preparer', 'driver', 'admin', 'system', 'staff'));

DO $$
BEGIN
  ALTER TABLE public.order_messages DROP CONSTRAINT IF EXISTS order_messages_message_type_check;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

ALTER TABLE public.order_messages
  DROP CONSTRAINT IF EXISTS order_messages_message_type_check;

ALTER TABLE public.order_messages
  ADD CONSTRAINT order_messages_message_type_check
  CHECK (message_type IN (
    'text', 'image', 'system',
    'cancel_request', 'edit_request', 'return_for_edit',
    'cancel_confirmed', 'edit_submitted'
  ));

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS modification_requested_at timestamptz;

-- 2) Staff access helper (panel + branch)
CREATE OR REPLACE FUNCTION public.can_staff_access_order(_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = _order_id
      AND public.is_panel_user()
      AND (
        public.has_role(auth.uid(), 'site_admin'::app_role)
        OR o.branch_id IS NULL
        OR public.can_access_branch(auth.uid(), o.branch_id)
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_staff_access_order(uuid) TO authenticated;

-- 3) RLS: keep existing broad select; widen insert for staff
DROP POLICY IF EXISTS "Order messages select" ON public.order_messages;
CREATE POLICY "Order messages select"
  ON public.order_messages FOR SELECT TO authenticated
  USING (
    order_id IN (SELECT id FROM public.orders WHERE user_id = auth.uid())
    OR public.is_order_preparer(auth.uid())
    OR public.has_role(auth.uid(), 'driver'::app_role)
    OR public.has_role(auth.uid(), 'store_admin'::app_role)
    OR public.has_role(auth.uid(), 'site_admin'::app_role)
    OR public.has_role(auth.uid(), 'support'::app_role)
    OR public.can_staff_access_order(order_id)
  );

DROP POLICY IF EXISTS "Order messages insert" ON public.order_messages;
CREATE POLICY "Order messages insert"
  ON public.order_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      (sender_role = 'customer' AND order_id IN (SELECT id FROM public.orders WHERE user_id = auth.uid()))
      OR (sender_role = 'preparer' AND public.is_order_preparer(auth.uid()))
      OR (sender_role IN ('admin', 'system', 'staff') AND (
        public.has_role(auth.uid(), 'store_admin'::app_role)
        OR public.has_role(auth.uid(), 'site_admin'::app_role)
        OR public.has_role(auth.uid(), 'support'::app_role)
        OR public.can_staff_access_order(order_id)
      ))
      OR (sender_role = 'driver' AND public.has_role(auth.uid(), 'driver'::app_role))
    )
  );

-- 4) Realtime
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_messages;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

-- 5) Storage: authenticated users may upload chat attachments under order-chat/
DROP POLICY IF EXISTS "Authenticated order chat uploads" ON storage.objects;
CREATE POLICY "Authenticated order chat uploads"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'images'
    AND (storage.foldername(name))[1] = 'order-chat'
  );

DROP POLICY IF EXISTS "Authenticated order chat update" ON storage.objects;
CREATE POLICY "Authenticated order chat update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'images'
    AND (storage.foldername(name))[1] = 'order-chat'
  );

-- 6) Internal message insert
CREATE OR REPLACE FUNCTION public._insert_order_message(
  p_order_id uuid,
  p_sender_id uuid,
  p_sender_role text,
  p_body text,
  p_message_type text,
  p_image_urls text[] DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.order_messages (order_id, sender_id, sender_role, body, message_type, image_urls)
  VALUES (p_order_id, p_sender_id, p_sender_role, p_body, p_message_type, COALESCE(p_image_urls, '{}'))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- 7) Customer requests cancel
CREATE OR REPLACE FUNCTION public.request_order_cancel(p_order_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_uid uuid := auth.uid();
  v_reason text := NULLIF(trim(COALESCE(p_reason, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'unauthorized');
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.user_id IS DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object('success', false, 'code', 'not_found');
  END IF;

  IF v_order.status IN ('delivered'::public.order_status, 'cancelled'::public.order_status) THEN
    RETURN jsonb_build_object('success', false, 'code', 'not_allowed');
  END IF;

  PERFORM public._insert_order_message(
    p_order_id, v_uid, 'customer',
    COALESCE(v_reason, 'طلب إلغاء'),
    'cancel_request'
  );

  -- Immediate cancel for pending unpaid
  IF v_order.status = 'pending'::public.order_status
     AND v_order.payment_status IS DISTINCT FROM 'paid'::public.payment_status THEN
    UPDATE public.orders
    SET notes = CASE
          WHEN v_reason IS NULL THEN notes
          ELSE COALESCE(notes || E'\n', '') || 'إلغاء العميل: ' || v_reason
        END
    WHERE id = p_order_id;
    RETURN public.restore_order_stock(p_order_id)
      || jsonb_build_object('cancelled', true);
  END IF;

  RETURN jsonb_build_object('success', true, 'requested', true);
END;
$$;

-- 8) Staff confirms cancel
CREATE OR REPLACE FUNCTION public.staff_confirm_order_cancel(p_order_id uuid, p_notes text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_uid uuid := auth.uid();
  v_notes text := NULLIF(trim(COALESCE(p_notes, '')), '');
  v_restore jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.can_staff_access_order(p_order_id) THEN
    RETURN jsonb_build_object('success', false, 'code', 'unauthorized');
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'not_found');
  END IF;

  IF v_order.status IN ('delivered'::public.order_status, 'cancelled'::public.order_status) THEN
    RETURN jsonb_build_object('success', false, 'code', 'not_allowed');
  END IF;

  PERFORM public._insert_order_message(
    p_order_id, v_uid, 'staff',
    COALESCE(v_notes, 'تم تأكيد إلغاء الطلب من المتجر'),
    'cancel_confirmed'
  );

  IF v_order.payment_status IS DISTINCT FROM 'paid'::public.payment_status
     AND v_order.status IS DISTINCT FROM 'pending'::public.order_status THEN
    UPDATE public.orders SET status = 'pending'::public.order_status WHERE id = p_order_id;
  END IF;

  v_restore := public.restore_order_stock(p_order_id);

  IF COALESCE((v_restore->>'success')::boolean, false) IS NOT TRUE
     OR COALESCE((v_restore->>'code'), '') = 'not_restorable' THEN
    UPDATE public.orders
    SET
      status = 'cancelled'::public.order_status,
      notes = CASE
        WHEN v_notes IS NULL THEN notes
        ELSE COALESCE(notes || E'\n', '') || 'إلغاء متجر: ' || v_notes
      END
    WHERE id = p_order_id;
  ELSE
    UPDATE public.orders
    SET notes = CASE
      WHEN v_notes IS NULL THEN notes
      ELSE COALESCE(notes || E'\n', '') || 'إلغاء متجر: ' || v_notes
    END
    WHERE id = p_order_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'cancelled', true, 'restore', v_restore);
END;
$$;

-- 9) Customer requests edit (message + flag; staff follows up in chat)
CREATE OR REPLACE FUNCTION public.request_order_edit(p_order_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'unauthorized');
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.user_id IS DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object('success', false, 'code', 'not_found');
  END IF;

  IF v_order.status IN (
    'delivered'::public.order_status,
    'cancelled'::public.order_status,
    'on_the_way'::public.order_status
  ) THEN
    RETURN jsonb_build_object('success', false, 'code', 'not_allowed');
  END IF;

  UPDATE public.orders
  SET modification_requested_at = now()
  WHERE id = p_order_id;

  PERFORM public._insert_order_message(
    p_order_id, v_uid, 'customer',
    COALESCE(NULLIF(trim(COALESCE(p_note, '')), ''), 'طلب العميل تعديل الطلب'),
    'edit_request'
  );

  RETURN jsonb_build_object('success', true, 'requested', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_order_cancel(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_confirm_order_cancel(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_order_edit(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
