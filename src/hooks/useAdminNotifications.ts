import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { playNotificationSound, unlockNotificationAudio } from "@/lib/notification-sound";

export type NotificationPrefs = {
  order_new: boolean;
  order_status: boolean;
  driver_assigned: boolean;
  low_stock: boolean;
  new_complaint: boolean;
  sound_enabled: boolean;
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  order_new: true,
  order_status: true,
  driver_assigned: true,
  low_stock: true,
  new_complaint: true,
  sound_enabled: true,
};

export function useNotificationPrefs() {
  return useQuery({
    queryKey: ["store-settings", "notifications"],
    queryFn: async (): Promise<NotificationPrefs> => {
      const { data, error } = await supabase
        .from("store_settings")
        .select("value")
        .eq("key", "notifications")
        .maybeSingle();
      if (error) throw error;
      return { ...DEFAULT_NOTIFICATION_PREFS, ...(data?.value as object | undefined) };
    },
  });
}

function inScope(branchId: string | null | undefined, filterBranchId: string | null, scopedBranchIds: string[] | null) {
  if (!branchId) return true;
  if (filterBranchId) return branchId === filterBranchId;
  if (scopedBranchIds?.length) return scopedBranchIds.includes(branchId);
  return true;
}

export function useAdminNotifications() {
  const { filterBranchId, scopedBranchIds, loading } = useAdminAuth();
  const { data: prefs = DEFAULT_NOTIFICATION_PREFS } = useNotificationPrefs();
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const scopeRef = useRef({ filterBranchId, scopedBranchIds });
  scopeRef.current = { filterBranchId, scopedBranchIds };

  useEffect(() => {
    const unlock = () => unlockNotificationAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  useEffect(() => {
    if (loading) return;

    const alert = (enabled: boolean, message: string) => {
      if (!enabled) return;
      if (prefsRef.current.sound_enabled) playNotificationSound();
      toast.info(message);
    };

    const channel = supabase
      .channel("admin-notification-sounds")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, (payload) => {
        const row = payload.new as any;
        if (!inScope(row?.branch_id, scopeRef.current.filterBranchId, scopeRef.current.scopedBranchIds)) return;
        alert(prefsRef.current.order_new, `طلب جديد #${row.order_number ?? ""}`.trim());
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, (payload) => {
        const row = payload.new as any;
        const prev = payload.old as any;
        if (!inScope(row?.branch_id, scopeRef.current.filterBranchId, scopeRef.current.scopedBranchIds)) return;
        if (prev?.status && row?.status && prev.status !== row.status) {
          alert(prefsRef.current.order_status, `تغيير حالة الطلب #${row.order_number ?? ""} إلى ${row.status}`);
        } else if (prev?.driver_id !== row?.driver_id && row?.driver_id) {
          alert(prefsRef.current.driver_assigned, `تم تعيين مندوب للطلب #${row.order_number ?? ""}`);
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "complaints" }, (payload) => {
        const row = payload.new as any;
        if (!inScope(row?.branch_id, scopeRef.current.filterBranchId, scopeRef.current.scopedBranchIds)) return;
        alert(prefsRef.current.new_complaint, "شكوى جديدة من عميل");
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "products" }, (payload) => {
        const row = payload.new as any;
        const prev = payload.old as any;
        if (!inScope(row?.branch_id, scopeRef.current.filterBranchId, scopeRef.current.scopedBranchIds)) return;
        const was = Number(prev?.stock_quantity);
        const now = Number(row?.stock_quantity);
        if (Number.isFinite(was) && Number.isFinite(now) && was > 0 && now <= 0) {
          alert(prefsRef.current.low_stock, `نفاد المخزون: ${row.name || "منتج"}`);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loading]);
}
