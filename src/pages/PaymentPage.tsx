import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import PaymentChrome from "@/components/layout/PaymentChrome";
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
  const initOnceRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      if (!orderId || initOnceRef.current) return;

      const { data: ord, error } = await supabase
        .from("orders").select("*").eq("id", orderId).maybeSingle();
      if (cancelled) return;
      if (error || !ord) {
        toast({ title: "الطلب غير موجود", variant: "destructive" });
        navigate("/");
        return;
      }
      setOrder(ord);

      const { data: keyData } = await supabase.functions.invoke("get-moyasar-key");
      if (cancelled) return;
      const publishableKey = keyData?.key;
      if (!publishableKey) {
        toast({ title: "خدمة الدفع غير مهيأة", variant: "destructive" });
        setLoading(false);
        return;
      }

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

      try {
        await loadScript();
      } catch {
        if (!cancelled) {
          toast({ title: "تعذر تحميل نموذج الدفع", variant: "destructive" });
          setLoading(false);
        }
        return;
      }
      if (cancelled) return;

      // Wait until the form mount is painted (loader off) before Moyasar.init.
      setLoading(false);
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      if (cancelled || !window.Moyasar || !formRef.current || initOnceRef.current) return;

      initOnceRef.current = true;
      window.Moyasar.init({
        element: formRef.current,
        amount: Math.round(Number(ord.total) * 100),
        currency: "SAR",
        description: `طلب رقم ${ord.order_number}`,
        publishable_api_key: publishableKey,
        callback_url: `${window.location.origin}/payment-result`,
        language: "ar",
        supported_networks: ["mada", "visa", "mastercard"],
        methods: ["creditcard", "stcpay", "applepay"],
        apple_pay: {
          country: "SA",
          label: "سنام سوبرماركت",
          validate_merchant_url: "https://api.moyasar.com/v1/applepay/initiate",
        },
        metadata: { order_id: ord.id, user_id: ord.user_id },
        on_failure: (err: unknown) => {
          const message =
            typeof err === "string"
              ? err
              : err && typeof err === "object" && "message" in err
                ? String((err as { message?: unknown }).message || err)
                : String(err || "فشل الدفع");
          console.error("[moyasar]", err);
          toast({
            title: "تعذر إكمال الدفع",
            description: message,
            variant: "destructive",
          });
        },
      });
    };

    init();
    return () => {
      cancelled = true;
    };
  }, [orderId, navigate, toast]);

  return (
    <PaymentChrome>
      <h1 className="font-heading font-bold text-2xl mb-2">الدفع الإلكتروني</h1>
      {order && (
        <p className="text-muted-foreground mb-2">
          طلب رقم {order.order_number} · المبلغ:{" "}
          <span className="font-bold text-primary">{Number(order.total).toFixed(2)} ر.س</span>
        </p>
      )}
      <p className="text-xs text-muted-foreground mb-6">
        Apple Pay: افتحي الرابط من تطبيق <strong>Safari</strong> (مو Chrome). إذا فتحت ورقة الدفع ثم نزلت وحدها خلال ثوانٍ فالمتصفح أو تسجيل النطاق عند Moyasar لم يُكمِل التحقق — أعيدي المحاولة من Safari، أو تأكدي أن النطاق store.sanam.sa حالته Registered.
      </p>
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}
      <div ref={formRef} className="mysr-form" />
    </PaymentChrome>
  );
};

export default PaymentPage;
