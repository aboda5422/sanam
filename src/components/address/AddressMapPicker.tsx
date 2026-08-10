import { useState, useEffect, useCallback, useRef } from "react";
import { MapPin, Home, Briefcase, Navigation, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
import { loadGoogleMaps } from "@/lib/google-maps";
import {
  useActiveDeliveryZones,
  isLocationCovered,
  OUT_OF_SERVICE_MESSAGE,
} from "@/hooks/useDeliveryZones";

interface AddressMapPickerProps {
  onAddressSelected: (address: { label: string; address: string; lat: number; lng: number; id?: string }) => void;
  initialLat?: number;
  initialLng?: number;
}

const KHAMIS_LAT = 18.3;
const KHAMIS_LNG = 42.73;
const LAST_LOCATION_KEY = "bazaar:last_picked_location";

type SavedLoc = { lat: number; lng: number; address?: string; label?: "home" | "work"; ts: number };

const loadLastLocation = (): SavedLoc | null => {
  try {
    const raw = localStorage.getItem(LAST_LOCATION_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (typeof v?.lat === "number" && typeof v?.lng === "number") return v;
  } catch {}
  return null;
};

const saveLastLocation = (loc: SavedLoc) => {
  try { localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify(loc)); } catch {}
};

const AddressMapPicker = ({ onAddressSelected, initialLat, initialLng }: AddressMapPickerProps) => {
  const cached = !initialLat && !initialLng ? loadLastLocation() : null;
  const [lat, setLat] = useState(initialLat || cached?.lat || KHAMIS_LAT);
  const [lng, setLng] = useState(initialLng || cached?.lng || KHAMIS_LNG);
  const [addressText, setAddressText] = useState(cached?.address || "");
  const [label, setLabel] = useState<"home" | "work">(cached?.label || "home");
  const [mapLoaded, setMapLoaded] = useState(false);
  const [locating, setLocating] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const mapElRef = useRef<HTMLDivElement>(null);
  const zoneOverlaysRef = useRef<any[]>([]);
  const { active: activeZones } = useActiveDeliveryZones();

  const covered = isLocationCovered(lat, lng, activeZones);

  // Load Google Maps
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await loadGoogleMaps();
      if (!cancelled) setMapLoaded(true);
      if (!ok) return;
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!mapLoaded || !window.google?.maps || !mapElRef.current) return;

    const mapEl = mapElRef.current;
    const map = new window.google.maps.Map(mapEl, {
      center: { lat, lng },
      zoom: 15,
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: "greedy",
    });

    const marker = new window.google.maps.Marker({
      position: { lat, lng },
      map,
      draggable: true,
    });

    (mapEl as any).__map = map;
    (mapEl as any).__marker = marker;

    map.addListener("click", (e: any) => {
      const pos = e.latLng;
      marker.setPosition(pos);
      setLat(pos.lat());
      setLng(pos.lng());
      reverseGeocode(pos.lat(), pos.lng());
    });

    marker.addListener("dragend", () => {
      const pos = marker.getPosition();
      setLat(pos.lat());
      setLng(pos.lng());
      reverseGeocode(pos.lat(), pos.lng());
    });
  }, [mapLoaded]);

  // Overlay active service zones so customers see coverage
  useEffect(() => {
    if (!mapLoaded || !window.google?.maps || !mapElRef.current) return;
    const map = (mapElRef.current as any).__map;
    if (!map) return;

    zoneOverlaysRef.current.forEach((p) => p.setMap(null));
    zoneOverlaysRef.current = [];

    activeZones.forEach((zone) => {
      const poly = new window.google.maps.Polygon({
        paths: zone.polygon,
        fillColor: zone.color || "#16a34a",
        fillOpacity: 0.12,
        strokeColor: zone.color || "#16a34a",
        strokeOpacity: 0.7,
        strokeWeight: 2,
        clickable: false,
        map,
      });
      zoneOverlaysRef.current.push(poly);
    });
  }, [activeZones, mapLoaded]);

  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    const fallback = `موقع محدد: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    if (!window.google?.maps) {
      setAddressText((prev) => prev?.trim() ? prev : fallback);
      return;
    }
    const geocoder = new window.google.maps.Geocoder();
    try {
      const result = await geocoder.geocode({ location: { lat, lng } });
      if (result.results?.[0]) {
        setAddressText(result.results[0].formatted_address);
      } else {
        setAddressText((prev) => prev?.trim() ? prev : fallback);
      }
    } catch {
      setAddressText((prev) => prev?.trim() ? prev : fallback);
    }
  }, []);

  const applyPosition = (latitude: number, longitude: number) => {
    setLat(latitude);
    setLng(longitude);
    reverseGeocode(latitude, longitude);
    const mapEl = mapElRef.current;
    const map = mapEl && (mapEl as any).__map;
    const marker = mapEl && (mapEl as any).__marker;
    if (map) {
      map.setCenter({ lat: latitude, lng: longitude });
      map.setZoom(16);
    }
    if (marker) {
      marker.setPosition({ lat: latitude, lng: longitude });
    }
    saveLastLocation({ lat: latitude, lng: longitude, ts: Date.now() });
  };

  const reportGeoError = (code: string, detail?: string) => {
    const msg = (() => {
      switch (code) {
        case "denied": return "تم رفض إذن الموقع. فعّل الإذن من الإعدادات > الخصوصية > الموقع > سنام";
        case "timeout": return "انتهت مهلة تحديد الموقع (timeout). تأكد من تفعيل GPS وأنك خارج المباني أو قرب نافذة";
        case "unavailable": return "خدمة الموقع غير متاحة على الجهاز حالياً";
        case "no-geolocation": return "متصفحك لا يدعم تحديد الموقع";
        default: return "تعذّر تحديد موقعك";
      }
    })();
    const full = detail ? `${msg} (${detail})` : msg;
    setLastError(`[${code}] ${detail || msg}`);
    console.error("[Geolocation]", code, detail);
    toast.error(full, { duration: 6000 });
  };

  const getCurrentLocation = async () => {
    setLocating(true);
    setLastError(null);
    try {
      if (Capacitor.isNativePlatform()) {
        const { Geolocation } = await import("@capacitor/geolocation");
        const perm = await Geolocation.checkPermissions();
        console.log("[Geolocation] permission state:", perm);
        if (perm.location !== "granted") {
          const req = await Geolocation.requestPermissions();
          console.log("[Geolocation] permission request result:", req);
          if (req.location !== "granted") {
            reportGeoError("denied", `permission=${req.location}`);
            setLocating(false);
            return;
          }
        }
        const t0 = Date.now();
        const pos: any = await Promise.race([
          Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 16000)),
        ]).catch(async (err) => {
          console.warn("[Geolocation] high-accuracy failed:", err?.message, "after", Date.now() - t0, "ms");
          if (err?.message === "timeout" || /timeout|kCLError/i.test(String(err?.message))) {
            return await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 10000 });
          }
          throw err;
        });
        console.log("[Geolocation] got fix in", Date.now() - t0, "ms", pos?.coords);
        applyPosition(pos.coords.latitude, pos.coords.longitude);
        toast.success("تم تحديد موقعك");
      } else {
        if (!navigator.geolocation) { reportGeoError("no-geolocation"); return; }
        await new Promise<void>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              applyPosition(pos.coords.latitude, pos.coords.longitude);
              toast.success("تم تحديد موقعك");
              resolve();
            },
            (err) => {
              const code =
                err.code === 1 ? "denied" :
                err.code === 2 ? "unavailable" :
                err.code === 3 ? "timeout" : "unknown";
              reportGeoError(code, err.message);
              resolve();
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
          );
        });
      }
    } catch (e: any) {
      const raw = String(e?.message || e);
      const code = /denied|permission/i.test(raw) ? "denied"
        : /timeout/i.test(raw) ? "timeout"
        : /unavailable|kCLError/i.test(raw) ? "unavailable"
        : "unknown";
      reportGeoError(code, raw);
    } finally {
      setLocating(false);
    }
  };

  const handleConfirm = () => {
    if (!addressText.trim()) {
      toast.error("يرجى تحديد موقعك على الخريطة");
      return;
    }
    if (!isLocationCovered(lat, lng, activeZones)) {
      toast.error(OUT_OF_SERVICE_MESSAGE, { duration: 7000 });
      return;
    }
    saveLastLocation({ lat, lng, address: addressText, label, ts: Date.now() });
    onAddressSelected({ label, address: addressText, lat, lng });
  };

  return (
    <div className="space-y-4">
      {/* Label selector */}
      <div className="flex gap-3">
        <button
          onClick={() => setLabel("home")}
          className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all ${
            label === "home" ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/30"
          }`}
        >
          <Home className="h-5 w-5" />
          <span className="font-medium">المنزل</span>
        </button>
        <button
          onClick={() => setLabel("work")}
          className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all ${
            label === "work" ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/30"
          }`}
        >
          <Briefcase className="h-5 w-5" />
          <span className="font-medium">العمل</span>
        </button>
      </div>

      {/* Map */}
      <div className="relative rounded-xl overflow-hidden border">
        <div ref={mapElRef} id="address-map" className="w-full h-64 bg-muted flex items-center justify-center">
          {!mapLoaded && (
            <div className="text-muted-foreground text-sm flex items-center gap-2">
              <MapPin className="h-5 w-5 animate-pulse" />
              جاري تحميل الخريطة...
            </div>
          )}
          {mapLoaded && !window.google?.maps && (
            <div className="text-muted-foreground text-sm text-center p-4">
              <MapPin className="h-8 w-8 mx-auto mb-2" />
              <p>أدخل العنوان يدوياً</p>
            </div>
          )}
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="absolute bottom-3 left-3 shadow-md"
          onClick={getCurrentLocation}
          disabled={locating}
        >
          <Navigation className={`h-4 w-4 ml-1 ${locating ? "animate-spin" : ""}`} />
          موقعي الحالي
        </Button>
      </div>

      {activeZones.length > 0 && !covered && (
        <div className="flex items-start gap-2 text-sm bg-destructive/10 text-destructive border border-destructive/30 rounded-lg p-3">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{OUT_OF_SERVICE_MESSAGE}</span>
        </div>
      )}

      {lastError && (
        <div className="text-xs bg-destructive/10 text-destructive border border-destructive/30 rounded-lg p-2 font-mono break-all">
          {lastError}
        </div>
      )}

      {/* Address text */}
      <div>
        <Label>تفاصيل العنوان</Label>
        <Input
          value={addressText}
          onChange={(e) => setAddressText(e.target.value)}
          placeholder="الحي، الشارع، رقم المبنى"
          className="mt-1"
        />
      </div>

      <Button onClick={handleConfirm} className="w-full" size="lg" disabled={activeZones.length > 0 && !covered}>
        <MapPin className="h-4 w-4 ml-2" />
        تأكيد العنوان
      </Button>
    </div>
  );
};

export default AddressMapPicker;
