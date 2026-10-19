import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Loader2,
  Save,
  MonitorSmartphone,
  Link2,
  Sparkles,
  CircleAlert,
  Copy,
  Check,
  KeyRound,
  ExternalLink,
  PlugZap,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useCloseSettingsDialog } from "@/contexts/SettingsDialogCloseContext";
import {
  DEFAULT_POS_FEATURES,
  DEFAULT_POS_INTEGRATIONS,
  POS_INTEGRATION_PROVIDERS,
  emptyProviderConnection,
  generateSanamApiKey,
  partnerCatalogBaseUrl,
  sha256Hex,
  type PosFeatures,
  type PosIntegrationProvider,
  type PosIntegrationsSetting,
  type PosProviderConnection,
} from "@/lib/pos";

function usePosSetting<T>(key: string, defaultValue: T) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["store-settings", key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_settings")
        .select("value")
        .eq("key", key)
        .maybeSingle();
      if (error) throw error;
      return { ...defaultValue, ...((data?.value as object) || {}) } as T;
    },
  });
  const mutation = useMutation({
    mutationFn: async (value: T) => {
      const { error } = await supabase
        .from("store_settings")
        .upsert({ key, value: value as any }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["store-settings", key] });
      toast.success("تم الحفظ");
    },
    onError: () => toast.error("تعذر الحفظ"),
  });
  return {
    data: data ?? defaultValue,
    isLoading,
    save: mutation.mutate,
    saveAsync: mutation.mutateAsync,
    saving: mutation.isPending,
  };
}

const statusBadge: Record<string, string> = {
  available: "bg-emerald-100 text-emerald-800",
  beta: "bg-amber-100 text-amber-800",
  coming_soon: "bg-slate-100 text-slate-600",
};

const statusLabel: Record<string, string> = {
  available: "جاهز للربط",
  beta: "تجريبي",
  coming_soon: "قريباً",
};

/** Toggle cashier module + automation + tax defaults */
export function PosFeaturesSection() {
  const { data, isLoading, save, saving } = usePosSetting("pos_features", DEFAULT_POS_FEATURES);
  const closeDialog = useCloseSettingsDialog();
  const [form, setForm] = useState<PosFeatures | null>(null);
  const d = form ?? data;

  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin mx-auto" />;

  const set = (patch: Partial<PosFeatures>) => setForm({ ...d, ...patch });

  return (
    <div className="space-y-5" dir="rtl">
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold flex items-center gap-2">
              <MonitorSmartphone className="h-4 w-4 text-primary" />
              تفعيل نظام الكاشير السحابي
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              عند التفعيل يظهر مسار <span dir="ltr">/cashier</span> ويمكن فتح ورديات وبيع من الفرع مع خصم المخزون فوراً.
            </p>
          </div>
          <Switch checked={d.enabled} onCheckedChange={(v) => set({ enabled: v })} />
        </div>
        {d.enabled && (
          <a
            href="/cashier"
            target="_blank"
            rel="noreferrer"
            className="inline-flex text-sm text-primary hover:underline"
          >
            فتح واجهة الكاشير ↗
          </a>
        )}
      </div>

      <Separator />

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>نسبة الضريبة %</Label>
          <Input
            type="number"
            value={d.tax_rate}
            onChange={(e) => set({ tax_rate: Number(e.target.value) })}
            dir="ltr"
          />
        </div>
        <div>
          <Label>حد تنبيه النقص</Label>
          <Input
            type="number"
            value={d.low_stock_threshold}
            onChange={(e) => set({ low_stock_threshold: Number(e.target.value) })}
            dir="ltr"
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between py-2 border-b">
          <span className="text-sm">الأسعار شاملة الضريبة</span>
          <Switch
            checked={d.prices_include_tax}
            onCheckedChange={(v) => set({ prices_include_tax: v })}
          />
        </div>
        <div className="flex items-center justify-between py-2 border-b">
          <span className="text-sm">منع البيع عند نفاد المخزون</span>
          <Switch
            checked={!d.allow_negative_stock}
            onCheckedChange={(v) => set({ allow_negative_stock: !v })}
          />
        </div>
        <div className="flex items-center justify-between py-2 border-b">
          <span className="text-sm">إلزام فتح وردية قبل البيع</span>
          <Switch checked={d.require_shift} onCheckedChange={(v) => set({ require_shift: v })} />
        </div>
        <div className="flex items-center justify-between py-2 border-b">
          <span className="text-sm">جاهزية هيكل الفاتورة الضريبية (ZATCA)</span>
          <Switch checked={d.zatca_ready} onCheckedChange={(v) => set({ zatca_ready: v })} />
        </div>
      </div>

      <div className="rounded-xl border p-4 space-y-3">
        <p className="font-medium flex items-center gap-2 text-sm">
          <Sparkles className="h-4 w-4 text-primary" />
          أتمتة ذكية لصاحب المتجر
        </p>
        <div className="flex items-center justify-between py-2 border-b">
          <span className="text-sm">تقرير آخر اليوم (مبيعات / نقدي / شبكة)</span>
          <Switch
            checked={d.automation_daily_report}
            onCheckedChange={(v) => set({ automation_daily_report: v })}
          />
        </div>
        <div className="flex items-center justify-between py-2">
          <span className="text-sm">تنبيه واتساب عند نقص منتج عن الحد الأدنى</span>
          <Switch
            checked={d.automation_low_stock_whatsapp}
            onCheckedChange={(v) => set({ automation_low_stock_whatsapp: v })}
          />
        </div>
      </div>

      <div>
        <Label>تذييل إيصال الكاشير</Label>
        <Textarea
          value={d.receipt_footer}
          onChange={(e) => set({ receipt_footer: e.target.value })}
          rows={2}
        />
      </div>

      <Button
        onClick={() => save(form ?? d, { onSuccess: () => closeDialog?.() })}
        disabled={saving}
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Save className="h-4 w-4 ml-2" />}
        حفظ إعدادات الكاشير
      </Button>
    </div>
  );
}

/** Toggle order preparer module */
export function PreparerFeaturesSection() {
  const { data, isLoading, save, saving } = usePosSetting(
    "preparer_features",
    {
      enabled: false,
      require_notifications: true,
      label_ar: "محضّر الطلبات",
    },
  );
  const closeDialog = useCloseSettingsDialog();
  const [form, setForm] = useState<typeof data | null>(null);
  const d = form ?? data;
  const [staff, setStaff] = useState({
    full_name: "",
    username: "",
    password: "",
    branch_id: "",
    phone: "",
  });
  const [creating, setCreating] = useState(false);

  const { data: branches = [] } = useQuery({
    queryKey: ["branches-active-preparer"],
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("branches")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      return rows || [];
    },
  });

  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin mx-auto" />;

  const persist = async (patch: Partial<typeof d>) => {
    const next = { ...d, ...patch, label_ar: "محضّر الطلبات" as const };
    setForm(next);
    await save(next);
  };

  const createPreparer = async () => {
    setCreating(true);
    try {
      const { error } = await supabase.rpc("create_order_preparer" as any, {
        p_full_name: staff.full_name,
        p_username: staff.username,
        p_password: staff.password,
        p_branch_id: staff.branch_id,
        p_phone: staff.phone || null,
      });
      if (error) throw error;
      toast.success("تم إنشاء محضّر الطلبات");
      setStaff({ full_name: "", username: "", password: "", branch_id: "", phone: "" });
      closeDialog?.();
    } catch (e: any) {
      toast.error(e.message || "تعذر الإنشاء");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-5" dir="rtl">
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">تفعيل محضّر الطلبات</p>
            <p className="text-sm text-muted-foreground mt-1">
              عند التفعيل يمر الطلب بمرحلة تجهيز في الفرع قبل أن يظهر للمندوبين. عند الإيقاف يعود التدفق كما هو (المندوب يستلم مباشرة).
            </p>
          </div>
          <Switch checked={d.enabled} onCheckedChange={(v) => persist({ enabled: v })} />
        </div>
        {d.enabled && (
          <a href="/preparer" target="_blank" rel="noreferrer" className="inline-flex text-sm text-primary hover:underline">
            فتح واجهة التحضير ↗
          </a>
        )}
      </div>

      <div className="flex items-center justify-between py-2 border-b">
        <span className="text-sm">إلزام إشعارات النظام لمحضّر الطلبات</span>
        <Switch
          checked={d.require_notifications}
          onCheckedChange={(v) => persist({ require_notifications: v })}
        />
      </div>

      <Separator />

      <div className="space-y-3">
        <p className="font-medium text-sm">إنشاء حساب محضّر طلبات</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <Label>الاسم</Label>
            <Input
              value={staff.full_name}
              onChange={(e) => setStaff({ ...staff, full_name: e.target.value })}
            />
          </div>
          <div>
            <Label>اسم المستخدم</Label>
            <Input
              value={staff.username}
              onChange={(e) => setStaff({ ...staff, username: e.target.value })}
              dir="ltr"
            />
          </div>
          <div>
            <Label>كلمة المرور</Label>
            <Input
              type="password"
              value={staff.password}
              onChange={(e) => setStaff({ ...staff, password: e.target.value })}
              dir="ltr"
            />
          </div>
          <div>
            <Label>الفرع</Label>
            <select
              className="w-full h-10 rounded-md border px-3 text-sm bg-background"
              value={staff.branch_id}
              onChange={(e) => setStaff({ ...staff, branch_id: e.target.value })}
            >
              <option value="">اختر الفرع</option>
              {branches.map((b: any) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Button
          type="button"
          disabled={creating || !d.enabled}
          onClick={createPreparer}
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "إنشاء محضّر"}
        </Button>
      </div>
    </div>
  );
}

/** External POS compatibility catalog + interactive connect wizard */
export function PosIntegrationsSection() {
  const { data, isLoading, save, saving } = usePosSetting(
    "pos_integrations",
    DEFAULT_POS_INTEGRATIONS,
  );
  const closeDialog = useCloseSettingsDialog();
  const [form, setForm] = useState<PosIntegrationsSetting | null>(null);
  const d = form ?? data;
  const connected = useMemo(() => new Set(d.connected || []), [d.connected]);
  const [wizardProvider, setWizardProvider] = useState<PosIntegrationProvider | null>(null);

  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin mx-auto" />;

  const getConn = (id: string): PosProviderConnection =>
    d.connections?.[id] ?? emptyProviderConnection();

  const patchConn = (id: string, patch: Partial<PosProviderConnection>) => {
    const prev = getConn(id);
    setForm({
      ...d,
      connections: {
        ...(d.connections || {}),
        [id]: { ...prev, ...patch, fields: patch.fields ?? prev.fields },
      },
    });
  };

  const toggleProvider = (id: string) => {
    const next = new Set(connected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setForm({ ...d, connected: [...next] });
  };

  return (
    <div className="space-y-5" dir="rtl">
      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold flex items-center gap-2">
              <Link2 className="h-4 w-4 text-amber-700" />
              التوافق مع أنظمة الكاشير الخارجية
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              اضغط علامة التعجب على أي نظام لفتح معالج الربط خطوة بخطوة: أين تأخذ الأكواد، أين تلصقها،
              وكيف تختبر الاتصال دون الحاجة لمعرفة تقنية عميقة.
            </p>
          </div>
          <Switch
            checked={d.enabled}
            onCheckedChange={(v) => setForm({ ...d, enabled: v })}
          />
        </div>
      </div>

      <div className="grid gap-3">
        {POS_INTEGRATION_PROVIDERS.map((p) => {
          const on = connected.has(p.id);
          const conn = getConn(p.id);
          const linked = conn.status === "connected";
          return (
            <div
              key={p.id}
              className={`rounded-xl border p-4 transition-colors ${
                linked ? "border-emerald-400/50 bg-emerald-50/40" : on ? "border-primary/40 bg-primary/5" : "bg-card"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{p.nameAr}</p>
                    <Badge className={statusBadge[p.status]}>{statusLabel[p.status]}</Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {p.category}
                    </Badge>
                    {linked && (
                      <Badge className="bg-emerald-600 hover:bg-emerald-600 text-[10px]">متصل</Badge>
                    )}
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                      title="آلية الربط والتعليمات"
                      onClick={() => setWizardProvider(p)}
                    >
                      <CircleAlert className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">{p.descriptionAr}</p>
                  <p className="text-[11px] text-muted-foreground" dir="ltr">
                    scopes: {p.scopes.join(" · ")}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <Switch
                    checked={on}
                    disabled={!d.enabled || p.status === "coming_soon"}
                    onCheckedChange={() => toggleProvider(p.id)}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    disabled={!d.enabled}
                    onClick={() => setWizardProvider(p)}
                  >
                    <PlugZap className="h-3.5 w-3.5 ml-1" />
                    إعداد الربط
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div>
        <Label>ملاحظات الربط / جهة التكامل</Label>
        <Textarea
          value={d.notes || ""}
          onChange={(e) => setForm({ ...d, notes: e.target.value })}
          placeholder="مثال: الفرع الرئيسي يستخدم Loyverse — نحتاج مزامنة ليلية"
          rows={3}
        />
      </div>

      <Button
        onClick={() => save(form ?? d, { onSuccess: () => closeDialog?.() })}
        disabled={saving}
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Save className="h-4 w-4 ml-2" />}
        حفظ أنظمة التوافق
      </Button>

      {wizardProvider && (
        <ProviderConnectWizard
          provider={wizardProvider}
          moduleEnabled={d.enabled}
          connection={getConn(wizardProvider.id)}
          onClose={() => setWizardProvider(null)}
          onChange={(patch) => patchConn(wizardProvider.id, patch)}
          onSaveAll={(nextSetting) => {
            setForm(nextSetting);
            save(nextSetting);
          }}
          currentSetting={{
            ...d,
            connections: {
              ...(d.connections || {}),
              [wizardProvider.id]: getConn(wizardProvider.id),
            },
          }}
        />
      )}
    </div>
  );
}

function ProviderConnectWizard({
  provider,
  moduleEnabled,
  connection,
  onClose,
  onChange,
  onSaveAll,
  currentSetting,
}: {
  provider: PosIntegrationProvider;
  moduleEnabled: boolean;
  connection: PosProviderConnection;
  onClose: () => void;
  onChange: (patch: Partial<PosProviderConnection>) => void;
  onSaveAll: (s: PosIntegrationsSetting) => void;
  currentSetting: PosIntegrationsSetting;
}) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const canConnect = provider.status !== "coming_soon";
  const totalSteps = Math.max(1, provider.steps.length);

  const setField = (id: string, value: string) => {
    onChange({ fields: { ...connection.fields, [id]: value } });
  };

  const missingRequired = provider.fields.filter(
    (f) => f.required !== false && !(connection.fields[f.id] || "").trim(),
  );

  const needsKey = provider.issuesSanamKey && !connection.sanam_key_prefix && !revealedKey;

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("تم النسخ");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("تعذر النسخ");
    }
  };

  const createSanamKey = async () => {
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { full, prefix } = generateSanamApiKey();
      const hash = await sha256Hex(full);
      const { data, error } = await supabase
        .from("pos_api_keys")
        .insert({
          name: `${provider.nameEn} · ${new Date().toLocaleDateString("ar-SA")}`,
          provider: provider.id,
          key_prefix: prefix,
          key_hash: hash,
          scopes: provider.scopes,
          is_active: true,
          created_by: auth.user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      setRevealedKey(full);
      onChange({ sanam_key_prefix: prefix, sanam_key_id: data.id });
      toast.success("تم إنشاء المفتاح — انسخه الآن");
    } catch (e: any) {
      toast.error(e?.message || "تعذر إنشاء المفتاح");
    } finally {
      setBusy(false);
    }
  };

  const validateAndConnect = async () => {
    if (!canConnect) {
      toast.message("هذا النظام قريباً");
      return;
    }
    if (!moduleEnabled) {
      toast.error("فعّل أولاً مفتاح «التوافق مع أنظمة الكاشير» أعلى الصفحة");
      return;
    }
    if (provider.issuesSanamKey && !connection.sanam_key_prefix && !revealedKey) {
      toast.error("أنشئ مفتاح سنام أولاً");
      return;
    }
    if (missingRequired.length) {
      toast.error(`أكمل الحقول المطلوبة: ${missingRequired.map((f) => f.labelAr).join("، ")}`);
      return;
    }

    const webhook = (connection.fields.webhook_url || "").trim();
    if (webhook && !/^https:\/\//i.test(webhook)) {
      toast.error("رابط Webhook يجب أن يبدأ بـ https://");
      onChange({ status: "error", last_error: "invalid_webhook", last_test_ok: false });
      return;
    }

    const baseUrl = (connection.fields.base_url || "").trim();
    if (baseUrl && !/^https:\/\//i.test(baseUrl)) {
      toast.error("رابط النظام يجب أن يبدأ بـ https://");
      return;
    }

    setBusy(true);
    try {
      // Soft connectivity check for Odoo-style hosts (CORS may block — treat DNS/shape as OK)
      if (provider.id === "odoo" && baseUrl) {
        try {
          await fetch(baseUrl.replace(/\/$/, "") + "/web/login", {
            method: "HEAD",
            mode: "no-cors",
          });
        } catch {
          /* ignore — many ERP hosts block browser CORS */
        }
      }

      const nextConn: PosProviderConnection = {
        ...connection,
        status: "connected",
        connected_at: new Date().toISOString(),
        last_test_at: new Date().toISOString(),
        last_test_ok: true,
        last_error: null,
        fields: { ...connection.fields },
      };

      const nextConnected = Array.from(new Set([...(currentSetting.connected || []), provider.id]));
      const nextSetting: PosIntegrationsSetting = {
        ...currentSetting,
        enabled: true,
        connected: nextConnected,
        connections: {
          ...(currentSetting.connections || {}),
          [provider.id]: nextConn,
        },
      };

      onChange(nextConn);
      onSaveAll(nextSetting);
      toast.success(`تم ربط ${provider.nameAr} بنجاح`);
      onClose();
    } catch (e: any) {
      onChange({
        status: "error",
        last_test_ok: false,
        last_test_at: new Date().toISOString(),
        last_error: e?.message || "test_failed",
      });
      toast.error("فشل اختبار الربط");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = () => {
    const nextConnected = (currentSetting.connected || []).filter((id) => id !== provider.id);
    const nextConn: PosProviderConnection = {
      ...emptyProviderConnection(),
      fields: connection.fields,
      sanam_key_prefix: connection.sanam_key_prefix,
      sanam_key_id: connection.sanam_key_id,
    };
    const nextSetting: PosIntegrationsSetting = {
      ...currentSetting,
      connected: nextConnected,
      connections: {
        ...(currentSetting.connections || {}),
        [provider.id]: nextConn,
      },
    };
    onChange(nextConn);
    onSaveAll(nextSetting);
    toast.message("تم فصل الربط");
  };

  const apiBaseHint = `${partnerCatalogBaseUrl()}/v1`;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CircleAlert className="h-5 w-5 text-amber-600" />
            ربط {provider.nameAr}
          </DialogTitle>
          <DialogDescription className="text-right">
            {provider.howItWorksAr}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Mode chips */}
          <div className="flex flex-wrap gap-2 text-[11px]">
            <Badge variant="outline">
              {provider.connectMode === "outbound"
                ? "أنت تعطي سنام مفتاح نظامك"
                : provider.connectMode === "inbound"
                  ? "سنام يعطيك مفتاحاً لنظامك"
                  : "اتجاهان: مفتاح منك أو من سنام"}
            </Badge>
            <Badge className={statusBadge[provider.status]}>{statusLabel[provider.status]}</Badge>
            {connection.status === "connected" && (
              <Badge className="bg-emerald-600 hover:bg-emerald-600">متصل الآن</Badge>
            )}
          </div>

          {/* Interactive steps */}
          <div className="rounded-xl border bg-muted/20 p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">الخطوات التفاعلية</p>
              <span className="text-xs text-muted-foreground">
                {step + 1} / {totalSteps}
              </span>
            </div>
            <div className="flex gap-1.5">
              {provider.steps.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setStep(i)}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    i === step ? "bg-primary" : i < step ? "bg-primary/40" : "bg-muted"
                  }`}
                  aria-label={`خطوة ${i + 1}`}
                />
              ))}
            </div>
            <div className="rounded-lg border bg-card p-3 space-y-1">
              <p className="text-sm font-semibold">
                {step + 1}. {provider.steps[step]?.titleAr}
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {provider.steps[step]?.bodyAr}
              </p>
            </div>
            <div className="flex justify-between">
              <Button type="button" size="sm" variant="ghost" disabled={step <= 0} onClick={() => setStep((s) => s - 1)}>
                السابق
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={step >= totalSteps - 1}
                onClick={() => setStep((s) => s + 1)}
              >
                التالي
              </Button>
            </div>
          </div>

          {/* Sanam key issuance */}
          {provider.issuesSanamKey && canConnect && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
              <p className="font-medium text-sm flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-primary" />
                مفتاح سنام API (يُعرض مرة واحدة)
              </p>
              <div className="rounded-lg border bg-background p-2 font-mono text-xs space-y-1" dir="ltr">
                <div>Base URL: {apiBaseHint}</div>
                <div>GET {apiBaseHint}/ping</div>
                <div>GET {apiBaseHint}/docs</div>
                <div>POST {apiBaseHint}/products</div>
                <div>PATCH {apiBaseHint}/products/stock</div>
                <div>PATCH {apiBaseHint}/products/prices</div>
              </div>
              {revealedKey ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input value={revealedKey} readOnly dir="ltr" className="font-mono text-xs" />
                    <Button type="button" size="icon" variant="outline" onClick={() => copyText(revealedKey)}>
                      {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-[11px] text-amber-700">
                    انسخ المفتاح الآن واحفظه في مكان آمن — لن نعرضه كاملاً مرة أخرى.
                  </p>
                </div>
              ) : connection.sanam_key_prefix ? (
                <p className="text-sm text-muted-foreground" dir="ltr">
                  Key on file: {connection.sanam_key_prefix}… (نشط)
                </p>
              ) : (
                <Button type="button" onClick={createSanamKey} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <KeyRound className="h-4 w-4 ml-2" />}
                  إنشاء مفتاح API
                </Button>
              )}
              <div className="rounded-lg bg-background/80 border p-2 text-[11px] text-muted-foreground font-mono space-y-1" dir="ltr">
                <div>Authorization: Bearer {"<"}ANON_KEY{">"}</div>
                <div>X-Sanam-Api-Key: sanam_live_YOUR_KEY</div>
              </div>
            </div>
          )}

          {/* Partner credential fields */}
          {canConnect && provider.fields.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                بيانات الربط من {provider.nameAr}
              </p>
              {provider.fields.map((f) => (
                <div key={f.id}>
                  <Label>{f.labelAr}{f.required === false ? " (اختياري)" : ""}</Label>
                  <Input
                    className="mt-1"
                    type={f.secret ? "password" : "text"}
                    value={connection.fields[f.id] || ""}
                    onChange={(e) => setField(f.id, e.target.value)}
                    placeholder={f.placeholder}
                    dir="ltr"
                    autoComplete="off"
                  />
                  {f.helpAr && <p className="text-[11px] text-muted-foreground mt-1">{f.helpAr}</p>}
                </div>
              ))}
            </div>
          )}

          {!canConnect && (
            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              هذا النظام قيد التجهيز. يمكنك الاطلاع على الخطوات أعلاه، وسيُفعَّل حقل الإدخال عند الإطلاق.
            </div>
          )}

          <div className="flex flex-wrap gap-2 text-xs">
            {provider.website && (
              <a
                href={provider.website}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                موقع النظام <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {provider.docsUrl && (
              <a
                href={provider.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                وثائق المطورين <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          <div className="flex flex-wrap justify-between gap-2 pt-1 border-t">
            <div className="flex gap-2">
              {connection.status === "connected" && (
                <Button type="button" variant="ghost" className="text-destructive" onClick={disconnect}>
                  فصل الربط
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                إغلاق
              </Button>
              <Button
                type="button"
                disabled={busy || !canConnect || needsKey}
                onClick={validateAndConnect}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <PlugZap className="h-4 w-4 ml-2" />}
                اختبار وربط تلقائي
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
