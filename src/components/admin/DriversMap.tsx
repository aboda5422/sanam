import { useEffect, useState, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Truck, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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
  const [mapLoaded, setMapLoaded] = useState(false);

  const { data: drivers, isLoading } = useQuery({
    queryKey: ["admin-drivers-locations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drivers")
        .select("id, phone, full_name, is_available, current_lat, current_lng, vehicle_type");
      if (error) throw error;
      return data as DriverLocation[];
    },
    refetchInterval: 15000,
  });

  const { data: branches } = useQuery({
    queryKey: ["admin-branches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branches")
        .select("id, name, lat, lng, is_active");
      if (error) throw error;
      return data;
    },
  });

  // Load Google Maps script
  useEffect(() => {
    const loadMap = async () => {
      try {
        const { data } = await supabase.functions.invoke("get-maps-key");
        const key = data?.key;
        if (!key) {
          setMapLoaded(true);
          return;
        }
        if (!(window as any).google) {
          if (!document.getElementById("google-maps-script")) {
            const script = document.createElement("script");
            script.id = "google-maps-script";
            script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&language=ar`;
            script.async = true;
            script.onload = () => setMapLoaded(true);
            document.head.appendChild(script);
          } else {
            setMapLoaded(true);
          }
        } else {
          setMapLoaded(true);
        }
      } catch {
        setMapLoaded(true);
      }
    };
    loadMap();
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapLoaded || !(window as any).google || !mapRef.current || mapInstanceRef.current) return;
    mapInstanceRef.current = new (window as any).google.maps.Map(mapRef.current, {
      center: { lat: KHAMIS_LAT, lng: KHAMIS_LNG },
      zoom: 13,
      disableDefaultUI: false,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      gestureHandling: "greedy",
    });
  }, [mapLoaded]);

  // Update markers when data changes
  const updateMarkers = useCallback(() => {
    const google = (window as any).google;
    const map = mapInstanceRef.current;
    if (!google || !map) return;

    // Clear old markers
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    // Branch markers
    branches?.forEach((branch) => {
      if (!branch.lat || !branch.lng) return;
      const marker = new google.maps.Marker({
        position: { lat: branch.lat, lng: branch.lng },
        map,
        title: branch.name,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 12,
          fillColor: "#1a3c2a",
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 2,
        },
        label: { text: "🏪", fontSize: "14px" },
      });
      const infoWindow = new google.maps.InfoWindow({
        content: `<div style="font-family:sans-serif;direction:rtl;padding:4px"><b>${branch.name}</b></div>`,
      });
      marker.addListener("click", () => infoWindow.open(map, marker));
      markersRef.current.push(marker);
    });

    // Driver markers
    drivers?.forEach((driver) => {
      const lat = driver.current_lat || KHAMIS_LAT + (Math.random() - 0.5) * 0.05;
      const lng = driver.current_lng || KHAMIS_LNG + (Math.random() - 0.5) * 0.05;
      const marker = new google.maps.Marker({
        position: { lat, lng },
        map,
        title: driver.full_name || driver.phone || "مندوب",
        icon: {
          path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z",
          fillColor: driver.is_available ? "#22c55e" : "#ef4444",
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 1.5,
          scale: 1.8,
          anchor: new google.maps.Point(12, 22),
        },
      });
      const name = driver.full_name || driver.phone || "مندوب";
      const status = driver.is_available ? "متاح" : "مشغول";
      const infoWindow = new google.maps.InfoWindow({
        content: `<div style="font-family:sans-serif;direction:rtl;padding:4px"><b>${name}</b><br/><span style="color:${driver.is_available ? 'green' : 'red'}">${status}</span></div>`,
      });
      marker.addListener("click", () => infoWindow.open(map, marker));
      markersRef.current.push(marker);
    });
  }, [drivers, branches]);

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
        <div ref={mapRef} className="w-full h-[350px] rounded-xl overflow-hidden border bg-muted">
          {!mapLoaded && (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
              <MapPin className="h-5 w-5 animate-pulse ml-2" />
              جاري تحميل الخريطة...
            </div>
          )}
          {mapLoaded && !(window as any).google && (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm text-center p-4">
              <div>
                <MapPin className="h-8 w-8 mx-auto mb-2" />
                <p>تعذر تحميل الخريطة</p>
              </div>
            </div>
          )}
        </div>

        {/* Drivers list */}
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
