-- Activity log: stamp branch_id from the row, and keep login logs reliable.
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

  IF TG_TABLE_NAME = 'branches' THEN
    v_branch := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  ELSIF TG_TABLE_NAME IN ('orders', 'products', 'categories', 'complaints', 'announcements') THEN
    v_branch := CASE WHEN TG_OP = 'DELETE' THEN OLD.branch_id ELSE NEW.branch_id END;
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
