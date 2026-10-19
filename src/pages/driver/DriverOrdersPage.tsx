import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Package, MapPin, Clock, User, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useDriverAuth } from "@/hooks/useDriverAuth";
import { useDriverNotifications } from "@/hooks/useDriverNotifications";
import { fetchDriverBranchIds } from "@/lib/branch-scope";
import DriverLayout from "@/components/driver/DriverLayout";
import { DEFAULT_PREPARER_FEATURES, type PreparerFeatures, prepProgress } from "@/lib/preparer";
import { RETURN_STATUS_LABELS, type OrderReturnStatus } from "@/lib/order-returns";

type OrdersTab = "available" | "mine" | "returns";

const parseOrdersTab = (raw: string | null): OrdersTab | null =>
  raw === "available" || raw === "mine" || raw === "returns" ? raw : null;

const DriverOrdersPage = () => {
  const { loading: authLoading, driverId } = useDriverAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = parseOrdersTab(searchParams.get("tab"));
  /** Fallback when URL has no ?tab= (e.g. bottom nav). */
  const [fallbackTab, setFallbackTab] = useState<OrdersTab>("available");
  const activeTab: OrdersTab = tabFromUrl || fallbackTab;
  const [availableOrders, setAvailableOrders] = useState<any[]>([]);
  const [preparingSilent, setPreparingSilent] = useState<any[]>([]);
  const [myOrders, setMyOrders] = useState<any[]>([]);
  const [availableReturns, setAvailableReturns] = useState<any[]>([]);
  const [myReturns, setMyReturns] = useState<any[]>([]);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [returnBusy, setReturnBusy] = useState<string | null>(null);
  const [preparerOn, setPreparerOn] = useState(false);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);
  const { toast } = useToast();
  useDriverNotifications(driverId);

  const changeTab = (tab: OrdersTab) => {
    setFallbackTab(tab);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (tab === "available") next.delete("tab");
        else next.set("tab", tab);
        return next;
      },
      { replace: true },
    );
  };

  useEffect(() => {
    if (!driverId) {
      setIsAvailable(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("drivers")
        .select("is_available")
        .eq("id", driverId)
        .maybeSingle();
      if (!cancelled) setIsAvailable(!!data?.is_available);
    };
    load();
    const channel = supabase
      .channel(`driver-orders-avail-${driverId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "drivers", filter: `id=eq.${driverId}` },
        (payload) => setIsAvailable(!!(payload.new as any)?.is_available),
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [driverId]);

  useEffect(() => {
    supabase
      .from("store_settings")
      .select("value")
      .eq("key", "preparer_features")
      .maybeSingle()
      .then(({ data }) => {
        const feat = {
          ...DEFAULT_PREPARER_FEATURES,
          ...((data?.value as Partial<PreparerFeatures>) || {}),
        };
        setPreparerOn(!!feat.enabled);
      });
  }, []);

  const fetchOrders = async () => {
    if (!driverId) return;

    const [{ data: driverRow }, branchIds] = await Promise.all([
      supabase.from("drivers").select("is_available").eq("id", driverId).maybeSingle(),
      fetchDriverBranchIds(driverId),
    ]);
    const availableNow = !!driverRow?.is_available;
    setIsAvailable(availableNow);

    // Offline: no unassigned pool (keep "mine" / returns below)
    if (!availableNow || !branchIds.length) {
      setAvailableOrders([]);
      setPreparingSilent([]);
    } else if (preparerOn) {
      const [{ data: ready }, { data: prep }] = await Promise.all([
        supabase
          .from("orders")
          .select("*, order_items(quantity, prepared_qty)")
          .eq("status", "ready")
          .is("driver_id", null)
          .in("branch_id", branchIds)
          .order("created_at", { ascending: false }),
        supabase
          .from("orders")
          .select("*, order_items(quantity, prepared_qty)")
          .eq("status", "preparing")
          .is("driver_id", null)
          .in("branch_id", branchIds)
          .order("created_at", { ascending: false }),
      ]);
      setAvailableOrders(ready || []);
      setPreparingSilent(prep || []);
    } else {
      const { data: pending } = await supabase
        .from("orders")
        .select("*")
        .eq("status", "pending")
        .is("driver_id", null)
        .in("branch_id", branchIds)
        .order("created_at", { ascending: false });
      setAvailableOrders(pending || []);
      setPreparingSilent([]);
    }

    const { data: mine } = await supabase
      .from("orders")
      .select("*")
      .eq("driver_id", driverId)
      .in("status", ["assigned", "preparing", "awaiting_price_approval", "price_approved", "on_the_way"])
      .order("created_at", { ascending: false });

    setMyOrders(mine || []);

    if (availableNow && branchIds.length) {
      const [{ data: retAvail }, { data: retMine }] = await Promise.all([
        supabase
          .from("order_returns" as any)
          .select("*, orders:order_id(order_number, customer_name, customer_phone, delivery_address, delivery_lat, delivery_lng, total)")
          .eq("status", "awaiting_pickup")
          .in("branch_id", branchIds)
          .order("created_at", { ascending: true }),
        supabase
          .from("order_returns" as any)
          .select("*, orders:order_id(order_number, customer_name, customer_phone, delivery_address, delivery_lat, delivery_lng, total)")
          .eq("driver_id", driverId)
          .in("status", ["assigned", "picked_up", "refund_failed"])
          .order("created_at", { ascending: false }),
      ]);
      setAvailableReturns((retAvail as any) || []);
      setMyReturns((retMine as any) || []);
    } else {
      setAvailableReturns([]);
      // Still show my in-progress returns when offline
      const { data: retMine } = await supabase
        .from("order_returns" as any)
        .select("*, orders:order_id(order_number, customer_name, customer_phone, delivery_address, delivery_lat, delivery_lng, total)")
        .eq("driver_id", driverId)
        .in("status", ["assigned", "picked_up", "refund_failed"])
        .order("created_at", { ascending: false });
      setMyReturns((retMine as any) || []);
    }
    setOrdersLoaded(true);
  };

  useEffect(() => {
    fetchOrders();

    const channel = supabase
      .channel("driver-orders-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        fetchOrders();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "order_returns" }, () => {
        fetchOrders();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [driverId, preparerOn]);

  // Auto-pick a useful tab only when URL has no ?tab= (don't fight user clicks).
  useEffect(() => {
    if (!ordersLoaded || tabFromUrl) return;
    const returnsCount = availableReturns.length + myReturns.length;
    const counts = {
      available: availableOrders.length,
      mine: myOrders.length,
      returns: returnsCount,
    } as const;
    if (counts[fallbackTab] > 0) return;
    if (myOrders.length > 0) setFallbackTab("mine");
    else if (availableOrders.length > 0) setFallbackTab("available");
    else if (returnsCount > 0) setFallbackTab("returns");
    else setFallbackTab("available");
  }, [
    ordersLoaded,
    tabFromUrl,
    fallbackTab,
    myOrders.length,
    availableOrders.length,
    availableReturns.length,
    myReturns.length,
  ]);

  const acceptOrder = async (orderId: string) => {
    if (!driverId) {
      toast({ title: "تعذر القبول", description: "حساب المندوب غير جاهز بعد، أعد المحاولة", variant: "destructive" });
      return;
    }
    if (!isAvailable) {
      toast({
        title: "أنت غير متاح",
        description: "فعّل استقبال الطلبات من لوحة المندوب قبل قبول طلب جديد",
        variant: "destructive",
      });
      return;
    }
    if (acceptingId) return;
    setAcceptingId(orderId);

    const expectedStatus = preparerOn ? "ready" : "pending";
    const { data, error } = await supabase
      .from("orders")
      .update({ driver_id: driverId, status: "assigned", assigned_at: new Date().toISOString() })
      .eq("id", orderId)
      .eq("status", expectedStatus)
      .is("driver_id", null)
      .select("id");

    setAcceptingId(null);

    if (error || !data?.length) {
      toast({
        title: "لم يتم قبول الطلب",
        description: error?.message || "قد يكون الطلب قبل من مندوب آخر أو ليس جاهزاً بعد",
        variant: "destructive",
      });
      fetchOrders();
      return;
    }

    toast({ title: "تم قبول الطلب", description: "الطلب أصبح في قائمة طلباتك" });
    changeTab("mine");
    fetchOrders();
  };

  const claimReturn = async (returnId: string) => {
    if (!driverId || returnBusy) return;
    setReturnBusy(returnId);
    try {
      const { error } = await supabase.rpc("driver_claim_return" as any, { p_return_id: returnId });
      if (error) throw error;
      toast({ title: "تم استلام مهمة الإرجاع", description: "توجه للعميل لاستلام المنتجات" });
      fetchOrders();
    } catch (e: any) {
      toast({ title: "تعذر الاستلام", description: e.message, variant: "destructive" });
    } finally {
      setReturnBusy(null);
    }
  };

  const completeReturn = async (returnId: string) => {
    if (returnBusy) return;
    setReturnBusy(returnId);
    try {
      const { error: markErr } = await supabase.rpc("driver_mark_return_picked_up" as any, {
        p_return_id: returnId,
      });
      if (markErr) throw markErr;
      const { data, error } = await supabase.functions.invoke("finalize-order-return", {
        body: { return_id: returnId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({
        title: "تم استلام المرتجع",
        description: data?.message || `تم تنفيذ الاسترداد (${Number(data?.refund_amount || 0).toFixed(2)} ر.س)`,
      });
      fetchOrders();
    } catch (e: any) {
      toast({ title: "تعذر إكمال الإرجاع", description: e.message, variant: "destructive" });
      fetchOrders();
    } finally {
      setReturnBusy(null);
    }
  };

  const statusLabels: Record<string, string> = {
    pending: "جديد",
    assigned: "معيّن",
    preparing: "جاري التجهيز",
    awaiting_price_approval: "بانتظار موافقة السعر",
    price_approved: "السعر معتمد",
    ready: "جاهز للاستلام",
    on_the_way: "في الطريق",
    price_revision: "رفض السعر — مراجعة",
  };

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
    assigned: "bg-blue-100 text-blue-800 border-blue-200",
    preparing: "bg-orange-100 text-orange-800 border-orange-200",
    awaiting_price_approval: "bg-amber-100 text-amber-900 border-amber-200",
    price_approved: "bg-emerald-100 text-emerald-800 border-emerald-200",
    ready: "bg-teal-100 text-teal-800 border-teal-200",
    on_the_way: "bg-indigo-100 text-indigo-800 border-indigo-200",
    price_revision: "bg-red-100 text-red-800 border-red-200",
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
  };

  const orderBadgeKey = (order: any) => {
    // رفض فعلي فقط — preparing + proposed بدون اعتماد = شراء متاجر متبقية بعد موافقة جزئية
    if (order.status === "preparing" && order.price_rejected_at) {
      return "price_revision";
    }
    return order.status;
  };

  const OrderCard = ({ order, showAccept = false }: { order: any; showAccept?: boolean }) => {
    const badgeKey = orderBadgeKey(order);
    return (
    <Card className="hover:border-primary/40 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="font-heading font-bold">طلب #{order.order_number}</span>
          <Badge variant="outline" className={`text-[10px] ${statusColors[badgeKey] || ""}`}>
            {statusLabels[badgeKey] || order.status}
          </Badge>
        </div>

        {badgeKey === "price_revision" ? (
          <p className="text-xs text-red-700 font-medium mb-2">العميل رفض السعر — افتح الطلب للمراجعة</p>
        ) : null}

        {order.customer_name && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">
            <User className="h-3.5 w-3.5" />
            <span>{order.customer_name}</span>
          </div>
        )}

        <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">
          <MapPin className="h-3.5 w-3.5" />
          <span className="truncate">{order.delivery_address || "عنوان غير محدد"}</span>
        </div>

        <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-2">
          <Clock className="h-3.5 w-3.5" />
          <span>{formatTime(order.created_at)}</span>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <span className="font-bold text-lg">{Number(order.total).toFixed(2)}</span>
            <span className="text-xs text-muted-foreground mr-1">ر.س</span>
          </div>
          <div className="flex gap-2">
            {showAccept && (
              <Button
                type="button"
                size="sm"
                disabled={acceptingId === order.id}
                onClick={() => acceptOrder(order.id)}
              >
                {acceptingId === order.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "قبول الطلب"}
              </Button>
            )}
            <Button size="sm" variant="outline" asChild>
              <Link to={`/driver/order/${order.id}`}>التفاصيل</Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
    );
  };

  const ReturnCard = ({ row, mode }: { row: any; mode: "claim" | "complete" }) => {
    const order = Array.isArray(row.orders) ? row.orders[0] : row.orders;
    return (
      <Card className="border-purple-200">
        <CardContent className="p-4 space-y-2">
          <div className="flex justify-between items-start gap-2">
            <div>
              <p className="font-bold">إرجاع طلب #{order?.order_number || "—"}</p>
              <p className="text-xs text-muted-foreground">
                {RETURN_STATUS_LABELS[row.status as OrderReturnStatus] || row.status}
              </p>
            </div>
            <Badge variant="outline" className="bg-purple-50 text-purple-800 text-[10px]">
              {Number(row.refund_amount).toFixed(2)} ر.س
            </Badge>
          </div>
          {order?.customer_name && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <User className="h-3.5 w-3.5" />
              <span>{order.customer_name}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            <span className="truncate">{order?.delivery_address || "عنوان غير محدد"}</span>
          </div>
          {order?.customer_phone && (
            <a href={`tel:${order.customer_phone}`} className="text-sm text-primary">
              اتصال: {order.customer_phone}
            </a>
          )}
          {mode === "claim" ? (
            <Button
              className="w-full"
              size="sm"
              disabled={returnBusy === row.id}
              onClick={() => claimReturn(row.id)}
            >
              {returnBusy === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "استلام مهمة الإرجاع"}
            </Button>
          ) : (
            <Button
              className="w-full"
              size="sm"
              variant="secondary"
              disabled={returnBusy === row.id || row.status === "picked_up"}
              onClick={() => completeReturn(row.id)}
            >
              {returnBusy === row.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "تأكيد استلام المرتجع من العميل"
              )}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  };

  if (authLoading) {
    return (
      <DriverLayout title="الطلبات">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DriverLayout>
    );
  }

  return (
    <DriverLayout title="الطلبات">
      <div className="p-4 md:p-6 max-w-lg mx-auto">
        <Tabs value={activeTab} onValueChange={(v) => changeTab(v as OrdersTab)} dir="rtl">
          <TabsList className="w-full mb-4 flex flex-wrap h-auto gap-1">
            <TabsTrigger value="available" className="flex-1 min-w-[30%]">
              متاحة ({availableOrders.length})
            </TabsTrigger>
            <TabsTrigger value="mine" className="flex-1 min-w-[30%]">
              طلباتي ({myOrders.length})
            </TabsTrigger>
            <TabsTrigger value="returns" className="flex-1 min-w-[30%]">
              إرجاع ({availableReturns.length + myReturns.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="available" className="space-y-3">
            {preparerOn && preparingSilent.length > 0 && (
              <div className="space-y-2 mb-4">
                <p className="text-sm font-semibold text-muted-foreground">جاري التحضير في الفرع (للمتابعة فقط)</p>
                {preparingSilent.map((order) => {
                  const p = prepProgress(order.order_items || []);
                  return (
                    <Card key={order.id} className="opacity-90 border-dashed">
                      <CardContent className="p-4 space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="font-bold">طلب #{order.order_number}</span>
                          <Badge variant="outline" className="text-[10px] bg-orange-50 text-orange-800">
                            تحضير {p.percent}%
                          </Badge>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-orange-400 transition-all" style={{ width: `${p.percent}%` }} />
                        </div>
                        <p className="text-xs text-muted-foreground">لا يمكن القبول حتى يكتمل التحضير</p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
            {availableOrders.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-3 opacity-40" />
                  <p>{preparerOn ? "لا توجد طلبات جاهزة للاستلام" : "لا توجد طلبات متاحة حالياً"}</p>
                </CardContent>
              </Card>
            ) : (
              availableOrders.map((order) => (
                <OrderCard key={order.id} order={order} showAccept />
              ))
            )}
          </TabsContent>

          <TabsContent value="mine" className="space-y-3">
            {myOrders.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-3 opacity-40" />
                  <p>ليس لديك طلبات نشطة</p>
                </CardContent>
              </Card>
            ) : (
              myOrders.map((order) => (
                <OrderCard key={order.id} order={order} />
              ))
            )}
          </TabsContent>

          <TabsContent value="returns" className="space-y-4">
            <section className="space-y-2">
              <p className="text-sm font-semibold">مهامي للإرجاع</p>
              {myReturns.length === 0 ? (
                <p className="text-xs text-muted-foreground">لا مهام إرجاع معيّنة لك</p>
              ) : (
                myReturns.map((r) => <ReturnCard key={r.id} row={r} mode="complete" />)
              )}
            </section>
            <section className="space-y-2">
              <p className="text-sm font-semibold">متاحة للاستلام</p>
              {availableReturns.length === 0 ? (
                <p className="text-xs text-muted-foreground">لا مهام إرجاع متاحة</p>
              ) : (
                availableReturns.map((r) => <ReturnCard key={r.id} row={r} mode="claim" />)
              )}
            </section>
          </TabsContent>
        </Tabs>
      </div>
    </DriverLayout>
  );
};

export default DriverOrdersPage;
