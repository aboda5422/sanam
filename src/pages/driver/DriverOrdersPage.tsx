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

const DriverOrdersPage = () => {
  const { loading: authLoading, driverId } = useDriverAuth();
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get("tab") || "available";
  const [availableOrders, setAvailableOrders] = useState<any[]>([]);
  const [myOrders, setMyOrders] = useState<any[]>([]);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const { toast } = useToast();
  useDriverNotifications(driverId);

  const fetchOrders = async () => {
    if (!driverId) return;

    const branchIds = await fetchDriverBranchIds(driverId);
    if (!branchIds.length) {
      setAvailableOrders([]);
    } else {
      const { data: pending } = await supabase
        .from("orders")
        .select("*")
        .eq("status", "pending")
        .is("driver_id", null)
        .in("branch_id", branchIds)
        .order("created_at", { ascending: false });
      setAvailableOrders(pending || []);
    }

    // My active orders
    const { data: mine } = await supabase
      .from("orders")
      .select("*")
      .eq("driver_id", driverId)
      .in("status", ["assigned", "preparing", "on_the_way"])
      .order("created_at", { ascending: false });

    setMyOrders(mine || []);
  };

  useEffect(() => {
    fetchOrders();

    const channel = supabase
      .channel("driver-orders-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        fetchOrders();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [driverId]);

  const acceptOrder = async (orderId: string) => {
    if (!driverId) {
      toast({ title: "تعذر القبول", description: "حساب المندوب غير جاهز بعد، أعد المحاولة", variant: "destructive" });
      return;
    }
    if (acceptingId) return;
    setAcceptingId(orderId);

    const { data, error } = await supabase
      .from("orders")
      .update({ driver_id: driverId, status: "assigned", assigned_at: new Date().toISOString() })
      .eq("id", orderId)
      .eq("status", "pending")
      .is("driver_id", null)
      .select("id");

    setAcceptingId(null);

    if (error || !data?.length) {
      toast({
        title: "لم يتم قبول الطلب",
        description: error?.message || "قد يكون الطلب قبل من مندوب آخر أو ليس من فرعك",
        variant: "destructive",
      });
      fetchOrders();
      return;
    }

    toast({ title: "تم قبول الطلب", description: "الطلب أصبح في قائمة طلباتك" });
    fetchOrders();
  };

  const statusLabels: Record<string, string> = {
    pending: "جديد",
    assigned: "معيّن",
    preparing: "جاري التجهيز",
    on_the_way: "في الطريق",
  };

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
    assigned: "bg-blue-100 text-blue-800 border-blue-200",
    preparing: "bg-orange-100 text-orange-800 border-orange-200",
    on_the_way: "bg-indigo-100 text-indigo-800 border-indigo-200",
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
  };

  const OrderCard = ({ order, showAccept = false }: { order: any; showAccept?: boolean }) => (
    <Card className="hover:border-primary/40 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="font-heading font-bold">طلب #{order.order_number}</span>
          <Badge variant="outline" className={`text-[10px] ${statusColors[order.status] || ""}`}>
            {statusLabels[order.status] || order.status}
          </Badge>
        </div>

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
        <Tabs defaultValue={defaultTab} dir="rtl">
          <TabsList className="w-full mb-4">
            <TabsTrigger value="available" className="flex-1">
              متاحة ({availableOrders.length})
            </TabsTrigger>
            <TabsTrigger value="mine" className="flex-1">
              طلباتي ({myOrders.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="available" className="space-y-3">
            {availableOrders.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-3 opacity-40" />
                  <p>لا توجد طلبات متاحة حالياً</p>
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
        </Tabs>
      </div>
    </DriverLayout>
  );
};

export default DriverOrdersPage;
