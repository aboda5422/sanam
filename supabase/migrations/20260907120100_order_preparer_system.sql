-- Order preparer (محضّر الطلبات) optional module
-- (role: 20260907120000, status ready: 20260907120050)

-- Feature flag
INSERT INTO public.store_settings (key, value)
VALUES (
  'preparer_features',
  jsonb_build_object(
    'enabled', false,
    'require_notifications', true,
    'label_ar', 'محضّر الطلبات'
  )
)
ON CONFLICT (key) DO NOTHING;

-- 4) Order prep columns
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS preparer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prep_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS prep_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS customer_note text;

CREATE INDEX IF NOT EXISTS idx_orders_preparer ON public.orders(preparer_id) WHERE preparer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_status_branch ON public.orders(status, branch_id);

-- 5) Order items: link product + prep progress
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS prepared_qty integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prepared_at timestamptz;

-- 6) Staff↔customer messages on order (no phone/location shown to preparer)
CREATE TABLE IF NOT EXISTS public.order_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_role text NOT NULL CHECK (sender_role IN ('customer', 'preparer', 'driver', 'admin', 'system')),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_messages_order ON public.order_messages(order_id, created_at);

ALTER TABLE public.order_messages ENABLE ROW LEVEL SECURITY;

-- 7) Helpers
CREATE OR REPLACE FUNCTION public.is_order_preparer(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'order_preparer'::app_role)
      OR public.has_role(_user_id, 'store_admin'::app_role)
      OR public.has_role(_user_id, 'site_admin'::app_role);
$$;

CREATE OR REPLACE FUNCTION public.preparer_feature_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((value->>'enabled')::boolean, false)
  FROM public.store_settings
  WHERE key = 'preparer_features';
$$;

-- 8) Create preparer staff (mirrors create_cashier)
CREATE OR REPLACE FUNCTION public.create_order_preparer(
  p_full_name text,
  p_username text,
  p_password text,
  p_branch_id uuid,
  p_phone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_name text := trim(p_full_name);
  v_username text := lower(trim(p_username));
  v_email text;
  v_user_id uuid := gen_random_uuid();
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
BEGIN
  IF auth.uid() IS NULL
     OR (
       NOT public.has_role(auth.uid(), 'site_admin'::app_role)
       AND NOT public.has_role(auth.uid(), 'store_admin'::app_role)
     ) THEN
    RAISE EXCEPTION 'صلاحيات غير كافية';
  END IF;

  IF v_name IS NULL OR v_name = '' THEN RAISE EXCEPTION 'الاسم مطلوب'; END IF;
  IF v_username IS NULL OR v_username = '' THEN RAISE EXCEPTION 'اسم المستخدم مطلوب'; END IF;
  IF p_password IS NULL OR char_length(p_password) < 6 THEN
    RAISE EXCEPTION 'كلمة المرور قصيرة';
  END IF;
  IF p_branch_id IS NULL THEN RAISE EXCEPTION 'الفرع مطلوب'; END IF;

  IF position('@' in v_username) > 0 THEN
    v_email := v_username;
  ELSE
    v_email := v_username || '@staff.sanam';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_email) THEN
    RAISE EXCEPTION 'اسم المستخدم مستخدم مسبقاً';
  END IF;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    is_sso_user, is_anonymous
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_user_id, 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object('full_name', v_name, 'username', v_username),
    now(), now(), '', '', '', '', false, false
  );

  INSERT INTO auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) VALUES (
    v_user_id::text, v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
    'email', now(), now(), now()
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'order_preparer'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.profiles
  SET full_name = v_name, phone = v_phone
  WHERE user_id = v_user_id;

  INSERT INTO public.admin_branch_access (user_id, branch_id)
  VALUES (v_user_id, p_branch_id)
  ON CONFLICT (user_id, branch_id) DO NOTHING;

  RETURN jsonb_build_object('user_id', v_user_id, 'email', v_email);
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_order_preparer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preparer_feature_enabled() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.create_order_preparer(text, text, text, uuid, text) TO authenticated;

-- 9) Claim order for prep
CREATE OR REPLACE FUNCTION public.preparer_claim_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.orders%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR NOT public.is_order_preparer(v_uid) THEN
    RAISE EXCEPTION 'غير مصرح';
  END IF;
  IF NOT public.preparer_feature_enabled() THEN
    RAISE EXCEPTION 'ميزة التحضير غير مفعّلة';
  END IF;

  UPDATE public.orders o
  SET
    preparer_id = v_uid,
    status = 'preparing',
    prep_started_at = coalesce(o.prep_started_at, now())
  WHERE o.id = p_order_id
    AND o.status = 'pending'
    AND o.preparer_id IS NULL
    AND o.prep_completed_at IS NULL
    AND (
      public.has_role(v_uid, 'site_admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.admin_branch_access a
        WHERE a.user_id = v_uid AND a.branch_id = o.branch_id
      )
    )
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'تعذر استلام الطلب (قد يكون مستلماً مسبقاً)';
  END IF;

  RETURN jsonb_build_object('id', v_row.id, 'status', v_row.status, 'order_number', v_row.order_number);
END;
$$;

GRANT EXECUTE ON FUNCTION public.preparer_claim_order(uuid) TO authenticated;

-- 10) Mark item prepared (qty increment or set)
CREATE OR REPLACE FUNCTION public.preparer_mark_item(
  p_order_item_id uuid,
  p_prepared_qty integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_item public.order_items%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_qty integer;
  v_all_done boolean;
BEGIN
  IF v_uid IS NULL OR NOT public.is_order_preparer(v_uid) THEN
    RAISE EXCEPTION 'غير مصرح';
  END IF;

  SELECT * INTO v_item FROM public.order_items WHERE id = p_order_item_id;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'الصنف غير موجود'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_item.order_id;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'الطلب غير موجود'; END IF;
  IF v_order.preparer_id IS DISTINCT FROM v_uid
     AND NOT public.has_role(v_uid, 'site_admin'::app_role)
     AND NOT public.has_role(v_uid, 'store_admin'::app_role) THEN
    RAISE EXCEPTION 'هذا الطلب ليس ضمن مسؤوليتك';
  END IF;
  IF v_order.status NOT IN ('preparing') THEN
    RAISE EXCEPTION 'الطلب ليس في مرحلة التحضير';
  END IF;

  v_qty := COALESCE(p_prepared_qty, LEAST(v_item.prepared_qty + 1, v_item.quantity));
  IF v_qty < 0 THEN v_qty := 0; END IF;
  IF v_qty > v_item.quantity THEN v_qty := v_item.quantity; END IF;

  UPDATE public.order_items
  SET prepared_qty = v_qty,
      prepared_at = CASE WHEN v_qty >= quantity THEN now() ELSE prepared_at END
  WHERE id = p_order_item_id
  RETURNING * INTO v_item;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.order_items oi
    WHERE oi.order_id = v_order.id AND oi.prepared_qty < oi.quantity
  ) INTO v_all_done;

  IF v_all_done THEN
    UPDATE public.orders
    SET status = 'ready',
        prep_completed_at = now()
    WHERE id = v_order.id
    RETURNING * INTO v_order;
  END IF;

  RETURN jsonb_build_object(
    'item_id', v_item.id,
    'prepared_qty', v_item.prepared_qty,
    'quantity', v_item.quantity,
    'order_status', v_order.status,
    'all_done', v_all_done
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.preparer_mark_item(uuid, integer) TO authenticated;

-- 11) RLS policies for preparer on orders / items / messages
DROP POLICY IF EXISTS "Preparers view branch orders" ON public.orders;
CREATE POLICY "Preparers view branch orders"
  ON public.orders FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'order_preparer'::app_role)
    AND public.preparer_feature_enabled()
    AND (
      branch_id IN (SELECT branch_id FROM public.admin_branch_access WHERE user_id = auth.uid())
      OR preparer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Preparers update claimed orders" ON public.orders;
CREATE POLICY "Preparers update claimed orders"
  ON public.orders FOR UPDATE TO authenticated
  USING (
    public.is_order_preparer(auth.uid())
    AND (
      preparer_id = auth.uid()
      OR (
        status = 'pending'
        AND preparer_id IS NULL
        AND branch_id IN (SELECT branch_id FROM public.admin_branch_access WHERE user_id = auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "Preparers view order items" ON public.order_items;
CREATE POLICY "Preparers view order items"
  ON public.order_items FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'order_preparer'::app_role)
    AND order_id IN (
      SELECT id FROM public.orders
      WHERE branch_id IN (SELECT branch_id FROM public.admin_branch_access WHERE user_id = auth.uid())
         OR preparer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Preparers update order items prep" ON public.order_items;
CREATE POLICY "Preparers update order items prep"
  ON public.order_items FOR UPDATE TO authenticated
  USING (
    public.is_order_preparer(auth.uid())
    AND order_id IN (SELECT id FROM public.orders WHERE preparer_id = auth.uid() OR public.has_role(auth.uid(), 'site_admin'::app_role))
  );

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
  );

DROP POLICY IF EXISTS "Order messages insert" ON public.order_messages;
CREATE POLICY "Order messages insert"
  ON public.order_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      (sender_role = 'customer' AND order_id IN (SELECT id FROM public.orders WHERE user_id = auth.uid()))
      OR (sender_role = 'preparer' AND public.is_order_preparer(auth.uid()))
      OR (sender_role IN ('admin', 'system') AND (
        public.has_role(auth.uid(), 'store_admin'::app_role)
        OR public.has_role(auth.uid(), 'site_admin'::app_role)
        OR public.has_role(auth.uid(), 'support'::app_role)
      ))
      OR (sender_role = 'driver' AND public.has_role(auth.uid(), 'driver'::app_role))
    )
  );

-- Drivers: when preparer enabled, claim from ready (not pending)
-- Keep existing claim policy; frontend will query ready when feature on.
