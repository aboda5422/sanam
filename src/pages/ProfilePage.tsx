import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { User, Package, MapPin, Mail, Save, Loader2, AlertTriangle, ShoppingCart, Settings, Trash2, ShieldAlert, LogOut, Plus, Pencil, X, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import AddressMapPicker from "@/components/address/AddressMapPicker";
import SavedAddresses from "@/components/address/SavedAddresses";
import { useLanguage } from "@/contexts/LanguageContext";
import { notifyAddressesChanged } from "@/lib/branch";
import { translateError } from "@/lib/error-messages";

const statusMap: Record<string, { label: string; labelEn: string; color: string }> = {
  pending: { label: "قيد الانتظار", labelEn: "Pending", color: "bg-yellow-100 text-yellow-800" },
  assigned: { label: "تم التعيين", labelEn: "Assigned", color: "bg-blue-100 text-blue-800" },
  preparing: { label: "جاري التحضير", labelEn: "Preparing", color: "bg-orange-100 text-orange-800" },
  on_the_way: { label: "في الطريق", labelEn: "On the Way", color: "bg-purple-100 text-purple-800" },
  delivered: { label: "تم التوصيل", labelEn: "Delivered", color: "bg-green-100 text-green-800" },
  cancelled: { label: "ملغي", labelEn: "Cancelled", color: "bg-red-100 text-red-800" },
};

const ProfilePage = () => {
  const navigate = useNavigate();
  const { t, lang } = useLanguage();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("profile");
  const [form, setForm] = useState({ full_name: "", phone: "", address: "", city: "مكة المكرمة" });
  const [editingProfile, setEditingProfile] = useState(false);
  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteBlock, setDeleteBlock] = useState<{ pendingOrders: number; openComplaints: number } | null>(null);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [addressesRefreshKey, setAddressesRefreshKey] = useState(0);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const handleStartDelete = async () => {
    setDeleteOpen(true);
    setDeleteBlock(null);
    setDeleteConfirmed(false);
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("delete-account", { body: {} });
      if (error) throw error;
      if (data?.canDelete === false) {
        setDeleteBlock({ pendingOrders: data.pendingOrders || 0, openComplaints: data.openComplaints || 0 });
      } else {
        setDeleteConfirmed(true);
      }
    } catch (e: any) {
      toast.error(t("تعذر التحقق من الحساب", "Unable to verify account") + ": " + (e?.message || ""));
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  const handleConfirmDelete = async () => {
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("delete-account", { body: { confirm: true } });
      if (error) throw error;
      if (data?.deleted) {
        await supabase.auth.signOut();
        toast.success(t("تم حذف حسابك نهائياً", "Your account has been permanently deleted"));
        navigate("/auth", { replace: true });
      } else if (data?.canDelete === false) {
        setDeleteBlock({ pendingOrders: data.pendingOrders || 0, openComplaints: data.openComplaints || 0 });
        setDeleteConfirmed(false);
      }
    } catch (e: any) {
      toast.error(t("فشل حذف الحساب", "Failed to delete account") + ": " + (e?.message || ""));
    } finally {
      setDeleting(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success(t("تم تسجيل الخروج", "Signed out"));
    navigate("/auth", { replace: true });
  };

  const needsCurrentPassword = Boolean(
    user?.identities?.some((i: { provider?: string }) => i.provider === "email") ||
      user?.app_metadata?.provider === "email" ||
      (Array.isArray(user?.app_metadata?.providers) && user.app_metadata.providers.includes("email"))
  );

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast.error(t("يجب أن تكون كلمة المرور 6 أحرف على الأقل", "Password must be at least 6 characters"));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t("كلمتا المرور غير متطابقتين", "Passwords do not match"));
      return;
    }
    if (needsCurrentPassword && !currentPassword) {
      toast.error(t("أدخل كلمة المرور الحالية", "Enter your current password"));
      return;
    }
    if (!user?.email) {
      toast.error(t("لا يمكن تغيير كلمة المرور لهذا الحساب", "Password cannot be changed for this account"));
      return;
    }
    setSavingPassword(true);
    try {
      if (needsCurrentPassword) {
        const { error: reauth } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: currentPassword,
        });
        if (reauth) throw reauth;
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success(t("تم تحديث كلمة المرور بنجاح", "Password updated successfully"));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowPasswordForm(false);
    } catch (e: any) {
      toast.error(translateError(e?.message || String(e)));
    } finally {
      setSavingPassword(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth"); return; }
      setUser(session.user);

      const [profileRes, ordersRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", session.user.id).maybeSingle(),
        supabase.from("orders").select("*, order_items(*)").eq("user_id", session.user.id).order("created_at", { ascending: false }),
      ]);

      if (profileRes.data) {
        setProfile(profileRes.data);
        setForm({
          full_name: profileRes.data.full_name || session.user.user_metadata?.full_name || "",
          phone: profileRes.data.phone || "",
          address: profileRes.data.address || "",
          city: profileRes.data.city || "مكة المكرمة",
        });
      } else {
        setForm(f => ({ ...f, full_name: session.user.user_metadata?.full_name || "" }));
      }
      setOrders(ordersRes.data || []);
      setLoading(false);
    };
    init();
  }, [navigate]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update(form).eq("user_id", user.id);
    if (error) {
      toast.error("فشل الحفظ: " + error.message);
    } else {
      setProfile((p: any) => ({ ...(p || {}), ...form }));
      setEditingProfile(false);
      toast.success(t("تم حفظ البيانات بنجاح", "Profile saved successfully"));
    }
    setSaving(false);
  };

  const handleCancelOrder = async () => {
    if (!cancelOrderId || !cancelReason.trim()) {
      toast.error(t("يرجى كتابة سبب الإلغاء", "Please provide a cancellation reason"));
      return;
    }
    setCancelling(true);
    const { error } = await supabase.from("orders").update({
      status: "cancelled" as any,
      notes: cancelReason.trim(),
    }).eq("id", cancelOrderId);

    if (error) {
      toast.error(t("فشل إلغاء الطلب", "Failed to cancel order"));
    } else {
      toast.success(t("تم إلغاء الطلب بنجاح", "Order cancelled successfully"));
      setOrders(prev => prev.map(o => o.id === cancelOrderId ? { ...o, status: "cancelled", notes: cancelReason } : o));
    }
    setCancelOrderId(null);
    setCancelReason("");
    setCancelling(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 container py-8 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" dir={lang === "ar" ? "rtl" : "ltr"}>
      <Header />
      <main className="flex-1 container py-6 max-w-3xl">
        <h1 className="font-heading font-bold text-2xl mb-6 flex items-center gap-2">
          <User className="h-6 w-6 text-primary" />
          {t("حسابي", "My Account")}
        </h1>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="space-y-4"
          dir={lang === "ar" ? "rtl" : "ltr"}
        >
          <TabsList className="!grid h-10 w-full grid-cols-4">
            <TabsTrigger value="profile">{t("الملف الشخصي", "Profile")}</TabsTrigger>
            <TabsTrigger value="addresses">{t("عناويني", "Addresses")}</TabsTrigger>
            <TabsTrigger value="orders">{t("طلباتي", "Orders")} ({orders.length})</TabsTrigger>
            <TabsTrigger value="settings">{t("الإعدادات", "Settings")}</TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-lg text-start">{t("البيانات الشخصية", "Personal Info")}</CardTitle>
                  {!editingProfile && (
                    <button
                      type="button"
                      onClick={() => setEditingProfile(true)}
                      className="shrink-0 rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-primary transition-colors"
                      aria-label={t("تعديل", "Edit")}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4" dir={lang === "ar" ? "rtl" : "ltr"}>
                <div>
                  <Label className="text-start block">{t("البريد الإلكتروني", "Email")}</Label>
                  <div className="mt-1 flex items-center gap-2 rounded-md bg-muted p-2.5 text-sm text-muted-foreground">
                    <Mail className="h-4 w-4 shrink-0" />
                    <span dir="ltr" className="min-w-0 flex-1 text-start">
                      {user?.email}
                    </span>
                  </div>
                </div>

                {editingProfile ? (
                  <>
                    <div>
                      <Label className="text-start block">{t("الاسم الكامل", "Full Name")}</Label>
                      <Input
                        value={form.full_name}
                        onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                        className="mt-1 text-start"
                        dir={lang === "ar" ? "rtl" : "ltr"}
                      />
                    </div>
                    <div>
                      <Label className="text-start block">{t("رقم الجوال", "Phone")}</Label>
                      <Input
                        value={form.phone}
                        onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                        placeholder="05xxxxxxxx"
                        dir="ltr"
                        className={`mt-1 ${lang === "ar" ? "text-right" : "text-left"}`}
                      />
                    </div>
                    <div>
                      <Label className="text-start block">{t("المدينة", "City")}</Label>
                      <select
                        dir={lang === "ar" ? "rtl" : "ltr"}
                        value={form.city === "Makkah" || form.city === "مكة المكرمة" ? "مكة المكرمة" : form.city === "Riyadh" || form.city === "الرياض" ? "الرياض" : form.city}
                        onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                        className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-start"
                      >
                        <option value="مكة المكرمة">{t("مكة المكرمة", "Makkah")}</option>
                        <option value="الرياض">{t("الرياض", "Riyadh")}</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleSave} disabled={saving} className="flex-1 gap-2">
                        {saving ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {t("جاري الحفظ...", "Saving...")}
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4" />
                            {t("حفظ البيانات", "Save")}
                          </>
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={saving}
                        className="gap-2"
                        onClick={() => {
                          setForm({
                            full_name: profile?.full_name || user?.user_metadata?.full_name || "",
                            phone: profile?.phone || "",
                            address: profile?.address || "",
                            city: profile?.city || "مكة المكرمة",
                          });
                          setEditingProfile(false);
                        }}
                      >
                        <X className="h-4 w-4" />
                        {t("إلغاء", "Cancel")}
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    {[
                      { key: "full_name", label: t("الاسم الكامل", "Full Name"), value: form.full_name },
                      { key: "phone", label: t("رقم الجوال", "Phone"), value: form.phone, ltr: true },
                      {
                        key: "city",
                        label: t("المدينة", "City"),
                        value:
                          form.city === "Riyadh" || form.city === "الرياض"
                            ? t("الرياض", "Riyadh")
                            : form.city === "Makkah" || form.city === "مكة المكرمة" || !form.city
                              ? t("مكة المكرمة", "Makkah")
                              : form.city,
                      },
                    ].map((row) => (
                      <div key={row.key} className="min-w-0 text-start">
                        <p className="text-xs text-muted-foreground">{row.label}</p>
                        <p className="mt-0.5 text-sm font-medium">
                          {row.value?.trim() ? (
                            row.ltr ? (
                              <span dir="ltr" className="inline-block">
                                {row.value}
                              </span>
                            ) : (
                              row.value
                            )
                          ) : (
                            t("غير محدد", "Not set")
                          )}
                        </p>
                      </div>
                    ))}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Addresses Tab */}
          <TabsContent value="addresses">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-primary" />
                  {t("عناويني المحفوظة", "Saved Addresses")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {user && (
                  <SavedAddresses
                    onSelect={() => {}}
                    onAddNew={() => setShowAddAddress(true)}
                    showAddButton={false}
                    refreshKey={addressesRefreshKey}
                  />
                )}

                {showAddAddress ? (
                  <div className="border-t pt-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold">{t("إضافة عنوان جديد", "Add New Address")}</h3>
                      <Button variant="ghost" size="sm" onClick={() => setShowAddAddress(false)}>
                        {t("إلغاء", "Cancel")}
                      </Button>
                    </div>
                    <AddressMapPicker
                      onAddressSelected={async (addr) => {
                        if (!user) return;
                        const { count } = await supabase
                          .from("user_addresses")
                          .select("id", { count: "exact", head: true })
                          .eq("user_id", user.id);
                        const { error } = await supabase.from("user_addresses").insert({
                          user_id: user.id,
                          label: addr.label,
                          address: addr.address,
                          lat: addr.lat,
                          lng: addr.lng,
                          national_address: addr.national_address || null,
                          is_default: (count || 0) === 0,
                        });
                        if (error) {
                          toast.error(t("فشل حفظ العنوان", "Failed to save address"));
                        } else {
                          toast.success(t("تم حفظ العنوان بنجاح! يمكنك الآن التسوق", "Address saved! You can now start shopping"));
                          setShowAddAddress(false);
                          setAddressesRefreshKey((k) => k + 1);
                          notifyAddressesChanged();
                        }
                      }}
                    />
                  </div>
                ) : (
                  <Button variant="outline" className="w-full gap-2" onClick={() => setShowAddAddress(true)}>
                    <Plus className="h-4 w-4" />
                    {t("إضافة عنوان جديد", "Add New Address")}
                  </Button>
                )}

                <Button onClick={() => navigate("/")} variant="outline" className="w-full gap-2">
                  <ShoppingCart className="h-4 w-4" />
                  {t("متابعة التسوق", "Continue Shopping")}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Orders Tab */}
          <TabsContent value="orders">
            {orders.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Package className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">{t("لا توجد طلبات بعد", "No orders yet")}</p>
                  <Button variant="outline" className="mt-4" onClick={() => navigate("/")}>{t("تسوّق الآن", "Shop Now")}</Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {/* Active Orders */}
                {orders.filter(o => !["delivered", "cancelled"].includes(o.status)).length > 0 && (
                  <div>
                    <h3 className="font-heading font-bold text-sm mb-3 text-primary">{t("طلبات نشطة", "Active Orders")}</h3>
                    <div className="space-y-3">
                      {orders.filter(o => !["delivered", "cancelled"].includes(o.status)).map(order => {
                        const status = statusMap[order.status] || statusMap.pending;
                        return (
                          <Card key={order.id} className="overflow-hidden cursor-pointer hover:border-primary/30 transition-colors border-primary/20">
                            <CardContent className="p-4">
                              <div className="flex items-center justify-between mb-3" onClick={() => navigate(`/order/${order.id}`)}>
                                <div>
                                  <span className="font-bold text-sm">{t("طلب", "Order")} #{order.order_number}</span>
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {new Date(order.created_at).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                  </p>
                                </div>
                                <Badge className={`${status.color} border-0 text-xs`}>{lang === "ar" ? status.label : status.labelEn}</Badge>
                              </div>
                              {order.order_items?.length > 0 && (
                                <div className="space-y-1.5 mb-3" onClick={() => navigate(`/order/${order.id}`)}>
                                  {order.order_items.slice(0, 3).map((item: any) => (
                                    <div key={item.id} className="flex justify-between text-sm">
                                      <span>{item.product_name} × {item.quantity}</span>
                                      <span className="font-medium">{item.total_price} {t("ر.س", "SAR")}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <div className="flex items-center justify-between pt-2 border-t">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-primary font-medium cursor-pointer" onClick={() => navigate(`/order/${order.id}`)}>{t("تتبع الطلب ←", "Track Order →")}</span>
                                  {order.status === "pending" && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setCancelOrderId(order.id); }}
                                      className="text-xs text-destructive hover:underline"
                                    >
                                      {t("إلغاء", "Cancel")}
                                    </button>
                                  )}
                                </div>
                                <span className="font-bold text-primary">{order.total} {t("ر.س", "SAR")}</span>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Past Orders */}
                {orders.filter(o => ["delivered", "cancelled"].includes(o.status)).length > 0 && (
                  <div>
                    <h3 className="font-heading font-bold text-sm mb-3 text-muted-foreground">{t("طلبات سابقة", "Past Orders")}</h3>
                    <div className="space-y-3">
                      {orders.filter(o => ["delivered", "cancelled"].includes(o.status)).map(order => {
                        const status = statusMap[order.status] || statusMap.pending;
                        return (
                          <Card key={order.id} className="overflow-hidden hover:border-primary/30 transition-colors">
                            <CardContent className="p-4">
                              <div className="flex items-center justify-between mb-3">
                                <div className="cursor-pointer flex-1" onClick={() => navigate(`/order/${order.id}`)}>
                                  <span className="font-bold text-sm">{t("طلب", "Order")} #{order.order_number}</span>
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {new Date(order.created_at).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge className={`${status.color} border-0 text-xs`}>{lang === "ar" ? status.label : status.labelEn}</Badge>
                                  {order.status === "delivered" && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); navigate(`/complaints?order=${order.id}`); }}
                                      className="w-8 h-8 rounded-full bg-destructive/10 text-destructive flex items-center justify-center hover:bg-destructive/20 transition-colors"
                                      title={t("تقديم شكوى", "File Complaint")}
                                    >
                                      <AlertTriangle className="h-4 w-4" />
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center justify-between pt-2 border-t cursor-pointer" onClick={() => navigate(`/order/${order.id}`)}>
                                <span className="text-sm text-muted-foreground">{t("عرض التفاصيل", "View Details")}</span>
                                <span className="font-bold text-primary">{order.total} {t("ر.س", "SAR")}</span>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Settings className="h-5 w-5 text-primary" />
                    {t("الإعدادات", "Settings")}
                  </CardTitle>
                  <div className="flex flex-wrap items-center justify-end gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowPasswordForm((v) => !v)}
                      className="flex items-center gap-2 text-sm text-primary hover:opacity-80 transition-opacity"
                    >
                      <KeyRound className="h-4 w-4" />
                      <span>{t("تعديل كلمة المرور", "Change password")}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex items-center gap-2 text-sm text-destructive hover:opacity-80 transition-opacity"
                      aria-label={t("تسجيل الخروج", "Sign out")}
                    >
                      <LogOut className="h-4 w-4" />
                      <span>{t("تسجيل الخروج", "Sign out")}</span>
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {showPasswordForm && (
                  <div className="rounded-xl border p-4 space-y-3">
                    <h3 className="font-bold text-sm">{t("تعديل كلمة المرور", "Change password")}</h3>
                    {needsCurrentPassword && (
                      <div>
                        <Label>{t("كلمة المرور الحالية", "Current password")}</Label>
                        <Input
                          type="password"
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          className="mt-1"
                          dir="ltr"
                          autoComplete="current-password"
                        />
                      </div>
                    )}
                    <div>
                      <Label>{t("كلمة المرور الجديدة", "New password")}</Label>
                      <Input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="mt-1"
                        dir="ltr"
                        autoComplete="new-password"
                        minLength={6}
                      />
                    </div>
                    <div>
                      <Label>{t("تأكيد كلمة المرور", "Confirm password")}</Label>
                      <Input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="mt-1"
                        dir="ltr"
                        autoComplete="new-password"
                        minLength={6}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleChangePassword} disabled={savingPassword} className="flex-1 gap-2">
                        {savingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                        {t("حفظ كلمة المرور", "Save password")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={savingPassword}
                        onClick={() => {
                          setShowPasswordForm(false);
                          setCurrentPassword("");
                          setNewPassword("");
                          setConfirmPassword("");
                        }}
                      >
                        {t("إلغاء", "Cancel")}
                      </Button>
                    </div>
                  </div>
                )}

                <div className="border border-destructive/30 bg-destructive/5 rounded-xl p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <ShieldAlert className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h3 className="font-bold text-sm">{t("حذف الحساب", "Delete Account")}</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {t(
                          "سيتم حذف حسابك وجميع بياناتك نهائياً (العناوين، الطلبات السابقة، الشكاوى، الملف الشخصي). لا يمكن التراجع عن هذه العملية.",
                          "Your account and all related data (addresses, past orders, complaints, profile, etc.) will be permanently deleted. This action cannot be undone."
                        )}
                      </p>
                    </div>
                  </div>
                  <Button variant="destructive" onClick={handleStartDelete} className="w-full gap-2">
                    <Trash2 className="h-4 w-4" />
                    {t("حذف حسابي", "Delete My Account")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
      <Footer />

      {/* Delete Account Dialog */}
      {deleteOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => !deleting && setDeleteOpen(false)}>
          <div className="bg-card rounded-xl p-6 max-w-sm w-full space-y-4" onClick={e => e.stopPropagation()} dir={lang === "ar" ? "rtl" : "ltr"}>
            {deleting && !deleteBlock && !deleteConfirmed ? (
              <div className="text-center py-6">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                <p className="text-sm text-muted-foreground mt-3">{t("جاري التحقق من حسابك...", "Verifying your account...")}</p>
              </div>
            ) : deleteBlock ? (
              <>
                <div className="text-center">
                  <ShieldAlert className="h-10 w-10 mx-auto text-destructive mb-2" />
                  <h3 className="font-heading font-bold text-lg">{t("لا يمكن حذف الحساب حالياً", "Account Deletion Not Available")}</h3>
                </div>
                <p className="text-sm text-muted-foreground text-center">
                  {t("لديك عمليات معلقة يجب إنهاؤها قبل الحذف:", "You have pending items that must be resolved before deletion:")}
                </p>
                <ul className="text-sm space-y-1 bg-muted/30 rounded-lg p-3">
                  {deleteBlock.pendingOrders > 0 && (
                    <li>• {t("طلبات قيد التنفيذ", "Active orders")}: <span className="font-bold">{deleteBlock.pendingOrders}</span></li>
                  )}
                  {deleteBlock.openComplaints > 0 && (
                    <li>• {t("شكاوى مفتوحة", "Open complaints")}: <span className="font-bold">{deleteBlock.openComplaints}</span></li>
                  )}
                </ul>
                <Button variant="outline" onClick={() => setDeleteOpen(false)} className="w-full">
                  {t("حسناً", "OK")}
                </Button>
              </>
            ) : deleteConfirmed ? (
              <>
                <div className="text-center">
                  <Trash2 className="h-10 w-10 mx-auto text-destructive mb-2" />
                  <h3 className="font-heading font-bold text-lg">{t("هل أنت متأكد؟", "Are you sure?")}</h3>
                </div>
                <p className="text-sm text-muted-foreground text-center leading-relaxed">
                  {t(
                    "هل أنت متأكد أنك تريد حذف حسابك نهائياً؟ سيتم حذف جميع بياناتك ولن تتمكن من استعادتها.",
                    "Are you sure you want to permanently delete your account? All your data will be erased and cannot be recovered."
                  )}
                </p>
                <div className="flex gap-2">
                  <Button onClick={handleConfirmDelete} disabled={deleting} variant="destructive" className="flex-1">
                    {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : t("نعم، احذف الحساب", "Yes, Delete")}
                  </Button>
                  <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting} className="flex-1">
                    {t("تراجع", "Cancel")}
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* Cancel Order Dialog */}
      {cancelOrderId && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => { setCancelOrderId(null); setCancelReason(""); }}>
          <div className="bg-card rounded-xl p-6 max-w-sm w-full space-y-4" onClick={e => e.stopPropagation()} dir={lang === "ar" ? "rtl" : "ltr"}>
            <h3 className="font-heading font-bold text-lg text-center">{t("إلغاء الطلب", "Cancel Order")}</h3>
            <p className="text-sm text-muted-foreground text-center">{t("يرجى كتابة سبب الإلغاء", "Please provide a reason for cancellation")}</p>
            <textarea
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              placeholder={t("سبب الإلغاء...", "Reason...")}
              className="w-full border rounded-lg p-3 text-sm resize-none h-24 bg-background"
            />
            <div className="flex gap-2">
              <Button onClick={handleCancelOrder} disabled={cancelling || !cancelReason.trim()} variant="destructive" className="flex-1">
                {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : t("تأكيد الإلغاء", "Confirm Cancel")}
              </Button>
              <Button variant="outline" onClick={() => { setCancelOrderId(null); setCancelReason(""); }} className="flex-1">
                {t("تراجع", "Back")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfilePage;
