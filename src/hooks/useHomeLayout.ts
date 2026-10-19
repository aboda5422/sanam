import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  HOME_LAYOUT_KEY,
  mergeHomeLayout,
  type HomeLayoutConfig,
} from "@/lib/home-layout";
import { toast } from "sonner";

export function useHomeLayout() {
  return useQuery<HomeLayoutConfig>({
    queryKey: ["store-settings", HOME_LAYOUT_KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_settings")
        .select("value")
        .eq("key", HOME_LAYOUT_KEY)
        .maybeSingle();
      if (error) throw error;
      return mergeHomeLayout(data?.value);
    },
    staleTime: 60_000,
  });
}

export function useSaveHomeLayout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (value: HomeLayoutConfig) => {
      const { error } = await supabase
        .from("store_settings")
        .upsert({ key: HOME_LAYOUT_KEY, value }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["store-settings", HOME_LAYOUT_KEY] });
      toast.success("تم حفظ ترتيب الصفحة الرئيسية");
    },
    onError: () => toast.error("تعذر حفظ إعدادات الصفحة الرئيسية"),
  });
}
