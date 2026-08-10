import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Package, Clock, CheckCircle, TrendingUp, MapPin, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useDriverAuth } from "@/hooks/useDriverAuth";
import { useDriverGPS } from "@/hooks/useDriverGPS";
import { useDriverNotifications } from "@/hooks/useDriverNotifications";
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
        .select("is_available, total_earnings, full_name")
        .eq("id", driverId)
        .single();

      if (driver) {
        setIsAvailable(driver.is_available);
        setDriverName(driver.full_name || "");
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

      const { count } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");

      setStats((prev) => ({ ...prev, pending: count || 0 }));
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
    assigned: "bg-blue-100 text-blue-800",
    preparing: "bg-yellow-100 text-yellow-800",
    on_the_way: "bg-primary/10 text-primary",
  };

  const statusLabels: Record<string, string> = {
    assigned: "معيّن",
    preparing: "جاري التجهيز",
    on_the_way: "في الطريق",
  };

  if (authLoading) {
    return (
      <DriverLayout title="لوحة التحكم">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </DriverLayout>
    );
  }

  return (
    <DriverLayout title="لوحة التحكم">
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        {/* Driver Welcome */}
        {driverName && (
          <div className="text-center py-2">
            <h2 className="font-heading font-bold text-lg">مرحباً، {driverName}</h2>
            <p className="text-sm text-muted-foreground">{motivation}</p>
          </div>
        )}

        {/* Availability Toggle */}
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

        {/* Stats Grid - Clickable */}
        <div className="grid grid-cols-2 gap-3">
          <Link to="/driver/orders?tab=available">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4 text-center">
                <Package className="h-6 w-6 text-blue-500 mx-auto mb-1" />
                <p className="text-2xl font-bold">{stats.pending}</p>
                <p className="text-xs text-muted-foreground">طلبات جديدة</p>
              </CardContent>
            </Card>
          </Link>
          <Link to="/driver/orders?tab=mine">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4 text-center">
                <Clock className="h-6 w-6 text-yellow-500 mx-auto mb-1" />
                <p className="text-2xl font-bold">{stats.active}</p>
                <p className="text-xs text-muted-foreground">قيد التوصيل</p>
              </CardContent>
            </Card>
          </Link>
          <Link to="/driver/history">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4 text-center">
                <CheckCircle className="h-6 w-6 text-green-500 mx-auto mb-1" />
                <p className="text-2xl font-bold">{stats.delivered}</p>
                <p className="text-xs text-muted-foreground">تم التسليم اليوم</p>
              </CardContent>
            </Card>
          </Link>
          <Link to="/driver/earnings">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4 text-center">
                <Wallet className="h-6 w-6 text-primary mx-auto mb-1" />
                <p className="text-2xl font-bold">{stats.collections.toFixed(0)}</p>
                <p className="text-xs text-muted-foreground">تحصيلات اليوم (ر.س)</p>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Active Orders */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-heading font-bold">الطلبات النشطة</h2>
            <Link to="/driver/orders" className="text-sm text-primary hover:underline">
              عرض الكل
            </Link>
          </div>

          {activeOrders.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                <Package className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">لا توجد طلبات نشطة حالياً</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {activeOrders.map((order) => (
                <Link key={order.id} to={`/driver/order/${order.id}`}>
                  <Card className="hover:shadow-md transition-shadow">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-sm">طلب #{order.order_number}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[order.status] || ""}`}>
                          {statusLabels[order.status] || order.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
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

        {/* Quick Actions */}
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
