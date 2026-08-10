import { useState, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Users, Search, Ban, CheckCircle, Trash2, Percent, Mail, Phone,
  ShoppingCart, Eye, Filter, RefreshCcw,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

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
  order_count?: number;
  total_spent?: number;
}

const AdminCustomersPage = () => {
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerProfile | null>(null);
  const [discountDialog, setDiscountDialog] = useState(false);
  const [discountValue, setDiscountValue] = useState(0);
  const [detailDialog, setDetailDialog] = useState(false);
  const [customerOrders, setCustomerOrders] = useState<any[]>([]);

  const fetchCustomers = async () => {
    setLoading(true);
    // Get all profiles (admins have policy to view all)
    const { data: profiles } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (!profiles) { setLoading(false); return; }

    // Get order stats per user
    const { data: orders } = await supabase
      .from("orders")
      .select("user_id, total");

    const orderStats: Record<string, { count: number; total: number }> = {};
    orders?.forEach(o => {
      if (!o.user_id) return;
      if (!orderStats[o.user_id]) orderStats[o.user_id] = { count: 0, total: 0 };
      orderStats[o.user_id].count++;
      orderStats[o.user_id].total += Number(o.total);
    });

    const enriched = profiles.map(p => ({
      ...p,
      status: (p as any).status || "active",
      discount_percent: (p as any).discount_percent || 0,
      order_count: orderStats[p.user_id]?.count || 0,
      total_spent: orderStats[p.user_id]?.total || 0,
    }));

    setCustomers(enriched);
    setLoading(false);
  };

  useEffect(() => { fetchCustomers(); }, []);

  const filtered = customers.filter(c => {
    const matchSearch = !search ||
      c.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.phone?.includes(search) ||
      c.user_id?.includes(search);
    const matchStatus = statusFilter === "all" || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleStatusChange = async (customer: CustomerProfile, newStatus: string) => {
    const { error } = await supabase
      .from("profiles")
      .update({ status: newStatus } as any)
      .eq("user_id", customer.user_id);
    if (error) {
      toast.error("فشل تحديث الحالة");
    } else {
      toast.success(newStatus === "active" ? "تم تنشيط العميل" : "تم تعليق العميل");
      fetchCustomers();
    }
  };

  const handleDeleteCustomer = async (customer: CustomerProfile) => {
    const { error } = await supabase
      .from("profiles")
      .delete()
      .eq("user_id", customer.user_id);
    if (error) {
      toast.error("فشل حذف العميل: " + error.message);
    } else {
      toast.success("تم حذف العميل");
      fetchCustomers();
    }
  };

  const handleSaveDiscount = async () => {
    if (!selectedCustomer) return;
    const { error } = await supabase
      .from("profiles")
      .update({ discount_percent: discountValue } as any)
      .eq("user_id", selectedCustomer.user_id);
    if (error) {
      toast.error("فشل حفظ الخصم");
    } else {
      toast.success(`تم تعيين خصم ${discountValue}%`);
      setDiscountDialog(false);
      fetchCustomers();
    }
  };

  const handleViewDetails = async (customer: CustomerProfile) => {
    setSelectedCustomer(customer);
    const { data } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("user_id", customer.user_id)
      .order("created_at", { ascending: false })
      .limit(10);
    setCustomerOrders(data || []);
    setDetailDialog(true);
  };

  return (
    <AdminLayout title="إدارة العملاء">
      <div className="space-y-4">
        {/* Filters */}
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
                  <SelectItem value="active">نشط</SelectItem>
                  <SelectItem value="suspended">معلّق</SelectItem>
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

        {/* Customer List */}
        {loading ? (
          <div className="space-y-2">
            {[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-2 opacity-30" />
              لا يوجد عملاء
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map(customer => (
              <Card key={customer.id} className="hover:border-primary/20 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    {/* Info */}
                    <div className="flex-1 min-w-[200px]">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-sm">{customer.full_name || "بدون اسم"}</span>
                        <Badge variant={customer.status === "active" ? "default" : "destructive"} className="text-[10px]">
                          {customer.status === "active" ? "نشط" : "معلّق"}
                        </Badge>
                        {customer.discount_percent > 0 && (
                          <Badge variant="secondary" className="text-[10px]">
                            <Percent className="h-3 w-3 ml-0.5" />{customer.discount_percent}%
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {customer.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />{customer.phone}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <ShoppingCart className="h-3 w-3" />{customer.order_count} طلب
                        </span>
                        <span className="font-medium text-foreground">
                          {customer.total_spent?.toFixed(0)} ر.س
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleViewDetails(customer)} title="تفاصيل">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8"
                        onClick={() => { setSelectedCustomer(customer); setDiscountValue(customer.discount_percent); setDiscountDialog(true); }}
                        title="خصم"
                      >
                        <Percent className="h-4 w-4" />
                      </Button>
                      {customer.status === "active" ? (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-orange-500" onClick={() => handleStatusChange(customer, "suspended")} title="تعليق">
                          <Ban className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600" onClick={() => handleStatusChange(customer, "active")} title="تنشيط">
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="حذف">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent dir="rtl">
                          <AlertDialogHeader>
                            <AlertDialogTitle>حذف العميل</AlertDialogTitle>
                            <AlertDialogDescription>
                              هل أنت متأكد من حذف {customer.full_name}؟ لا يمكن التراجع عن هذا الإجراء.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>إلغاء</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeleteCustomer(customer)} className="bg-destructive text-destructive-foreground">
                              حذف
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Discount Dialog */}
        <Dialog open={discountDialog} onOpenChange={setDiscountDialog}>
          <DialogContent dir="rtl" className="max-w-sm">
            <DialogHeader>
              <DialogTitle>تعيين خصم للعميل</DialogTitle>
              <DialogDescription>{selectedCustomer?.full_name}</DialogDescription>
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

        {/* Detail Dialog */}
        <Dialog open={detailDialog} onOpenChange={setDetailDialog}>
          <DialogContent dir="rtl" className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>تفاصيل العميل</DialogTitle>
              <DialogDescription>{selectedCustomer?.full_name || "بدون اسم"}</DialogDescription>
            </DialogHeader>
            {selectedCustomer && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">الجوال:</span>
                    <p className="font-medium">{selectedCustomer.phone || "—"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">المدينة:</span>
                    <p className="font-medium">{selectedCustomer.city || "—"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">الحالة:</span>
                    <Badge variant={selectedCustomer.status === "active" ? "default" : "destructive"}>
                      {selectedCustomer.status === "active" ? "نشط" : "معلّق"}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">الخصم:</span>
                    <p className="font-medium">{selectedCustomer.discount_percent}%</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">عدد الطلبات:</span>
                    <p className="font-medium">{selectedCustomer.order_count}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">إجمالي المشتريات:</span>
                    <p className="font-medium">{selectedCustomer.total_spent?.toFixed(0)} ر.س</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">تاريخ التسجيل:</span>
                    <p className="font-medium">{new Date(selectedCustomer.created_at).toLocaleDateString("ar-SA")}</p>
                  </div>
                </div>

                {customerOrders.length > 0 && (
                  <div>
                    <h4 className="font-bold text-sm mb-2">آخر الطلبات</h4>
                    <div className="space-y-2">
                      {customerOrders.map(order => (
                        <div key={order.id} className="border rounded-lg p-3 text-sm">
                          <div className="flex justify-between mb-1">
                            <span>طلب #{order.order_number}</span>
                            <Badge variant="outline" className="text-[10px]">{order.status}</Badge>
                          </div>
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{new Date(order.created_at).toLocaleDateString("ar-SA")}</span>
                            <span className="font-bold text-foreground">{order.total} ر.س</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default AdminCustomersPage;
