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
  branch_id?: string | null;
};

export const OUT_OF_SERVICE_MESSAGE =
  "عذراً، هذا الموقع خارج نطاق التوصيل للفرع المحدد. جرّب فرعاً آخر أو عنواناً أقرب.";

async function fetchDeliveryZones(branchId?: string | null): Promise<DeliveryZone[]> {
  let query = supabase
    .from("delivery_zones")
    .select("id, name, polygon, is_active, color, sort_order, branch_id")
    .order("sort_order", { ascending: true });

  if (branchId) {
    query = query.eq("branch_id", branchId);
  }

  const { data, error } = await query;

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
    branch_id: row.branch_id,
  }));
}

export function useDeliveryZones(branchId?: string | null) {
  return useQuery({
    queryKey: ["delivery-zones", branchId || "all"],
    queryFn: () => fetchDeliveryZones(branchId),
    staleTime: 60_000,
  });
}

export function useActiveDeliveryZones(branchId?: string | null) {
  const query = useDeliveryZones(branchId);
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

export async function checkDeliveryCoverageRpc(
  lat: number,
  lng: number,
  branchId?: string | null
): Promise<boolean> {
  if (branchId) {
    const { data, error } = await supabase.rpc("is_within_branch_zone" as any, {
      p_lat: lat,
      p_lng: lng,
      p_branch_id: branchId,
    });
    if (error) {
      console.warn("[delivery-zone] branch RPC failed, falling back:", error.message);
      return true;
    }
    return !!data;
  }

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

export async function calculateDeliveryFeeRpc(
  branchId: string,
  lat: number,
  lng: number
): Promise<number | null> {
  const { data, error } = await supabase.rpc("calculate_branch_delivery_fee" as any, {
    p_branch_id: branchId,
    p_lat: lat,
    p_lng: lng,
  });
  if (error) {
    console.warn("[delivery-fee] RPC failed:", error.message);
    return null;
  }
  return data == null ? null : Number(data);
}
