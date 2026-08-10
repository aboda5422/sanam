import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export const useAdminAuth = () => {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/admin/login");
        return;
      }

      const uid = session.user.id;
      setUserId(uid);

      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", uid);

      const isAdmin = roles?.some(
        (r) => r.role === "store_admin" || r.role === "site_admin"
      );
      if (!isAdmin) {
        navigate("/admin/login");
        return;
      }

      const adminRole = roles?.find(
        (r) => r.role === "store_admin" || r.role === "site_admin"
      );
      setRole(adminRole?.role || null);
      setLoading(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      check();
    });

    check();
    return () => subscription.unsubscribe();
  }, [navigate]);

  return { loading, userId, role };
};
