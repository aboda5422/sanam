import { useState, useEffect, useCallback, useRef } from "react";
import { MapPin, Navigation, AlertTriangle, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
import { loadGoogleMaps, geocodeNationalAddress } from "@/lib/google-maps";
import {
  inferCityFromNationalAddress,
  isValidNationalAddress,
  normalizeNationalAddress,
  NATIONAL_ADDRESS_LOOKUP_ENABLED,
  type AddressLabelKind,
  type CustomerAddressPayload,
} from "@/lib/branch";
import {
  useActiveDeliveryZones,
  isLocationCovered,
  OUT_OF_SERVICE_MESSAGE,
} from "@/hooks/useDeliveryZones";

interface AddressMapPickerProps {
  onAddressSelected: (address: CustomerAddressPayload) => void;
  initialLat?: number;
  initialLng?: number;
}

const KHAMIS_LAT = 18.3;
const KHAMIS_LNG = 42.73;
const LAST_LOCATION_KEY = "sanam:last_picked_location";

type SavedLoc = { lat: number; lng: number; address?: string; label?: string; ts: number };
type Method = "national" | "map" | null;
type LabelKind = AddressLabelKind;

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

const methodBtn = (active: boolean) =>
  `flex-1 flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all ${
    active ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/30"
  }`;

const AddressMapPicker = ({ onAddressSelected, initialLat, initialLng }: AddressMapPickerProps) => {
  const cached = !initialLat && !initialLng ? loadLastLocation() : null;
  const [lat, setLat] = useState(initialLat || cached?.lat || KHAMIS_LAT);
  const [lng, setLng] = useState(initialLng || cached?.lng || KHAMIS_LNG);
  const [addressText, setAddressText] = useState(cached?.address || "");
  const [labelKind, setLabelKind] = useState<LabelKind>("home");
  const [customLabel, setCustomLabel] = useState("");
  const [method, setMethod] = useState<Method>(null);
  const [nationalInput, setNationalInput] = useState("");
  const [nationalAccepted, setNationalAccepted] = useState(false);
  const [nationalPinFound, setNationalPinFound] = useState(false);
  const [mapTouched, setMapTouched] = useState(!!(initialLat && initialLng));
  const [lookingUp, setLookingUp] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [locating, setLocating] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const mapElRef = useRef<HTMLDivElement>(null);
  const zoneOverlaysRef = useRef<any[]>([]);
  const pendingFocus = useRef<{
    lat: number;
    lng: number;
    formatted?: string;
    confirmPin?: boolean;
    zoom?: number;
  } | null>(null);
  const { active: activeZones } = useActiveDeliveryZones();

  useEffect(() => {
    if (NATIONAL_ADDRESS_LOOKUP_ENABLED) return;
    if (method === "national") {
      setMethod(null);
      setNationalAccepted(false);
      setNationalPinFound(false);
    }
    if (labelKind === "national") setLabelKind("home");
  }, [method, labelKind]);

  const showMap = method === "map" || (method === "national" && nationalAccepted);
  const covered = isLocationCovered(lat, lng, activeZones);

  useEffect(() => {
    if (!showMap) return;
    let cancelled = false;
    (async () => {
      const ok = await loadGoogleMaps();
      if (!cancelled) setMapLoaded(true);
      if (!ok) return;
    })();
    return () => { cancelled = true; };
  }, [showMap]);

  useEffect(() => {
    if (!showMap || !mapLoaded || !window.google?.maps || !mapElRef.current) return;

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
      setMapTouched(true);
      reverseGeocode(pos.lat(), pos.lng());
    });

    marker.addListener("dragend", () => {
      const pos = marker.getPosition();
      setLat(pos.lat());
      setLng(pos.lng());
      setMapTouched(true);
      reverseGeocode(pos.lat(), pos.lng());
    });

    const pending = pendingFocus.current;
    if (pending) {
      pendingFocus.current = null;
      map.setCenter({ lat: pending.lat, lng: pending.lng });
      map.setZoom(pending.zoom ?? (pending.confirmPin ? 16 : 13));
      marker.setPosition({ lat: pending.lat, lng: pending.lng });
      setLat(pending.lat);
      setLng(pending.lng);
      if (pending.confirmPin) setMapTouched(true);
      if (pending.formatted) setAddressText(pending.formatted);
      else if (pending.confirmPin) reverseGeocode(pending.lat, pending.lng);
    }
  }, [showMap, mapLoaded]);

  useEffect(() => {
    if (!showMap || !mapLoaded || !window.google?.maps || !mapElRef.current) return;
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
  }, [activeZones, mapLoaded, showMap]);

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
    setMapTouched(true);
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
        if (perm.location !== "granted") {
          const req = await Geolocation.requestPermissions();
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
          if (err?.message === "timeout" || /timeout|kCLError/i.test(String(err?.message))) {
            return await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 10000 });
          }
          throw err;
        });
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

  const lookupNational = async () => {
    const code = normalizeNationalAddress(nationalInput);
    if (!isValidNationalAddress(code)) {
      toast.error("العنوان الوطني المختصر غير صحيح. مثال: ANCAW32154");
      return;
    }
    setLookingUp(true);
    await loadGoogleMaps();
    const geo = await geocodeNationalAddress(code);
    const city = inferCityFromNationalAddress(code);
    setLookingUp(false);

    if (geo) {
      pendingFocus.current = {
        lat: geo.lat,
        lng: geo.lng,
        formatted: geo.formatted || `العنوان الوطني: ${code}`,
        confirmPin: true,
      };
      setNationalPinFound(true);
      toast.success("تم تحديد الموقع من العنوان الوطني");
    } else {
      const hint = city || { lat: 23.8859, lng: 45.0792, name: "" };
      pendingFocus.current = {
        lat: hint.lat,
        lng: hint.lng,
        formatted: `العنوان الوطني: ${code}${city ? ` — ${city.name}` : ""}`,
        confirmPin: false,
        zoom: city ? 12 : 5,
      };
      setNationalPinFound(false);
      toast.message(
        city
          ? `لم نحدد المبنى تلقائياً. الخريطة عند ${city.name} — حرّك الدبوس إلى موقعك أو احفظ الرمز فقط.`
          : "لم نحدد هذا الرمز على الخريطة. حرّك الدبوس إلى منطقتك أو احفظ الرمز الوطني فقط."
      );
    }
    setNationalAccepted(true);
    setMapLoaded(false);
  };

  const handleConfirm = async () => {
    const national = normalizeNationalAddress(nationalInput);
    const hasNational = method === "national" && isValidNationalAddress(national);
    const hasMap = method === "map" ? mapTouched : nationalPinFound || mapTouched;

    if (method === "national" && !hasNational) {
      toast.error("أدخل العنوان الوطني المختصر ثم اضغط تحقق");
      return;
    }
    if (method === "map" && !hasMap) {
      toast.error("حدد موقعك على الخريطة");
      return;
    }

    const resolvedLabel =
      labelKind === "custom" ? customLabel.trim() : labelKind;
    if (labelKind === "custom" && !resolvedLabel) {
      toast.error("اكتب اسماً للعنوان المخصص");
      return;
    }

    let finalLat: number | null = hasMap ? lat : null;
    let finalLng: number | null = hasMap ? lng : null;
    let finalAddress = addressText.trim();

    if (!finalAddress && hasNational) finalAddress = `العنوان الوطني: ${national}`;
    if (!finalAddress && hasMap) finalAddress = `موقع محدد: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;

    if (finalLat != null && finalLng != null && activeZones.length > 0 && !isLocationCovered(finalLat, finalLng, activeZones)) {
      toast.error(OUT_OF_SERVICE_MESSAGE, { duration: 7000 });
      return;
    }

    if (hasMap) saveLastLocation({ lat, lng, address: finalAddress, label: resolvedLabel, ts: Date.now() });
    onAddressSelected({
      label: resolvedLabel,
      address: finalAddress,
      lat: finalLat,
      lng: finalLng,
      national_address: hasNational ? national : null,
    });
  };

  const pickMethod = (next: Method) => {
    setMethod(next);
    setNationalAccepted(false);
    setNationalPinFound(false);
    setMapLoaded(false);
    setLastError(null);
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="address-label">اسم العنوان</Label>
        <select
          id="address-label"
          value={labelKind}
          onChange={(e) => setLabelKind(e.target.value as LabelKind)}
          className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="home">المنزل</option>
          <option value="work">العمل</option>
          <option value="national" disabled={!NATIONAL_ADDRESS_LOOKUP_ENABLED}>
            العنوان الوطني
          </option>
          <option value="custom">مخصص</option>
        </select>
        {labelKind === "custom" && (
          <Input
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            placeholder="مثال: بيت العائلة، المزرعة..."
            className="mt-2"
            maxLength={40}
          />
        )}
      </div>

      <div>
        <p className="text-sm text-muted-foreground mb-2">كيف تريد إدخال العنوان؟</p>
        <div className="flex gap-3">
          <button
            type="button"
            disabled={!NATIONAL_ADDRESS_LOOKUP_ENABLED}
            onClick={() => NATIONAL_ADDRESS_LOOKUP_ENABLED && pickMethod("national")}
            className={`${methodBtn(method === "national")} ${
              NATIONAL_ADDRESS_LOOKUP_ENABLED
                ? ""
                : "opacity-40 grayscale pointer-events-none cursor-not-allowed"
            }`}
          >
            <Hash className="h-6 w-6" />
            <span className="font-medium text-sm text-center">العنوان الوطني المختصر</span>
          </button>
          <button type="button" onClick={() => pickMethod("map")} className={methodBtn(method === "map")}>
            <MapPin className="h-6 w-6" />
            <span className="font-medium text-sm text-center">العنوان على الخريطة</span>
          </button>
        </div>
      </div>

      {NATIONAL_ADDRESS_LOOKUP_ENABLED && method === "national" && (
        <div className="rounded-xl border p-3 space-y-2">
          <Label htmlFor="national-short">أدخل الرمز المختصر ثم تحقق</Label>
          <div className="flex gap-2">
            <Input
              id="national-short"
              value={nationalInput}
              onChange={(e) => {
                setNationalInput(e.target.value.toUpperCase());
                setNationalAccepted(false);
                setNationalPinFound(false);
              }}
              placeholder="ANCAW32154"
              dir="ltr"
              className="font-mono tracking-wider"
              maxLength={12}
            />
            <Button type="button" variant="outline" onClick={lookupNational} disabled={lookingUp}>
              {lookingUp ? "…" : "تحقق"}
            </Button>
          </div>
        </div>
      )}

      {showMap && (
        <>
          <div className="relative rounded-xl overflow-hidden border">
            <div ref={mapElRef} className="w-full h-64 bg-muted flex items-center justify-center">
              {!mapLoaded && (
                <div className="text-muted-foreground text-sm flex items-center gap-2">
                  <MapPin className="h-5 w-5 animate-pulse" />
                  جاري تحميل الخريطة...
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

          {method === "national" && nationalAccepted && !nationalPinFound && !mapTouched && (
            <p className="text-sm text-muted-foreground">
              لم نثبت الرمز تلقائياً على إحداثيات المبنى. حرّك الدبوس أو استخدم موقعك الحالي، أو احفظ الرمز الوطني فقط.
            </p>
          )}

          {mapTouched && activeZones.length > 0 && !covered && (
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

          <div>
            <Label>تفاصيل العنوان</Label>
            <Input
              value={addressText}
              onChange={(e) => setAddressText(e.target.value)}
              placeholder="الحي، الشارع، رقم المبنى"
              className="mt-1"
            />
          </div>

          <Button
            onClick={handleConfirm}
            className="w-full"
            size="lg"
            disabled={mapTouched && activeZones.length > 0 && !covered}
          >
            <MapPin className="h-4 w-4 ml-2" />
            {method === "national" && !mapTouched && !nationalPinFound
              ? "حفظ الرمز الوطني"
              : "حفظ العنوان"}
          </Button>
        </>
      )}
    </div>
  );
};

export default AddressMapPicker;
