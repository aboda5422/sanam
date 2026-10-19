export type OpsEnforcement = {
  /** Block driver app until system notifications are granted */
  driver_require_notifications: boolean;
  /** Block driver app until precise GPS is available */
  driver_require_location: boolean;
  /** Block preparer app until system notifications are granted */
  preparer_require_notifications: boolean;
};

export const OPS_ENFORCEMENT_KEY = "ops_enforcement";

export const DEFAULT_OPS_ENFORCEMENT: OpsEnforcement = {
  driver_require_notifications: true,
  driver_require_location: true,
  preparer_require_notifications: true,
};

export function parseOpsEnforcement(raw: unknown): OpsEnforcement {
  const v = (raw && typeof raw === "object" ? raw : {}) as Partial<OpsEnforcement>;
  return {
    driver_require_notifications:
      v.driver_require_notifications ?? DEFAULT_OPS_ENFORCEMENT.driver_require_notifications,
    driver_require_location:
      v.driver_require_location ?? DEFAULT_OPS_ENFORCEMENT.driver_require_location,
    preparer_require_notifications:
      v.preparer_require_notifications ?? DEFAULT_OPS_ENFORCEMENT.preparer_require_notifications,
  };
}
