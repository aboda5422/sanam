import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

declare global {
  interface Window {
    Moyasar?: any;
  }
}

const PaymentPage = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const formRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<any>(null);

  useEffect(() => {
    const init = async () => {
      if (!orderId) return;

      // Fetch order
      const { data: ord, error } = await supabase
        .from("orders").select("*").eq("id", orderId).maybeSingle();
      if (error || !ord) {
        toast({ title: "الطلب غير موجود", variant: "destructive" });
        navigate("/");
        return;
      }
      setOrder(ord);

      // Fetch publishable key
      const { data: keyData } = await supabase.functions.invoke("get-moyasar-key");
      const publishableKey = keyData?.key;
      if (!publishableKey) {
        toast({ title: "خدمة الدفع غير مهيأة", variant: "destructive" });
        return;
      }

      // Load Moyasar CSS + JS
      if (!document.querySelector("#moyasar-css")) {
        const link = document.createElement("link");
        link.id = "moyasar-css";
        link.rel = "stylesheet";
        link.href = "https://cdn.moyasar.com/mpf/1.15.0/moyasar.css";
        document.head.appendChild(link);
      }

      const loadScript = () => new Promise<void>((resolve, reject) => {
        if (window.Moyasar) return resolve();
        const s = document.createElement("script");
        s.src = "https://cdn.moyasar.com/mpf/1.15.0/moyasar.js";
        s.onload = () => resolve();
        s.onerror = () => reject();
        document.body.appendChild(s);
      });

      await loadScript();
      setLoading(false);

      setTimeout(() => {
        if (!window.Moyasar || !formRef.current) return;
        window.Moyasar.init({
          element: formRef.current,
          amount: Math.round(Number(ord.total) * 100),
          currency: "SAR",
          description: `طلب رقم ${ord.order_number}`,
          publishable_api_key: publishableKey,
          callback_url: `${window.location.origin}/payment-result`,
          methods: ["creditcard", "applepay", "stcpay"],
          metadata: { order_id: ord.id, user_id: ord.user_id },
        });
      }, 100);
    };
    init();
  }, [orderId, navigate, toast]);

  return (
    <div className="min-h-screen flex flex-col" dir="rtl">
      <Header />
      <main className="flex-1 container py-8 max-w-2xl">
        <h1 className="font-heading font-bold text-2xl mb-2">الدفع الإلكتروني</h1>
        {order && (
          <p className="text-muted-foreground mb-6">
            طلب رقم {order.order_number} · المبلغ: <span className="font-bold text-primary">{Number(order.total).toFixed(2)} ر.س</span>
          </p>
        )}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}
        <div ref={formRef} className="mysr-form" />
      </main>
      <Footer />
    </div>
  );
};

export default PaymentPage;
