import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const PaymentResultPage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<"loading" | "success" | "failed">("loading");
  const [orderId, setOrderId] = useState<string | null>(null);

  useEffect(() => {
    const verify = async () => {
      const paymentId = params.get("id");
      const status = params.get("status");
      if (!paymentId) { setState("failed"); return; }

      try {
        const { data, error } = await supabase.functions.invoke("verify-moyasar-payment", {
          body: { payment_id: paymentId },
        });
        if (error) throw error;
        setOrderId(data?.order_id || null);
        setState(data?.status === "paid" ? "success" : "failed");
      } catch {
        setState(status === "paid" ? "success" : "failed");
      }
    };
    verify();
  }, [params]);

  return (
    <div className="min-h-screen flex flex-col" dir="rtl">
      <Header />
      <main className="flex-1 container py-16 text-center">
        {state === "loading" && (
          <>
            <Loader2 className="h-16 w-16 mx-auto animate-spin text-primary mb-4" />
            <h2 className="font-heading text-xl font-bold">جاري التحقق من الدفع...</h2>
          </>
        )}
        {state === "success" && (
          <>
            <CheckCircle2 className="h-20 w-20 mx-auto text-green-500 mb-4" />
            <h2 className="font-heading text-2xl font-bold mb-2">تم الدفع بنجاح! 🎉</h2>
            <p className="text-muted-foreground mb-6">تم تأكيد طلبك وسيبدأ التجهيز قريباً</p>
            <div className="flex gap-3 justify-center">
              {orderId && <Button onClick={() => navigate(`/order/${orderId}`)}>تتبع الطلب</Button>}
              <Button variant="outline" onClick={() => navigate("/")}>العودة للتسوق</Button>
            </div>
          </>
        )}
        {state === "failed" && (
          <>
            <XCircle className="h-20 w-20 mx-auto text-destructive mb-4" />
            <h2 className="font-heading text-2xl font-bold mb-2">فشلت عملية الدفع</h2>
            <p className="text-muted-foreground mb-6">يرجى المحاولة مرة أخرى أو اختيار طريقة دفع مختلفة</p>
            <div className="flex gap-3 justify-center">
              {orderId && <Button onClick={() => navigate(`/order/${orderId}`)}>عرض الطلب</Button>}
              <Button variant="outline" onClick={() => navigate("/checkout")}>إعادة المحاولة</Button>
            </div>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default PaymentResultPage;
