import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export const useDriverAuth = () => {
  const [loading, setLoading] = useState(true);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/driver/login");
        return;
      }

      const uid = session.user.id;
      setUserId(uid);

      // Check driver role
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", uid);

      const isDriver = roles?.some((r) => r.role === "driver");
      if (!isDriver) {
        navigate("/driver/login");
        return;
      }

      // Get driver record
      const { data: driver } = await supabase
        .from("drivers")
        .select("id")
        .eq("user_id", uid)
        .single();

      if (driver) setDriverId(driver.id);
      setLoading(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      check();
    });

    check();
    return () => subscription.unsubscribe();
  }, [navigate]);

  return { loading, driverId, userId };
};
