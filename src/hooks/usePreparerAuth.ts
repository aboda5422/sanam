import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_PREPARER_FEATURES, type PreparerFeatures } from "@/lib/preparer";

export type PreparerSession = {
  userId: string;
  fullName: string;
  branchIds: string[];
  features: PreparerFeatures;
  notificationsOk: boolean;
};

async function ensureNotifications(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const res = await Notification.requestPermission();
  return res === "granted";
}

export function usePreparerAuth() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<PreparerSession | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const { data: auth } = await supabase.auth.getSession();
      const user = auth.session?.user;
      if (!user) {
        if (!cancelled) {
          setSession(null);
          setLoading(false);
          navigate("/preparer/login", { replace: true });
        }
        return;
      }

      const [{ data: roles }, { data: access }, { data: profile }, { data: featRow }] =
        await Promise.all([
          supabase.from("user_roles").select("role").eq("user_id", user.id),
          supabase.from("admin_branch_access").select("branch_id").eq("user_id", user.id),
          supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle(),
          supabase.from("store_settings").select("value").eq("key", "preparer_features").maybeSingle(),
        ]);

      const roleSet = new Set((roles || []).map((r) => r.role));
      const isPreparer =
        roleSet.has("order_preparer") ||
        roleSet.has("store_admin") ||
        roleSet.has("site_admin");
      const features = {
        ...DEFAULT_PREPARER_FEATURES,
        ...((featRow?.value as Partial<PreparerFeatures>) || {}),
      };

      if (!isPreparer || !features.enabled) {
        await supabase.auth.signOut();
        if (!cancelled) {
          setSession(null);
          setLoading(false);
          navigate("/preparer/login", { replace: true });
        }
        return;
      }

      let notificationsOk = true;
      if (features.require_notifications) {
        notificationsOk = await ensureNotifications();
      }

      if (!cancelled) {
        setSession({
          userId: user.id,
          fullName: profile?.full_name || user.email || "محضّر",
          branchIds: (access || []).map((a) => a.branch_id),
          features,
          notificationsOk,
        });
        setLoading(false);
      }
    };

    load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      load();
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  return { loading, session, setSession };
}
