import { useEffect, useState, useCallback } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { Loader2, Package, ChevronLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { playNotificationSound } from "@/lib/notification-sound";
import { prepProgress } from "@/lib/preparer";
import type { PreparerSession } from "@/hooks/usePreparerAuth";

const PreparerOrdersPage = () => {
  const session = useOutletContext<PreparerSession>();
  const [queue, setQueue] = useState<any[]>([]);
  const [mine, setMine] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    if (!session?.branchIds?.length) {
      setQueue([]);
      setMine([]);
      setLoading(false);
      return;
    }

    const [{ data: pending }, { data: preparing }] = await Promise.all([
      supabase
        .from("orders")
        .select("id, order_number, created_at, status, customer_note, notes, order_items(quantity, prepared_qty)")
        .eq("status", "pending")
        .is("preparer_id", null)
        .is("prep_completed_at", null)
        .in("branch_id", session.branchIds)
        .order("created_at", { ascending: true }),
      supabase
        .from("orders")
        .select("id, order_number, created_at, status, customer_note, notes, order_items(quantity, prepared_qty)")
        .eq("preparer_id", session.userId)
        .eq("status", "preparing")
        .order("created_at", { ascending: true }),
    ]);

    setQueue(pending || []);
    setMine(preparing || []);
    setLoading(false);
  }, [session]);

  useEffect(() => {
    fetchOrders();
    const channel = supabase
      .channel("preparer-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (payload: any) => {
        const row = payload.new;
        if (
          row &&
          row.status === "pending" &&
          !row.preparer_id &&
          session.branchIds.includes(row.branch_id)
        ) {
          playNotificationSound();
          if (Notification.permission === "granted") {
            new Notification("طلب جديد للتحضير", {
              body: `طلب #${row.order_number}`,
              icon: "/sanam-logo.png",
              tag: `prep-${row.id}`,
            });
          }
        }
        fetchOrders();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchOrders, session.branchIds]);

  const claim = async (orderId: string) => {
    setClaiming(orderId);
    try {
      const { error } = await supabase.rpc("preparer_claim_order" as any, {
        p_order_id: orderId,
      });
      if (error) throw error;
      toast.success("تم استلام الطلب للتحضير");
      fetchOrders();
    } catch (e: any) {
      toast.error(e.message || "تعذر الاستلام");
    } finally {
      setClaiming(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const renderCard = (order: any, actionable: boolean) => {
    const progress = prepProgress(order.order_items || []);
    return (
      <Card key={order.id} className="overflow-hidden">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-2xl font-black tracking-tight">#{order.order_number}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(order.created_at).toLocaleString("ar-SA")}
              </p>
            </div>
            <Badge variant={order.status === "preparing" ? "default" : "secondary"}>
              {order.status === "preparing" ? "جاري التحضير" : "بانتظار الاستلام"}
            </Badge>
          </div>
          {order.customer_note && (
            <p className="text-sm bg-amber-50 border border-amber-200 rounded-lg p-2">
              ملاحظة العميل: {order.customer_note}
            </p>
          )}
          {order.status === "preparing" && (
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span>التقدم</span>
                <span>
                  {progress.done}/{progress.total} ({progress.percent}%)
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${progress.percent}%` }} />
              </div>
            </div>
          )}
          <div className="flex gap-2">
            {actionable && (
              <Button
                className="flex-1"
                disabled={claiming === order.id}
                onClick={() => claim(order.id)}
              >
                {claiming === order.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "استلام للتحضير"}
              </Button>
            )}
            <Button variant="outline" className="flex-1" asChild>
              <Link to={`/preparer/order/${order.id}`}>
                فتح الطلب <ChevronLeft className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="font-bold flex items-center gap-2">
          <Package className="h-5 w-5" /> طلباتي قيد التحضير
        </h2>
        {mine.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد طلبات قيد التحضير حالياً</p>
        ) : (
          mine.map((o) => renderCard(o, false))
        )}
      </section>
      <section className="space-y-3">
        <h2 className="font-bold">قائمة الانتظار</h2>
        {queue.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا طلبات جديدة</p>
        ) : (
          queue.map((o) => renderCard(o, true))
        )}
      </section>
    </div>
  );
};

export default PreparerOrdersPage;
