import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_POS_FEATURES, type PosFeatures } from "@/lib/pos";

export type CashierSession = {
  userId: string;
  fullName: string;
  branchIds: string[];
  features: PosFeatures;
};

export function useCashierAuth() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<CashierSession | null>(null);

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
          navigate("/cashier/login", { replace: true });
        }
        return;
      }

      const [{ data: roles }, { data: access }, { data: profile }, { data: featRow }] =
        await Promise.all([
          supabase.from("user_roles").select("role").eq("user_id", user.id),
          supabase.from("admin_branch_access").select("branch_id").eq("user_id", user.id),
          supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle(),
          supabase.from("store_settings").select("value").eq("key", "pos_features").maybeSingle(),
        ]);

      const roleSet = new Set((roles || []).map((r) => r.role));
      const isCashier =
        roleSet.has("cashier") || roleSet.has("store_admin") || roleSet.has("site_admin");
      const features = {
        ...DEFAULT_POS_FEATURES,
        ...((featRow?.value as Partial<PosFeatures>) || {}),
      };

      if (!isCashier || !features.enabled) {
        await supabase.auth.signOut();
        if (!cancelled) {
          setSession(null);
          setLoading(false);
          navigate("/cashier/login", { replace: true });
        }
        return;
      }

      if (!cancelled) {
        setSession({
          userId: user.id,
          fullName: profile?.full_name || user.email || "كاشير",
          branchIds: (access || []).map((a) => a.branch_id),
          features,
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

  return { loading, session };
}
