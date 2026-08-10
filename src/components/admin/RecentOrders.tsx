import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "قيد الانتظار", variant: "secondary" },
  assigned: { label: "تم التعيين", variant: "outline" },
  preparing: { label: "جاري التحضير", variant: "default" },
  on_the_way: { label: "في الطريق", variant: "default" },
  delivered: { label: "تم التوصيل", variant: "default" },
  cancelled: { label: "ملغي", variant: "destructive" },
};

const RecentOrders = () => {
  const { data: orders, isLoading } = useQuery({
    queryKey: ["admin-recent-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, customer_name, total, status, created_at, payment_method")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000,
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-heading">آخر الطلبات</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !orders?.length ? (
          <p className="text-sm text-muted-foreground text-center py-8">لا توجد طلبات</p>
        ) : (
          <div className="space-y-2">
            {orders.map((order) => {
              const s = statusLabels[order.status] || statusLabels.pending;
              return (
                <div
                  key={order.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm">#{order.order_number}</span>
                      <Badge variant={s.variant} className="text-[10px]">
                        {s.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {order.customer_name || "عميل"}
                    </p>
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-sm">{Number(order.total).toFixed(2)} ر.س</p>
                    <p className="text-[10px] text-muted-foreground">
                      {order.payment_method === "cash" ? "كاش" : "شبكة"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RecentOrders;
