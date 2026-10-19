import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  BellRing,
  Brain,
  CheckCheck,
  Loader2,
  RefreshCw,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import {
  DEFAULT_ADMIN_ASSISTANT,
  type AdminAssistantSettings,
  type AssistantAlert,
} from "@/lib/admin-assistant";
import { toast } from "sonner";
import { playNotificationSound } from "@/lib/notification-sound";

/** Dashboard tile + alerts/settings for operational AI assistant */
export default function AdminAssistantCard() {
  const { filterBranchId, scopedBranchIds } = useAdminAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("alerts");
  const [alerts, setAlerts] = useState<AssistantAlert[]>([]);
  const [unread, setUnread] = useState(0);
  const [settings, setSettings] = useState<AdminAssistantSettings>(DEFAULT_ADMIN_ASSISTANT);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (searchParams.get("assistant") === "1") {
      setOpen(true);
      setTab("alerts");
    }
  }, [searchParams]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next && searchParams.get("assistant")) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("assistant");
      setSearchParams(nextParams, { replace: true });
    }
  };

  const branchId =
    filterBranchId || (scopedBranchIds?.length === 1 ? scopedBranchIds[0] : null);

  const loadSettings = useCallback(async () => {
    const { data } = await supabase
      .from("store_settings")
      .select("value")
      .eq("key", "admin_assistant")
      .maybeSingle();
    setSettings({
      ...DEFAULT_ADMIN_ASSISTANT,
      ...((data?.value as Partial<AdminAssistantSettings>) || {}),
    });
  }, []);

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("admin_assistant_alerts" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(40);
    if (branchId) q = q.eq("branch_id", branchId);
    const { data } = await q;
    const rows = ((data as any) || []) as AssistantAlert[];
    setAlerts(rows);
    setUnread(rows.filter((a) => !a.is_read).length);
    setLoading(false);
  }, [branchId]);

  const notifyNew = (rows: AssistantAlert[]) => {
    if (!rows.length) return;
    if (settings.notify_system && "Notification" in window && Notification.permission === "granted") {
      for (const a of rows.slice(0, 3)) {
        new Notification(a.title, {
          body: a.body,
          tag: a.fingerprint,
          icon: "/sanam-logo.png",
        });
      }
    }
    playNotificationSound();
    toast.warning(rows[0].title, { description: rows[0].body });
  };

  const runScan = useCallback(async () => {
    if (!settings.enabled) return;
    setScanning(true);
    try {
      if (
        settings.notify_system &&
        "Notification" in window &&
        Notification.permission === "default"
      ) {
        await Notification.requestPermission();
      }
      const { data, error } = await supabase.functions.invoke("admin-assistant-scan", {
        body: { branch_id: branchId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const created = (data?.created || []) as AssistantAlert[];
      if (created.length) notifyNew(created);
      await loadAlerts();
    } catch (e: any) {
      console.error(e);
    } finally {
      setScanning(false);
    }
  }, [branchId, settings.enabled, settings.notify_system, loadAlerts]);

  useEffect(() => {
    loadSettings();
    loadAlerts();
  }, [loadSettings, loadAlerts]);

  useEffect(() => {
    if (!settings.enabled) return;
    const tick = () => {
      void runScan();
    };
    tick();
    const ms = Math.max(5, settings.scan_interval_minutes || 15) * 60 * 1000;
    const t = setInterval(tick, ms);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional interval on settings only
  }, [settings.enabled, settings.scan_interval_minutes, branchId]);

  useEffect(() => {
    const ch = supabase
      .channel("admin-assistant-alerts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "admin_assistant_alerts" },
        (payload) => {
          const row = payload.new as AssistantAlert;
          if (branchId && row.branch_id && row.branch_id !== branchId) return;
          setAlerts((prev) => [row, ...prev].slice(0, 40));
          setUnread((u) => u + 1);
          if (settings.notify_system) notifyNew([row]);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [branchId, settings.notify_system]);

  const markAllRead = async () => {
    const ids = alerts.filter((a) => !a.is_read).map((a) => a.id);
    if (!ids.length) return;
    await supabase.from("admin_assistant_alerts" as any).update({ is_read: true }).in("id", ids);
    setAlerts((prev) => prev.map((a) => ({ ...a, is_read: true })));
    setUnread(0);
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("store_settings")
        .upsert({ key: "admin_assistant", value: settings as any }, { onConflict: "key" });
      if (error) throw error;
      toast.success("تم حفظ إعدادات المساعد");
    } catch (e: any) {
      toast.error(e.message || "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const severityClass: Record<string, string> = {
    info: "bg-blue-100 text-blue-800",
    warning: "bg-amber-100 text-amber-900",
    critical: "bg-red-100 text-red-800",
  };

  return (
    <>
      <Card
        className="cursor-pointer hover:shadow-md transition-shadow border-primary/30 bg-primary/5"
        onClick={() => setOpen(true)}
      >
        <CardContent className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
            <Brain className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm flex items-center gap-2">
              المساعد الإداري
              {unread > 0 && (
                <Badge className="h-5 px-1.5 text-[10px]">{unread}</Badge>
              )}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              تنبيهات مخزون وطلبات متأخرة وتقارير مختصرة
            </p>
          </div>
          <BellRing className={`h-4 w-4 shrink-0 ${unread ? "text-amber-500" : "text-muted-foreground"}`} />
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              المساعد الإداري
            </DialogTitle>
            <DialogDescription>
              تنبيهات لحظية لمدير الفرع/الإدمن مع ضبط المؤشرات من الإعدادات.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={tab} onValueChange={setTab} dir="rtl">
            <TabsList className="w-full">
              <TabsTrigger value="alerts" className="flex-1">
                التنبيهات
              </TabsTrigger>
              <TabsTrigger value="settings" className="flex-1">
                الإعدادات
              </TabsTrigger>
            </TabsList>

            <TabsContent value="alerts" className="space-y-3 mt-3">
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={runScan} disabled={scanning}>
                  {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4 ml-1" />}
                  فحص الآن
                </Button>
                <Button size="sm" variant="ghost" onClick={markAllRead} disabled={!unread}>
                  <CheckCheck className="h-4 w-4 ml-1" />
                  تعليم الكل كمقروء
                </Button>
              </div>
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : alerts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">لا تنبيهات بعد</p>
              ) : (
                <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                  {alerts.map((a) => (
                    <div
                      key={a.id}
                      className={`rounded-lg border p-3 ${a.is_read ? "opacity-70" : "bg-card"}`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="font-semibold text-sm">{a.title}</p>
                        <Badge className={`text-[10px] ${severityClass[a.severity] || ""}`}>
                          {a.severity === "critical" ? "حرج" : a.severity === "warning" ? "تحذير" : "معلومة"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap">{a.body}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {new Date(a.created_at).toLocaleString("ar-SA")}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="settings" className="space-y-4 mt-3">
              <div className="flex items-center justify-between py-2 border-b">
                <span className="text-sm flex items-center gap-2">
                  <Settings2 className="h-4 w-4" /> تفعيل المساعد
                </span>
                <Switch
                  checked={settings.enabled}
                  onCheckedChange={(v) => setSettings((s) => ({ ...s, enabled: v }))}
                />
              </div>
              <div className="flex items-center justify-between py-2 border-b">
                <span className="text-sm">إشعارات شاشة الجوال/المتصفح</span>
                <Switch
                  checked={settings.notify_system}
                  onCheckedChange={(v) => setSettings((s) => ({ ...s, notify_system: v }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">حد نفاذ المخزون</Label>
                  <Input
                    type="number"
                    min={1}
                    value={settings.low_stock_threshold}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, low_stock_threshold: Number(e.target.value) || 5 }))
                    }
                    dir="ltr"
                  />
                </div>
                <div>
                  <Label className="text-xs">تأخر الطلب (ساعات)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={settings.stuck_order_hours}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, stuck_order_hours: Number(e.target.value) || 3 }))
                    }
                    dir="ltr"
                  />
                </div>
                <div>
                  <Label className="text-xs">فترة الفحص (دقائق)</Label>
                  <Input
                    type="number"
                    min={5}
                    value={settings.scan_interval_minutes}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        scan_interval_minutes: Number(e.target.value) || 15,
                      }))
                    }
                    dir="ltr"
                  />
                </div>
                <div>
                  <Label className="text-xs">نسبة انخفاض المبيعات %</Label>
                  <Input
                    type="number"
                    min={5}
                    value={settings.sales_drop_percent}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        sales_drop_percent: Number(e.target.value) || 15,
                      }))
                    }
                    dir="ltr"
                  />
                </div>
              </div>
              {(
                [
                  ["alert_low_stock", "تنبيه نفاذ المخزون"],
                  ["alert_stuck_orders", "تنبيه الطلبات المتأخرة"],
                  ["alert_sales_drop", "نصيحة انخفاض المبيعات"],
                  ["alert_daily_report", "تقرير آخر اليوم"],
                  ["alert_monthly_report", "تقرير آخر الشهر"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="flex items-center justify-between py-1.5 border-b">
                  <span className="text-sm">{label}</span>
                  <Switch
                    checked={settings[key]}
                    onCheckedChange={(v) => setSettings((s) => ({ ...s, [key]: v }))}
                  />
                </div>
              ))}
              <Button onClick={saveSettings} disabled={saving} className="w-full">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ الإعدادات"}
              </Button>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
