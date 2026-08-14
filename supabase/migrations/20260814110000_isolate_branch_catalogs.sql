-- Isolate catalogs per branch: copy shared products/categories, then bind each copy to one branch.
-- New branches clone from an existing branch via clone_catalog_to_branch().

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE;

ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;

ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE;

ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_slug_key;
DROP INDEX IF EXISTS public.categories_slug_key;

CREATE TABLE IF NOT EXISTS public.driver_branches (
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (driver_id, branch_id)
);

ALTER TABLE public.driver_branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read driver branches" ON public.driver_branches;
CREATE POLICY "Public read driver branches"
  ON public.driver_branches FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins manage driver branches" ON public.driver_branches;
CREATE POLICY "Admins manage driver branches"
  ON public.driver_branches FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'site_admin'::app_role)
    OR public.has_role(auth.uid(), 'store_admin'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'site_admin'::app_role)
    OR public.has_role(auth.uid(), 'store_admin'::app_role)
  );

CREATE TABLE IF NOT EXISTS public.customer_branches (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active',
  discount_percent numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, branch_id)
);

ALTER TABLE public.customer_branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage customer branches" ON public.customer_branches;
CREATE POLICY "Admins manage customer branches"
  ON public.customer_branches FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'site_admin'::app_role)
    OR public.has_role(auth.uid(), 'store_admin'::app_role)
    OR public.has_role(auth.uid(), 'support'::app_role)
    OR public.has_role(auth.uid(), 'accountant'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'site_admin'::app_role)
    OR public.has_role(auth.uid(), 'store_admin'::app_role)
    OR public.has_role(auth.uid(), 'support'::app_role)
  );

CREATE OR REPLACE FUNCTION public.clone_catalog_to_branch(p_source uuid, p_target uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cats int := 0;
  v_prods int := 0;
BEGIN
  IF p_source IS NULL OR p_target IS NULL OR p_source = p_target THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true);
  END IF;
  IF EXISTS (SELECT 1 FROM public.categories WHERE branch_id = p_target LIMIT 1)
     OR EXISTS (SELECT 1 FROM public.products WHERE branch_id = p_target LIMIT 1) THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  CREATE TEMP TABLE _cat_map (
    old_id uuid PRIMARY KEY,
    new_id uuid NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _cat_map (old_id, new_id)
  SELECT c.id, gen_random_uuid()
  FROM public.categories c
  WHERE c.branch_id = p_source;

  INSERT INTO public.categories (
    id, name, name_en, image, slug, section, is_active, sort_order, branch_id, created_at, updated_at
  )
  SELECT m.new_id, c.name, c.name_en, c.image, c.slug, c.section, c.is_active, c.sort_order,
         p_target, now(), now()
  FROM _cat_map m
  JOIN public.categories c ON c.id = m.old_id;
  GET DIAGNOSTICS v_cats = ROW_COUNT;

  INSERT INTO public.products (
    id, name, name_en, price, original_price, image, category_id, unit, description,
    is_active, is_featured, sort_order, barcode, brand, origin_country, size_label,
    product_form, gallery_urls, extra_label, stock_quantity, cost_price, branch_id,
    created_at, updated_at
  )
  SELECT gen_random_uuid(), p.name, p.name_en, p.price, p.original_price, p.image,
         m.new_id, p.unit, p.description, p.is_active, p.is_featured, p.sort_order,
         p.barcode, p.brand, p.origin_country, p.size_label, p.product_form,
         p.gallery_urls, p.extra_label, p.stock_quantity, p.cost_price, p_target,
         now(), now()
  FROM public.products p
  LEFT JOIN _cat_map m ON m.old_id = p.category_id
  WHERE p.branch_id = p_source;
  GET DIAGNOSTICS v_prods = ROW_COUNT;

  INSERT INTO public.announcements (title, content, bg_color, is_active, sort_order, branch_id)
  SELECT a.title, a.content, a.bg_color, a.is_active, a.sort_order, p_target
  FROM public.announcements a
  WHERE a.branch_id = p_source;

  RETURN jsonb_build_object('ok', true, 'categories', v_cats, 'products', v_prods);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_clone_catalog_on_new_branch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_src uuid;
BEGIN
  SELECT id INTO v_src
  FROM public.branches
  WHERE id <> NEW.id
  ORDER BY created_at NULLS LAST, id
  LIMIT 1;
  IF v_src IS NOT NULL THEN
    PERFORM public.clone_catalog_to_branch(v_src, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clone_catalog_on_new_branch ON public.branches;
CREATE TRIGGER trg_clone_catalog_on_new_branch
  AFTER INSERT ON public.branches
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_clone_catalog_on_new_branch();

DO $$
DECLARE
  r record;
  n_branches int;
  n_shared int;
BEGIN
  SELECT count(*) INTO n_branches FROM public.branches;
  SELECT count(*) INTO n_shared FROM public.categories WHERE branch_id IS NULL;

  IF n_branches = 0 THEN
    RETURN;
  END IF;

  IF n_shared = 0 AND EXISTS (SELECT 1 FROM public.products WHERE branch_id IS NULL) THEN
    n_shared := 1;
  END IF;

  IF n_branches = 1 THEN
    UPDATE public.categories SET branch_id = (SELECT id FROM public.branches LIMIT 1) WHERE branch_id IS NULL;
    UPDATE public.products SET branch_id = (SELECT id FROM public.branches LIMIT 1) WHERE branch_id IS NULL;
    UPDATE public.announcements SET branch_id = (SELECT id FROM public.branches LIMIT 1) WHERE branch_id IS NULL;
  ELSIF n_shared > 0 OR EXISTS (SELECT 1 FROM public.products WHERE branch_id IS NULL) THEN
    CREATE TEMP TABLE _iso_cat (old_id uuid, branch_id uuid, new_id uuid, PRIMARY KEY (old_id, branch_id));
    CREATE TEMP TABLE _iso_prod (old_id uuid, branch_id uuid, new_id uuid, PRIMARY KEY (old_id, branch_id));

    INSERT INTO _iso_cat (old_id, branch_id, new_id)
    SELECT c.id, b.id, gen_random_uuid()
    FROM public.categories c
    CROSS JOIN public.branches b
    WHERE c.branch_id IS NULL;

    INSERT INTO public.categories (
      id, name, name_en, image, slug, section, is_active, sort_order, branch_id, created_at, updated_at
    )
    SELECT m.new_id, c.name, c.name_en, c.image, c.slug, c.section, c.is_active, c.sort_order,
           m.branch_id, c.created_at, now()
    FROM _iso_cat m
    JOIN public.categories c ON c.id = m.old_id;

    INSERT INTO _iso_prod (old_id, branch_id, new_id)
    SELECT p.id, b.id, gen_random_uuid()
    FROM public.products p
    CROSS JOIN public.branches b
    WHERE p.branch_id IS NULL;

    INSERT INTO public.products (
      id, name, name_en, price, original_price, image, category_id, unit, description,
      is_active, is_featured, sort_order, barcode, brand, origin_country, size_label,
      product_form, gallery_urls, extra_label, stock_quantity, cost_price, branch_id,
      created_at, updated_at
    )
    SELECT m.new_id, p.name, p.name_en, p.price, p.original_price, p.image,
           cm.new_id, p.unit, p.description, p.is_active, p.is_featured, p.sort_order,
           p.barcode, p.brand, p.origin_country, p.size_label, p.product_form,
           p.gallery_urls, p.extra_label, p.stock_quantity, p.cost_price, m.branch_id,
           p.created_at, now()
    FROM _iso_prod m
    JOIN public.products p ON p.id = m.old_id
    LEFT JOIN _iso_cat cm ON cm.old_id = p.category_id AND cm.branch_id = m.branch_id;

    UPDATE public.products np
    SET stock_quantity = bi.stock_quantity
    FROM public.branch_inventory bi
    JOIN _iso_prod m ON m.old_id = bi.product_id AND m.branch_id = bi.branch_id
    WHERE np.id = m.new_id;

    UPDATE public.branch_inventory bi
    SET product_id = m.new_id
    FROM _iso_prod m
    WHERE bi.product_id = m.old_id AND bi.branch_id = m.branch_id;

    INSERT INTO public.announcements (title, content, bg_color, is_active, sort_order, branch_id)
    SELECT a.title, a.content, a.bg_color, a.is_active, a.sort_order, b.id
    FROM public.announcements a
    CROSS JOIN public.branches b
    WHERE a.branch_id IS NULL;

    DELETE FROM public.products WHERE branch_id IS NULL;
    DELETE FROM public.categories WHERE branch_id IS NULL;
    DELETE FROM public.announcements WHERE branch_id IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.categories WHERE branch_id IS NULL) THEN
    RAISE NOTICE 'categories still missing branch_id';
  ELSE
    ALTER TABLE public.categories ALTER COLUMN branch_id SET NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM public.products WHERE branch_id IS NULL) THEN
    RAISE NOTICE 'products still missing branch_id';
  ELSE
    ALTER TABLE public.products ALTER COLUMN branch_id SET NOT NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS categories_branch_slug_key
  ON public.categories (branch_id, slug);

CREATE INDEX IF NOT EXISTS products_branch_id_idx ON public.products (branch_id);
CREATE INDEX IF NOT EXISTS categories_branch_id_idx ON public.categories (branch_id);
CREATE INDEX IF NOT EXISTS complaints_branch_id_idx ON public.complaints (branch_id);
CREATE INDEX IF NOT EXISTS announcements_branch_id_idx ON public.announcements (branch_id);

UPDATE public.complaints c
SET branch_id = o.branch_id
FROM public.orders o
WHERE c.order_id = o.id AND c.branch_id IS NULL AND o.branch_id IS NOT NULL;

INSERT INTO public.customer_branches (user_id, branch_id, status, discount_percent)
SELECT DISTINCT o.user_id, o.branch_id, COALESCE(p.status, 'active'), COALESCE(p.discount_percent, 0)
FROM public.orders o
LEFT JOIN public.profiles p ON p.user_id = o.user_id
WHERE o.user_id IS NOT NULL AND o.branch_id IS NOT NULL
ON CONFLICT (user_id, branch_id) DO NOTHING;

INSERT INTO public.driver_branches (driver_id, branch_id)
SELECT d.id, b.id FROM public.drivers d CROSS JOIN public.branches b
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.trg_order_touch_customer_branch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND NEW.branch_id IS NOT NULL THEN
    INSERT INTO public.customer_branches (user_id, branch_id)
    VALUES (NEW.user_id, NEW.branch_id)
    ON CONFLICT (user_id, branch_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_touch_customer_branch ON public.orders;
CREATE TRIGGER trg_order_touch_customer_branch
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_order_touch_customer_branch();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_branches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_branches TO authenticated;
GRANT EXECUTE ON FUNCTION public.clone_catalog_to_branch(uuid, uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.create_driver(text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.create_driver(
  p_full_name text,
  p_username text,
  p_password text,
  p_phone text DEFAULT NULL,
  p_id_number text DEFAULT NULL,
  p_vehicle_type text DEFAULT 'car',
  p_branch_id uuid DEFAULT NULL
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
  v_driver_id uuid;
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_id_number text := nullif(trim(coalesce(p_id_number, '')), '');
  v_vehicle text := coalesce(nullif(trim(p_vehicle_type), ''), 'car');
  v_branch uuid := p_branch_id;
BEGIN
  IF auth.uid() IS NULL OR (
    NOT public.has_role(auth.uid(), 'site_admin'::app_role)
    AND NOT public.has_role(auth.uid(), 'store_admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'صلاحيات غير كافية';
  END IF;

  IF v_branch IS NULL THEN
    SELECT a.branch_id INTO v_branch
    FROM public.admin_branch_access a
    WHERE a.user_id = auth.uid()
    LIMIT 1;
  END IF;

  IF v_name IS NULL OR v_name = '' THEN
    RAISE EXCEPTION 'الاسم الكامل مطلوب';
  END IF;
  IF v_username IS NULL OR v_username = '' THEN
    RAISE EXCEPTION 'اسم المستخدم مطلوب';
  END IF;
  IF p_password IS NULL OR char_length(p_password) < 6 THEN
    RAISE EXCEPTION 'كلمة المرور يجب ألا تقل عن 6 أحرف';
  END IF;
  IF position('@' in v_username) = 0 AND v_username !~ '^[a-z0-9._-]{3,32}$' THEN
    RAISE EXCEPTION 'اسم المستخدم يجب أن يكون 3–32 حرفاً (أحرف إنجليزية أو أرقام أو . _ -)';
  END IF;

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
    jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now()
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'driver'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.profiles SET full_name = v_name WHERE user_id = v_user_id;

  INSERT INTO public.drivers (user_id, full_name, phone, email, id_number, vehicle_type, is_available, status)
  VALUES (v_user_id, v_name, v_phone, v_email, v_id_number, v_vehicle, true, 'active')
  RETURNING id INTO v_driver_id;

  INSERT INTO public.driver_wallet (driver_id)
  VALUES (v_driver_id)
  ON CONFLICT (driver_id) DO NOTHING;

  IF v_branch IS NOT NULL THEN
    INSERT INTO public.driver_branches (driver_id, branch_id)
    VALUES (v_driver_id, v_branch)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object('success', true, 'user_id', v_user_id, 'driver_id', v_driver_id, 'username', v_username);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_driver(text, text, text, text, text, text, uuid) TO authenticated;
