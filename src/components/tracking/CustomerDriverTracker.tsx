import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin, Clock, Truck } from "lucide-react";
import { startOrUpdateDeliveryLiveActivity } from "@/lib/order-live-activity";
import {
  createOsmMap,
  loadLeaflet,
  osmCircleMarker,
  osmFitPoints,
  resetLeafletContainer,
} from "@/lib/osm-map";

interface Props {
  orderId: string;
  driverId: string;
  destLat: number | null;
  destLng: number | null;
  orderNumber?: string | null;
  driverName?: string | null;
}

const CustomerDriverTracker = ({
  orderId,
  driverId,
  destLat,
  destLng,
  orderNumber,
  driverName,
}: Props) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const driverMarkerRef = useRef<any>(null);
  const destMarkerRef = useRef<any>(null);
  const routeRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const [driverPos, setDriverPos] = useState<{ lat: number; lng: number } | null>(null);
  const [eta, setEta] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await loadLeaflet();
      if (cancelled || !ok) return;
      let host = mapRef.current;
      for (let i = 0; i < 40 && !host; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        host = mapRef.current;
      }
      if (cancelled || !host) return;
      const center =
        destLat && destLng
          ? { lat: destLat, lng: destLng }
          : { lat: 18.3, lng: 42.73 };
      const map = createOsmMap(host, center, 14);
      if (!map) return;
      mapInstanceRef.current = map;
      setMapReady(true);
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
      driverMarkerRef.current = null;
      destMarkerRef.current = null;
      routeRef.current = null;
      resetLeafletContainer(mapRef.current);
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const fetchDriver = async () => {
      const { data } = await supabase
        .from("drivers")
        .select("current_lat, current_lng")
        .eq("id", driverId)
        .maybeSingle();
      if (data?.current_lat && data?.current_lng) {
        setDriverPos({ lat: data.current_lat, lng: data.current_lng });
      }
    };
    void fetchDriver();
    // Realtime only — avoid duplicate REST polling every 15s (Egress).
    const channel = supabase
      .channel(`driver-track-${driverId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "drivers", filter: `id=eq.${driverId}` },
        (payload: any) => {
          const d = payload.new;
          if (d?.current_lat && d?.current_lng) {
            setDriverPos({ lat: d.current_lat, lng: d.current_lng });
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [driverId]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady || !window.L) return;

    if (destLat && destLng) {
      if (!destMarkerRef.current) {
        destMarkerRef.current = osmCircleMarker(map, destLat, destLng, {
          color: "#ef4444",
          radius: 10,
          title: "وجهتك",
          label: "🏠",
        });
      } else {
        destMarkerRef.current.setLatLng([destLat, destLng]);
      }
    }

    if (driverPos) {
      if (!driverMarkerRef.current) {
        driverMarkerRef.current = osmCircleMarker(map, driverPos.lat, driverPos.lng, {
          color: "#22c55e",
          radius: 11,
          title: "المندوب",
          label: "🚗",
        });
      } else {
        driverMarkerRef.current.setLatLng([driverPos.lat, driverPos.lng]);
      }

      if (destLat && destLng) {
        osmFitPoints(map, [driverPos, { lat: destLat, lng: destLng }], 60);

        if (routeRef.current) {
          try {
            map.removeLayer(routeRef.current);
          } catch {
            /* ignore */
          }
        }
        routeRef.current = window.L.polyline(
          [
            [driverPos.lat, driverPos.lng],
            [destLat, destLng],
          ],
          { color: "#3d2298", weight: 3, dashArray: "6 8", opacity: 0.75 },
        ).addTo(map);

        const R = 6371;
        const dLat = ((destLat - driverPos.lat) * Math.PI) / 180;
        const dLng = ((destLng - driverPos.lng) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos((driverPos.lat * Math.PI) / 180) *
            Math.cos((destLat * Math.PI) / 180) *
            Math.sin(dLng / 2) ** 2;
        const km = 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const minutes = Math.max(2, Math.round((km / 30) * 60));
        setEta(`${minutes} دقيقة تقريباً (${km.toFixed(1)} كم)`);
      }
    }
  }, [driverPos, destLat, destLng, mapReady]);

  useEffect(() => {
    void startOrUpdateDeliveryLiveActivity({
      orderId,
      orderNumber,
      driverName,
      statusLabel: "في الطريق",
      eta: eta || undefined,
      message: driverName
        ? `المندوب ${driverName} في الطريق إليك`
        : "المندوب في الطريق إليك",
    });
  }, [orderId, orderNumber, driverName, eta]);

  return (
    <Card className="mb-6 border-primary/30 overflow-hidden">
      <div className="bg-primary text-primary-foreground px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Truck className="h-5 w-5 animate-pulse" />
          <span className="font-bold text-sm">المندوب في الطريق إليك</span>
        </div>
        {eta && (
          <div className="flex items-center gap-1 text-xs bg-primary-foreground/20 px-2 py-1 rounded-full">
            <Clock className="h-3 w-3" />
            <span className="font-semibold">{eta}</span>
          </div>
        )}
      </div>
      <CardContent className="p-0">
        <div ref={mapRef} className="w-full h-[280px] bg-muted relative">
          {!mapReady && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm z-[400] bg-muted">
              <MapPin className="h-5 w-5 animate-pulse ml-2" />
              جاري تحميل الخريطة...
            </div>
          )}
          {mapReady && !driverPos && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm text-center p-4 z-[400] pointer-events-none">
              <div>
                <Truck className="h-8 w-8 mx-auto mb-2 animate-bounce" />
                <p>جاري تحديد موقع المندوب...</p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default CustomerDriverTracker;
