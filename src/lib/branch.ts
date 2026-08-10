import { haversineKm, type LatLng } from "@/lib/geo";

export type Branch = {
  id: string;
  name: string;
  nameEn?: string;
  address: string | null;
  city: string | null;
  slug: string;
  lat: number;
  lng: number;
  phone: string | null;
  is_active: boolean;
};

export type BranchDeliveryRate = {
  id: string;
  branch_id: string;
  max_distance_km: number;
  fee: number;
  sort_order: number;
};

export const BRANCH_STORAGE_KEY = "sanam:selected_branch_slug";

/** Saudi national short address e.g. ANCAW32154 */
export function isValidNationalAddress(value: string): boolean {
  return /^[A-Za-z]{4,6}\d{4,5}$/.test(value.trim());
}

export function normalizeNationalAddress(value: string): string {
  return value.trim().toUpperCase();
}

export function distanceFromBranch(branch: Pick<Branch, "lat" | "lng">, point: LatLng): number {
  return haversineKm(branch.lat, branch.lng, point.lat, point.lng);
}

/** Pick fee from ascending max_distance_km tiers. */
export function feeForDistance(rates: BranchDeliveryRate[], distanceKm: number): number {
  const sorted = [...rates].sort((a, b) => a.max_distance_km - b.max_distance_km);
  const hit = sorted.find((r) => distanceKm <= r.max_distance_km);
  if (hit) return Number(hit.fee);
  if (sorted.length) return Number(sorted[sorted.length - 1].fee);
  return 15;
}
