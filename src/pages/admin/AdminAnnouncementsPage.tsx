import { useState, useEffect, useCallback } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Megaphone,
  Plus,
  Pencil,
  Trash2,
  LayoutTemplate,
  Smartphone,
  MessageCircle,
  Ban,
  Loader2,
  Bell,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { applyBranchFilter, writeBranchId } from "@/lib/branch-scope";
import ImageUpload from "@/components/admin/ImageUpload";

type PromoKind = "banner" | "popup" | "push";

interface Announcement {
  id: string;
  title: string;
  content: string | null;
  is_active: boolean;
  sort_order: number;
  bg_color: string;
  kind: PromoKind;
  image_url: string | null;
  cta_label: string | null;
  cta_url: string | null;
  created_at: string;
}

type CreateMode = "banner" | "popup" | "push" | "whatsapp" | null;

const emptyBanner = { title: "", content: "", is_active: true, bg_color: "primary" };
const emptyRich = {
  title: "",
  content: "",
  is_active: true,
  bg_color: "primary",
  image_url: "",
  cta_label: "",
  cta_url: "",
};

const AdminAnnouncementsPage = () => {
  const { scopedBranchIds, filterBranchId } = useAdminAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [createMode, setCreateMode] = useState<CreateMode>(null);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [bannerForm, setBannerForm] = useState(emptyBanner);
  const [richForm, setRichForm] = useState(emptyRich);
  const [saving, setSaving] = useState(false);

  // WhatsApp
  const [waMessage, setWaMessage] = useState("");
  const [waMedia, setWaMedia] = useState("");
  const [waMediaName, setWaMediaName] = useState("");
  const [subscribers, setSubscribers] = useState<{ phone: string; user_id: string; full_name: string | null }[]>([]);
  const [blacklist, setBlacklist] = useState<{ id: string; phone: string; reason: string | null }[]>([]);
  const [blacklistPhone, setBlacklistPhone] = useState("");
  const [blacklistReason, setBlacklistReason] = useState("");
  const [waLoading, setWaLoading] = useState(false);

  const fetchAnnouncements = useCallback(async () => {
    setLoading(true);
    let q = (supabase as any)
      .from("announcements")
      .select("*")
      .order("sort_order", { ascending: true });
    q = applyBranchFilter(q, scopedBranchIds);
    const { data } = await q;
    setAnnouncements(
      (data || []).map((r: any) => ({
        ...r,
        kind: (r.kind || "banner") as PromoKind,
      })),
    );
    setLoading(false);
  }, [scopedBranchIds]);

  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  const loadWhatsAppData = async () => {
    setWaLoading(true);
    try {
      const bid = writeBranchId(filterBranchId, scopedBranchIds);
      const [{ data: phones, error: phonesErr }, { data: bl, error: blErr }] = await Promise.all([
        supabase.rpc("list_whatsapp_subscriber_phones" as any, { p_branch_id: bid || null }),
        (supabase as any).from("whatsapp_blacklist").select("id, phone, reason").order("created_at", { ascending: false }),
      ]);
      if (phonesErr) throw phonesErr;
      if (blErr) throw blErr;
      setSubscribers((phones as any) || []);
      setBlacklist(bl || []);
    } catch (e: any) {
      toast.error(e.message || "تعذر تحميل أرقام المشتركين");
      setSubscribers([]);
    } finally {
      setWaLoading(false);
    }
  };

  useEffect(() => {
    if (createMode === "whatsapp") loadWhatsAppData();
  }, [createMode, filterBranchId, scopedBranchIds]);

  const requireBranch = () => {
    const bid = writeBranchId(filterBranchId, scopedBranchIds);
    if (!bid) {
      toast.error("اختر فرعاً من أعلى الصفحة أولاً");
      return null;
    }
    return bid;
  };

  const handleSaveBanner = async () => {
    if (!bannerForm.title.trim()) {
      toast.error("العنوان مطلوب");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const { error } = await (supabase as any)
          .from("announcements")
          .update({ ...bannerForm, kind: "banner" })
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("تم تحديث الشعار");
      } else {
        const bid = requireBranch();
        if (!bid) return;
        const { error } = await (supabase as any).from("announcements").insert({
          ...bannerForm,
          kind: "banner",
          sort_order: announcements.filter((a) => a.kind === "banner").length,
          branch_id: bid,
        });
        if (error) throw error;
        toast.success("تم إضافة الشعار");
      }
      setCreateMode(null);
      setEditing(null);
      setBannerForm(emptyBanner);
      fetchAnnouncements();
    } catch (e: any) {
      toast.error(e.message || "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRich = async (kind: "popup" | "push") => {
    if (!richForm.title.trim()) {
      toast.error("العنوان مطلوب");
      return;
    }
    if (kind === "popup" && !richForm.image_url.trim()) {
      toast.error("أضف صورة للإعلان المنبثق");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: richForm.title,
        content: richForm.content || null,
        is_active: richForm.is_active,
        bg_color: richForm.bg_color || "primary",
        kind,
        image_url: richForm.image_url || null,
        cta_label: richForm.cta_label || null,
        cta_url: richForm.cta_url || null,
      };
      if (editing) {
        const { error } = await (supabase as any).from("announcements").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("تم التحديث");
      } else {
        const bid = requireBranch();
        if (!bid) return;
        const { data: inserted, error } = await (supabase as any)
          .from("announcements")
          .insert({
            ...payload,
            sort_order: announcements.filter((a) => a.kind === kind).length,
            branch_id: bid,
          })
          .select("id")
          .maybeSingle();
        if (error) throw error;
        toast.success(kind === "popup" ? "تم حفظ الإعلان المنبثق" : "تم حفظ إشعار الجوال");

        if (kind === "push") {
          const { data: sendRes, error: sendErr } = await supabase.functions.invoke("send-fcm-push", {
            body: {
              title: richForm.title,
              body: richForm.content || "",
              image_url: richForm.image_url || null,
              cta_url: richForm.cta_url || "/",
              branch_id: bid,
              announcement_id: inserted?.id || null,
              use_topic: true,
            },
          });
          if (sendErr) {
            toast.error("حُفظ الإشعار لكن فشل الإرسال: " + sendErr.message);
          } else if (sendRes?.error) {
            toast.error("حُفظ الإشعار لكن فشل الإرسال: " + sendRes.error);
          } else {
            toast.success(
              `تم الإرسال · نجاح ${sendRes?.success_count ?? 0} / أهداف ${sendRes?.target_count ?? 0}`,
            );
          }
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification(richForm.title, {
              body: richForm.content || undefined,
              icon: richForm.image_url || "/sanam-logo.png",
            });
          }
        }
      }
      setCreateMode(null);
      setEditing(null);
      setRichForm(emptyRich);
      fetchAnnouncements();
    } catch (e: any) {
      toast.error(e.message || "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await (supabase as any).from("announcements").delete().eq("id", id);
    if (error) {
      toast.error("فشل الحذف");
      return;
    }
    toast.success("تم الحذف");
    fetchAnnouncements();
  };

  const handleToggle = async (ann: Announcement) => {
    await (supabase as any).from("announcements").update({ is_active: !ann.is_active }).eq("id", ann.id);
    fetchAnnouncements();
  };

  const openEdit = (ann: Announcement) => {
    setEditing(ann);
    if (ann.kind === "banner") {
      setBannerForm({
        title: ann.title,
        content: ann.content || "",
        is_active: ann.is_active,
        bg_color: ann.bg_color,
      });
      setCreateMode("banner");
    } else {
      setRichForm({
        title: ann.title,
        content: ann.content || "",
        is_active: ann.is_active,
        bg_color: ann.bg_color || "primary",
        image_url: ann.image_url || "",
        cta_label: ann.cta_label || "",
        cta_url: ann.cta_url || "",
      });
      setCreateMode(ann.kind);
    }
  };

  const openNew = (mode: CreateMode) => {
    setEditing(null);
    setBannerForm(emptyBanner);
    setRichForm(emptyRich);
    setWaMessage("");
    setWaMedia("");
    setWaMediaName("");
    setCreateMode(mode);
  };

  const addToBlacklist = async () => {
    const phone = blacklistPhone.trim();
    if (!phone) return;
    const bid = writeBranchId(filterBranchId, scopedBranchIds);
    const { error } = await (supabase as any).from("whatsapp_blacklist").upsert(
      { phone, reason: blacklistReason.trim() || "طلب العميل", branch_id: bid },
      { onConflict: "phone" },
    );
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("أُضيف للقائمة السوداء");
    setBlacklistPhone("");
    setBlacklistReason("");
    loadWhatsAppData();
  };

  const removeBlacklist = async (id: string) => {
    await (supabase as any).from("whatsapp_blacklist").delete().eq("id", id);
    loadWhatsAppData();
  };

  const queueWhatsAppBroadcast = async () => {
    if (!waMessage.trim()) {
      toast.error("اكتب نص الرسالة");
      return;
    }
    const bid = requireBranch();
    if (!bid) return;
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("whatsapp_broadcasts").insert({
        branch_id: bid,
        message: waMessage.trim(),
        media_url: waMedia || null,
        media_name: waMediaName || null,
        status: "queued",
        recipient_count: subscribers.length,
        excluded_count: blacklist.length,
        created_by: auth.user?.id || null,
        error_note:
          "بانتظار مفاتيح واتساب الرسمية — الحملة محفوظة وقائمة الأرقام جاهزة للإرسال لاحقاً",
      });
      if (error) throw error;
      toast.success(
        `تم تجهيز الحملة لـ ${subscribers.length} مشتركاً. سيُفعَّل الإرسال بعد ربط مفاتيح واتساب.`,
      );
      setCreateMode(null);
    } catch (e: any) {
      toast.error(e.message || "تعذر الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const bgOptions = [
    { value: "primary", label: "أخضر", className: "bg-primary text-primary-foreground" },
    { value: "destructive", label: "أحمر", className: "bg-destructive text-destructive-foreground" },
    { value: "warning", label: "برتقالي", className: "bg-orange-500 text-white" },
    { value: "info", label: "أزرق", className: "bg-blue-500 text-white" },
    { value: "dark", label: "داكن", className: "bg-foreground text-background" },
  ];

  const kindLabel: Record<PromoKind, string> = {
    banner: "بانر علوي",
    popup: "منبثق",
    push: "جوال",
  };

  const listByKind = (kind: PromoKind) => announcements.filter((a) => a.kind === kind);

  return (
    <AdminLayout title="إدارة الشعارات والإعلانات">
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <p className="text-sm text-muted-foreground max-w-xl">
            بانر أعلى الموقع، إعلان منتصف الشاشة، إشعار جوال، ورسائل واتساب جماعية.
          </p>
          <div className="flex flex-wrap gap-2 justify-end">
            <Button onClick={() => openNew("banner")} size="sm">
              <Plus className="h-4 w-4 ml-1" />
              شعار علوي
            </Button>
            <Button onClick={() => openNew("popup")} size="sm" variant="secondary">
              <LayoutTemplate className="h-4 w-4 ml-1" />
              إعلان منبثق
            </Button>
            <Button onClick={() => openNew("push")} size="sm" variant="secondary">
              <Smartphone className="h-4 w-4 ml-1" />
              إشعار جوال
            </Button>
            <Button onClick={() => openNew("whatsapp")} size="sm" variant="outline">
              <MessageCircle className="h-4 w-4 ml-1" />
              واتساب جماعي
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : (
          <Tabs defaultValue="banner" dir="rtl">
            <TabsList className="w-full flex flex-wrap h-auto gap-1">
              <TabsTrigger value="banner" className="flex-1">
                بانر ({listByKind("banner").length})
              </TabsTrigger>
              <TabsTrigger value="popup" className="flex-1">
                منبثق ({listByKind("popup").length})
              </TabsTrigger>
              <TabsTrigger value="push" className="flex-1">
                جوال ({listByKind("push").length})
              </TabsTrigger>
            </TabsList>
            {(["banner", "popup", "push"] as PromoKind[]).map((kind) => (
              <TabsContent key={kind} value={kind} className="space-y-2 mt-3">
                {listByKind(kind).length === 0 ? (
                  <Card>
                    <CardContent className="p-8 text-center text-muted-foreground">
                      <Megaphone className="h-10 w-10 mx-auto mb-2 opacity-30" />
                      لا يوجد محتوى من نوع «{kindLabel[kind]}» بعد
                    </CardContent>
                  </Card>
                ) : (
                  listByKind(kind).map((ann) => {
                    const bgOpt = bgOptions.find((b) => b.value === ann.bg_color) || bgOptions[0];
                    return (
                      <Card key={ann.id} className={!ann.is_active ? "opacity-50" : ""}>
                        <CardContent className="p-4">
                          <div className="flex items-center gap-3">
                            {ann.image_url ? (
                              <img
                                src={ann.image_url}
                                alt=""
                                className="w-14 h-14 rounded-lg object-cover shrink-0"
                              />
                            ) : (
                              <div className={`rounded-lg px-3 py-2 text-sm flex-1 ${bgOpt.className}`}>
                                <span className="font-semibold">{ann.title}</span>
                                {ann.content && <span className="mr-2 opacity-80">{ann.content}</span>}
                              </div>
                            )}
                            {ann.image_url && (
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-sm truncate">{ann.title}</p>
                                {ann.cta_url && (
                                  <p className="text-xs text-muted-foreground truncate" dir="ltr">
                                    {ann.cta_label || "رابط"} → {ann.cta_url}
                                  </p>
                                )}
                              </div>
                            )}
                            <div className="flex items-center gap-2 shrink-0">
                              <Switch checked={ann.is_active} onCheckedChange={() => handleToggle(ann)} />
                              <Badge variant={ann.is_active ? "default" : "secondary"} className="text-[10px]">
                                {ann.is_active ? "مفعّل" : "معطّل"}
                              </Badge>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(ann)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent dir="rtl">
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>حذف؟</AlertDialogTitle>
                                    <AlertDialogDescription>لا يمكن التراجع عن الحذف.</AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDelete(ann.id)}
                                      className="bg-destructive text-destructive-foreground"
                                    >
                                      حذف
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </TabsContent>
            ))}
          </Tabs>
        )}

        {/* Banner dialog */}
        <Dialog open={createMode === "banner"} onOpenChange={(o) => !o && setCreateMode(null)}>
          <DialogContent dir="rtl" className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editing ? "تعديل الشعار العلوي" : "شعار علوي جديد"}</DialogTitle>
              <DialogDescription>يظهر في الشريط أعلى واجهة العميل</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>العنوان</Label>
                <Input
                  value={bannerForm.title}
                  onChange={(e) => setBannerForm((f) => ({ ...f, title: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>نص إضافي</Label>
                <Input
                  value={bannerForm.content}
                  onChange={(e) => setBannerForm((f) => ({ ...f, content: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>لون الخلفية</Label>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {bgOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setBannerForm((f) => ({ ...f, bg_color: opt.value }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium ${opt.className} ${
                        bannerForm.bg_color === opt.value ? "ring-2 ring-offset-2 ring-foreground" : "opacity-70"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={bannerForm.is_active}
                  onCheckedChange={(v) => setBannerForm((f) => ({ ...f, is_active: v }))}
                />
                <Label>مفعّل</Label>
              </div>
              <Button onClick={handleSaveBanner} className="w-full" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? "تحديث" : "إضافة"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Popup / Push dialog */}
        <Dialog
          open={createMode === "popup" || createMode === "push"}
          onOpenChange={(o) => !o && setCreateMode(null)}
        >
          <DialogContent dir="rtl" className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {createMode === "push"
                  ? editing
                    ? "تعديل إشعار الجوال"
                    : "إشعار على شاشة الجوال"
                  : editing
                    ? "تعديل إعلان منبثق"
                    : "إعلان منتصف الشاشة"}
              </DialogTitle>
              <DialogDescription>
                {createMode === "push"
                  ? "يظهر للعميل على شاشة الجهاز إذا فعّل الإشعارات. الربط العميق يأخذ العميل لقسم أو صفحة داخل التطبيق."
                  : "نافذة بصورة وزر يحوّل لرابط داخل الموقع أو التطبيق (مثال: /auth أو /category/cheese)."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>العنوان</Label>
                <Input
                  value={richForm.title}
                  onChange={(e) => setRichForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder={createMode === "push" ? "الحق خصم 50% على الجبن" : "افتتاح فرع جديد"}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>النص</Label>
                <Textarea
                  value={richForm.content}
                  onChange={(e) => setRichForm((f) => ({ ...f, content: e.target.value }))}
                  rows={2}
                  className="mt-1"
                />
              </div>
              {createMode === "popup" && (
                <ImageUpload
                  folder="announcements"
                  label="صورة الإعلان"
                  value={richForm.image_url}
                  onChange={(url) => setRichForm((f) => ({ ...f, image_url: url }))}
                />
              )}
              {createMode === "push" && (
                <ImageUpload
                  folder="announcements"
                  label="صورة الإشعار (اختياري)"
                  value={richForm.image_url}
                  onChange={(url) => setRichForm((f) => ({ ...f, image_url: url }))}
                />
              )}
              <div>
                <Label>نص الزر / الدعوة</Label>
                <Input
                  value={richForm.cta_label}
                  onChange={(e) => setRichForm((f) => ({ ...f, cta_label: e.target.value }))}
                  placeholder="اضغط للتسجيل"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>رابط التحويل داخل التطبيق</Label>
                <Input
                  value={richForm.cta_url}
                  onChange={(e) => setRichForm((f) => ({ ...f, cta_url: e.target.value }))}
                  placeholder="/auth أو /category/slug"
                  dir="ltr"
                  className="mt-1"
                />
              </div>
              {createMode === "push" && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 flex gap-2">
                  <Bell className="h-4 w-4 shrink-0 mt-0.5" />
                  إشعارات الشاشة المقفلة تحتاج لاحقاً مفاتيح FCM/APNs. حالياً يُحفظ الإشعار ويُختبر محلياً إن كانت صلاحية المتصفح ممنوحة.
                </p>
              )}
              <div className="flex items-center gap-2">
                <Switch
                  checked={richForm.is_active}
                  onCheckedChange={(v) => setRichForm((f) => ({ ...f, is_active: v }))}
                />
                <Label>مفعّل</Label>
              </div>
              <Button
                onClick={() => handleSaveRich(createMode === "push" ? "push" : "popup")}
                className="w-full"
                disabled={saving}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? "تحديث" : "حفظ"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* WhatsApp dialog */}
        <Dialog open={createMode === "whatsapp"} onOpenChange={(o) => !o && setCreateMode(null)}>
          <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>رسالة واتساب جماعية</DialogTitle>
              <DialogDescription>
                تُسحب الأرقام من الملفات الشخصية وطلبات العملاء (بما فيها الضيوف)، مع استثناء القائمة السوداء. الإرسال الفعلي بعد مفاتيح واتساب.
              </DialogDescription>
            </DialogHeader>
            {waLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <Label>نص الرسالة</Label>
                  <Textarea
                    value={waMessage}
                    onChange={(e) => setWaMessage(e.target.value)}
                    rows={4}
                    className="mt-1"
                    placeholder="اكتب رسالة الحملة…"
                  />
                </div>
                <ImageUpload
                  folder="announcements"
                  label="مرفق صورة (اختياري)"
                  value={waMedia}
                  onChange={(url) => {
                    setWaMedia(url);
                    setWaMediaName(url ? "مرفق" : "");
                  }}
                />
                <div>
                  <Label className="flex items-center gap-2 mb-2">
                    أرقام المشتركين
                    <Badge variant="secondary">{subscribers.length}</Badge>
                  </Label>
                  <div className="max-h-40 overflow-y-auto rounded-lg border p-2 text-xs space-y-1 bg-muted/20">
                    {subscribers.length === 0 ? (
                      <p className="text-muted-foreground text-center py-4 leading-relaxed">
                        لا أرقام متاحة حالياً.
                        <br />
                        المصدر: أرقام الملفات الشخصية + أرقام الطلبات (بما فيها الضيوف).
                        {filterBranchId ? " تأكد أن فلتر الفرع يشمل طلبات فيها جوال." : ""}
                      </p>
                    ) : (
                      subscribers.slice(0, 100).map((s) => (
                        <div key={s.phone} className="flex justify-between gap-2" dir="ltr">
                          <span>{s.phone}</span>
                          <span className="text-muted-foreground truncate">{s.full_name || ""}</span>
                        </div>
                      ))
                    )}
                    {subscribers.length > 100 && (
                      <p className="text-center text-muted-foreground pt-1">…و{subscribers.length - 100} أخرى</p>
                    )}
                  </div>
                </div>
                <div className="rounded-xl border p-3 space-y-3">
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <Ban className="h-4 w-4" /> القائمة السوداء
                  </p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Input
                      placeholder="رقم الجوال"
                      value={blacklistPhone}
                      onChange={(e) => setBlacklistPhone(e.target.value)}
                      dir="ltr"
                    />
                    <Input
                      placeholder="السبب (طلب العميل)"
                      value={blacklistReason}
                      onChange={(e) => setBlacklistReason(e.target.value)}
                    />
                    <Button type="button" variant="outline" onClick={addToBlacklist}>
                      إضافة
                    </Button>
                  </div>
                  <div className="space-y-1 max-h-28 overflow-y-auto">
                    {blacklist.map((b) => (
                      <div key={b.id} className="flex items-center justify-between text-xs border rounded px-2 py-1">
                        <span dir="ltr">{b.phone}</span>
                        <span className="text-muted-foreground truncate mx-2">{b.reason}</span>
                        <Button variant="ghost" size="sm" className="h-7 text-destructive" onClick={() => removeBlacklist(b.id)}>
                          إزالة
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
                <Button className="w-full" onClick={queueWhatsAppBroadcast} disabled={saving || !subscribers.length}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : `تجهيز الإرسال (${subscribers.length})`}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default AdminAnnouncementsPage;
