import { useMemo, useState, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Users, Search, Ban, CheckCircle, Trash2, Percent,
  Filter, RefreshCcw, ChevronDown, ShieldOff, Download,
} from "lucide-react";
import * as XLSX from "xlsx";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAdminAuth } from "@/hooks/useAdminAuth";

const STATUS_META: Record<string, { label: string; variant: "default" | "destructive" | "secondary" }> = {
  active: { label: "مفعّل", variant: "default" },
  suspended: { label: "موقوف", variant: "secondary" },
  blocked: { label: "محظور", variant: "destructive" },
};

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "قيد الانتظار",
  assigned: "مُسند",
  preparing: "قيد التجهيز",
  on_the_way: "في الطريق",
  delivered: "تم التوصيل",
  cancelled: "ملغى",
};

interface CustomerProfile {
  id: string;
  user_id: string;
  full_name: string | null;
  phone: string | null;
  city: string | null;
  status: string;
  discount_percent: number;
  created_at: string;
  email?: string;
  national_address?: string | null;
  order_count?: number;
  total_spent?: number;
}

const FieldValue = ({
  label,
  value,
  ltr,
}: {
  label: string;
  value?: string | null;
  ltr?: boolean;
}) => {
  const empty = !value || !String(value).trim();
  return (
    <div className="space-y-1 min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      {empty ? (
        <p className="text-sm font-medium text-muted-foreground">لا يوجد</p>
      ) : ltr ? (
        <p className="text-sm font-medium">
          <span dir="ltr" className="inline-block">{value}</span>
        </p>
      ) : (
        <p className="text-sm font-medium">{value}</p>
      )}
    </div>
  );
};

const EXPORT_COLUMNS = [
  { id: "full_name", label: "الاسم" },
  { id: "phone", label: "الجوال" },
  { id: "email", label: "الإيميل" },
  { id: "national_address", label: "العنوان المختصر" },
  { id: "city", label: "المدينة" },
  { id: "status", label: "الحالة" },
  { id: "discount_percent", label: "نسبة الخصم" },
  { id: "order_count", label: "عدد الطلبات" },
  { id: "total_spent", label: "إجمالي المشتريات" },
  { id: "created_at", label: "تاريخ التسجيل" },
] as const;

type ExportColumnId = (typeof EXPORT_COLUMNS)[number]["id"];

const customerExportValue = (c: CustomerProfile, col: ExportColumnId): string | number => {
  switch (col) {
    case "full_name":
      return c.full_name?.trim() || "لا يوجد";
    case "phone":
      return c.phone?.trim() || "لا يوجد";
    case "email":
      return c.email?.trim() || "لا يوجد";
    case "national_address":
      return c.national_address?.trim() || "لا يوجد";
    case "city":
      return c.city?.trim() || "لا يوجد";
    case "status":
      return STATUS_META[c.status]?.label || c.status;
    case "discount_percent":
      return Number(c.discount_percent) || 0;
    case "order_count":
      return Number(c.order_count) || 0;
    case "total_spent":
      return Number(c.total_spent?.toFixed(2) ?? 0);
    case "created_at":
      return c.created_at ? new Date(c.created_at).toLocaleDateString("ar-SA") : "لا يوجد";
  }
};

const AdminCustomersPage = () => {
  const { scopedBranchIds } = useAdminAuth();
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerProfile | null>(null);
  const [discountDialog, setDiscountDialog] = useState(false);
  const [discountValue, setDiscountValue] = useState(0);
  const [detailDialog, setDetailDialog] = useState(false);
  const [customerOrders, setCustomerOrders] = useState<any[]>([]);
  const [customerAddresses, setCustomerAddresses] = useState<any[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportCols, setExportCols] = useState<Set<ExportColumnId>>(
    () => new Set(EXPORT_COLUMNS.map((c) => c.id)),
  );

  const fetchCustomers = async () => {
    setLoading(true);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (!profiles) { setLoading(false); return; }

    const { data: staffRoles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["store_admin", "site_admin", "driver", "accountant", "inventory", "support"]);
    const staffIds = new Set((staffRoles || []).map((r) => r.user_id));
    let customerProfiles = profiles.filter((p) => !staffIds.has(p.user_id));

    const { data: orders } = await supabase
      .from("orders")
      .select("user_id, total, national_address, created_at, branch_id");

    const scopedOrders = (orders || []).filter((o) => {
      if (!o.user_id) return false;
      if (scopedBranchIds && scopedBranchIds.length > 0) {
        return o.branch_id && scopedBranchIds.includes(o.branch_id);
      }
      return true;
    });

    if (scopedBranchIds && scopedBranchIds.length > 0) {
      const allowed = new Set(scopedOrders.map((o) => o.user_id as string));
      customerProfiles = customerProfiles.filter((p) => allowed.has(p.user_id));
    }

    const orderStats: Record<string, { count: number; total: number }> = {};
    const nationalByUser = new Map<string, { address: string; at: number }>();
    scopedOrders.forEach(o => {
      if (!o.user_id) return;
      if (!orderStats[o.user_id]) orderStats[o.user_id] = { count: 0, total: 0 };
      orderStats[o.user_id].count++;
      orderStats[o.user_id].total += Number(o.total);
      const na = (o as any).national_address?.trim();
      if (na) {
        const at = new Date(o.created_at).getTime();
        const prev = nationalByUser.get(o.user_id);
        if (!prev || at > prev.at) nationalByUser.set(o.user_id, { address: na, at });
      }
    });

    const { data: emails } = await supabase.rpc("admin_customer_emails");
    const emailByUser = new Map((emails || []).map((r) => [r.user_id, r.email || ""]));

    const enriched = customerProfiles.map(p => ({
      ...p,
      status: (p as any).status || "active",
      discount_percent: (p as any).discount_percent || 0,
      email: (() => {
        const em = emailByUser.get(p.user_id) || "";
        return em.endsWith("@staff.sanam") ? "" : em;
      })(),
      national_address: nationalByUser.get(p.user_id)?.address || null,
      order_count: orderStats[p.user_id]?.count || 0,
      total_spent: orderStats[p.user_id]?.total || 0,
    }));

    setCustomers(enriched);
    setLoading(false);
  };

  useEffect(() => { fetchCustomers(); }, [scopedBranchIds]);

  const filtered = customers.filter(c => {
    const matchSearch = !search ||
      c.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.phone?.includes(search) ||
      c.email?.toLowerCase().includes(search.toLowerCase()) ||
      c.national_address?.toLowerCase().includes(search.toLowerCase()) ||
      c.user_id?.includes(search);
    const matchStatus = statusFilter === "all" || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const selectedCustomers = useMemo(
    () => filtered.filter((c) => selectedIds.has(c.user_id)),
    [filtered, selectedIds],
  );
  const allFilteredSelected = filtered.length > 0 && filtered.every((c) => selectedIds.has(c.user_id));

  const toggleSelect = (userId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(filtered.map((c) => c.user_id)));
  };

  const handleBulkStatus = async (newStatus: string) => {
    const ids = selectedCustomers.map((c) => c.user_id);
    if (ids.length === 0) return;
    const { error } = await supabase
      .from("profiles")
      .update({ status: newStatus } as any)
      .in("user_id", ids);
    if (error) {
      toast.error("فشل تحديث الحالة");
    } else {
      toast.success(newStatus === "active" ? "تم تنشيط الحساب" : "تم حظر الحساب");
      setSelectedIds(new Set());
      fetchCustomers();
    }
  };

  const handleBulkDelete = async () => {
    const ids = selectedCustomers.map((c) => c.user_id);
    if (ids.length === 0) return;
    const { error } = await supabase.from("profiles").delete().in("user_id", ids);
    if (error) {
      toast.error("فشل حذف العميل: " + error.message);
    } else {
      toast.success(ids.length === 1 ? "تم حذف العميل" : `تم حذف ${ids.length} عملاء`);
      setSelectedIds(new Set());
      setDeleteOpen(false);
      fetchCustomers();
    }
  };

  const handleSaveDiscount = async () => {
    const ids = selectedCustomers.map((c) => c.user_id);
    if (ids.length === 0) return;
    const { error } = await supabase
      .from("profiles")
      .update({ discount_percent: discountValue } as any)
      .in("user_id", ids);
    if (error) {
      toast.error("فشل حفظ الخصم");
    } else {
      toast.success(
        ids.length === 1
          ? `تم تعيين خصم ${discountValue}%`
          : `تم تعيين خصم ${discountValue}% لـ ${ids.length} عملاء`,
      );
      setDiscountDialog(false);
      fetchCustomers();
    }
  };

  const handleViewDetails = async (customer: CustomerProfile, e?: { stopPropagation: () => void }) => {
    e?.stopPropagation();
    setSelectedCustomer(customer);
    setDetailDialog(true);
    setDetailsLoading(true);
    setCustomerOrders([]);
    setCustomerAddresses([]);

    const ordersById = new Map<string, any>();
    const pushOrders = (rows: any[] | null) => {
      for (const row of rows || []) ordersById.set(row.id, row);
    };

    const [{ data: byUser, error: userErr }, { data: addresses, error: addrErr }] = await Promise.all([
      supabase
        .from("orders")
        .select("*, order_items(*)")
        .eq("user_id", customer.user_id)
        .order("created_at", { ascending: false }),
      supabase
        .from("user_addresses")
        .select("id, label, address, is_default")
        .eq("user_id", customer.user_id),
    ]);
    if (userErr) toast.error("تعذر تحميل الطلبات: " + userErr.message);
    pushOrders(byUser);

    const phone = customer.phone?.trim();
    const name = customer.full_name?.trim();
    if (phone) {
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .eq("customer_phone", phone)
        .order("created_at", { ascending: false });
      if (error) toast.error("تعذر تحميل طلبات الجوال: " + error.message);
      else pushOrders(data);
    }
    if (name) {
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .eq("customer_name", name)
        .order("created_at", { ascending: false });
      if (error) toast.error("تعذر تحميل طلبات الاسم: " + error.message);
      else pushOrders(data);
    }

    const merged = [...ordersById.values()].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    setCustomerOrders(merged);
    if (addrErr) toast.error("تعذر تحميل العناوين: " + addrErr.message);
    setCustomerAddresses(addresses || []);
    setDetailsLoading(false);
  };

  const noneSelected = selectedIds.size === 0;

  const toggleExportCol = (id: ExportColumnId) => {
    setExportCols((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExportExcel = () => {
    const cols = EXPORT_COLUMNS.filter((c) => exportCols.has(c.id));
    if (cols.length === 0) {
      toast.error("اختر عموداً واحداً على الأقل");
      return;
    }
    const rows = selectedCustomers.map((c) => cols.map((col) => customerExportValue(c, col.id)));
    const sheet = XLSX.utils.aoa_to_sheet([cols.map((c) => c.label), ...rows]);
    sheet["!cols"] = cols.map((c) => ({ wch: Math.max(14, c.label.length + 4) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "العملاء");
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `عملاء_سنام_${stamp}.xlsx`);
    toast.success(`تم تصدير ${selectedCustomers.length} عميل`);
    setExportOpen(false);
  };

  return (
    <AdminLayout title="إدارة العملاء">
      <div className="space-y-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="بحث بالاسم أو الجوال..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pr-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <Filter className="h-4 w-4 ml-2" />
                  <SelectValue placeholder="الحالة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="active">مفعّل</SelectItem>
                  <SelectItem value="blocked">محظور</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={fetchCustomers}>
                <RefreshCcw className="h-4 w-4" />
              </Button>
              <Badge variant="secondary" className="text-xs">
                <Users className="h-3 w-3 ml-1" />
                {filtered.length} عميل
              </Badge>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-2 p-3 bg-primary/10 rounded-xl border border-primary/20">
          <Badge className={selectedIds.size > 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}>
            {selectedIds.size > 0 ? `${selectedIds.size} محدد` : "حدد عميلاً"}
          </Badge>
          <Button
            size="sm"
            variant="outline"
            disabled={noneSelected}
            onClick={() => {
              const first = selectedCustomers[0];
              setDiscountValue(first?.discount_percent || 0);
              setDiscountDialog(true);
            }}
          >
            <Percent className="ml-1 h-4 w-4" />
            خصم
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" disabled={noneSelected}>
                <Ban className="ml-1 h-4 w-4" />
                الحالة
                <ChevronDown className="mr-1 h-3.5 w-3.5 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[10rem]">
              <DropdownMenuItem className="cursor-pointer gap-2 text-green-600 focus:text-green-700 focus:bg-green-50" onClick={() => handleBulkStatus("active")}>
                <CheckCircle className="h-4 w-4" />
                تنشيط
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer gap-2 text-destructive focus:text-destructive" onClick={() => handleBulkStatus("blocked")}>
                <ShieldOff className="h-4 w-4" />
                حظر
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive"
            disabled={noneSelected}
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="ml-1 h-4 w-4" />
            حذف
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={noneSelected}
            onClick={() => setExportOpen(true)}
          >
            <Download className="ml-1 h-4 w-4" />
            تصدير
          </Button>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-2 opacity-30" />
              لا يوجد عملاء
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-xl border overflow-hidden bg-card">
            <div className="grid grid-cols-[auto_minmax(8rem,1.2fr)_minmax(6rem,0.8fr)_minmax(8rem,1fr)_minmax(6rem,0.8fr)_auto_auto] gap-3 items-center px-4 py-2 text-xs font-medium text-muted-foreground bg-muted/40 border-b">
              <Checkbox
                checked={allFilteredSelected}
                onCheckedChange={toggleSelectAll}
                aria-label="تحديد الكل"
              />
              <span>الاسم</span>
              <span className="justify-self-start">الجوال</span>
              <span className="justify-self-start">الإيميل</span>
              <span className="justify-self-start">العنوان المختصر</span>
              <span className="w-full text-start">الحالة</span>
              <span aria-hidden="true" />
            </div>
            <div className="divide-y">
              {filtered.map(customer => {
                const checked = selectedIds.has(customer.user_id);
                const empty = (v?: string | null) => !v || !String(v).trim();
                return (
                  <div
                    key={customer.id}
                    className={`grid grid-cols-[auto_minmax(8rem,1.2fr)_minmax(6rem,0.8fr)_minmax(8rem,1fr)_minmax(6rem,0.8fr)_auto_auto] gap-3 items-center px-4 py-3 hover:bg-muted/30 transition-colors ${checked ? "bg-primary/5" : ""}`}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleSelect(customer.user_id)}
                    />
                    <button type="button" className="min-w-0 text-right" onClick={() => toggleSelect(customer.user_id)}>
                      <p className="font-semibold text-sm truncate">{customer.full_name || "بدون اسم"}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {customer.city || "بدون مدينة"}
                        {customer.discount_percent > 0 ? ` · خصم ${customer.discount_percent}%` : ""}
                      </p>
                    </button>
                    {empty(customer.phone) ? (
                      <span className="text-sm text-muted-foreground justify-self-start">لا يوجد</span>
                    ) : (
                      <span className="text-sm font-medium justify-self-start truncate" dir="ltr">{customer.phone}</span>
                    )}
                    {empty(customer.email) ? (
                      <span className="text-sm text-muted-foreground justify-self-start">لا يوجد</span>
                    ) : (
                      <span className="text-sm font-medium justify-self-start truncate" dir="ltr">{customer.email}</span>
                    )}
                    {empty(customer.national_address) ? (
                      <span className="text-sm text-muted-foreground justify-self-start">لا يوجد</span>
                    ) : (
                      <span className="text-sm font-medium justify-self-start font-mono tracking-wide" dir="ltr">
                        {customer.national_address}
                      </span>
                    )}
                    <div className="w-full flex justify-start">
                      <Badge variant={STATUS_META[customer.status]?.variant || "secondary"} className="text-[10px]">
                        {STATUS_META[customer.status]?.label || customer.status}
                      </Badge>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="justify-self-end h-8"
                      title="سجل العميل والطلبات"
                      onClick={(e) => handleViewDetails(customer, e)}
                    >
                      التفاصيل
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <Dialog open={discountDialog} onOpenChange={setDiscountDialog}>
          <DialogContent dir="rtl" className="max-w-sm">
            <DialogHeader>
              <DialogTitle>تعيين خصم</DialogTitle>
              <DialogDescription>
                سيُطبَّق على {selectedCustomers.length} عميل محدد
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Label>نسبة الخصم (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={discountValue}
                onChange={e => setDiscountValue(Number(e.target.value))}
              />
              <Button onClick={handleSaveDiscount} className="w-full">حفظ الخصم</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={detailDialog} onOpenChange={setDetailDialog}>
          <DialogContent dir="rtl" className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>سجل العميل</DialogTitle>
              <DialogDescription>{selectedCustomer?.full_name || "بدون اسم"}</DialogDescription>
            </DialogHeader>
            {selectedCustomer && (
              <div className="space-y-5">
                <section>
                  <h4 className="font-bold text-sm mb-2">بيانات الحساب</h4>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm rounded-lg border p-4">
                    <FieldValue label="الجوال" value={selectedCustomer.phone} ltr />
                    <FieldValue label="الإيميل" value={selectedCustomer.email} ltr />
                    <FieldValue label="العنوان المختصر" value={selectedCustomer.national_address} ltr />
                    <FieldValue label="المدينة" value={selectedCustomer.city} />
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-xs text-muted-foreground">الحالة</p>
                      <Badge variant={STATUS_META[selectedCustomer.status]?.variant || "secondary"}>
                        {STATUS_META[selectedCustomer.status]?.label || selectedCustomer.status}
                      </Badge>
                    </div>
                    <FieldValue label="خصم الحساب" value={`${selectedCustomer.discount_percent}%`} />
                    <FieldValue
                      label="تاريخ التسجيل"
                      value={new Date(selectedCustomer.created_at).toLocaleDateString("ar-SA")}
                    />
                    <FieldValue
                      label="إجمالي المشتريات"
                      value={`${selectedCustomer.total_spent?.toFixed(0) ?? 0} ر.س · ${selectedCustomer.order_count ?? 0} طلب`}
                    />
                  </div>
                </section>

                {customerAddresses.length > 0 && (
                  <section>
                    <h4 className="font-bold text-sm mb-2">عناوين التوصيل</h4>
                    <div className="space-y-2">
                      {customerAddresses.map((addr) => (
                        <div key={addr.id} className="rounded-lg border p-3 text-sm">
                          <p className="font-medium">
                            {addr.label === "home" ? "المنزل" : addr.label === "work" ? "العمل" : addr.label || "عنوان"}
                            {addr.is_default ? " · افتراضي" : ""}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">{addr.address}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {detailsLoading ? (
                  <div className="flex justify-center py-6">
                    <RefreshCcw className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    <section>
                      <h4 className="font-bold text-sm mb-2">المشتريات</h4>
                      {(() => {
                        const purchased = new Map<string, { qty: number; total: number }>();
                        for (const order of customerOrders) {
                          for (const item of order.order_items || []) {
                            const cur = purchased.get(item.product_name) || { qty: 0, total: 0 };
                            cur.qty += Number(item.quantity) || 0;
                            cur.total += Number(item.total_price) || 0;
                            purchased.set(item.product_name, cur);
                          }
                        }
                        const rows = [...purchased.entries()].sort((a, b) => b[1].total - a[1].total);
                        if (rows.length === 0) {
                          return <p className="text-sm text-muted-foreground">لا توجد مشتريات مسجّلة لهذا العميل في الطلبات</p>;
                        }
                        return (
                          <div className="rounded-lg border overflow-hidden">
                            {rows.map(([name, info]) => (
                              <div key={name} className="flex justify-between gap-3 px-3 py-2 text-sm border-b last:border-0">
                                <span>{name} × {info.qty}</span>
                                <span className="font-medium shrink-0">{info.total.toFixed(2)} ر.س</span>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </section>

                    <section>
                      <h4 className="font-bold text-sm mb-2">الطلبات</h4>
                      {customerOrders.length === 0 ? (
                        <p className="text-sm text-muted-foreground">لا توجد طلبات مسجّلة لهذا العميل في النظام</p>
                      ) : (
                        <div className="space-y-2">
                          {customerOrders.map((order) => (
                            <div key={order.id} className="border rounded-lg p-3 text-sm space-y-2">
                              <div className="flex justify-between items-center gap-2">
                                <span className="font-medium">طلب #{order.order_number}</span>
                                <Badge variant="outline" className="text-[10px]">
                                  {ORDER_STATUS_LABELS[order.status] || order.status}
                                </Badge>
                              </div>
                              <div className="flex justify-between text-xs text-muted-foreground">
                                <span>{new Date(order.created_at).toLocaleDateString("ar-SA")}</span>
                                <span>{order.payment_method === "cash" ? "كاش" : "إلكتروني"}</span>
                              </div>
                              {(order.order_items || []).map((item: any) => (
                                <div key={item.id} className="flex justify-between text-xs">
                                  <span>{item.product_name} × {item.quantity}</span>
                                  <span>{Number(item.total_price).toFixed(2)} ر.س</span>
                                </div>
                              ))}
                              {Number(order.discount_amount) > 0 && (
                                <div className="flex justify-between text-xs text-green-700">
                                  <span>خصم ({Number(order.discount_percent)}%)</span>
                                  <span>−{Number(order.discount_amount).toFixed(2)} ر.س</span>
                                </div>
                              )}
                              <div className="flex justify-between font-bold border-t pt-2">
                                <span>الإجمالي</span>
                                <span>{Number(order.total).toFixed(2)} ر.س</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  </>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={exportOpen} onOpenChange={setExportOpen}>
          <DialogContent dir="rtl" className="max-w-md">
            <DialogHeader>
              <DialogTitle>تصدير بيانات العملاء</DialogTitle>
              <DialogDescription>
                اختر الأعمدة ثم صدّر {selectedCustomers.length} عميل محدداً إلى ملف Excel.
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setExportCols(new Set(EXPORT_COLUMNS.map((c) => c.id)))}
              >
                تحديد الكل
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setExportCols(new Set())}>
                إلغاء التحديد
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {EXPORT_COLUMNS.map((col) => (
                <label key={col.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer hover:bg-muted/40">
                  <Checkbox
                    checked={exportCols.has(col.id)}
                    onCheckedChange={() => toggleExportCol(col.id)}
                  />
                  {col.label}
                </label>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setExportOpen(false)}>إلغاء</Button>
              <Button onClick={handleExportExcel} disabled={exportCols.size === 0}>
                <Download className="h-4 w-4 ml-1" />
                تصدير Excel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>حذف العميل</AlertDialogTitle>
              <AlertDialogDescription>
                {selectedCustomers.length === 1
                  ? `هل أنت متأكد من حذف ${selectedCustomers[0].full_name || "هذا العميل"}؟ لا يمكن التراجع.`
                  : `هل أنت متأكد من حذف ${selectedCustomers.length} عملاء؟ لا يمكن التراجع.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground">
                حذف
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AdminLayout>
  );
};

export default AdminCustomersPage;
