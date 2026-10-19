import { useEffect, useRef, useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { playNotificationSound } from "@/lib/notification-sound";
import { fetchDriverBranchIds } from "@/lib/branch-scope";
import { DEFAULT_PREPARER_FEATURES, type PreparerFeatures } from "@/lib/preparer";

export function useDriverNotifications(driverId: string | null) {
  const lastNotifiedRef = useRef<string | null>(null);
  const lastSilentRef = useRef<string | null>(null);
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [preparerOn, setPreparerOn] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);

  useEffect(() => {
    supabase
      .from("store_settings")
      .select("value")
      .eq("key", "preparer_features")
      .maybeSingle()
      .then(({ data }) => {
        const feat = {
          ...DEFAULT_PREPARER_FEATURES,
          ...((data?.value as Partial<PreparerFeatures>) || {}),
        };
        setPreparerOn(!!feat.enabled);
      });
  }, []);

  useEffect(() => {
    if (!driverId) {
      setBranchIds([]);
      setIsAvailable(false);
      return;
    }
    let cancelled = false;
    fetchDriverBranchIds(driverId).then((ids) => {
      if (!cancelled) setBranchIds(ids);
    });

    const loadAvailability = async () => {
      const { data } = await supabase
        .from("drivers")
        .select("is_available")
        .eq("id", driverId)
        .maybeSingle();
      if (!cancelled) setIsAvailable(!!data?.is_available);
    };
    loadAvailability();

    const availChannel = supabase
      .channel(`driver-avail-${driverId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "drivers", filter: `id=eq.${driverId}` },
        (payload) => {
          setIsAvailable(!!(payload.new as any)?.is_available);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(availChannel);
    };
  }, [driverId]);

  const handleOrderChange = useCallback(
    (payload: any) => {
      if (!driverId) return;
      const newData = payload.new;
      if (!newData) return;

      const inBranch =
        newData.branch_id && branchIds.includes(newData.branch_id) && !newData.driver_id;
      const assignedToMe = newData.driver_id === driverId;
      const oldData = payload.old;

      // Customer rejected purchase price — notify assigned driver (even if offline)
      if (
        assignedToMe &&
        newData.status === "preparing" &&
        (newData.price_rejected_at ||
          (oldData?.status === "awaiting_price_approval" && newData.status === "preparing"))
      ) {
        const rejectTag = `price-reject-${newData.id}-${newData.price_rejected_at || newData.updated_at}`;
        if (lastNotifiedRef.current !== rejectTag) {
          lastNotifiedRef.current = rejectTag;
          playNotificationSound();
          if (Notification.permission === "granted") {
            new Notification("العميل رفض السعر", {
              body: `طلب #${newData.order_number} — راجع الفاتورة وأعد الإرسال`,
              icon: "/logo-mark.png",
              tag: `price-reject-${newData.id}`,
            });
          }
        }
        return;
      }

      // Offline drivers must not get new unassigned-order alerts
      if (!isAvailable && !assignedToMe) return;

      // Silent progress while branch is preparing (preparer mode)
      if (
        preparerOn &&
        inBranch &&
        isAvailable &&
        newData.status === "preparing" &&
        newData.id !== lastSilentRef.current
      ) {
        lastSilentRef.current = newData.id;
        if (Notification.permission === "granted") {
          new Notification("طلب قيد التحضير", {
            body: `طلب #${newData.order_number} — جاري التجهيز في الفرع`,
            icon: "/logo-mark.png",
            tag: `prep-silent-${newData.id}`,
            silent: true,
          });
        }
        return;
      }

      // Actionable: ready (preparer on) or pending (preparer off), or assigned to me
      const actionable =
        assignedToMe ||
        (isAvailable &&
          inBranch &&
          ((preparerOn && newData.status === "ready") ||
            (!preparerOn && newData.status === "pending")));

      if (!actionable) return;
      if (newData.id === lastNotifiedRef.current && payload.eventType !== "INSERT") {
        // allow re-notify when status becomes ready
        if (!(preparerOn && newData.status === "ready")) return;
      }

      lastNotifiedRef.current = newData.id;
      playNotificationSound();

      if (Notification.permission === "granted") {
        const title =
          preparerOn && newData.status === "ready"
            ? "طلب جاهز للاستلام! 🛒"
            : "طلب جديد! 🛒";
        new Notification(title, {
          body: `طلب #${newData.order_number} - ${Number(newData.total).toFixed(2)} ر.س`,
          icon: "/logo-mark.png",
          tag: `driver-order-${newData.id}`,
        });
      }
    },
    [driverId, branchIds, preparerOn, isAvailable],
  );

  useEffect(() => {
    if (!driverId) return;

    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    const channel = supabase
      .channel("driver-new-order-notif")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, handleOrderChange)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, handleOrderChange)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [driverId, handleOrderChange]);
}
