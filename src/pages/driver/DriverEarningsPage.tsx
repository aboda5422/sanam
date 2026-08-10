import { useEffect, useState } from "react";
import { Wallet, Truck, Star, Calendar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useDriverAuth } from "@/hooks/useDriverAuth";
import DriverLayout from "@/components/driver/DriverLayout";

const DriverEarningsPage = () => {
  const { loading: authLoading, driverId } = useDriverAuth();
  const [driver, setDriver] = useState<any>(null);
  const [todayCollections, setTodayCollections] = useState(0);
  const [weekCollections, setWeekCollections] = useState(0);
  const [monthCollections, setMonthCollections] = useState(0);

  useEffect(() => {
    if (!driverId) return;

    const fetchData = async () => {
      const { data: driverData } = await supabase
        .from("drivers")
        .select("*")
        .eq("id", driverId)
        .single();

      if (driverData) setDriver(driverData);

      const { data: orders } = await supabase
        .from("orders")
        .select("collected_amount, delivered_at")
        .eq("driver_id", driverId)
        .eq("status", "delivered");

      if (!orders) return;

      const now = new Date();
      const todayStr = now.toISOString().split("T")[0];
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      setTodayCollections(
        orders.filter((o) => o.delivered_at?.startsWith(todayStr)).reduce((s, o) => s + Number(o.collected_amount || 0), 0)
      );
      setWeekCollections(
        orders.filter((o) => o.delivered_at && o.delivered_at >= weekAgo).reduce((s, o) => s + Number(o.collected_amount || 0), 0)
      );
      setMonthCollections(
        orders.filter((o) => o.delivered_at && o.delivered_at >= monthStart).reduce((s, o) => s + Number(o.collected_amount || 0), 0)
      );
    };

    fetchData();
  }, [driverId]);

  if (authLoading) {
    return (
      <DriverLayout title="التحصيلات">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </DriverLayout>
    );
  }

  return (
    <DriverLayout title="التحصيلات والإحصائيات">
      <div className="p-4 max-w-lg mx-auto space-y-4">
        {/* Collections Cards */}
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">اليوم</p>
              <p className="text-lg font-bold text-primary">{todayCollections.toFixed(0)}</p>
              <p className="text-xs text-muted-foreground">ر.س</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">هذا الأسبوع</p>
              <p className="text-lg font-bold text-primary">{weekCollections.toFixed(0)}</p>
              <p className="text-xs text-muted-foreground">ر.س</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">هذا الشهر</p>
              <p className="text-lg font-bold text-primary">{monthCollections.toFixed(0)}</p>
              <p className="text-xs text-muted-foreground">ر.س</p>
            </CardContent>
          </Card>
        </div>

        {/* Total Stats */}
        <Card>
          <CardContent className="p-4 space-y-4">
            <h3 className="font-heading font-bold">الإحصائيات الإجمالية</h3>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Wallet className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">إجمالي التحصيلات</p>
                <p className="font-bold text-lg">{Number(driver?.total_earnings || 0).toFixed(2)} ر.س</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Truck className="h-5 w-5 text-blue-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">عدد التوصيلات</p>
                <p className="font-bold text-lg">{driver?.total_deliveries || 0} توصيلة</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-yellow-50 flex items-center justify-center">
                <Star className="h-5 w-5 text-yellow-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">التقييم</p>
                <p className="font-bold text-lg">{Number(driver?.rating || 5).toFixed(1)} / 5.0</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-green-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">تاريخ الانضمام</p>
                <p className="font-bold">
                  {driver?.created_at
                    ? new Date(driver.created_at).toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" })
                    : "-"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DriverLayout>
  );
};

export default DriverEarningsPage;
