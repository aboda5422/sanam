import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Package, Clock, CheckCircle, MapPin, Wallet, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useDriverAuth } from "@/hooks/useDriverAuth";
import { useDriverGPS } from "@/hooks/useDriverGPS";
import { useDriverNotifications } from "@/hooks/useDriverNotifications";
import { fetchDriverBranchIds } from "@/lib/branch-scope";
import DriverLayout from "@/components/driver/DriverLayout";

const motivationalMessages = [
  "يوم موفق بإذن الله! 🚀",
  "أنت الأفضل، واصل! 💪",
  "كل توصيلة تصنع فرقاً! ⭐",
  "بالتوفيق في يومك! 🌟",
  "عملك مقدّر، شكراً لك! 🙏",
];

// Force clean rebuild after hook changes
const DriverDashboard = () => {
  const { loading: authLoading, driverId, userId } = useDriverAuth();
  const [isAvailable, setIsAvailable] = useState(false);
  const [driverName, setDriverName] = useState("");
  const [stats, setStats] = useState({ pending: 0, active: 0, delivered: 0, collections: 0 });
  const [unpaidPay, setUnpaidPay] = useState<number | null>(null);
  const [activeOrders, setActiveOrders] = useState<any[]>([]);
  const [locationWarningShown, setLocationWarningShown] = useState(false);
  const { toast } = useToast();
  useDriverGPS(driverId, isAvailable);
  useDriverNotifications(driverId);

  const [motivation] = useState(() =>
    motivationalMessages[Math.floor(Math.random() * motivationalMessages.length)]
  );

  useEffect(() => {
    if (!driverId) return;

    const fetchData = async () => {
      const { data: driver } = await supabase
        .from("drivers")
        .select("is_available, total_earnings, full_name, pay_type, unpaid_delivery_pay")
        .eq("id", driverId)
        .single();

      if (driver) {
        setIsAvailable(driver.is_available);
        setDriverName(driver.full_name || "");
        setUnpaidPay(driver.pay_type === "per_order" ? Number(driver.unpaid_delivery_pay || 0) : null);
      }

      const today = new Date().toISOString().split("T")[0];

      const { data: orders } = await supabase
        .from("orders")
        .select("*")
        .eq("driver_id", driverId);

      const todayOrders = orders?.filter((o) => o.created_at.startsWith(today)) || [];
      const active = orders?.filter((o) => ["assigned", "preparing", "on_the_way"].includes(o.status)) || [];
      const delivered = todayOrders.filter((o) => o.status === "delivered");

      setStats({
        pending: 0,
        active: active.length,
        delivered: delivered.length,
        collections: delivered.reduce((sum, o) => sum + Number(o.collected_amount || 0), 0),
      });

      setActiveOrders(active.slice(0, 3));

      const branchIds = await fetchDriverBranchIds(driverId);
      let pendingCount = 0;
      if (branchIds.length) {
        const { count } = await supabase
          .from("orders")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending")
          .is("driver_id", null)
          .in("branch_id", branchIds);
        pendingCount = count || 0;
      }
      setStats((prev) => ({ ...prev, pending: pendingCount }));
    };

    fetchData();

    const channel = supabase
      .channel("driver-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        fetchData();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [driverId]);

  // Show location warning only when toggling availability ON and location is denied
  const checkLocationPermission = async (): Promise<boolean> => {
    if (!("geolocation" in navigator)) {
      toast({
        title: "الموقع غير مدعوم",
        description: "متصفحك لا يدعم خدمات الموقع",
        variant: "destructive",
      });
      return false;
    }

    try {
      const permission = await navigator.permissions.query({ name: "geolocation" });
      if (permission.state === "denied") {
        toast({
          title: "صلاحية الموقع مطلوبة",
          description: "يرجى السماح بالوصول إلى موقعك من إعدادات المتصفح لتتمكن من استقبال الطلبات",
          variant: "destructive",
          duration: 8000,
        });
        return false;
      }
    } catch {
      // permissions API not supported, try geolocation directly
    }
    return true;
  };

  const toggleAvailability = async () => {
    if (!driverId) return;
    const newStatus = !isAvailable;

    // Only check location when turning ON
    if (newStatus) {
      const locationOk = await checkLocationPermission();
      if (!locationOk) return;
    }

    const { error } = await supabase
      .from("drivers")
      .update({ is_available: newStatus })
      .eq("id", driverId);

    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
      return;
    }

    setIsAvailable(newStatus);
    toast({
      title: newStatus ? "أنت متاح الآن" : "تم إيقاف الاستقبال",
      description: newStatus ? "ستصلك الطلبات الجديدة" : "لن تصلك طلبات جديدة",
    });
  };

  const statusColors: Record<string, string> = {
    assigned: "bg-blue-100 text-blue-800 border-blue-200",
    preparing: "bg-orange-100 text-orange-800 border-orange-200",
    on_the_way: "bg-indigo-100 text-indigo-800 border-indigo-200",
  };

  const statusLabels: Record<string, string> = {
    assigned: "معيّن",
    preparing: "جاري التجهيز",
    on_the_way: "في الطريق",
  };

  if (authLoading) {
    return (
      <DriverLayout title="الرئيسية">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DriverLayout>
    );
  }

  const statTiles = [
    { to: "/driver/orders?tab=available", icon: Package, value: stats.pending, label: "طلبات جديدة", iconClass: "bg-blue-50 text-blue-600" },
    { to: "/driver/orders?tab=mine", icon: Clock, value: stats.active, label: "قيد التوصيل", iconClass: "bg-amber-50 text-amber-600" },
    { to: "/driver/history", icon: CheckCircle, value: stats.delivered, label: "تم التسليم اليوم", iconClass: "bg-emerald-50 text-emerald-600" },
    { to: "/driver/earnings", icon: Wallet, value: stats.collections.toFixed(0), label: "تحصيلات اليوم (ر.س)", iconClass: "bg-primary/10 text-primary" },
  ];

  return (
    <DriverLayout title="الرئيسية">
      <div className="p-4 md:p-6 space-y-4 max-w-lg mx-auto">
        {driverName && (
          <div className="rounded-xl border bg-card p-4 text-center">
            <h2 className="font-heading font-bold text-lg">مرحباً، {driverName}</h2>
            <p className="text-sm text-muted-foreground mt-1">{motivation}</p>
          </div>
        )}

        {unpaidPay !== null && (
          <Link to="/driver/earnings">
            <Card className="hover:border-primary/40 transition-colors">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">أجر التوصيل المستحق</p>
                  <p className="font-heading font-bold text-lg">{unpaidPay.toFixed(2)} ر.س</p>
                </div>
                <Wallet className="h-5 w-5 text-primary" />
              </CardContent>
            </Card>
          </Link>
        )}

        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="font-heading font-bold text-base">حالة الاستقبال</p>
              <p className="text-sm text-muted-foreground">
                {isAvailable ? "متاح لاستقبال الطلبات" : "غير متاح حالياً"}
              </p>
            </div>
            <Switch checked={isAvailable} onCheckedChange={toggleAvailability} />
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3">
          {statTiles.map((tile) => {
            const Icon = tile.icon;
            return (
              <Link key={tile.to} to={tile.to}>
                <Card className="hover:border-primary/40 transition-colors h-full">
                  <CardContent className="p-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${tile.iconClass}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <p className="text-2xl font-heading font-bold">{tile.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{tile.label}</p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-heading font-bold">الطلبات النشطة</h2>
            <Link to="/driver/orders" className="text-sm text-primary font-medium hover:underline">
              عرض الكل
            </Link>
          </div>

          {activeOrders.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Package className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">لا توجد طلبات نشطة حالياً</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {activeOrders.map((order) => (
                <Link key={order.id} to={`/driver/order/${order.id}`}>
                  <Card className="hover:border-primary/40 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-heading font-bold text-sm">طلب #{order.order_number}</span>
                        <Badge variant="outline" className={`text-[10px] ${statusColors[order.status] || ""}`}>
                          {statusLabels[order.status] || order.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{order.delivery_address || "عنوان غير محدد"}</span>
                      </div>
                      <p className="text-sm font-semibold mt-1">{Number(order.total).toFixed(2)} ر.س</p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button asChild variant="outline" className="h-12">
            <Link to="/driver/orders">عرض الطلبات المتاحة</Link>
          </Button>
          <Button asChild variant="outline" className="h-12">
            <Link to="/driver/earnings">التحصيلات والإحصائيات</Link>
          </Button>
        </div>
      </div>
    </DriverLayout>
  );
};

export default DriverDashboard;
