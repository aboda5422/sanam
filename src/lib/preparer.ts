export type PreparerFeatures = {
  enabled: boolean;
  require_notifications: boolean;
  label_ar: string;
};

export const DEFAULT_PREPARER_FEATURES: PreparerFeatures = {
  enabled: false,
  require_notifications: true,
  label_ar: "محضّر الطلبات",
};

export function prepProgress(items: { quantity: number; prepared_qty?: number | null }[]): {
  done: number;
  total: number;
  percent: number;
} {
  const total = items.reduce((s, i) => s + (i.quantity || 0), 0);
  const done = items.reduce((s, i) => s + Math.min(i.prepared_qty || 0, i.quantity || 0), 0);
  return {
    done,
    total,
    percent: total > 0 ? Math.round((done / total) * 100) : 0,
  };
}
