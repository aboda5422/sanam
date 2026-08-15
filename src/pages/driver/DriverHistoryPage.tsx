import { useEffect, useState } from "react";
import { CheckCircle, XCircle, Calendar, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useDriverAuth } from "@/hooks/useDriverAuth";
import DriverLayout from "@/components/driver/DriverLayout";

const DriverHistoryPage = () => {
  const { loading: authLoading, driverId } = useDriverAuth();
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    if (!driverId) return;

    const fetch = async () => {
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("driver_id", driverId)
        .in("status", ["delivered", "cancelled"])
        .order("created_at", { ascending: false })
        .limit(50);

      setOrders(data || []);
    };

    fetch();
  }, [driverId]);

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  if (authLoading) {
    return (
      <DriverLayout title="السجل">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DriverLayout>
    );
  }

  return (
    <DriverLayout title="سجل الطلبات">
      <div className="p-4 md:p-6 max-w-lg mx-auto space-y-3">
        {orders.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p>لا توجد طلبات سابقة</p>
            </CardContent>
          </Card>
        ) : (
          orders.map((order) => (
            <Card key={order.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-heading font-bold text-sm">طلب #{order.order_number}</span>
                  {order.status === "delivered" ? (
                    <Badge variant="outline" className="text-[10px] bg-green-100 text-green-800 border-green-200 gap-1">
                      <CheckCircle className="h-3 w-3" /> تم التسليم
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] bg-red-100 text-red-800 border-red-200 gap-1">
                      <XCircle className="h-3 w-3" /> ملغي
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mb-1">{formatDate(order.created_at)}</p>
                <p className="text-sm truncate text-muted-foreground">{order.delivery_address}</p>
                <div className="flex justify-between mt-2">
                  <span className="text-sm">الإجمالي: <strong>{Number(order.total).toFixed(2)} ر.س</strong></span>
                  <span className="text-sm text-primary">التوصيل: {Number(order.delivery_fee).toFixed(2)} ر.س</span>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </DriverLayout>
  );
};

export default DriverHistoryPage;
