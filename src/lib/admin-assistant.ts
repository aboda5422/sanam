export type AdminAssistantSettings = {
  enabled: boolean;
  low_stock_threshold: number;
  stuck_order_hours: number;
  scan_interval_minutes: number;
  alert_low_stock: boolean;
  alert_stuck_orders: boolean;
  alert_daily_report: boolean;
  alert_monthly_report: boolean;
  alert_sales_drop: boolean;
  sales_drop_percent: number;
  notify_system: boolean;
};

export const DEFAULT_ADMIN_ASSISTANT: AdminAssistantSettings = {
  enabled: true,
  low_stock_threshold: 5,
  stuck_order_hours: 3,
  scan_interval_minutes: 15,
  alert_low_stock: true,
  alert_stuck_orders: true,
  alert_daily_report: true,
  alert_monthly_report: true,
  alert_sales_drop: true,
  sales_drop_percent: 15,
  notify_system: true,
};

export type AssistantAlert = {
  id: string;
  branch_id: string | null;
  kind: string;
  severity: "info" | "warning" | "critical";
  title: string;
  body: string;
  fingerprint: string;
  meta: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
};
