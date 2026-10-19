import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_STORE_INFO,
  STORE_INFO_KEY,
  mergeStoreInfo,
  toWhatsAppDigits,
  type StoreInfo,
} from "@/lib/store-info";

function isBlankOrZeroPhone(phone: string) {
  const digits = String(phone || "").replace(/\D/g, "");
  return !digits || /^0+$/.test(digits);
}

export const useStoreInfo = () => {
  const query = useQuery({
    queryKey: ["store-settings", STORE_INFO_KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_settings")
        .select("value")
        .eq("key", STORE_INFO_KEY)
        .maybeSingle();
      if (error) throw error;
      return mergeStoreInfo(data?.value);
    },
    // Keep fresh so admin save → footer update is visible without long wait
    staleTime: 5_000,
  });

  // Always merge: AdminSettings may cache the raw JSON under the same query key
  const info: StoreInfo = mergeStoreInfo(query.data ?? DEFAULT_STORE_INFO);
  const phoneDisplay = isBlankOrZeroPhone(info.phone)
    ? DEFAULT_STORE_INFO.phone
    : info.phone.trim();
  const whatsappDigits = toWhatsAppDigits(
    info.whatsapp,
    isBlankOrZeroPhone(info.phone) ? DEFAULT_STORE_INFO.whatsapp : info.phone,
  );

  return {
    ...query,
    info,
    whatsappDigits,
    phoneDisplay,
    phoneTel: phoneDisplay.replace(/\s/g, ""),
  };
};
