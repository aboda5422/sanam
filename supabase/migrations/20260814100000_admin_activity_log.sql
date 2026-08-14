CREATE TABLE IF NOT EXISTS public.admin_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  actor_name text,
  actor_role text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  summary text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS admin_activity_log_created_at_idx
  ON public.admin_activity_log (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_activity_log_branch_id_idx
  ON public.admin_activity_log (branch_id);
CREATE INDEX IF NOT EXISTS admin_activity_log_actor_id_idx
  ON public.admin_activity_log (actor_id);

ALTER TABLE public.admin_activity_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.purge_admin_activity_log()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM public.admin_activity_log
  WHERE created_at < now() - interval '48 hours';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_admin_activity(
  p_action text,
  p_entity_type text,
  p_summary text,
  p_entity_id text DEFAULT NULL,
  p_branch_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_name text;
  v_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT p.full_name INTO v_name
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
  LIMIT 1;

  SELECT ur.role::text INTO v_role
  FROM public.user_roles ur
  WHERE ur.user_id = auth.uid()
  ORDER BY CASE ur.role
    WHEN 'site_admin' THEN 0
    WHEN 'store_admin' THEN 1
    WHEN 'accountant' THEN 2
    WHEN 'inventory' THEN 3
    WHEN 'support' THEN 4
    WHEN 'driver' THEN 5
    ELSE 9
  END
  LIMIT 1;

  INSERT INTO public.admin_activity_log (
    actor_id, actor_name, actor_role, action, entity_type, entity_id, branch_id, summary, metadata
  ) VALUES (
    auth.uid(),
    COALESCE(nullif(trim(v_name), ''), 'مستخدم'),
    COALESCE(v_role, 'unknown'),
    COALESCE(nullif(trim(p_action), ''), 'other'),
    COALESCE(nullif(trim(p_entity_type), ''), 'system'),
    p_entity_id,
    p_branch_id,
    COALESCE(nullif(trim(p_summary), ''), 'عملية'),
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_row_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_entity_id text;
  v_branch uuid;
  v_summary text;
  v_label text;
  v_meta jsonb := '{}'::jsonb;
  v_name text;
  v_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  v_action := lower(TG_OP);
  v_label := CASE TG_TABLE_NAME
    WHEN 'orders' THEN 'طلب'
    WHEN 'products' THEN 'منتج'
    WHEN 'categories' THEN 'قسم'
    WHEN 'complaints' THEN 'شكوى'
    WHEN 'drivers' THEN 'مندوب'
    WHEN 'branches' THEN 'فرع'
    WHEN 'store_settings' THEN 'إعداد'
    WHEN 'user_roles' THEN 'صلاحية'
    WHEN 'announcements' THEN 'إعلان'
    WHEN 'payments' THEN 'دفعة'
    ELSE TG_TABLE_NAME
  END;

  IF TG_OP = 'DELETE' THEN
    v_entity_id := OLD.id::text;
  ELSE
    v_entity_id := NEW.id::text;
  END IF;

  IF TG_TABLE_NAME = 'orders' THEN
    v_branch := CASE WHEN TG_OP = 'DELETE' THEN OLD.branch_id ELSE NEW.branch_id END;
  ELSIF TG_TABLE_NAME = 'branches' THEN
    v_branch := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  ELSE
    v_branch := NULL;
  END IF;

  IF TG_TABLE_NAME = 'orders' THEN
    IF TG_OP = 'INSERT' THEN
      v_summary := 'إنشاء طلب رقم ' || COALESCE(NEW.order_number::text, NEW.id::text);
      v_meta := jsonb_build_object('status', NEW.status, 'total', NEW.total);
    ELSIF TG_OP = 'UPDATE' THEN
      IF OLD.status IS DISTINCT FROM NEW.status THEN
        v_summary := 'تغيير حالة الطلب ' || COALESCE(NEW.order_number::text, '') || ' من ' || OLD.status || ' إلى ' || NEW.status;
      ELSIF OLD.driver_id IS DISTINCT FROM NEW.driver_id THEN
        v_summary := 'تعيين مندوب للطلب ' || COALESCE(NEW.order_number::text, '');
      ELSE
        v_summary := 'تحديث الطلب ' || COALESCE(NEW.order_number::text, '');
      END IF;
      v_meta := jsonb_build_object('from_status', OLD.status, 'to_status', NEW.status);
    ELSE
      v_summary := 'حذف طلب';
    END IF;
  ELSIF TG_TABLE_NAME = 'products' THEN
    v_name := CASE WHEN TG_OP = 'DELETE' THEN OLD.name ELSE NEW.name END;
    v_summary := CASE TG_OP
      WHEN 'INSERT' THEN 'إضافة منتج: ' || COALESCE(v_name, '')
      WHEN 'UPDATE' THEN 'تعديل منتج: ' || COALESCE(v_name, '')
      ELSE 'حذف منتج: ' || COALESCE(v_name, '')
    END;
  ELSIF TG_TABLE_NAME = 'categories' THEN
    v_name := CASE WHEN TG_OP = 'DELETE' THEN OLD.name ELSE NEW.name END;
    v_summary := CASE TG_OP
      WHEN 'INSERT' THEN 'إضافة قسم: ' || COALESCE(v_name, '')
      WHEN 'UPDATE' THEN 'تعديل قسم: ' || COALESCE(v_name, '')
      ELSE 'حذف قسم: ' || COALESCE(v_name, '')
    END;
  ELSIF TG_TABLE_NAME = 'complaints' THEN
    v_status := CASE WHEN TG_OP = 'DELETE' THEN OLD.status::text ELSE NEW.status::text END;
    v_summary := CASE TG_OP
      WHEN 'INSERT' THEN 'إنشاء شكوى'
      WHEN 'UPDATE' THEN 'تحديث شكوى إلى ' || COALESCE(v_status, '')
      ELSE 'حذف شكوى'
    END;
  ELSIF TG_TABLE_NAME = 'drivers' THEN
    v_name := CASE WHEN TG_OP = 'DELETE' THEN OLD.full_name ELSE NEW.full_name END;
    v_summary := CASE TG_OP
      WHEN 'INSERT' THEN 'إضافة مندوب: ' || COALESCE(v_name, '')
      WHEN 'UPDATE' THEN 'تحديث مندوب: ' || COALESCE(v_name, '')
      ELSE 'حذف مندوب: ' || COALESCE(v_name, '')
    END;
  ELSIF TG_TABLE_NAME = 'branches' THEN
    v_name := CASE WHEN TG_OP = 'DELETE' THEN OLD.name ELSE NEW.name END;
    v_branch := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
    v_summary := CASE TG_OP
      WHEN 'INSERT' THEN 'إضافة فرع: ' || COALESCE(v_name, '')
      WHEN 'UPDATE' THEN 'تعديل فرع: ' || COALESCE(v_name, '')
      ELSE 'حذف فرع: ' || COALESCE(v_name, '')
    END;
  ELSIF TG_TABLE_NAME = 'store_settings' THEN
    v_name := CASE WHEN TG_OP = 'DELETE' THEN OLD.key ELSE NEW.key END;
    v_summary := 'تعديل إعدادات المتجر (' || COALESCE(v_name, '') || ')';
  ELSIF TG_TABLE_NAME = 'user_roles' THEN
    v_entity_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id::text ELSE NEW.user_id::text END;
    v_summary := CASE TG_OP
      WHEN 'INSERT' THEN 'تعيين صلاحية ' || NEW.role::text
      WHEN 'DELETE' THEN 'إزالة صلاحية ' || OLD.role::text
      ELSE 'تعديل صلاحية'
    END;
  ELSIF TG_TABLE_NAME = 'announcements' THEN
    v_name := CASE WHEN TG_OP = 'DELETE' THEN OLD.title ELSE NEW.title END;
    v_summary := CASE TG_OP
      WHEN 'INSERT' THEN 'إضافة إعلان: ' || COALESCE(v_name, '')
      WHEN 'UPDATE' THEN 'تعديل إعلان: ' || COALESCE(v_name, '')
      ELSE 'حذف إعلان'
    END;
  ELSIF TG_TABLE_NAME = 'payments' THEN
    IF TG_OP = 'INSERT' THEN
      v_summary := 'تسجيل دفعة بمبلغ ' || COALESCE(NEW.amount::text, '');
    ELSIF TG_OP = 'UPDATE' THEN
      v_summary := 'تحديث دفعة إلى ' || COALESCE(NEW.status::text, '');
    ELSE
      v_summary := 'حذف دفعة';
    END IF;
  ELSE
    v_summary := v_label || ' — ' || v_action;
  END IF;

  PERFORM public.log_admin_activity(
    v_action,
    TG_TABLE_NAME,
    v_summary,
    v_entity_id,
    v_branch,
    v_meta
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_orders ON public.orders;
CREATE TRIGGER trg_activity_orders
  AFTER INSERT OR UPDATE OR DELETE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.record_row_activity();

DROP TRIGGER IF EXISTS trg_activity_products ON public.products;
CREATE TRIGGER trg_activity_products
  AFTER INSERT OR UPDATE OR DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.record_row_activity();

DROP TRIGGER IF EXISTS trg_activity_categories ON public.categories;
CREATE TRIGGER trg_activity_categories
  AFTER INSERT OR UPDATE OR DELETE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.record_row_activity();

DROP TRIGGER IF EXISTS trg_activity_complaints ON public.complaints;
CREATE TRIGGER trg_activity_complaints
  AFTER INSERT OR UPDATE OR DELETE ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.record_row_activity();

DROP TRIGGER IF EXISTS trg_activity_drivers ON public.drivers;
CREATE TRIGGER trg_activity_drivers
  AFTER INSERT OR UPDATE OR DELETE ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.record_row_activity();

DROP TRIGGER IF EXISTS trg_activity_branches ON public.branches;
CREATE TRIGGER trg_activity_branches
  AFTER INSERT OR UPDATE OR DELETE ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.record_row_activity();

DROP TRIGGER IF EXISTS trg_activity_store_settings ON public.store_settings;
CREATE TRIGGER trg_activity_store_settings
  AFTER INSERT OR UPDATE OR DELETE ON public.store_settings
  FOR EACH ROW EXECUTE FUNCTION public.record_row_activity();

DROP TRIGGER IF EXISTS trg_activity_user_roles ON public.user_roles;
CREATE TRIGGER trg_activity_user_roles
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.record_row_activity();

DROP TRIGGER IF EXISTS trg_activity_announcements ON public.announcements;
CREATE TRIGGER trg_activity_announcements
  AFTER INSERT OR UPDATE OR DELETE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.record_row_activity();

DROP TRIGGER IF EXISTS trg_activity_payments ON public.payments;
CREATE TRIGGER trg_activity_payments
  AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.record_row_activity();

DROP POLICY IF EXISTS "Panel users view activity log" ON public.admin_activity_log;
CREATE POLICY "Panel users view activity log"
  ON public.admin_activity_log FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      public.is_panel_user()
      AND (
        branch_id IS NULL
        OR public.can_access_branch(auth.uid(), branch_id)
      )
    )
  );

GRANT SELECT ON public.admin_activity_log TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_admin_activity(text, text, text, text, uuid, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.purge_admin_activity_log() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_admin_activity_log() TO authenticated;

DO $$
BEGIN
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
      PERFORM cron.unschedule('purge-admin-activity-log');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END $$;

DO $$
BEGIN
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
      PERFORM cron.schedule(
        'purge-admin-activity-log',
        '20 * * * *',
        'SELECT public.purge_admin_activity_log()'
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END $$;
