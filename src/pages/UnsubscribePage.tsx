import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2, CheckCircle, XCircle, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

type State = "loading" | "ready" | "already" | "invalid" | "submitting" | "done" | "error";

const UnsubscribePage = () => {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<State>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setState("invalid");
      setMessage("الرابط غير صالح");
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`,
          { headers: { apikey: SUPABASE_KEY } }
        );
        const data = await res.json();
        if (data.valid) setState("ready");
        else if (data.reason === "already_unsubscribed") setState("already");
        else { setState("invalid"); setMessage(data.error || "رابط غير صالح"); }
      } catch {
        setState("error"); setMessage("تعذّر الاتصال بالخادم");
      }
    })();
  }, [token]);

  const confirm = async () => {
    if (!token) return;
    setState("submitting");
    const { data, error } = await supabase.functions.invoke("handle-email-unsubscribe", { body: { token } });
    if (error) { setState("error"); setMessage("حدث خطأ، حاول لاحقاً"); return; }
    if (data?.success) setState("done");
    else if (data?.reason === "already_unsubscribed") setState("already");
    else { setState("error"); setMessage(data?.error || "تعذّر إلغاء الاشتراك"); }
  };

  return (
    <div dir="rtl" className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md bg-card border rounded-2xl p-8 text-center shadow-sm">
        <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <Mail className="h-7 w-7 text-primary" />
        </div>
        <h1 className="font-heading text-2xl font-bold mb-2">إلغاء الاشتراك من البريد</h1>

        {state === "loading" && (
          <div className="py-6 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin ml-2" /> جاري التحقق...
          </div>
        )}

        {state === "ready" && (
          <>
            <p className="text-muted-foreground mb-6">
              هل تريد فعلاً إلغاء الاشتراك من رسائل سنام سوبر ماركت؟ لن تصلك إيصالات الدفع أو الإشعارات بعد ذلك.
            </p>
            <Button size="lg" className="w-full" onClick={confirm}>تأكيد إلغاء الاشتراك</Button>
          </>
        )}

        {state === "submitting" && (
          <div className="py-6 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin ml-2" /> جاري المعالجة...
          </div>
        )}

        {state === "done" && (
          <div className="py-4">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <p className="font-semibold">تم إلغاء اشتراكك بنجاح</p>
            <p className="text-sm text-muted-foreground mt-1">لن تتلقى المزيد من الرسائل من هذا العنوان.</p>
          </div>
        )}

        {state === "already" && (
          <div className="py-4">
            <CheckCircle className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="font-semibold">أنت ملغى الاشتراك مسبقاً</p>
          </div>
        )}

        {(state === "invalid" || state === "error") && (
          <div className="py-4">
            <XCircle className="h-12 w-12 text-destructive mx-auto mb-3" />
            <p className="font-semibold">{message || "رابط غير صالح"}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default UnsubscribePage;