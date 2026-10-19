export type DatePeriod = "today" | "week" | "custom" | "all";

/** Default period filter for collection hub and related admin views. */
export const DEFAULT_DATE_PERIOD: DatePeriod = "today";

/** @deprecated Prefer DEFAULT_DATE_PERIOD */
export const DEFAULT_WHOLESALE_PERIOD = DEFAULT_DATE_PERIOD;

export function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function datePeriodRange(
  period: DatePeriod,
  customFrom: string,
  customTo: string,
): { from: Date | null; to: Date | null } {
  const now = new Date();
  if (period === "all") return { from: null, to: null };
  if (period === "today") return { from: startOfDay(now), to: endOfDay(now) };
  if (period === "week") {
    const from = startOfDay(now);
    from.setDate(from.getDate() - 6);
    return { from, to: endOfDay(now) };
  }
  const from = customFrom ? startOfDay(new Date(customFrom)) : null;
  const to = customTo ? endOfDay(new Date(customTo)) : null;
  return { from, to };
}

export function isoInRange(iso: string | null | undefined, from: Date | null, to: Date | null) {
  if (!from && !to) return true;
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (from && t < from.getTime()) return false;
  if (to && t > to.getTime()) return false;
  return true;
}

/** ISO bounds for Supabase `.gte` / `.lte` on timestamptz columns. */
export function rangeIsoBounds(from: Date | null, to: Date | null) {
  return {
    fromIso: from ? from.toISOString() : null,
    toIso: to ? to.toISOString() : null,
  };
}

export const DATE_PERIOD_OPTIONS: { id: DatePeriod; label: string }[] = [
  { id: "today", label: "يومي" },
  { id: "week", label: "أسبوعي" },
  { id: "custom", label: "مخصص" },
  { id: "all", label: "الكل" },
];
