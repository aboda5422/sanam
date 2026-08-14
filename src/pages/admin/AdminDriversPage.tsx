import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Loader2, Star, Plus, Truck, Users, Wallet, MapPin, Search,
  UserPlus, Ban, CheckCircle, Trash2, ArrowLeftRight, Eye, Phone, Mail
} from "lucide-react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { applyBranchFilter, writeBranchId } from "@/lib/branch-scope";
import DriversMap from "@/components/admin/DriversMap";

/* ─── KPI Cards ─── */
const KPICards = ({ drivers, wallets }: { drivers: any[]; wallets: any[] }) => {
  const total = drivers?.length ?? 0;
  const active = drivers?.filter((d) => d.status === "active").length ?? 0;
  const available = drivers?.filter((d) => d.is_available).length ?? 0;
  const totalEarnings = wallets?.reduce((s, w) => s + Number(w.total_collected), 0) ?? 0;
  const totalCommission = wallets?.reduce((s, w) => s + Number(w.total_commission), 0) ?? 0;

  const cards = [
    { label: "إجمالي المناديب", value: total, icon: Users, color: "text-blue-600 bg-blue-50" },
    { label: "نشط", value: active, icon: CheckCircle, color: "text-green-600 bg-green-50" },
    { label: "متاح الآن", value: available, icon: Truck, color: "text-emerald-600 bg-emerald-50" },
    { label: "إجمالي التحصيل", value: `${totalEarnings.toFixed(0)} ر.س`, icon: Wallet, color: "text-amber-600 bg-amber-50" },
    { label: "إجمالي العمولات", value: `${totalCommission.toFixed(0)} ر.س`, icon: Wallet, color: "text-purple-600 bg-purple-50" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
      {cards.map((c) => (
        <Card key={c.label} className="border-0 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`p-2 rounded-xl ${c.color}`}><c.icon className="h-5 w-5" /></div>
            <div>
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className="text-lg font-bold">{c.value}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

/* ─── Add Driver Dialog ─── */
const AddDriverDialog = ({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) => {
  const qc = useQueryClient();
  const { scopedBranchIds, filterBranchId } = useAdminAuth();
  const [form, setForm] = useState({
    username: "",
    password: "",
    full_name: "",
    phone: "",
    id_number: "",
    vehicle_type: "car",
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!form.full_name.trim() || !form.username.trim() || !form.password.trim()) {
        throw new Error("الاسم الكامل واسم المستخدم وكلمة المرور مطلوبة");
      }
      if (form.password.trim().length < 6) {
        throw new Error("كلمة المرور يجب ألا تقل عن 6 أحرف");
      }
      const bid = writeBranchId(filterBranchId, scopedBranchIds);
      if (!bid) throw new Error("اختر فرعاً من أعلى الصفحة قبل إضافة مندوب");
      const { data, error } = await supabase.rpc("create_driver", {
        p_full_name: form.full_name.trim(),
        p_username: form.username.trim(),
        p_password: form.password,
        p_phone: form.phone.trim() || undefined,
        p_id_number: form.id_number.trim() || undefined,
        p_vehicle_type: form.vehicle_type,
        p_branch_id: bid,
      });
      if (error) throw error;
      const payload = data as { success?: boolean } | null;
      if (!payload?.success) throw new Error("فشل في إنشاء الحساب");
    },
    onSuccess: () => {
      toast.success("تم إضافة المندوب بنجاح");
      qc.invalidateQueries({ queryKey: ["admin-drivers"] });
      onOpenChange(false);
      setForm({ username: "", password: "", full_name: "", phone: "", id_number: "", vehicle_type: "car" });
    },
    onError: (e: any) => toast.error(e.message || "فشل في إضافة المندوب"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader><DialogTitle>إضافة مندوب جديد</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>الاسم الكامل *</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
          <div>
            <Label>اسم المستخدم *</Label>
            <Input
              dir="ltr"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              autoComplete="off"
            />
          </div>
          <div>
            <Label>كلمة المرور *</Label>
            <Input
              type="password"
              dir="ltr"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              autoComplete="new-password"
            />
          </div>
          <div><Label>رقم الجوال</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><Label>رقم الهوية</Label><Input value={form.id_number} onChange={(e) => setForm({ ...form, id_number: e.target.value })} /></div>
          <div>
            <Label>نوع المركبة</Label>
            <Select value={form.vehicle_type} onValueChange={(v) => setForm({ ...form, vehicle_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="car">سيارة</SelectItem>
                <SelectItem value="motorcycle">دراجة نارية</SelectItem>
                <SelectItem value="bicycle">دراجة هوائية</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button className="w-full" onClick={() => addMutation.mutate()} disabled={addMutation.isPending || !form.username.trim() || !form.password.trim() || !form.full_name.trim()}>
            {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <UserPlus className="h-4 w-4 ml-2" />}
            إضافة المندوب
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

/* ─── Order Assignment Section ─── */
const OrderAssignment = () => {
  const qc = useQueryClient();
  const { scopedBranchIds } = useAdminAuth();

  const { data: pendingOrders } = useQuery({
    queryKey: ["pending-orders-for-assign", scopedBranchIds],
    queryFn: async () => {
      let q = supabase.from("orders").select("*").in("status", ["pending", "assigned"]).order("created_at", { ascending: false });
      q = applyBranchFilter(q, scopedBranchIds);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 5000,
  });

  const { data: activeDrivers } = useQuery({
    queryKey: ["active-drivers-for-assign", scopedBranchIds],
    queryFn: async () => {
      if (scopedBranchIds && scopedBranchIds.length > 0) {
        const { data: links, error: le } = await supabase
          .from("driver_branches" as any)
          .select("driver_id")
          .in("branch_id", scopedBranchIds);
        if (le) throw le;
        const ids = [...new Set((links || []).map((r: any) => r.driver_id))];
        if (!ids.length) return [];
        const { data, error } = await supabase.from("drivers").select("id, full_name, phone, is_available, status").eq("status", "active").in("id", ids);
        if (error) throw error;
        return data || [];
      }
      const { data, error } = await supabase.from("drivers").select("id, full_name, phone, is_available, status").eq("status", "active");
      if (error) throw error;
      return data || [];
    },
  });

  const assignMutation = useMutation({
    mutationFn: async ({ orderId, driverId }: { orderId: string; driverId: string }) => {
      const { error } = await supabase.from("orders").update({
        driver_id: driverId,
        status: "assigned" as any,
        assigned_at: new Date().toISOString(),
      }).eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تعيين الطلب للمندوب");
      qc.invalidateQueries({ queryKey: ["pending-orders-for-assign"] });
    },
  });

  const transferMutation = useMutation({
    mutationFn: async ({ orderId, newDriverId }: { orderId: string; newDriverId: string }) => {
      const { error } = await supabase.from("orders").update({
        driver_id: newDriverId,
        assigned_at: new Date().toISOString(),
      }).eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تحويل الطلب");
      qc.invalidateQueries({ queryKey: ["pending-orders-for-assign"] });
    },
  });

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    assigned: "bg-blue-100 text-blue-800",
    preparing: "bg-orange-100 text-orange-800",
    on_the_way: "bg-indigo-100 text-indigo-800",
  };

  const statusLabels: Record<string, string> = {
    pending: "بانتظار التعيين",
    assigned: "معين لمندوب",
    preparing: "قيد التجهيز",
    on_the_way: "في الطريق",
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        الطلبات الجديدة تظهر هنا. إذا لم يتم تعيين مندوب خلال 15 ثانية، يظهر الطلب لجميع المناديب تلقائياً.
      </p>
      {(!pendingOrders || pendingOrders.length === 0) ? (
        <div className="text-center py-12 text-muted-foreground">لا توجد طلبات تحتاج تعيين</div>
      ) : (
        <div className="space-y-3">
          {pendingOrders.map((order) => (
            <Card key={order.id} className="border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">طلب #{order.order_number}</span>
                    <Badge className={statusColors[order.status] || ""}>{statusLabels[order.status] || order.status}</Badge>
                  </div>
                  <span className="text-sm text-muted-foreground">{Number(order.total).toFixed(2)} ر.س</span>
                </div>
                <div className="text-sm text-muted-foreground mb-3">
                  {order.customer_name} • {order.delivery_address?.slice(0, 40)}...
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Select onValueChange={(driverId) => {
                    if (order.driver_id) {
                      transferMutation.mutate({ orderId: order.id, newDriverId: driverId });
                    } else {
                      assignMutation.mutate({ orderId: order.id, driverId });
                    }
                  }}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder={order.driver_id ? "تحويل لمندوب آخر" : "تعيين مندوب"} />
                    </SelectTrigger>
                    <SelectContent>
                      {activeDrivers?.filter((d) => d.id !== order.driver_id).map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {(d as any).full_name || d.phone || d.id.slice(0, 8)}
                          {d.is_available && " ✅"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {order.driver_id && (
                    <Badge variant="outline" className="gap-1">
                      <ArrowLeftRight className="h-3 w-3" />
                      معين لمندوب
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

/* ─── Wallets Tab ─── */
const WalletsTab = () => {
  const { data: wallets, isLoading } = useQuery({
    queryKey: ["admin-wallets"],
    queryFn: async () => {
      const { data, error } = await supabase.from("driver_wallet").select("*, drivers(phone, full_name, user_id)").order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const qc = useQueryClient();

  const settleMutation = useMutation({
    mutationFn: async ({ walletId, driverId, amount, type }: { walletId: string; driverId: string; amount: number; type: "cash" | "card" }) => {
      // Record transaction
      await supabase.from("wallet_transactions").insert({
        driver_id: driverId,
        type: "settlement" as any,
        amount,
        notes: type === "cash" ? "تسليم نقدي" : "تحويل عبر الشبكة",
      });
      // Reset balance
      await supabase.from("driver_wallet").update({ balance: 0 } as any).eq("id", walletId);
    },
    onSuccess: () => {
      toast.success("تم تسوية الرصيد");
      qc.invalidateQueries({ queryKey: ["admin-wallets"] });
    },
  });

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">المبالغ النقدية تبقى في حوزة المندوب حتى يتم تسليمها. الدفع عبر الشبكة يترحّل تلقائياً.</p>
      <div className="bg-card rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/30">
              <th className="text-right p-3 font-medium">المندوب</th>
              <th className="text-right p-3 font-medium">الرصيد (نقدي بحوزته)</th>
              <th className="text-right p-3 font-medium">إجمالي التحصيل</th>
              <th className="text-right p-3 font-medium">العمولات</th>
              <th className="text-right p-3 font-medium">نسبة العمولة</th>
              <th className="text-center p-3 font-medium">تسوية</th>
            </tr></thead>
            <tbody>
              {wallets?.map((w) => (
                <tr key={w.id} className="border-b last:border-0 hover:bg-muted/10">
                  <td className="p-3 font-medium">{(w.drivers as any)?.full_name || (w.drivers as any)?.phone || w.driver_id.slice(0, 8)}</td>
                  <td className="p-3 font-bold text-amber-600">{Number(w.balance).toFixed(2)} ر.س</td>
                  <td className="p-3">{Number(w.total_collected).toFixed(2)} ر.س</td>
                  <td className="p-3">{Number(w.total_commission).toFixed(2)} ر.س</td>
                  <td className="p-3">{(Number(w.commission_rate) * 100).toFixed(0)}%</td>
                  <td className="p-3 text-center">
                    {Number(w.balance) > 0 && (
                      <div className="flex gap-1 justify-center">
                        <Button size="sm" variant="outline" className="text-xs h-7 gap-1"
                          onClick={() => settleMutation.mutate({ walletId: w.id, driverId: w.driver_id, amount: Number(w.balance), type: "cash" })}>
                          💵 كاش
                        </Button>
                        <Button size="sm" variant="outline" className="text-xs h-7 gap-1"
                          onClick={() => settleMutation.mutate({ walletId: w.id, driverId: w.driver_id, amount: Number(w.balance), type: "card" })}>
                          💳 شبكة
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {(!wallets || wallets.length === 0) && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">لا توجد محافظ</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

/* ─── Main Page ─── */
const AdminDriversPage = () => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [occupancyFilter, setOccupancyFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<any>(null);
  const qc = useQueryClient();
  const { scopedBranchIds } = useAdminAuth();

  const { data: drivers, isLoading } = useQuery({
    queryKey: ["admin-drivers", scopedBranchIds],
    queryFn: async () => {
      if (scopedBranchIds && scopedBranchIds.length > 0) {
        const { data: links, error: le } = await supabase
          .from("driver_branches" as any)
          .select("driver_id")
          .in("branch_id", scopedBranchIds);
        if (le) throw le;
        const ids = [...new Set((links || []).map((r: any) => r.driver_id))];
        if (!ids.length) return [];
        const { data, error } = await supabase.from("drivers").select("*").in("id", ids).order("created_at", { ascending: false });
        if (error) throw error;
        return data || [];
      }
      const { data, error } = await supabase.from("drivers").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: wallets } = useQuery({
    queryKey: ["admin-wallets"],
    queryFn: async () => {
      const { data, error } = await supabase.from("driver_wallet").select("*");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: activeAssignments } = useQuery({
    queryKey: ["admin-drivers-active-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("driver_id")
        .not("driver_id", "is", null)
        .in("status", ["assigned", "preparing", "on_the_way"]);
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 8000,
  });

  const busyDriverIds = new Set(
    (activeAssignments || []).map((o) => o.driver_id).filter(Boolean) as string[],
  );

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("drivers").update({ status } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تحديث الحالة");
      qc.invalidateQueries({ queryKey: ["admin-drivers"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("drivers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم حذف المندوب");
      qc.invalidateQueries({ queryKey: ["admin-drivers"] });
    },
  });

  const filtered = drivers?.filter((d) => {
    const matchSearch = !search || (d as any).full_name?.includes(search) || d.phone?.includes(search);
    const isActive = (d as any).status === "active";
    const matchStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && isActive) ||
      (statusFilter === "inactive" && !isActive);
    const hasOrder = busyDriverIds.has(d.id);
    const matchOccupancy =
      occupancyFilter === "all" ||
      (occupancyFilter === "busy" && hasOrder) ||
      (occupancyFilter === "free" && !hasOrder);
    return matchSearch && matchStatus && matchOccupancy;
  });

  return (
    <AdminLayout title="إدارة المناديب">
      <KPICards drivers={drivers || []} wallets={wallets || []} />

      <Tabs defaultValue="drivers" dir="rtl">
        <TabsList className="mb-4 w-full justify-start">
          <TabsTrigger value="drivers" className="gap-1"><Users className="h-4 w-4" />المناديب</TabsTrigger>
          <TabsTrigger value="orders" className="gap-1"><ArrowLeftRight className="h-4 w-4" />توزيع الطلبات</TabsTrigger>
          <TabsTrigger value="tracking" className="gap-1"><MapPin className="h-4 w-4" />تتبع المناديب</TabsTrigger>
          <TabsTrigger value="wallets" className="gap-1"><Wallet className="h-4 w-4" />المحافظ والعمولات</TabsTrigger>
        </TabsList>

        {/* ─── Drivers Tab ─── */}
        <TabsContent value="drivers">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="بحث بالاسم أو الجوال..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36"><SelectValue placeholder="الحالة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="active">مفعل</SelectItem>
                <SelectItem value="inactive">غير مفعل</SelectItem>
              </SelectContent>
            </Select>
            <Select value={occupancyFilter} onValueChange={setOccupancyFilter}>
              <SelectTrigger className="w-36"><SelectValue placeholder="التوفر" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="busy">شاغر</SelectItem>
                <SelectItem value="free">متوفر</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => setAddOpen(true)} className="gap-1"><Plus className="h-4 w-4" />إضافة مندوب</Button>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : (
            <div className="bg-card rounded-xl border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-muted/30">
                    <th className="text-right p-3 font-medium">المندوب</th>
                    <th className="text-right p-3 font-medium">الجوال</th>
                    <th className="text-right p-3 font-medium">البريد</th>
                    <th className="text-center p-3 font-medium">التقييم</th>
                    <th className="text-center p-3 font-medium">التوصيلات</th>
                    <th className="text-center p-3 font-medium">الحالة</th>
                    <th className="text-center p-3 font-medium">التوفر</th>
                    <th className="text-center p-3 font-medium">إجراءات</th>
                  </tr></thead>
                  <tbody>
                    {filtered?.map((d) => (
                      <tr key={d.id} className="border-b last:border-0 hover:bg-muted/10">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            {(d as any).avatar_url ? (
                              <img src={(d as any).avatar_url} className="h-8 w-8 rounded-full object-cover" />
                            ) : (
                              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                                {((d as any).full_name || "م")[0]}
                              </div>
                            )}
                            <span className="font-medium">{(d as any).full_name || d.user_id.slice(0, 8)}</span>
                          </div>
                        </td>
                        <td className="p-3 text-muted-foreground">{d.phone || "—"}</td>
                        <td className="p-3 text-muted-foreground text-xs">{(d as any).email || "—"}</td>
                        <td className="p-3 text-center">
                          <span className="inline-flex items-center gap-1">
                            <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />{Number(d.rating).toFixed(1)}
                          </span>
                        </td>
                        <td className="p-3 text-center">{d.total_deliveries}</td>
                        <td className="p-3 text-center">
                          <Badge variant={(d as any).status === "active" ? "default" : "secondary"}>
                            {(d as any).status === "active" ? "مفعل" : "غير مفعل"}
                          </Badge>
                        </td>
                        <td className="p-3 text-center">
                          <Badge variant={busyDriverIds.has(d.id) ? "outline" : "secondary"}>
                            {busyDriverIds.has(d.id) ? "شاغر" : "متوفر"}
                          </Badge>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex gap-1 justify-center">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setSelectedDriver(d)}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            {(d as any).status === "active" ? (
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-amber-600" onClick={() => updateStatusMutation.mutate({ id: d.id, status: "suspended" })}>
                                <Ban className="h-3.5 w-3.5" />
                              </Button>
                            ) : (
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600" onClick={() => updateStatusMutation.mutate({ id: d.id, status: "active" })}>
                                <CheckCircle className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600" onClick={() => {
                              if (confirm("هل أنت متأكد من حذف هذا المندوب؟")) deleteMutation.mutate(d.id);
                            }}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {(!filtered || filtered.length === 0) && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">لا يوجد مناديب</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ─── Order Assignment Tab ─── */}
        <TabsContent value="orders">
          <OrderAssignment />
        </TabsContent>

        {/* ─── Tracking Tab ─── */}
        <TabsContent value="tracking">
          <div className="h-[calc(100vh-350px)] rounded-xl overflow-hidden">
            <DriversMap />
          </div>
        </TabsContent>

        {/* ─── Wallets Tab ─── */}
        <TabsContent value="wallets">
          <WalletsTab />
        </TabsContent>
      </Tabs>

      <AddDriverDialog open={addOpen} onOpenChange={setAddOpen} />

      {/* Driver Details Dialog */}
      <Dialog open={!!selectedDriver} onOpenChange={() => setSelectedDriver(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader><DialogTitle>بيانات المندوب</DialogTitle></DialogHeader>
          {selectedDriver && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                {(selectedDriver as any).avatar_url ? (
                  <img src={(selectedDriver as any).avatar_url} className="h-16 w-16 rounded-full object-cover" />
                ) : (
                  <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-xl font-bold text-primary">
                    {((selectedDriver as any).full_name || "م")[0]}
                  </div>
                )}
                <div>
                  <h3 className="font-bold text-lg">{(selectedDriver as any).full_name || "بدون اسم"}</h3>
                  <Badge variant={(selectedDriver as any).status === "active" ? "default" : "destructive"}>
                    {(selectedDriver as any).status === "active" ? "نشط" : "معلق"}
                  </Badge>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" />{selectedDriver.phone || "—"}</div>
                <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" />{(selectedDriver as any).email || "—"}</div>
                <div><span className="text-muted-foreground">الهوية:</span> {(selectedDriver as any).id_number || "—"}</div>
                <div><span className="text-muted-foreground">المركبة:</span> {selectedDriver.vehicle_type || "—"}</div>
                <div><span className="text-muted-foreground">التقييم:</span> ⭐ {Number(selectedDriver.rating).toFixed(1)}</div>
                <div><span className="text-muted-foreground">التوصيلات:</span> {selectedDriver.total_deliveries}</div>
                <div><span className="text-muted-foreground">الأرباح:</span> {Number(selectedDriver.total_earnings).toFixed(2)} ر.س</div>
                <div><span className="text-muted-foreground">متاح:</span> {selectedDriver.is_available ? "نعم ✅" : "لا ❌"}</div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminDriversPage;
