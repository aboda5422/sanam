import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin, Clock, Truck } from "lucide-react";

interface Props {
  orderId: string;
  driverId: string;
  destLat: number | null;
  destLng: number | null;
}

const CustomerDriverTracker = ({ orderId, driverId, destLat, destLng }: Props) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const driverMarkerRef = useRef<any>(null);
  const destMarkerRef = useRef<any>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [driverPos, setDriverPos] = useState<{ lat: number; lng: number } | null>(null);
  const [eta, setEta] = useState<string | null>(null);

  // Load Google Maps
  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await supabase.functions.invoke("get-maps-key");
        const key = data?.key;
        if (!key) { setMapLoaded(true); return; }
        if (!(window as any).google) {
          if (!document.getElementById("google-maps-script")) {
            const script = document.createElement("script");
            script.id = "google-maps-script";
            script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&language=ar`;
            script.async = true;
            script.onload = () => setMapLoaded(true);
            document.head.appendChild(script);
          } else {
            const check = setInterval(() => {
              if ((window as any).google) { setMapLoaded(true); clearInterval(check); }
            }, 200);
          }
        } else setMapLoaded(true);
      } catch { setMapLoaded(true); }
    };
    load();
  }, []);

  // Fetch driver location and subscribe to updates
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
    fetchDriver();
    const interval = setInterval(fetchDriver, 15000);
    const channel = supabase
      .channel(`driver-track-${driverId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "drivers", filter: `id=eq.${driverId}` },
        (payload: any) => {
          const d = payload.new;
          if (d?.current_lat && d?.current_lng) setDriverPos({ lat: d.current_lat, lng: d.current_lng });
        })
      .subscribe();
    return () => { clearInterval(interval); supabase.removeChannel(channel); };
  }, [driverId]);

  // Init map
  useEffect(() => {
    if (!mapLoaded || !(window as any).google || !mapRef.current || mapInstanceRef.current) return;
    const center = driverPos || (destLat && destLng ? { lat: destLat, lng: destLng } : { lat: 18.3, lng: 42.73 });
    mapInstanceRef.current = new (window as any).google.maps.Map(mapRef.current, {
      center, zoom: 14, disableDefaultUI: true, zoomControl: true, gestureHandling: "greedy",
    });
  }, [mapLoaded, driverPos, destLat, destLng]);

  // Update markers + ETA
  useEffect(() => {
    const google = (window as any).google;
    const map = mapInstanceRef.current;
    if (!google || !map) return;

    // Destination marker
    if (destLat && destLng && !destMarkerRef.current) {
      destMarkerRef.current = new google.maps.Marker({
        position: { lat: destLat, lng: destLng }, map, title: "وجهتك",
        icon: {
          path: google.maps.SymbolPath.CIRCLE, scale: 10,
          fillColor: "#ef4444", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2,
        },
        label: { text: "🏠", fontSize: "14px" },
      });
    }

    // Driver marker
    if (driverPos) {
      if (!driverMarkerRef.current) {
        driverMarkerRef.current = new google.maps.Marker({
          position: driverPos, map, title: "المندوب",
          icon: {
            path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z",
            fillColor: "#22c55e", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2,
            scale: 1.8, anchor: new google.maps.Point(12, 22),
          },
          label: { text: "🚗", fontSize: "12px" },
        });
      } else {
        driverMarkerRef.current.setPosition(driverPos);
      }

      // Fit bounds
      if (destLat && destLng) {
        const bounds = new google.maps.LatLngBounds();
        bounds.extend(driverPos);
        bounds.extend({ lat: destLat, lng: destLng });
        map.fitBounds(bounds, 80);

        // Distance + ETA estimate (Haversine, ~30 km/h average city speed)
        const R = 6371;
        const dLat = ((destLat - driverPos.lat) * Math.PI) / 180;
        const dLng = ((destLng - driverPos.lng) * Math.PI) / 180;
        const a = Math.sin(dLat / 2) ** 2 +
          Math.cos((driverPos.lat * Math.PI) / 180) *
          Math.cos((destLat * Math.PI) / 180) *
          Math.sin(dLng / 2) ** 2;
        const km = 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const minutes = Math.max(2, Math.round((km / 30) * 60));
        setEta(`${minutes} دقيقة تقريباً (${km.toFixed(1)} كم)`);
      }
    }
  }, [driverPos, destLat, destLng, mapLoaded]);

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
        <div ref={mapRef} className="w-full h-[280px] bg-muted">
          {!mapLoaded && (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
              <MapPin className="h-5 w-5 animate-pulse ml-2" />
              جاري تحميل الخريطة...
            </div>
          )}
          {mapLoaded && !driverPos && (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm text-center p-4">
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