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
  delivery_fee: number;
  free_delivery_threshold: number;
  min_order: number;
  work_start: string;
  work_end: string;
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
export const NATIONAL_ADDRESS_LOOKUP_ENABLED = true;

export function isValidNationalAddress(value: string): boolean {
  return /^[A-Za-z]{4,6}\d{4,5}$/.test(value.trim());
}

export function normalizeNationalAddress(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

/** Approximate city center from SPL short-code prefix (not a building pin). */
const NATIONAL_CITY_HINTS: { prefix: string; lat: number; lng: number; name: string }[] = [
  { prefix: "MEK", lat: 21.3891, lng: 39.8579, name: "مكة المكرمة" },
  { prefix: "MAK", lat: 21.3891, lng: 39.8579, name: "مكة المكرمة" },
  { prefix: "JED", lat: 21.4858, lng: 39.1925, name: "جدة" },
  { prefix: "RUH", lat: 24.7136, lng: 46.6753, name: "الرياض" },
  { prefix: "MED", lat: 24.5247, lng: 39.5692, name: "المدينة المنورة" },
  { prefix: "DMM", lat: 26.4207, lng: 50.0888, name: "الدمام" },
  { prefix: "KHB", lat: 26.2794, lng: 50.2083, name: "الخبر" },
  { prefix: "ABH", lat: 18.2164, lng: 42.5053, name: "أبها" },
  { prefix: "KHM", lat: 18.3, lng: 42.73, name: "خميس مشيط" },
  { prefix: "TAI", lat: 21.2703, lng: 40.4158, name: "الطائف" },
  { prefix: "TAB", lat: 28.3838, lng: 36.555, name: "تبوك" },
];

export function inferCityFromNationalAddress(
  code: string
): { lat: number; lng: number; name: string } | null {
  const q = normalizeNationalAddress(code);
  const hit = NATIONAL_CITY_HINTS.find((c) => q.startsWith(c.prefix));
  return hit ? { lat: hit.lat, lng: hit.lng, name: hit.name } : null;
}

export type CustomerAddressPayload = {
  id?: string;
  label: string;
  address: string;
  lat: number | null;
  lng: number | null;
  national_address?: string | null;
};

export function formatAddressLabel(label?: string | null): string {
  const v = (label || "").trim();
  if (v === "home") return "المنزل";
  if (v === "work") return "العمل";
  if (v === "national") return "العنوان الوطني";
  return v || "عنوان";
}

export type AddressLabelKind = "home" | "work" | "national" | "custom";

export function parseAddressLabelKind(label?: string | null): AddressLabelKind {
  const v = (label || "").trim();
  if (v === "home" || v === "work" || v === "national") return v;
  return "custom";
}

export const ADDRESSES_CHANGED_EVENT = "sanam:addresses-changed";

export function notifyAddressesChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ADDRESSES_CHANGED_EVENT));
}

export function addressHasCoords(addr: { lat?: number | null; lng?: number | null }): boolean {
  return Number.isFinite(addr.lat) && Number.isFinite(addr.lng);
}

export function distanceFromBranch(branch: Pick<Branch, "lat" | "lng">, point: LatLng): number {
  return haversineKm(branch.lat, branch.lng, point.lat, point.lng);
}

/** Pick fee from ascending max_distance_km tiers. */
export function feeForDistance(
  rates: BranchDeliveryRate[],
  distanceKm: number,
  fallbackFee = 10,
): number {
  const sorted = [...rates].sort((a, b) => a.max_distance_km - b.max_distance_km);
  const hit = sorted.find((r) => distanceKm <= r.max_distance_km);
  if (hit) return Number(hit.fee);
  if (sorted.length) return Number(sorted[sorted.length - 1].fee);
  return fallbackFee;
}

const toHm = (value?: string | null, fallback = "08:00") => {
  if (!value) return fallback;
  return String(value).slice(0, 5);
};

const hmToMinutes = (hm: string) => {
  const [h, m] = hm.split(":").map((n) => Number(n));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
};

/** Current minutes since midnight in Saudi Arabia. */
export function riyadhMinutesNow(date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Riyadh",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value || 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value || 0);
  return hour * 60 + minute;
}

export function isBranchOpenNow(
  workStart?: string | null,
  workEnd?: string | null,
  date = new Date(),
): boolean {
  const start = hmToMinutes(toHm(workStart, "08:00"));
  const end = hmToMinutes(toHm(workEnd, "23:00"));
  const now = riyadhMinutesNow(date);
  if (start === end) return true;
  if (start < end) return now >= start && now < end;
  return now >= start || now < end;
}

export const IMMEDIATE_DELIVERY_LABEL = "الآن (في أقرب وقت)";

export function immediateDeliveryClosedMessage(workStart?: string | null, workEnd?: string | null): string {
  const start = toHm(workStart, "08:00");
  const end = toHm(workEnd, "23:00");
  return `عذراً، التوصيل الفوري غير متاح حالياً. دوام الفرع من ${start} إلى ${end}. يرجى اختيار وقت توصيل لاحق.`;
}
