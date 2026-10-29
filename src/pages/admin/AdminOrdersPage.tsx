import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Search, Loader2, Eye, XCircle, Undo2, MapPin, MessageSquare } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { mapsLinkFromCoords, parseMapsCoords } from "@/lib/maps-link";
import OrderChatPanel from "@/components/orders/OrderChatPanel";

const OPEN_STATUSES = new Set(["pending", "assigned", "preparing", "ready"]);

const CHAT_SEEN_KEY = "admin-order-chat-seen";

function readChatSeen(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(CHAT_SEEN_KEY) || "{}");
  } catch {
    return {};
  }
}

function markChatSeen(orderId: string) {
  const map = readChatSeen();
  map[orderId] = new Date().toISOString();
  localStorage.setItem(CHAT_SEEN_KEY, JSON.stringify(map));
}

const statusMap: Record<string, { label: string; color: string }> = {
  pending: { label: "بانتظار", color: "bg-yellow-100 text-yellow-800" },
  preparing: { label: "جاري التحضير", color: "bg-orange-100 text-orange-800" },
  ready: { label: "جاهز للمندوب", color: "bg-teal-100 text-teal-800" },
  assigned: { label: "تم التعيين", color: "bg-blue-100 text-blue-800" },
  on_the_way: { label: "في الطريق", color: "bg-indigo-100 text-indigo-800" },
  delivered: { label: "تم التوصيل", color: "bg-green-100 text-green-800" },
  cancelled: { label: "ملغي", color: "bg-red-100 text-red-800" },
};

type PaymentBadge = { label: string; className: string };

/** طلب صالح تشغيلياً: كاش (الدفع عند الاستلام)، أو إلكتروني مدفوع فعلاً. */
function isHealthyPaymentOrder(o: { payment_method?: string | null; payment_status?: string | null; status?: string }) {
  if (o.status === "cancelled") return false;
  const method = (o.payment_method || "").toLowerCase();
  if (method === "cash") return true;
  return o.payment_status === "paid";
}

function isCashMethod(method?: string | null) {
  return (method || "").toLowerCase() === "cash";
}

/** تسميات أوضح حسب طريقة الدفع + حالة الدفع. */
function paymentBadgeForOrder(o: {
  payment_method?: string | null;
  payment_status?: string | null;
}): PaymentBadge {
  const cash = isCashMethod(o.payment_method);
  switch (o.payment_status) {
    case "paid":
      return { label: "مدفوع", className: "bg-green-100 text-green-800 border-green-300" };
    case "failed":
      return { label: "فشل في الدفع", className: "bg-red-100 text-red-800 border-red-300" };
    case "refunded":
      return { label: "مسترد", className: "bg-purple-100 text-purple-800 border-purple-300" };
    case "cancelled":
      return { label: "ملغي", className: "bg-gray-100 text-gray-800 border-gray-300" };
    case "pending":
    default:
      if (cash) {
        return { label: "عند الاستلام", className: "bg-amber-100 text-amber-900 border-amber-300" };
      }
      return { label: "لم يكمل الدفع", className: "bg-orange-100 text-orange-900 border-orange-300" };
  }
}

const paymentFilterOptions: { value: string; label: string }[] = [
  { value: "healthy", label: "الطلبات السليمة" },
  { value: "incomplete", label: "لم يكمل الدفع" },
  { value: "failed", label: "فشل في الدفع" },
  { value: "paid", label: "مدفوع" },
  { value: "refunded", label: "مسترد" },
  { value: "all", label: "كل المدفوعات" },
];

function orderDeliveryCoords(order: {
  delivery_lat?: number | null;
  delivery_lng?: number | null;
  delivery_address?: string | null;
}) {
  if (Number.isFinite(order.delivery_lat) && Number.isFinite(order.delivery_lng)) {
    return { lat: Number(order.delivery_lat), lng: Number(order.delivery_lng) };
  }
  const addr = order.delivery_address || "";
  const fromText = addr.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (fromText) {
    const parsed = parseMapsCoords(`${fromText[1]},${fromText[2]}`);
    if (parsed) return parsed;
  }
  return null;
}

const AdminOrdersContent = () => {
  const { scopedBranchIds, isSuperAdmin } = useAdminAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  /** افتراضي: السليمة فقط (كاش أو إلكتروني مدفوع) — الفاشلة/غير المكتملة عبر الفلتر */
  const [paymentFilter, setPaymentFilter] = useState("healthy");
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [refundOrder, setRefundOrder] = useState<any | null>(null);
  const [refundAmount, setRefundAmount] = useState<string>("");
  const [refunding, setRefunding] = useState(false);
  const [chatOrder, setChatOrder] = useState<any | null>(null);
  const [chatSeenTick, setChatSeenTick] = useState(0);

  useEffect(() => {
    const status = searchParams.get("status");
    if (!status) return;
    if (status === "open" || statusMap[status]) setStatusFilter(status);
  }, [searchParams]);

  const { data: orders, isLoading } = useQuery({
    queryKey: ["admin-orders", scopedBranchIds],
    queryFn: async () => {
      let q = supabase
        .from("orders")
        .select("*, order_items(*), branches(name, slug)")
        .order("created_at", { ascending: false });
      if (scopedBranchIds && scopedBranchIds.length > 0) {
        q = q.in("branch_id", scopedBranchIds);
      } else if (!isSuperAdmin) {
        return [];
      }
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const orderIds = (orders || []).map((o: any) => o.id);
  const { data: chatFlags } = useQuery({
    queryKey: ["admin-order-chat-flags", orderIds],
    enabled: orderIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_messages" as any)
        .select("order_id, message_type, sender_role, created_at")
        .in("order_id", orderIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const map: Record<string, { cancel?: boolean; edit?: boolean; lastCustomerAt?: string }> = {};
      for (const row of (data || []) as unknown as {
        order_id: string;
        message_type: string;
        sender_role: string;
        created_at: string;
      }[]) {
        const cur = map[row.order_id] || {};
        if (row.message_type === "cancel_request") cur.cancel = true;
        if (row.message_type === "edit_request") cur.edit = true;
        if (row.sender_role === "customer" && !cur.lastCustomerAt) {
          cur.lastCustomerAt = row.created_at;
        }
        map[row.order_id] = cur;
      }
      return map;
    },
  });

  useEffect(() => {
    if (orderIds.length === 0) return;
    const channel = supabase
      .channel("admin-orders-chat-badge")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "order_messages" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["admin-order-chat-flags"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderIds.join(","), queryClient]);

  const openChat = (o: any) => {
    markChatSeen(o.id);
    setChatSeenTick((t) => t + 1);
    setChatOrder(o);
  };

  const hasUnreadCustomerMsg = (orderId: string) => {
    void chatSeenTick;
    const lastCustomerAt = chatFlags?.[orderId]?.lastCustomerAt;
    if (!lastCustomerAt) return false;
    const seenAt = readChatSeen()[orderId];
    if (!seenAt) return true;
    return new Date(lastCustomerAt).getTime() > new Date(seenAt).getTime();
  };

  const updateStatus = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: string; notes?: string }) => {
      const update: any = { status: status as any };
      if (notes) update.notes = notes;
      if (status === "delivered") update.delivered_at = new Date().toISOString();
      if (status === "cancelled") {
        await supabase.rpc("restore_order_stock" as any, { p_order_id: id });
      }
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
    const matchStatus =
      statusFilter === "all"
        ? true
        : statusFilter === "open"
          ? OPEN_STATUSES.has(o.status)
          : o.status === statusFilter;
    const method = (o.payment_method || "").toLowerCase();
    const matchPayment =
      paymentFilter === "all"
        ? true
        : paymentFilter === "healthy"
          ? isHealthyPaymentOrder(o)
          : paymentFilter === "incomplete"
            ? method !== "cash" && o.payment_status === "pending"
            : paymentFilter === "failed"
              ? o.payment_status === "failed"
              : o.payment_status === paymentFilter;
    return matchSearch && matchStatus && matchPayment;
  });

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="بحث برقم الطلب أو اسم العميل..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="الحالة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="open">معلقة / قيد المعالجة</SelectItem>
            {Object.entries(statusMap).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={paymentFilter} onValueChange={setPaymentFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="حالة الدفع" /></SelectTrigger>
          <SelectContent>
            {paymentFilterOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
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
                {filtered?.map((o) => {
                  const unreadChat = hasUnreadCustomerMsg(o.id);
                  const flags = chatFlags?.[o.id];
                  const needsAttention = unreadChat || flags?.cancel || flags?.edit;
                  return (
                  <tr key={o.id} className="border-b last:border-0 hover:bg-muted/10">
                    <td className="p-3 font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        #{o.order_number}
                        {needsAttention && (
                          <span
                            className="inline-block h-2 w-2 rounded-full bg-rose-500"
                            title={unreadChat ? "رسالة جديدة من العميل" : "طلب يحتاج متابعة"}
                          />
                        )}
                      </span>
                    </td>
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
                      {(() => {
                        const pay = paymentBadgeForOrder(o);
                        return (
                          <Badge variant="outline" className={`text-[10px] ${pay.className}`}>
                            {pay.label}
                          </Badge>
                        );
                      })()}
                      <p className="text-[10px] text-muted-foreground mt-1">{isCashMethod(o.payment_method) ? "نقدي" : "إلكتروني"}</p>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">{new Date(o.created_at).toLocaleDateString("ar-SA")}</td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setSelectedOrder(o)} title="عرض التفاصيل"><Eye className="h-4 w-4" /></Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openChat(o)}
                          title={unreadChat ? "رسالة جديدة من العميل" : "محادثة الطلب"}
                          className={`relative ${unreadChat || needsAttention ? "text-rose-600" : ""}`}
                        >
                          <MessageSquare className="h-4 w-4" />
                          {unreadChat && (
                            <span className="absolute top-1 left-1 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-background" />
                          )}
                        </Button>
                        {o.payment_status === "paid" && o.payment_method !== "cash" && (
                          <Button variant="ghost" size="icon" onClick={() => { setRefundOrder(o); setRefundAmount(String(o.total)); }} title="استرداد المبلغ" className="text-purple-600 hover:text-purple-700">
                            <Undo2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
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
                <div className="flex flex-col items-start gap-1">
                  <span className="text-muted-foreground">العنوان:</span>
                  {(() => {
                    const coords = orderDeliveryCoords(selectedOrder);
                    const addr = selectedOrder.delivery_address || "";
                    const coordOnly = /موقع محدد:/.test(addr);
                    return (
                      <>
                        {!coordOnly && addr ? <span>{addr}</span> : null}
                        {coords ? (
                          <Button asChild size="sm" variant="outline" className="gap-1.5 h-8">
                            <a
                              href={mapsLinkFromCoords(coords.lat, coords.lng)}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <MapPin className="h-3.5 w-3.5" />
                              فتح على الخريطة
                            </a>
                          </Button>
                        ) : (
                          !addr && <span>—</span>
                        )}
                      </>
                    );
                  })()}
                </div>
                <div>
                  <span className="text-muted-foreground">الدفع:</span>{" "}
                  {isCashMethod(selectedOrder.payment_method) ? "نقدي" : "إلكتروني"}
                  {" · "}
                  {paymentBadgeForOrder(selectedOrder).label}
                </div>
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
              <div className="space-y-1 pt-2 border-t text-sm">
                {Number((selectedOrder as any).discount_amount) > 0 && (
                  <div className="flex justify-between text-green-700">
                    <span>خصم ({Number((selectedOrder as any).discount_percent)}%)</span>
                    <span>−{Number((selectedOrder as any).discount_amount).toFixed(2)} ر.س</span>
                  </div>
                )}
                <div className="flex justify-between font-medium">
                  <span>الإجمالي</span><span>{selectedOrder.total?.toFixed(2)} ر.س</span>
                </div>
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

      <Sheet
        open={!!chatOrder}
        onOpenChange={(open) => {
          if (!open && chatOrder?.id) {
            markChatSeen(chatOrder.id);
            setChatSeenTick((t) => t + 1);
            queryClient.invalidateQueries({ queryKey: ["admin-order-chat-flags"] });
          }
          if (!open) setChatOrder(null);
        }}
      >
        <SheetContent side="left" className="w-full sm:max-w-md flex flex-col" dir="rtl">
          <SheetHeader>
            <SheetTitle>محادثة الطلب #{chatOrder?.order_number}</SheetTitle>
          </SheetHeader>
          {chatOrder && (
            <div className="flex-1 flex flex-col mt-4 min-h-0 gap-3">
              <div className="text-xs text-muted-foreground space-y-0.5 border rounded-lg p-2 bg-muted/30">
                <p>{chatOrder.customer_name} · {chatOrder.customer_phone}</p>
                <p>الحالة: {statusMap[chatOrder.status]?.label || chatOrder.status} · {Number(chatOrder.total).toFixed(2)} ر.س</p>
              </div>
              <OrderChatPanel
                orderId={chatOrder.id}
                mode="staff"
                orderStatus={chatOrder.status}
                className="flex-1 min-h-0"
                onOrderChanged={async () => {
                  queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
                  queryClient.invalidateQueries({ queryKey: ["admin-order-chat-flags"] });
                  const { data } = await supabase
                    .from("orders")
                    .select("*, order_items(*), branches(name, slug)")
                    .eq("id", chatOrder.id)
                    .maybeSingle();
                  if (data) setChatOrder(data);
                }}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>

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
    </>
  );
};

const AdminOrdersPage = () => (
  <AdminLayout title="إدارة الطلبات">
    <AdminOrdersContent />
  </AdminLayout>
);

export default AdminOrdersPage;
