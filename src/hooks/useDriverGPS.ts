import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Hook that sends the driver's GPS location to the database every 30 seconds.
 * Activate when driver is available. No toast messages - location warnings
 * are handled only by the dashboard toggle.
 */
export function useDriverGPS(driverId: string | null, isAvailable: boolean) {
  const watchIdRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPositionRef = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!driverId || !isAvailable) return;
    if (!("geolocation" in navigator)) return;

    const updateLocation = async (lat: number, lng: number) => {
      if (lastPositionRef.current) {
        const dLat = Math.abs(lat - lastPositionRef.current.lat);
        const dLng = Math.abs(lng - lastPositionRef.current.lng);
        if (dLat < 0.0001 && dLng < 0.0001) return;
      }
      lastPositionRef.current = { lat, lng };
      await supabase
        .from("drivers")
        .update({ current_lat: lat, current_lng: lng })
        .eq("id", driverId);
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => updateLocation(pos.coords.latitude, pos.coords.longitude),
      () => {}, // Silent - dashboard handles warnings
      { enableHighAccuracy: true }
    );

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => updateLocation(pos.coords.latitude, pos.coords.longitude),
      () => {}, // Silent
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );

    intervalRef.current = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        (pos) => updateLocation(pos.coords.latitude, pos.coords.longitude),
        () => {},
        { enableHighAccuracy: true }
      );
    }, 30000);

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [driverId, isAvailable]);
}
