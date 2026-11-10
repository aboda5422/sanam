import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, Loader2, Package, ShoppingBag } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { useCustomerOrderAlerts } from "@/hooks/useCustomerOrderAlerts";

const statusMap: Record<string, { label: string; labelEn: string; color: string }> = {
  pending: { label: "قيد الانتظار", labelEn: "Pending", color: "bg-yellow-100 text-yellow-800" },
  assigned: { label: "تم التعيين", labelEn: "Assigned", color: "bg-blue-100 text-blue-800" },
  preparing: { label: "جاري التحضير", labelEn: "Preparing", color: "bg-orange-100 text-orange-800" },
  ready: { label: "جاهز للتوصيل", labelEn: "Ready", color: "bg-teal-100 text-teal-800" },
  on_the_way: { label: "في الطريق", labelEn: "On the Way", color: "bg-purple-100 text-purple-800" },
  delivered: { label: "تم التوصيل", labelEn: "Delivered", color: "bg-green-100 text-green-800" },
  cancelled: { label: "ملغي", labelEn: "Cancelled", color: "bg-red-100 text-red-800" },
};

type OrderRow = {
  id: string;
  order_number: number;
  status: string;
  total: number;
  created_at: string;
  order_items?: { id: string; product_name: string; quantity: number; total_price: number }[];
};

/**
 * Storefront orders list (not under حسابي) — active orders stay here until delivered/cancelled.
 */
const CustomerOrdersPage = () => {
  const navigate = useNavigate();
  const { t, lang } = useLanguage();
  const { userId, activeOrderCount } = useCustomerOrderAlerts();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId) {
        setOrders([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabase
        .from("orders")
        .select("id, order_number, status, total, created_at, order_items(id, product_name, quantity, total_price)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(40);
      if (cancelled) return;
      if (fetchError) {
        setError(fetchError.message);
        setOrders([]);
      } else {
        setOrders((data || []) as OrderRow[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, activeOrderCount]);

  const { active, past } = useMemo(() => {
    const activeOrders = orders.filter((o) => !["delivered", "cancelled"].includes(o.status));
    const pastOrders = orders.filter((o) => ["delivered", "cancelled"].includes(o.status));
    return { active: activeOrders, past: pastOrders };
  }, [orders]);

  if (!userId && !loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 container py-16 text-center">
          <Package className="h-16 w-16 mx-auto text-muted-foreground/40 mb-4" />
          <h1 className="font-heading text-2xl font-bold mb-2">{t("طلباتي", "My Orders")}</h1>
          <p className="text-muted-foreground mb-6">
            {t("سجّل الدخول لمتابعة طلباتك النشطة", "Sign in to track your active orders")}
          </p>
          <Button onClick={() => navigate("/auth")}>{t("تسجيل الدخول", "Sign in")}</Button>
        </main>
        <div className="hidden md:block">
          <Footer />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container py-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-heading font-bold text-2xl">{t("طلباتي", "My Orders")}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t(
                "الطلبات النشطة تبقى هنا حتى التسليم أو الإلغاء",
                "Active orders stay here until delivered or cancelled",
              )}
            </p>
          </div>
          {active.length > 0 && (
            <Badge className="bg-amber-500 text-white border-0">
              {active.length} {t("نشط", "active")}
            </Badge>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <Card>
            <CardContent className="py-12 text-center">
              <AlertTriangle className="h-12 w-12 mx-auto text-destructive mb-3" />
              <p className="text-muted-foreground mb-4">
                {t("تعذر تحميل الطلبات. حاول مرة أخرى.", "Could not load orders. Please try again.")}
              </p>
              <Button variant="outline" onClick={() => window.location.reload()}>
                {t("إعادة المحاولة", "Retry")}
              </Button>
            </CardContent>
          </Card>
        ) : orders.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <ShoppingBag className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground mb-4">{t("لا توجد طلبات بعد", "No orders yet")}</p>
              <Link to="/">
                <Button>{t("تسوّق الآن", "Shop Now")}</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            <section>
              <h2 className="font-heading font-bold text-sm mb-3 text-primary">
                {t("طلبات نشطة", "Active Orders")}
              </h2>
              {active.length === 0 ? (
                <p className="text-sm text-muted-foreground rounded-xl border border-dashed p-4">
                  {t("لا يوجد طلب قيد التنفيذ حالياً", "No order in progress right now")}
                </p>
              ) : (
                <div className="space-y-3">
                  {active.map((order) => {
                    const status = statusMap[order.status] || statusMap.pending;
                    return (
                      <Card
                        key={order.id}
                        className="overflow-hidden cursor-pointer hover:border-primary/30 transition-colors border-primary/20"
                        onClick={() => navigate(`/order/${order.id}`)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <span className="font-bold text-sm">
                                {t("طلب", "Order")} #{order.order_number}
                              </span>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {new Date(order.created_at).toLocaleDateString(
                                  lang === "ar" ? "ar-SA" : "en-US",
                                  {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  },
                                )}
                              </p>
                            </div>
                            <Badge className={`${status.color} border-0 text-xs`}>
                              {lang === "ar" ? status.label : status.labelEn}
                            </Badge>
                          </div>
                          {order.order_items && order.order_items.length > 0 && (
                            <div className="space-y-1.5 mb-3">
                              {order.order_items.slice(0, 3).map((item) => (
                                <div key={item.id} className="flex justify-between text-sm">
                                  <span>
                                    {item.product_name} × {item.quantity}
                                  </span>
                                  <span className="font-medium">
                                    {item.total_price} {t("ر.س", "SAR")}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center justify-between pt-2 border-t">
                            <span className="text-sm text-primary font-medium">
                              {t("تتبع الطلب ←", "Track Order →")}
                            </span>
                            <span className="font-bold text-primary">
                              {order.total} {t("ر.س", "SAR")}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </section>

            {past.length > 0 && (
              <section>
                <h2 className="font-heading font-bold text-sm mb-3 text-muted-foreground">
                  {t("طلبات سابقة", "Past Orders")}
                </h2>
                <div className="space-y-3">
                  {past.map((order) => {
                    const status = statusMap[order.status] || statusMap.pending;
                    return (
                      <Card
                        key={order.id}
                        className="overflow-hidden hover:border-primary/30 transition-colors cursor-pointer"
                        onClick={() => navigate(`/order/${order.id}`)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <span className="font-bold text-sm">
                                {t("طلب", "Order")} #{order.order_number}
                              </span>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {new Date(order.created_at).toLocaleDateString(
                                  lang === "ar" ? "ar-SA" : "en-US",
                                  {
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                  },
                                )}
                              </p>
                            </div>
                            <Badge className={`${status.color} border-0 text-xs`}>
                              {lang === "ar" ? status.label : status.labelEn}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between pt-2 border-t">
                            <span className="text-sm text-muted-foreground">
                              {t("عرض التفاصيل", "View Details")}
                            </span>
                            <span className="font-bold text-primary">
                              {order.total} {t("ر.س", "SAR")}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
      <div className="hidden md:block">
        <Footer />
      </div>
    </div>
  );
};

export default CustomerOrdersPage;
