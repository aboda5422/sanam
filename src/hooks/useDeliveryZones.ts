import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isPointInAnyPolygon, normalizePolygon, type LatLng } from "@/lib/geo";

export type DeliveryZone = {
  id: string;
  name: string;
  polygon: LatLng[];
  is_active: boolean;
  color: string;
  sort_order: number;
};

export const OUT_OF_SERVICE_MESSAGE =
  "عذراً، هذا الموقع خارج نطاق التوصيل الحالي. نوصل حالياً داخل المناطق المفعّلة على الخريطة.";

async function fetchDeliveryZones(): Promise<DeliveryZone[]> {
  const { data, error } = await supabase
    .from("delivery_zones")
    .select("id, name, polygon, is_active, color, sort_order")
    .order("sort_order", { ascending: true });

  // Fail-open before migration is applied (or on transient errors): do not block checkout.
  if (error) {
    console.warn("[delivery-zones] fetch failed (fail-open):", error.message);
    return [];
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    name: row.name,
    polygon: normalizePolygon(row.polygon),
    is_active: !!row.is_active,
    color: row.color || "#22c55e",
    sort_order: row.sort_order ?? 0,
  }));
}

export function useDeliveryZones() {
  return useQuery({
    queryKey: ["delivery-zones"],
    queryFn: fetchDeliveryZones,
    staleTime: 60_000,
  });
}

export function useActiveDeliveryZones() {
  const query = useDeliveryZones();
  const active = (query.data || []).filter((z) => z.is_active && z.polygon.length >= 3);
  return { ...query, active };
}

/** Client-side coverage check. Fail-open when no active zones are configured. */
export function isLocationCovered(lat: number, lng: number, activeZones: DeliveryZone[]): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (activeZones.length === 0) return true;
  return isPointInAnyPolygon(
    { lat, lng },
    activeZones.map((z) => z.polygon)
  );
}

/** Optional server-side RPC check (uses same SQL ray-cast as order trigger). */
export async function checkDeliveryCoverageRpc(lat: number, lng: number): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_within_delivery_zone", {
    p_lat: lat,
    p_lng: lng,
  });
  if (error) {
    console.warn("[delivery-zone] RPC check failed, falling back to allow:", error.message);
    return true;
  }
  return !!data;
}
