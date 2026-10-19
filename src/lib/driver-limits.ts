/** Driver concurrent-order + cash-on-hand limits (store defaults + per-driver overrides). */

export const DRIVER_LIMITS_KEY = "driver_limits";

export type DriverLimits = {
  max_active_orders: number;
  max_cash_on_hand: number;
  enforce_active_orders: boolean;
  enforce_cash_limit: boolean;
  low_rating_threshold: number;
};

export const DEFAULT_DRIVER_LIMITS: DriverLimits = {
  max_active_orders: 4,
  max_cash_on_hand: 1000,
  enforce_active_orders: true,
  enforce_cash_limit: true,
  low_rating_threshold: 3,
};

/** Merge store enforcement toggles with a driver's own numeric limits. */
export function resolveDriverLimits(
  store: Partial<DriverLimits> | null | undefined,
  driver?: { max_active_orders?: number | null; max_cash_on_hand?: number | null } | null,
): DriverLimits {
  const base = { ...DEFAULT_DRIVER_LIMITS, ...(store || {}) };
  return {
    ...base,
    max_active_orders: Math.max(
      1,
      Number(driver?.max_active_orders ?? base.max_active_orders) || base.max_active_orders,
    ),
    max_cash_on_hand: Math.max(
      0,
      Number(driver?.max_cash_on_hand ?? base.max_cash_on_hand) || 0,
    ),
  };
}
