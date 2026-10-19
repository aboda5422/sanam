import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_OPS_ENFORCEMENT,
  OPS_ENFORCEMENT_KEY,
  parseOpsEnforcement,
  type OpsEnforcement,
} from "@/lib/ops-enforcement";

/** Admin-controlled mandatory gates for driver / preparer apps. */
export function useOpsEnforcement() {
  const { data, isLoading } = useQuery({
    queryKey: ["store-settings", OPS_ENFORCEMENT_KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_settings")
        .select("value")
        .eq("key", OPS_ENFORCEMENT_KEY)
        .maybeSingle();
      if (error) throw error;
      return parseOpsEnforcement(data?.value);
    },
    staleTime: 30_000,
  });

  const enforcement = data ?? DEFAULT_OPS_ENFORCEMENT;

  return {
    enforcement,
    isLoading,
    driverRequireNotifications: enforcement.driver_require_notifications,
    driverRequireLocation: enforcement.driver_require_location,
    preparerRequireNotifications: enforcement.preparer_require_notifications,
  };
}

export async function fetchOpsEnforcement(): Promise<OpsEnforcement> {
  const { data, error } = await supabase
    .from("store_settings")
    .select("value")
    .eq("key", OPS_ENFORCEMENT_KEY)
    .maybeSingle();
  if (error) throw error;
  return parseOpsEnforcement(data?.value);
}
