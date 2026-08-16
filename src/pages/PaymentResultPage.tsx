import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { convertGuestAccount, isAnonymousUser } from "@/lib/guest";
import { translateError } from "@/lib/error-messages";
import { useToast } from "@/hooks/use-toast";

const PaymentResultPage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [state, setState] = useState<"loading" | "success" | "failed">("loading");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState(false);
  const [askGuestRegister, setAskGuestRegister] = useState(false);
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPassword, setGuestPassword] = useState("");
  const [guestRegisterName, setGuestRegisterName] = useState("");
  const [registeringGuest, setRegisteringGuest] = useState(false);
  const [phone, setPhone] = useState("");

  useEffect(() => {
    const verify = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      let guest = isAnonymousUser(session?.user);
      if (session?.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("phone, is_guest")
          .eq("user_id", session.user.id)
          .maybeSingle();
        if (profile) {
          setPhone(profile.phone || "");
          if ((profile as any).is_guest) guest = true;
        }
      }
      setIsGuest(guest);

      const paymentId = params.get("id");
      const status = params.get("status");
      if (!paymentId) {
        setState("failed");
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke("verify-moyasar-payment", {
          body: { payment_id: paymentId },
        });
        if (error) throw error;
        setOrderId(data?.order_id || null);
        const ok = data?.status === "paid";
        setState(ok ? "success" : "failed");
        if (ok && guest) setAskGuestRegister(true);
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
            <p className="text-muted-foreground mb-2">تم تأكيد طلبك وسيبدأ التجهيز قريباً</p>
            {isGuest && (
              <p className="text-xs text-muted-foreground mb-6 max-w-md mx-auto">
                يمكنك متابعة الطلب طالما بقيت هذه الصفحة. احفظ حساباً إن أردت الرجوع لاحقاً.
              </p>
            )}
            {!isGuest && <div className="mb-6" />}
            <div className="flex flex-wrap gap-3 justify-center">
              {orderId && <Button onClick={() => navigate(`/order/${orderId}`)}>تتبع الطلب</Button>}
              {isGuest && (
                <Button variant="secondary" onClick={() => setAskGuestRegister(true)}>
                  حفظ بياناتي / إنشاء حساب
                </Button>
              )}
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
      <AlertDialog open={askGuestRegister} onOpenChange={setAskGuestRegister}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حفظ بياناتك كحساب؟</AlertDialogTitle>
            <AlertDialogDescription>
              أضف بريداً وكلمة مرور لتتبع طلباتك لاحقاً. المندوب سيصل إليك بالجوال والعنوان حتى بدون حساب.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-sm">البريد الإلكتروني (إلزامي)</Label>
              <Input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder="example@email.com" dir="ltr" className="mt-1" />
            </div>
            <div>
              <Label className="text-sm">كلمة المرور (إلزامي)</Label>
              <Input type="password" value={guestPassword} onChange={(e) => setGuestPassword(e.target.value)} placeholder="6 أحرف على الأقل" dir="ltr" className="mt-1" />
            </div>
            <div>
              <Label className="text-sm">الاسم (اختياري)</Label>
              <Input value={guestRegisterName} onChange={(e) => setGuestRegisterName(e.target.value)} placeholder="اتركه فارغاً للإبقاء على اسم الضيف" className="mt-1" />
            </div>
          </div>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel disabled={registeringGuest}>لاحقاً</AlertDialogCancel>
            <AlertDialogAction
              disabled={registeringGuest}
              onClick={async (e) => {
                e.preventDefault();
                setRegisteringGuest(true);
                try {
                  await convertGuestAccount({
                    email: guestEmail,
                    password: guestPassword,
                    fullName: guestRegisterName || undefined,
                    phone,
                  });
                  setIsGuest(false);
                  setAskGuestRegister(false);
                  toast({ title: "تم حفظ الحساب", description: "يمكنك تسجيل الدخول بنفس البريد لاحقاً" });
                } catch (err: any) {
                  toast({
                    title: "تعذر حفظ الحساب",
                    description: translateError(err?.message || String(err)),
                    variant: "destructive",
                  });
                } finally {
                  setRegisteringGuest(false);
                }
              }}
            >
              {registeringGuest ? "جاري الحفظ..." : "حفظ الحساب"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Footer />
    </div>
  );
};

export default PaymentResultPage;
