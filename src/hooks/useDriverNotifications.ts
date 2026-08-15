import { useEffect, useRef, useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { playNotificationSound } from "@/lib/notification-sound";
import { fetchDriverBranchIds } from "@/lib/branch-scope";

export function useDriverNotifications(driverId: string | null) {
  const lastNotifiedRef = useRef<string | null>(null);
  const [branchIds, setBranchIds] = useState<string[]>([]);

  useEffect(() => {
    if (!driverId) {
      setBranchIds([]);
      return;
    }
    let cancelled = false;
    fetchDriverBranchIds(driverId).then((ids) => {
      if (!cancelled) setBranchIds(ids);
    });
    return () => {
      cancelled = true;
    };
  }, [driverId]);

  const handleNewOrder = useCallback((payload: any) => {
    if (!driverId) return;
    const newData = payload.new;
    if (!newData || newData.id === lastNotifiedRef.current) return;

    const assignedToMe = newData.driver_id === driverId;
    const pendingInMyBranch =
      newData.status === "pending" &&
      !newData.driver_id &&
      newData.branch_id &&
      branchIds.includes(newData.branch_id);

    if (!assignedToMe && !pendingInMyBranch) return;

    lastNotifiedRef.current = newData.id;
    playNotificationSound();

    if (Notification.permission === "granted") {
      new Notification("طلب جديد! 🛒", {
        body: `طلب #${newData.order_number} - ${Number(newData.total).toFixed(2)} ر.س`,
        icon: "/sanam-logo.png",
      });
    }
  }, [driverId, branchIds]);

  useEffect(() => {
    if (!driverId) return;

    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    const channel = supabase
      .channel("driver-new-order-notif")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        handleNewOrder
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        handleNewOrder
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [driverId, handleNewOrder]);
}
