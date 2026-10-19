import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Store, Bell, Shield, Save, Loader2, Users, ScrollText, MonitorSmartphone, Link2, CreditCard, PackageCheck, Mail, LayoutTemplate } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import AdminUsersSection from "@/components/admin/AdminUsersSection";
import AdminActivityLogSection from "@/components/admin/AdminActivityLogSection";
import { PosFeaturesSection, PosIntegrationsSection, PreparerFeaturesSection } from "@/components/admin/PosSettingsSections";
import { DEFAULT_NOTIFICATION_PREFS } from "@/hooks/useAdminNotifications";
import { playNotificationSound, unlockNotificationAudio } from "@/lib/notification-sound";
import { DEFAULT_CHECKOUT_FEATURES, CHECKOUT_FEATURES_KEY } from "@/hooks/useCheckoutFeatures";
import { SettingsDialogCloseContext, useCloseSettingsDialog } from "@/contexts/SettingsDialogCloseContext";
import { DEFAULT_STORE_INFO, STORE_INFO_KEY, mergeStoreInfo, type StoreInfo } from "@/lib/store-info";

const useSetting = (key: string, defaultValue: any) => {
  const queryClient = useQueryClient();
  const closeDialog = useCloseSettingsDialog();
  const { data, isLoading } = useQuery({
    queryKey: ["store-settings", key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_settings")
        .select("value")
        .eq("key", key)
        .maybeSingle();
      if (error) throw error;
      return data?.value ?? defaultValue;
    },
  });

  const mutation = useMutation({
    mutationFn: async (value: any) => {
      const { error } = await supabase
        .from("store_settings")
        .upsert({ key, value }, { onConflict: "key" });
      if (error) throw error;
      return value;
    },
    onSuccess: (value) => {
      // Write merged store_info into cache immediately so Footer updates without waiting
      const cached =
        key === STORE_INFO_KEY ? mergeStoreInfo(value) : value;
      queryClient.setQueryData(["store-settings", key], cached);
      queryClient.invalidateQueries({ queryKey: ["store-settings", key] });
      toast.success("تم الحفظ بنجاح");
      closeDialog?.();
    },
    onError: () => toast.error("حدث خطأ أثناء الحفظ"),
  });

  return {
    data: key === STORE_INFO_KEY ? mergeStoreInfo(data ?? defaultValue) : (data ?? defaultValue),
    isLoading,
    save: mutation.mutate,
    saving: mutation.isPending,
  };
};

// ─── Store Info Section (also drives public footer) ───
const StoreInfoSection = () => {
  const { data, isLoading, save, saving } = useSetting(STORE_INFO_KEY, DEFAULT_STORE_INFO);
  const [form, setForm] = useState<StoreInfo | null>(null);
  const d = form ?? mergeStoreInfo(data);

  const set = (patch: Partial<StoreInfo>) => setForm({ ...d, ...patch });
  const setSocial = (key: keyof StoreInfo["social"], value: string) =>
    setForm({ ...d, social: { ...d.social, [key]: value } });

  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin mx-auto" />;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>اسم المتجر</Label>
          <Input value={d.name} onChange={(e) => set({ name: e.target.value })} />
        </div>
        <div>
          <Label>اسم الشركة (للتوقيع في الفوتر)</Label>
          <Input value={d.company_name} onChange={(e) => set({ company_name: e.target.value })} />
        </div>
        <div>
          <Label>رقم الجوال</Label>
          <Input value={d.phone} onChange={(e) => set({ phone: e.target.value })} dir="ltr" placeholder="0537688877" />
        </div>
        <div>
          <Label>رقم الواتساب</Label>
          <Input
            value={d.whatsapp}
            onChange={(e) => set({ whatsapp: e.target.value })}
            dir="ltr"
            placeholder="966537688877 أو 0537688877"
          />
          <p className="text-[11px] text-muted-foreground mt-1">يظهر في زر واتساب بالفوتر</p>
        </div>
        <div>
          <Label>البريد الإلكتروني</Label>
          <Input value={d.email} onChange={(e) => set({ email: e.target.value })} dir="ltr" />
        </div>
        <div>
          <Label>العنوان / نطاق التغطية</Label>
          <Input value={d.address} onChange={(e) => set({ address: e.target.value })} />
        </div>
        <div>
          <Label>رقم السجل التجاري</Label>
          <Input value={d.cr_number} onChange={(e) => set({ cr_number: e.target.value })} dir="ltr" />
        </div>
        <div>
          <Label>الرقم الضريبي (VAT)</Label>
          <Input value={d.vat_number} onChange={(e) => set({ vat_number: e.target.value })} dir="ltr" placeholder="اختياري" />
        </div>
      </div>

      <div>
        <Label>شعار قصير (تحت الشعار في الفوتر)</Label>
        <Input value={d.tagline} onChange={(e) => set({ tagline: e.target.value })} />
      </div>
      <div>
        <Label>وصف المتجر</Label>
        <Textarea value={d.description} onChange={(e) => set({ description: e.target.value })} rows={3} />
      </div>

      <div className="space-y-3 rounded-xl border p-3 bg-muted/20">
        <p className="text-sm font-semibold">حسابات التواصل (الفوتر)</p>
        <p className="text-xs text-muted-foreground -mt-1">اترك الحقل فارغاً لإخفاء الأيقونة من الموقع</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Instagram</Label>
            <Input
              value={d.social.instagram}
              onChange={(e) => setSocial("instagram", e.target.value)}
              dir="ltr"
              placeholder="https://instagram.com/..."
            />
          </div>
          <div>
            <Label>Snapchat</Label>
            <Input
              value={d.social.snapchat}
              onChange={(e) => setSocial("snapchat", e.target.value)}
              dir="ltr"
              placeholder="https://snapchat.com/add/..."
            />
          </div>
          <div>
            <Label>TikTok</Label>
            <Input
              value={d.social.tiktok}
              onChange={(e) => setSocial("tiktok", e.target.value)}
              dir="ltr"
              placeholder="https://tiktok.com/@..."
            />
          </div>
          <div>
            <Label>X (Twitter)</Label>
            <Input
              value={d.social.x}
              onChange={(e) => setSocial("x", e.target.value)}
              dir="ltr"
              placeholder="https://x.com/..."
            />
          </div>
        </div>
      </div>

      <Button onClick={() => save(form ?? d)} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Save className="h-4 w-4 ml-2" />}
        حفظ
      </Button>
    </div>
  );
};

// ─── Notifications Section ───
const NotificationsSection = () => {
  const { data, isLoading, save, saving } = useSetting("notifications", DEFAULT_NOTIFICATION_PREFS);
  const [form, setForm] = useState<any>(null);
  const d = form ?? data;

  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin mx-auto" />;

  const items = [
    { key: "order_new", label: "طلب جديد" },
    { key: "order_status", label: "تغيير حالة الطلب" },
    { key: "driver_assigned", label: "تعيين مندوب" },
    { key: "low_stock", label: "نفاد المخزون" },
    { key: "new_complaint", label: "شكوى جديدة" },
    { key: "sound_enabled", label: "تفعيل الصوت" },
  ];

  return (
    <div className="space-y-4">
      {items.map(item => (
        <div key={item.key} className="flex items-center justify-between py-2 border-b last:border-0">
          <span className="text-sm">{item.label}</span>
          <div className="flex items-center gap-2">
            {item.key === "sound_enabled" && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  unlockNotificationAudio();
                  if (!d.sound_enabled) return;
                  playNotificationSound();
                }}
              >
                تجربة
              </Button>
            )}
            <Switch checked={d[item.key]} onCheckedChange={v => setForm({ ...d, [item.key]: v })} />
          </div>
        </div>
      ))}
      <Button onClick={() => save(form ?? d)} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Save className="h-4 w-4 ml-2" />}
        حفظ
      </Button>
    </div>
  );
};

// ─── Security Section ───
const SecuritySection = () => {
  const { data, isLoading, save, saving } = useSetting("security", {
    require_email_verification: true,
    max_login_attempts: 5,
    session_timeout_hours: 24,
    allow_guest_checkout: false,
  });
  const [form, setForm] = useState<any>(null);
  const d = form ?? data;

  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin mx-auto" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between py-2 border-b">
        <span className="text-sm">تأكيد البريد الإلكتروني عند التسجيل</span>
        <Switch checked={d.require_email_verification} onCheckedChange={v => setForm({ ...d, require_email_verification: v })} />
      </div>
      <div className="flex items-center justify-between py-2 border-b">
        <span className="text-sm">السماح بالشراء بدون حساب</span>
        <Switch checked={d.allow_guest_checkout} onCheckedChange={v => setForm({ ...d, allow_guest_checkout: v })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label>عدد محاولات الدخول القصوى</Label><Input type="number" value={d.max_login_attempts} onChange={e => setForm({ ...d, max_login_attempts: Number(e.target.value) })} /></div>
        <div><Label>مدة الجلسة (ساعات)</Label><Input type="number" value={d.session_timeout_hours} onChange={e => setForm({ ...d, session_timeout_hours: Number(e.target.value) })} /></div>
      </div>
      <Button onClick={() => save(form ?? d)} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Save className="h-4 w-4 ml-2" />}
        حفظ
      </Button>
    </div>
  );
};

// ─── Checkout features (payments + national address) ───
const CheckoutFeaturesSection = () => {
  const { data, isLoading, save, saving } = useSetting(CHECKOUT_FEATURES_KEY, DEFAULT_CHECKOUT_FEATURES);
  const [form, setForm] = useState<any>(null);
  const d = form ?? data;

  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin mx-auto" />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        عند الإيقاف تبقى أيقونة الدفع الإلكتروني أو العنوان الوطني ظاهرة للعميل لكنها غير قابلة للنقر —
        مفيد أثناء تأخير الربط مع شركة المدفوعات أو مزوّد العنوان الوطني.
      </p>
      <div className="flex items-center justify-between py-2 border-b gap-4">
        <div>
          <p className="text-sm font-medium">الدفع الإلكتروني</p>
          <p className="text-xs text-muted-foreground">مدى / فيزا / STC Pay / أبل باي في صفحة الدفع</p>
        </div>
        <Switch
          checked={!!d.online_payment_enabled}
          onCheckedChange={(v) => setForm({ ...d, online_payment_enabled: v })}
        />
      </div>
      <div className="flex items-center justify-between py-2 border-b gap-4">
        <div>
          <p className="text-sm font-medium">العنوان الوطني المختصر</p>
          <p className="text-xs text-muted-foreground">إدخال الرمز الوطني في الخريطة والدفع</p>
        </div>
        <Switch
          checked={!!d.national_address_enabled}
          onCheckedChange={(v) => setForm({ ...d, national_address_enabled: v })}
        />
      </div>
      <Button onClick={() => save(form ?? d)} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Save className="h-4 w-4 ml-2" />}
        حفظ
      </Button>
    </div>
  );
};

// ─── Main Page ───
const AdminSettingsPage = () => {
  const [openSection, setOpenSection] = useState<string | null>(null);
  const navigate = useNavigate();

  const dialogSections = [
    { key: "store", icon: Store, title: "بيانات المتجر", desc: "اسم المتجر، الشركة، واتساب، السجل التجاري، وروابط التواصل للفوتر", component: StoreInfoSection },
    { key: "checkout", icon: CreditCard, title: "الدفع والعنوان الوطني", desc: "تفعيل أو إيقاف الدفع الإلكتروني والعنوان الوطني للعملاء", component: CheckoutFeaturesSection },
    { key: "pos", icon: MonitorSmartphone, title: "كاشير سنام السحابي", desc: "تفعيل الكاشير، الضريبة، الأتمتة، وتقرير آخر اليوم", component: PosFeaturesSection },
    { key: "preparer", icon: PackageCheck, title: "محضّر الطلبات", desc: "تفعيل مرحلة التجهيز قبل المندوب وإنشاء حسابات المحضّرين", component: PreparerFeaturesSection },
    { key: "pos_integrations", icon: Link2, title: "توافق أنظمة الكاشير الخارجية", desc: "أودو، لوايرس، فودكس، قيود وغيرها — للمزامنة بدل الاستبدال", component: PosIntegrationsSection },
    { key: "users", icon: Users, title: "مستخدمو الموقع والصلاحيات", desc: "مدير، محاسب، مخزون، وشكاوى — بدون مدراء الفروع والمناديب", component: AdminUsersSection },
    { key: "activity", icon: ScrollText, title: "سجل العمليات", desc: "متابعة إجراءات المدراء والمستخدمين — يُحذف بعد 48 ساعة", component: AdminActivityLogSection },
    { key: "notifications", icon: Bell, title: "الإشعارات", desc: "إعدادات التنبيهات والإشعارات الفورية", component: NotificationsSection },
    { key: "security", icon: Shield, title: "الأمان", desc: "تأكيد البريد، محاولات الدخول، مدة الجلسة، والشراء بدون حساب", component: SecuritySection },
  ];

  const linkCards = [
    {
      key: "home_layout",
      icon: LayoutTemplate,
      title: "الصفحة الرئيسية",
      desc: "ترتيب أقسام الصفحة الرئيسية واللافتات والمقاطع التسويقية",
      href: "/admin/home",
    },
    { key: "email_logs", icon: Mail, title: "سجل البريد الإلكتروني", desc: "متابعة رسائل الإرسال والحالة والأخطاء", href: "/admin/email-logs" },
  ];

  const cards = [
    ...dialogSections.slice(0, 7),
    ...linkCards,
    ...dialogSections.slice(7),
  ];

  return (
    <AdminLayout title="الإعدادات">
      <div className="grid gap-4 md:grid-cols-2">
        {cards.map((s) => (
          <Card
            key={s.key}
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => {
              if ("href" in s && s.href) navigate(s.href);
              else setOpenSection(s.key);
            }}
          >
            <CardHeader className="flex flex-row items-center gap-3">
              <s.icon className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">{s.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{s.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {dialogSections.map((s) => (
        <Dialog key={s.key} open={openSection === s.key} onOpenChange={(open) => !open && setOpenSection(null)}>
          <DialogContent
            className={`${s.key === "activity" || s.key === "pos_integrations" || s.key === "store" ? "max-w-4xl" : "max-w-2xl"} max-h-[90vh] overflow-y-auto`}
            dir="rtl"
            onPointerDownOutside={(e) => {
              if (document.querySelector("[data-add-staff-dialog]")) e.preventDefault();
            }}
            onFocusOutside={(e) => {
              if (document.querySelector("[data-add-staff-dialog]")) e.preventDefault();
            }}
            onInteractOutside={(e) => {
              if (document.querySelector("[data-add-staff-dialog]")) e.preventDefault();
            }}
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <s.icon className="h-5 w-5 text-primary" />
                {s.title}
              </DialogTitle>
            </DialogHeader>
            <SettingsDialogCloseContext.Provider value={() => setOpenSection(null)}>
              <s.component />
            </SettingsDialogCloseContext.Provider>
          </DialogContent>
        </Dialog>
      ))}
    </AdminLayout>
  );
};

export default AdminSettingsPage;
