import { Capacitor } from "@capacitor/core";

export type DeliveryLiveState = {
  orderId: string;
  orderNumber?: string | null;
  driverName?: string | null;
  statusLabel: string;
  eta?: string | null;
  message?: string | null;
};

const activityIdFor = (orderId: string) => `order-${orderId}`;

function flag(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.value === "boolean") return o.value;
    if (typeof o.available === "boolean") return o.available;
    if (typeof o.running === "boolean") return o.running;
  }
  return false;
}

/**
 * iOS Live Activity (Lock Screen / Dynamic Island) for delivery tracking.
 * System ActivityKit UI — not an in-app banner.
 * Requires Widget Extension (ios/App/OrderTrackingWidget/).
 */
export async function startOrUpdateDeliveryLiveActivity(
  state: DeliveryLiveState,
): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") return false;

  try {
    const { LiveActivity } = await import("capacitor-live-activity");
    if (!flag(await LiveActivity.isAvailable())) return false;

    const id = activityIdFor(state.orderId);
    const contentState = {
      title: "سنام",
      status: state.statusLabel,
      message:
        state.message ||
        (state.driverName
          ? `المندوب ${state.driverName} في الطريق إليك`
          : "طلبك في الطريق إليك"),
      eta: state.eta || "—",
      orderNumber: state.orderNumber || "",
      driverName: state.driverName || "",
    };
    const attributes = {
      title: "تتبع التوصيل",
      orderId: state.orderId,
      orderNumber: state.orderNumber || "",
    };

    if (flag(await LiveActivity.isRunning({ id }).catch(() => false))) {
      await LiveActivity.updateActivity({ id, contentState });
    } else {
      await LiveActivity.startActivity({ id, attributes, contentState });
    }
    return true;
  } catch (e) {
    console.warn("[live-activity] start/update failed", e);
    return false;
  }
}

export async function endDeliveryLiveActivity(
  orderId: string,
  opts?: { statusLabel?: string; message?: string },
): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") return;
  try {
    const { LiveActivity } = await import("capacitor-live-activity");
    await LiveActivity.endActivity({
      id: activityIdFor(orderId),
      contentState: {
        title: "سنام",
        status: opts?.statusLabel || "تم التوصيل",
        message: opts?.message || "وصل طلبك بنجاح",
        eta: "0",
      },
    });
  } catch (e) {
    console.warn("[live-activity] end failed", e);
  }
}
