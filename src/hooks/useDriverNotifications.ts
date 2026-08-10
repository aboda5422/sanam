import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

// Simple beep sound using Web Audio API
function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Play two short beeps
    const playBeep = (startTime: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.3, startTime);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.3);
      osc.start(startTime);
      osc.stop(startTime + 0.3);
    };

    playBeep(ctx.currentTime);
    playBeep(ctx.currentTime + 0.4);
  } catch (e) {
    console.log("Could not play notification sound");
  }
}

export function useDriverNotifications(driverId: string | null) {
  const lastNotifiedRef = useRef<string | null>(null);

  const handleNewOrder = useCallback((payload: any) => {
    if (!driverId) return;
    const newData = payload.new;
    
    // Notify if order is assigned to this driver or is pending (broadcast)
    if (
      newData &&
      (newData.driver_id === driverId || newData.status === "pending") &&
      newData.id !== lastNotifiedRef.current
    ) {
      lastNotifiedRef.current = newData.id;
      playNotificationSound();
      
      // Show browser notification if permitted
      if (Notification.permission === "granted") {
        new Notification("طلب جديد! 🛒", {
          body: `طلب #${newData.order_number} - ${Number(newData.total).toFixed(2)} ر.س`,
          icon: "/favicon.ico",
        });
      }
    }
  }, [driverId]);

  useEffect(() => {
    if (!driverId) return;

    // Request notification permission
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
