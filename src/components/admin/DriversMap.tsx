import { useEffect, useState, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Truck, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { applyBranchFilter, fetchDriverIdsForBranches } from "@/lib/branch-scope";
import {
  createOsmMap,
  loadLeaflet,
  osmCircleMarker,
  osmFitPoints,
  resetLeafletContainer,
} from "@/lib/osm-map";

interface DriverLocation {
  id: string;
  phone: string | null;
  full_name: string | null;
  is_available: boolean;
  current_lat: number | null;
  current_lng: number | null;
  vehicle_type: string | null;
}

const KHAMIS_LAT = 18.3;
const KHAMIS_LNG = 42.73;

const DriversMap = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const { scopedBranchIds } = useAdminAuth();

  const { data: drivers, isLoading } = useQuery({
    queryKey: ["admin-drivers-locations", scopedBranchIds],
    queryFn: async () => {
      const driverIds = await fetchDriverIdsForBranches(scopedBranchIds);
      let q = supabase
        .from("drivers")
        .select("id, phone, full_name, is_available, current_lat, current_lng, vehicle_type");
      if (driverIds) {
        if (!driverIds.length) return [] as DriverLocation[];
        q = q.in("id", driverIds);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as DriverLocation[];
    },
    refetchInterval: 60_000,
  });

  const { data: branches } = useQuery({
    queryKey: ["admin-branches-map", scopedBranchIds],
    queryFn: async () => {
      let q = supabase.from("branches").select("id, name, lat, lng, is_active");
      q = applyBranchFilter(q, scopedBranchIds, "id");
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await loadLeaflet();
      if (cancelled) return;
      if (!ok) {
        setMapError(true);
        return;
      }
      let host = mapRef.current;
      for (let i = 0; i < 40 && !host; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        host = mapRef.current;
      }
      if (cancelled || !host) {
        setMapError(true);
        return;
      }
      const center = { lat: KHAMIS_LAT, lng: KHAMIS_LNG };
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch {
          /* ignore */
        }
        mapInstanceRef.current = null;
      }
      const map = createOsmMap(host, center, 13);
      if (!map) {
        setMapError(true);
        return;
      }
      mapInstanceRef.current = map;
      setMapReady(true);
      setMapError(false);
    })();
    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch {
          /* ignore */
        }
        mapInstanceRef.current = null;
      }
      resetLeafletContainer(mapRef.current);
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const branch = branches?.find((b) => b.lat && b.lng);
    if (!map || !branch) return;
    map.setView([Number(branch.lat), Number(branch.lng)], map.getZoom());
  }, [branches]);

  const updateMarkers = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.L || !mapReady) return;

    markersRef.current.forEach((m) => {
      try {
        map.removeLayer(m);
      } catch {
        /* ignore */
      }
    });
    markersRef.current = [];

    const fitPts: { lat: number; lng: number }[] = [];

    branches?.forEach((branch) => {
      if (!branch.lat || !branch.lng) return;
      const lat = Number(branch.lat);
      const lng = Number(branch.lng);
      fitPts.push({ lat, lng });
      const m = osmCircleMarker(map, lat, lng, {
        color: "#1a3c2a",
        radius: 12,
        title: branch.name,
        label: "🏪",
      });
      if (m) {
        m.bindPopup(`<div style="direction:rtl;font-family:sans-serif"><b>${branch.name}</b></div>`);
        markersRef.current.push(m);
      }
    });

    drivers?.forEach((driver) => {
      const lat = driver.current_lat || KHAMIS_LAT + (Math.random() - 0.5) * 0.05;
      const lng = driver.current_lng || KHAMIS_LNG + (Math.random() - 0.5) * 0.05;
      fitPts.push({ lat, lng });
      const name = driver.full_name || driver.phone || "مندوب";
      const status = driver.is_available ? "متاح" : "مشغول";
      const m = osmCircleMarker(map, lat, lng, {
        color: driver.is_available ? "#22c55e" : "#ef4444",
        radius: 11,
        title: name,
      });
      if (m) {
        m.bindPopup(
          `<div style="direction:rtl;font-family:sans-serif"><b>${name}</b><br/><span style="color:${
            driver.is_available ? "green" : "red"
          }">${status}</span></div>`,
        );
        markersRef.current.push(m);
      }
    });

    if (fitPts.length) osmFitPoints(map, fitPts, 40);
  }, [drivers, branches, mapReady]);

  useEffect(() => {
    updateMarkers();
  }, [updateMarkers]);

  const availableDrivers = drivers?.filter((d) => d.is_available) || [];
  const busyDrivers = drivers?.filter((d) => !d.is_available) || [];

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-heading flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            خريطة المناديب والفروع
          </CardTitle>
          <div className="flex gap-2 text-xs">
            <span className="flex items-center gap-1">
              <Circle className="h-2 w-2 fill-green-500 text-green-500" />
              متاح ({availableDrivers.length})
            </span>
            <span className="flex items-center gap-1">
              <Circle className="h-2 w-2 fill-red-500 text-red-500" />
              مشغول ({busyDrivers.length})
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div
          ref={mapRef}
          className="w-full h-[350px] rounded-xl overflow-hidden border bg-muted relative"
        >
          {!mapReady && !mapError && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm z-[400] bg-muted">
              <MapPin className="h-5 w-5 animate-pulse ml-2" />
              جاري تحميل الخريطة...
            </div>
          )}
          {mapError && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm text-center p-4 z-[400] bg-muted">
              <div>
                <MapPin className="h-8 w-8 mx-auto mb-2" />
                <p>تعذر تحميل الخريطة</p>
              </div>
            </div>
          )}
        </div>

        {!isLoading && drivers && drivers.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-bold text-muted-foreground">قائمة المناديب</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {drivers.map((driver) => (
                <div
                  key={driver.id}
                  className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 text-sm"
                >
                  <div
                    className={`h-2 w-2 rounded-full ${
                      driver.is_available ? "bg-green-500" : "bg-red-500"
                    }`}
                  />
                  <Truck className="h-3 w-3 text-muted-foreground" />
                  <span className="flex-1 truncate">
                    {driver.full_name || driver.phone || "بدون اسم"}
                  </span>
                  <Badge variant={driver.is_available ? "default" : "secondary"} className="text-[10px]">
                    {driver.is_available ? "متاح" : "مشغول"}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DriversMap;
