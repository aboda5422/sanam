import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Phone, MessageCircle, ChevronLeft, Package, CheckCircle, Truck, Clock, MapPin, User, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import DriverRatingDialog from "@/components/rating/DriverRatingDialog";
import { useLanguage } from "@/contexts/LanguageContext";
import CustomerDriverTracker from "@/components/tracking/CustomerDriverTracker";

const steps = [
  { key: "pending", label: "تم استلام الطلب", icon: Clock, description: "تم استلام طلبك بنجاح وبانتظار التجهيز" },
  { key: "assigned", label: "تم تعيين المندوب", icon: User, description: "تم تعيين مندوب لتجهيز طلبك" },
  { key: "preparing", label: "جاري التجهيز", icon: Package, description: "المندوب يجهز طلبك الآن" },
  { key: "on_the_way", label: "في الطريق إليك", icon: Truck, description: "المندوب في الطريق إليك 🚗" },
  { key: "delivered", label: "تم التوصيل", icon: CheckCircle, description: "تم توصيل طلبك بنجاح ✅" },
];

const OrderTrackingPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<any>(null);
  const [driver, setDriver] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showRating, setShowRating] = useState(false);
  const [hasRated, setHasRated] = useState(false);
  const { t } = useLanguage();

  const fetchOrder = async () => {
    if (!id) return;
    const { data } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("id", id)
      .maybeSingle();

    if (data) {
      setOrder(data);
      if (data.driver_id) {
        const { data: driverData } = await supabase
          .from("drivers")
          .select("*, profiles:user_id(full_name)")
          .eq("id", data.driver_id)
          .maybeSingle();
        if (driverData) setDriver(driverData);
      }
      // Check if already rated
      if (data.status === "delivered") {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const { data: existing } = await (supabase as any)
            .from("driver_ratings")
            .select("id")
            .eq("order_id", data.id)
            .eq("user_id", session.user.id)
            .maybeSingle();
          if (existing) {
            setHasRated(true);
          } else if (data.driver_id) {
            setShowRating(true);
          }
        }
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchOrder();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`order-${id}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "orders",
        filter: `id=eq.${id}`,
      }, () => {
        fetchOrder();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [id]);

  const getCurrentStepIndex = () => {
    if (!order) return 0;
    if (order.status === "cancelled") return -1;
    return steps.findIndex(s => s.key === order.status);
  };

  const currentStep = getCurrentStepIndex();

  const driverPhone = driver?.phone || order?.customer_phone;
  const driverName = (driver as any)?.profiles?.full_name || "المندوب";

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 container py-8 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </main>
        <Footer />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 container py-16 text-center">
          <Package className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h2 className="font-heading text-xl font-bold mb-2">الطلب غير موجود</h2>
          <Button onClick={() => navigate("/profile")} variant="outline">
            العودة لطلباتي
          </Button>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" dir="rtl">
      <Header />
      <main className="flex-1 container py-6 max-w-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate("/profile")}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="font-heading font-bold text-xl">تتبع الطلب #{order.order_number}</h1>
            <p className="text-sm text-muted-foreground">
              {new Date(order.created_at).toLocaleDateString("ar-SA", {
                year: "numeric", month: "short", day: "numeric",
                hour: "2-digit", minute: "2-digit",
              })}
            </p>
          </div>
        </div>

        {/* Cancelled state */}
        {order.status === "cancelled" && (
          <Card className="mb-6 border-destructive/30 bg-destructive/5">
            <CardContent className="p-4 text-center">
              <p className="font-bold text-destructive">تم إلغاء هذا الطلب</p>
            </CardContent>
          </Card>
        )}

        {/* Live driver tracking - only when on the way */}
        {order.status === "on_the_way" && order.driver_id && (
          <CustomerDriverTracker
            orderId={order.id}
            driverId={order.driver_id}
            destLat={order.delivery_lat}
            destLng={order.delivery_lng}
          />
        )}

        {/* Progress Steps */}
        {order.status !== "cancelled" && (
          <Card className="mb-6">
            <CardContent className="p-6">
              <div className="relative">
                {steps.map((step, index) => {
                  const isCompleted = index <= currentStep;
                  const isCurrent = index === currentStep;
                  const Icon = step.icon;

                  return (
                    <div key={step.key} className="flex items-start gap-4 relative">
                      {/* Line */}
                      {index < steps.length - 1 && (
                        <div
                          className={`absolute right-[19px] top-10 w-0.5 h-12 ${
                            index < currentStep ? "bg-primary" : "bg-border"
                          }`}
                        />
                      )}
                      {/* Icon */}
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                          isCompleted
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        } ${isCurrent ? "ring-4 ring-primary/20 scale-110" : ""}`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      {/* Text */}
                      <div className={`pb-8 ${isCurrent ? "pt-0" : ""}`}>
                        <p className={`font-semibold text-sm ${isCompleted ? "text-foreground" : "text-muted-foreground"}`}>
                          {step.label}
                        </p>
                        {isCurrent && (
                          <p className="text-xs text-primary mt-0.5 animate-pulse">
                            {step.description}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Driver Contact - show when assigned or on_the_way */}
        {driver && ["assigned", "preparing", "on_the_way"].includes(order.status) && (
          <Card className="mb-6 border-primary/20 bg-primary/5">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-bold text-sm">{driverName}</p>
                    <p className="text-xs text-muted-foreground">مندوب التوصيل</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {driverPhone && (
                    <>
                      <a
                        href={`https://wa.me/966${driverPhone.replace(/^0/, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-10 h-10 rounded-full bg-green-500 text-white flex items-center justify-center hover:bg-green-600 transition-colors"
                      >
                        <MessageCircle className="h-5 w-5" />
                      </a>
                      <a
                        href={`tel:${driverPhone}`}
                        className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors"
                      >
                        <Phone className="h-5 w-5" />
                      </a>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Preparing message */}
        {["assigned", "preparing"].includes(order.status) && (
          <Card className="mb-6 border-orange-200 bg-orange-50">
            <CardContent className="p-4 text-center">
              <Package className="h-8 w-8 mx-auto text-orange-500 mb-2 animate-bounce" />
              <p className="font-bold text-orange-700 text-sm">طلبك قيد التجهيز 🛒</p>
              <p className="text-xs text-orange-600 mt-1">المندوب يجهز طلبك الآن</p>
            </CardContent>
          </Card>
        )}

        {/* Delivery Address */}
        {order.delivery_address && (
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-sm">عنوان التوصيل</p>
                  <p className="text-xs text-muted-foreground mt-1">{order.delivery_address}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Order Items */}
        <Card>
          <CardContent className="p-4">
            <h3 className="font-bold text-sm mb-3">تفاصيل الطلب</h3>
            <div className="space-y-2">
              {order.order_items?.map((item: any) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {item.product_name} × {item.quantity}
                  </span>
                  <span className="font-medium">{item.total_price} ر.س</span>
                </div>
              ))}
            </div>
            <div className="border-t mt-3 pt-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">التوصيل</span>
                <span>{order.delivery_fee === 0 ? "مجاني" : `${order.delivery_fee} ر.س`}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>الإجمالي</span>
                <span className="text-primary">{order.total} ر.س</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Rating button for delivered orders */}
        {order.status === "delivered" && order.driver_id && !hasRated && (
          <Card className="mt-4 border-yellow-200 bg-yellow-50">
            <CardContent className="p-4 text-center">
              <Star className="h-8 w-8 mx-auto text-yellow-500 mb-2" />
              <p className="font-bold text-sm mb-2">{t("كيف كانت تجربة التوصيل؟", "How was your delivery?")}</p>
              <Button onClick={() => setShowRating(true)} variant="outline" size="sm">
                {t("قيّم المندوب", "Rate Driver")}
              </Button>
            </CardContent>
          </Card>
        )}

        {hasRated && order.status === "delivered" && (
          <p className="text-center text-xs text-muted-foreground mt-4">
            {t("✅ تم إرسال تقييمك، شكراً لك!", "✅ Your rating was submitted, thank you!")}
          </p>
        )}

        {/* Rating Dialog */}
        {order.driver_id && (
          <DriverRatingDialog
            open={showRating}
            onOpenChange={setShowRating}
            orderId={order.id}
            driverId={order.driver_id}
            driverName={driverName}
          />
        )}
      </main>
      <Footer />
    </div>
  );
};

export default OrderTrackingPage;
