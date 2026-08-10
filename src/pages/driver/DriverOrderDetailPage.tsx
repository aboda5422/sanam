import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowRight, MapPin, Phone, User, Package, Navigation } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useDriverAuth } from "@/hooks/useDriverAuth";

const statusFlow: Record<string, { next: string; label: string; color: string }> = {
  assigned: { next: "preparing", label: "بدء التجهيز", color: "bg-yellow-500 hover:bg-yellow-600" },
  preparing: { next: "on_the_way", label: "انطلق للتوصيل", color: "bg-blue-500 hover:bg-blue-600" },
  on_the_way: { next: "delivered", label: "تم التسليم ✓", color: "bg-green-500 hover:bg-green-600" },
};

const statusLabels: Record<string, string> = {
  pending: "بانتظار المندوب",
  assigned: "تم القبول",
  preparing: "جاري التجهيز",
  on_the_way: "في الطريق",
  delivered: "تم التسليم",
  cancelled: "ملغي",
};

const DriverOrderDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { driverId } = useDriverAuth();
  const [order, setOrder] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapRef, setMapRef] = useState<HTMLDivElement | null>(null);
  const locationToastShownRef = useRef(false);
  const { toast } = useToast();

  // Load Google Maps script manually to avoid loader conflicts
  useEffect(() => {
    const loadMap = async () => {
      const { data } = await supabase.functions.invoke("get-maps-key");
      if (!data?.key || !mapRef) return;
      
      if (!(window as any).google?.maps) {
        const script = document.createElement("script");
        script.src = `https://maps.googleapis.com/maps/api/js?key=${data.key}&language=ar`;
        script.async = true;
        script.onload = () => setMapLoaded(true);
        document.head.appendChild(script);
      } else {
        setMapLoaded(true);
      }
    };
    loadMap();
  }, [mapRef]);

  useEffect(() => {
    const fetchOrder = async () => {
      if (!id) return;
      const { data } = await supabase.from("orders").select("*").eq("id", id).single();
      if (data) setOrder(data);
      const { data: orderItems } = await supabase.from("order_items").select("*").eq("order_id", id);
      setItems(orderItems || []);
    };
    fetchOrder();

    if (navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setDriverLocation(loc);
          if (driverId) {
            supabase.from("drivers").update({ current_lat: loc.lat, current_lng: loc.lng }).eq("id", driverId).then(() => {});
          }
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED && !locationToastShownRef.current) {
            locationToastShownRef.current = true;
            toast({
              title: "صلاحية الموقع مطلوبة",
              description: "يرجى السماح بالوصول إلى موقعك من إعدادات المتصفح",
              variant: "destructive",
              duration: 8000,
            });
          }
        },
        { enableHighAccuracy: true, maximumAge: 10000 }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, [id, driverId]);

  // Render map when ready
  useEffect(() => {
    if (!mapLoaded || !mapRef || !(window as any).google?.maps) return;
    
    const center = order?.delivery_lat && order?.delivery_lng
      ? { lat: order.delivery_lat, lng: order.delivery_lng }
      : driverLocation || { lat: 18.3, lng: 42.7 };

    const map = new (window as any).google.maps.Map(mapRef, {
      center, zoom: 14, disableDefaultUI: true, zoomControl: true,
    });

    if (order?.delivery_lat && order?.delivery_lng) {
      new (window as any).google.maps.Marker({ position: { lat: order.delivery_lat, lng: order.delivery_lng }, map, label: "🏠" });
    }
    if (driverLocation) {
      new (window as any).google.maps.Marker({ position: driverLocation, map, label: "🚗" });
    }
    if (driverLocation && order?.delivery_lat && order?.delivery_lng) {
      const directionsService = new (window as any).google.maps.DirectionsService();
      const directionsRenderer = new (window as any).google.maps.DirectionsRenderer({ map, suppressMarkers: true });
      directionsService.route(
        { origin: driverLocation, destination: { lat: order.delivery_lat, lng: order.delivery_lng }, travelMode: "DRIVING" },
        (result: any, status: string) => { if (status === "OK") directionsRenderer.setDirections(result); }
      );
    }
  }, [mapLoaded, mapRef, order?.delivery_lat, order?.delivery_lng, driverLocation]);

  const updateStatus = async () => {
    if (!order || !statusFlow[order.status]) return;

    const nextStatus = statusFlow[order.status].next;
    const update: any = { status: nextStatus };
    if (nextStatus === "delivered") update.delivered_at = new Date().toISOString();

    const { error } = await supabase.from("orders").update(update).eq("id", order.id);

    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
      return;
    }

    setOrder({ ...order, ...update });
    toast({ title: "تم تحديث الحالة", description: statusLabels[nextStatus] });

    if (nextStatus === "delivered") {
      if (driverId) {
        await supabase.rpc("increment_driver_deliveries" as any, { driver_id_param: driverId });
      }
      // Navigate back to dashboard after delivery
      setTimeout(() => navigate("/driver"), 1500);
    }
  };

  const openGoogleMaps = () => {
    if (!order?.delivery_lat || !order?.delivery_lng) return;
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${order.delivery_lat},${order.delivery_lng}&travelmode=driving`,
      "_blank"
    );
  };

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="sticky top-0 z-40 bg-primary text-primary-foreground shadow-md">
        <div className="flex items-center h-14 px-4">
          <button onClick={() => navigate(-1)} className="ml-3">
            <ArrowRight className="h-5 w-5" />
          </button>
          <h1 className="font-heading font-bold text-lg">طلب #{order.order_number}</h1>
          <span className="mr-auto text-sm opacity-90">{statusLabels[order.status]}</span>
        </div>
      </header>

      <div className="max-w-lg mx-auto pb-6">
        <div className="h-56 w-full bg-muted" ref={(el) => { if (el && !mapRef) setMapRef(el); }} />

        <div className="p-4 space-y-3">
          <Card>
            <CardContent className="p-4 space-y-2">
              <h3 className="font-heading font-bold text-sm">بيانات العميل</h3>
              {order.customer_name && (
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span>{order.customer_name}</span>
                </div>
              )}
              {order.customer_phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <a href={`tel:${order.customer_phone}`} className="text-primary hover:underline" dir="ltr">
                    {order.customer_phone}
                  </a>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span>{order.delivery_address || "عنوان غير محدد"}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <h3 className="font-heading font-bold text-sm mb-2">المنتجات ({items.length})</h3>
              <div className="space-y-2">
                {items.map((item) => (
                  <div key={item.id} className="flex items-center gap-3">
                    {item.product_image && (
                      <img src={item.product_image} alt="" className="w-10 h-10 rounded object-cover" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{item.product_name}</p>
                      <p className="text-xs text-muted-foreground">×{item.quantity}</p>
                    </div>
                    <span className="text-sm font-semibold">{Number(item.total_price).toFixed(2)} ر.س</span>
                  </div>
                ))}
              </div>
              <div className="border-t mt-3 pt-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span>المجموع الفرعي</span>
                  <span>{Number(order.subtotal).toFixed(2)} ر.س</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>رسوم التوصيل</span>
                  <span>{Number(order.delivery_fee).toFixed(2)} ر.س</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>الإجمالي</span>
                  <span>{Number(order.total).toFixed(2)} ر.س</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {order.notes && (
            <Card>
              <CardContent className="p-4">
                <h3 className="font-heading font-bold text-sm mb-1">ملاحظات</h3>
                <p className="text-sm text-muted-foreground">{order.notes}</p>
              </CardContent>
            </Card>
          )}

          <div className="flex gap-3">
            {order.delivery_lat && order.delivery_lng && (
              <Button variant="outline" className="flex-1" onClick={openGoogleMaps}>
                <Navigation className="h-4 w-4 ml-2" />
                فتح الخريطة
              </Button>
            )}
            {statusFlow[order.status] && (
              <Button
                className={`flex-1 text-white ${statusFlow[order.status].color}`}
                onClick={updateStatus}
              >
                {statusFlow[order.status].label}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DriverOrderDetailPage;
