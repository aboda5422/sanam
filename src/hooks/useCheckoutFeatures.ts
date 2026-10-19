import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CheckoutFeatures = {
  online_payment_enabled: boolean;
  national_address_enabled: boolean;
};

export const DEFAULT_CHECKOUT_FEATURES: CheckoutFeatures = {
  online_payment_enabled: true,
  national_address_enabled: true,
};

export const CHECKOUT_FEATURES_KEY = "checkout_features";

/** Admin-controlled checkout toggles (payments + national address). */
export function useCheckoutFeatures() {
  const { data, isLoading } = useQuery({
    queryKey: ["store-settings", CHECKOUT_FEATURES_KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_settings")
        .select("value")
        .eq("key", CHECKOUT_FEATURES_KEY)
        .maybeSingle();
      if (error) throw error;
      const v = (data?.value ?? {}) as Partial<CheckoutFeatures>;
      return {
        online_payment_enabled: v.online_payment_enabled ?? DEFAULT_CHECKOUT_FEATURES.online_payment_enabled,
        national_address_enabled: v.national_address_enabled ?? DEFAULT_CHECKOUT_FEATURES.national_address_enabled,
      } satisfies CheckoutFeatures;
    },
    staleTime: 60_000,
  });

  return {
    features: data ?? DEFAULT_CHECKOUT_FEATURES,
    isLoading,
    onlinePaymentEnabled: data?.online_payment_enabled ?? DEFAULT_CHECKOUT_FEATURES.online_payment_enabled,
    nationalAddressEnabled: data?.national_address_enabled ?? DEFAULT_CHECKOUT_FEATURES.national_address_enabled,
  };
}
