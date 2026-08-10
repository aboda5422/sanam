import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Search, Loader2, Eye, XCircle, Undo2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const statusMap: Record<string, { label: string; color: string }> = {
  pending: { label: "بانتظار", color: "bg-yellow-100 text-yellow-800" },
  assigned: { label: "تم التعيين", color: "bg-blue-100 text-blue-800" },
  preparing: { label: "جاري التحضير", color: "bg-orange-100 text-orange-800" },
  on_the_way: { label: "في الطريق", color: "bg-indigo-100 text-indigo-800" },
  delivered: { label: "تم التوصيل", color: "bg-green-100 text-green-800" },
  cancelled: { label: "ملغي", color: "bg-red-100 text-red-800" },
};

const paymentStatusMap: Record<string, { label: string; className: string }> = {
  pending: { label: "معلّق", className: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  paid: { label: "مدفوع", className: "bg-green-100 text-green-800 border-green-300" },
  failed: { label: "فاشل", className: "bg-red-100 text-red-800 border-red-300" },
  refunded: { label: "مسترد", className: "bg-purple-100 text-purple-800 border-purple-300" },
  cancelled: { label: "ملغي", className: "bg-gray-100 text-gray-800 border-gray-300" },
};

const AdminOrdersPage = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [refundOrder, setRefundOrder] = useState<any | null>(null);
  const [refundAmount, setRefundAmount] = useState<string>("");
  const [refunding, setRefunding] = useState(false);

  const { data: orders, isLoading } = useQuery({
    queryKey: ["admin-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: string; notes?: string }) => {
      const update: any = { status: status as any };
      if (notes) update.notes = notes;
      if (status === "delivered") update.delivered_at = new Date().toISOString();
      const { error } = await supabase.from("orders").update(update).eq("id", id);
      if (error) throw error;

      // Trigger "on the way" email via edge function (uses service role to fetch email)
      if (status === "on_the_way") {
        supabase.functions
          .invoke("notify-order-status", {
            body: { order_id: id, event: "on_the_way" },
          })
          .catch((err) => console.warn("On-the-way email failed:", err));
      }
      // Trigger "delivered + rate driver" email
      if (status === "delivered") {
        supabase.functions
          .invoke("notify-order-status", {
            body: { order_id: id, event: "delivered" },
          })
          .catch((err) => console.warn("Delivered email failed:", err));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      toast.success("تم تحديث الحالة");
      setCancelOrderId(null);
      setCancelReason("");
    },
    onError: () => toast.error("حدث خطأ"),
  });

  const handleStatusChange = (id: string, status: string) => {
    if (status === "cancelled") {
      setCancelOrderId(id);
    } else {
      updateStatus.mutate({ id, status });
    }
  };

  const handleConfirmCancel = () => {
    if (!cancelOrderId || !cancelReason.trim()) {
      toast.error("يرجى كتابة سبب الإلغاء");
      return;
    }
    updateStatus.mutate({ id: cancelOrderId, status: "cancelled", notes: cancelReason.trim() });
  };

  const handleRefund = async () => {
    if (!refundOrder) return;
    const amt = Number(refundAmount);
    if (!amt || amt <= 0 || amt > Number(refundOrder.total)) {
      toast.error("المبلغ غير صالح");
      return;
    }
    setRefunding(true);
    try {
      const { data, error } = await supabase.functions.invoke("refund-moyasar-payment", {
        body: { order_id: refundOrder.id, amount: amt },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "فشل الاسترداد");
      toast.success(`تم استرداد ${data.refund_amount} ر.س`);
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      setRefundOrder(null);
      setRefundAmount("");
    } catch (e: any) {
      toast.error(e.message || "فشل الاسترداد");
    } finally {
      setRefunding(false);
    }
  };

  const filtered = orders?.filter((o) => {
    const matchSearch = search === "" || o.order_number?.toString().includes(search) || o.customer_name?.includes(search) || o.customer_phone?.includes(search);
    const matchStatus = statusFilter === "all" || o.status === statusFilter;
    const matchPayment = paymentFilter === "all" || o.payment_status === paymentFilter;
    return matchSearch && matchStatus && matchPayment;
  });

  return (
    <AdminLayout title="إدارة الطلبات">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="بحث برقم الطلب أو اسم العميل..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="الحالة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            {Object.entries(statusMap).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={paymentFilter} onValueChange={setPaymentFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="حالة الدفع" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل المدفوعات</SelectItem>
            {Object.entries(paymentStatusMap).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Badge variant="outline">{filtered?.length ?? 0} طلب</Badge>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <div className="bg-card rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-right p-3 font-medium">#</th>
                  <th className="text-right p-3 font-medium">العميل</th>
                  <th className="text-right p-3 font-medium">المبلغ</th>
                  <th className="text-center p-3 font-medium">الحالة</th>
                  <th className="text-center p-3 font-medium">الدفع</th>
                  <th className="text-right p-3 font-medium">التاريخ</th>
                  <th className="text-center p-3 font-medium">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {filtered?.map((o) => (
                  <tr key={o.id} className="border-b last:border-0 hover:bg-muted/10">
                    <td className="p-3 font-medium">#{o.order_number}</td>
                    <td className="p-3">
                      <p>{o.customer_name || "—"}</p>
                      <p className="text-xs text-muted-foreground">{o.customer_phone}</p>
                    </td>
                    <td className="p-3 font-medium">{o.total?.toFixed(2)} ر.س</td>
                    <td className="p-3 text-center">
                      <Select value={o.status} onValueChange={(v) => handleStatusChange(o.id, v)}>
                        <SelectTrigger className="h-7 text-xs w-[130px] mx-auto">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(statusMap).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-3 text-center">
                      <Badge variant="outline" className={`text-[10px] ${paymentStatusMap[o.payment_status]?.className || ""}`}>
                        {paymentStatusMap[o.payment_status]?.label || o.payment_status}
                      </Badge>
                      <p className="text-[10px] text-muted-foreground mt-1">{o.payment_method === "cash" ? "نقدي" : "إلكتروني"}</p>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">{new Date(o.created_at).toLocaleDateString("ar-SA")}</td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setSelectedOrder(o)} title="عرض التفاصيل"><Eye className="h-4 w-4" /></Button>
                        {o.payment_status === "paid" && o.payment_method !== "cash" && (
                          <Button variant="ghost" size="icon" onClick={() => { setRefundOrder(o); setRefundAmount(String(o.total)); }} title="استرداد المبلغ" className="text-purple-600 hover:text-purple-700">
                            <Undo2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Order Details Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>تفاصيل الطلب #{selectedOrder?.order_number}</DialogTitle></DialogHeader>
          {selectedOrder && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">العميل:</span> {selectedOrder.customer_name}</div>
                <div><span className="text-muted-foreground">الهاتف:</span> {selectedOrder.customer_phone}</div>
                <div><span className="text-muted-foreground">العنوان:</span> {selectedOrder.delivery_address || "—"}</div>
                <div><span className="text-muted-foreground">الدفع:</span> {selectedOrder.payment_method}</div>
              </div>
              {selectedOrder.notes && (
                <div className="p-2 bg-muted rounded text-xs">
                  <span className="text-muted-foreground">ملاحظات:</span> {selectedOrder.notes}
                </div>
              )}
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="bg-muted/30"><th className="p-2 text-right">المنتج</th><th className="p-2 text-center">الكمية</th><th className="p-2 text-left">السعر</th></tr></thead>
                  <tbody>
                    {selectedOrder.order_items?.map((item: any) => (
                      <tr key={item.id} className="border-t"><td className="p-2">{item.product_name}</td><td className="p-2 text-center">{item.quantity}</td><td className="p-2">{item.total_price} ر.س</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-between font-medium pt-2 border-t">
                <span>الإجمالي</span><span>{selectedOrder.total?.toFixed(2)} ر.س</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cancel Order Dialog */}
      <Dialog open={!!cancelOrderId} onOpenChange={() => { setCancelOrderId(null); setCancelReason(""); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><XCircle className="h-5 w-5 text-destructive" /> إلغاء الطلب</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">يرجى كتابة سبب إلغاء الطلب:</p>
          <Textarea
            value={cancelReason}
            onChange={e => setCancelReason(e.target.value)}
            placeholder="سبب الإلغاء..."
            rows={3}
            className="resize-none"
          />
          <div className="flex gap-2">
            <Button onClick={handleConfirmCancel} disabled={!cancelReason.trim()} variant="destructive" className="flex-1">
              تأكيد الإلغاء
            </Button>
            <Button variant="outline" onClick={() => { setCancelOrderId(null); setCancelReason(""); }} className="flex-1">
              تراجع
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Refund Dialog */}
      <Dialog open={!!refundOrder} onOpenChange={() => !refunding && setRefundOrder(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Undo2 className="h-5 w-5 text-purple-600" /> استرداد المبلغ</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">حدّد المبلغ المراد استرداده للعميل (يمكن استرداد كامل المبلغ أو جزء منه).</p>
          <div className="space-y-2">
            <label className="text-xs font-medium">المبلغ (ر.س)</label>
            <Input
              type="number"
              step="0.01"
              min="0"
              max={refundOrder?.total ?? 0}
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              dir="ltr"
            />
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">إجمالي الطلب: {Number(refundOrder?.total ?? 0).toFixed(2)} ر.س</span>
              <div className="flex gap-1">
                <button type="button" onClick={() => setRefundAmount(String((Number(refundOrder?.total ?? 0) / 2).toFixed(2)))} className="text-primary hover:underline">50%</button>
                <span className="text-muted-foreground">·</span>
                <button type="button" onClick={() => setRefundAmount(String(refundOrder?.total ?? 0))} className="text-primary hover:underline">كامل المبلغ</button>
              </div>
            </div>
          </div>
          {Number(refundAmount) >= Number(refundOrder?.total ?? 0) && (
            <p className="text-xs text-muted-foreground bg-muted p-2 rounded">سيتم تحويل حالة الطلب إلى "ملغي" عند استرداد كامل المبلغ.</p>
          )}
          <div className="flex gap-2">
            <Button onClick={handleRefund} disabled={refunding || !refundAmount} variant="destructive" className="flex-1">
              {refunding && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}
              تأكيد الاسترداد
            </Button>
            <Button variant="outline" onClick={() => setRefundOrder(null)} disabled={refunding} className="flex-1">
              تراجع
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminOrdersPage;
