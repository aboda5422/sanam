import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { translateError } from "@/lib/error-messages";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
      toast({ title: "تم الإرسال", description: "تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني" });
    } catch (error: any) {
      toast({ title: "خطأ", description: translateError(error.message), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 flex items-center justify-center py-8">
        <div className="w-full max-w-md px-4">
          <div className="bg-card rounded-2xl border p-6 shadow-sm">
            <h1 className="font-heading font-bold text-xl text-center mb-2">نسيت كلمة المرور؟</h1>
            <p className="text-muted-foreground text-sm text-center mb-6">
              أدخل بريدك الإلكتروني لإرسال رابط إعادة التعيين
            </p>

            {sent ? (
              <div className="text-center space-y-4">
                <p className="text-sm">تم إرسال الرابط إلى <strong dir="ltr">{email}</strong></p>
                <Link to="/auth" className="text-primary hover:underline text-sm">العودة لتسجيل الدخول</Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="email" className="text-sm">البريد الإلكتروني</Label>
                  <div className="relative mt-1">
                    <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="example@email.com" className="pr-10 text-sm" dir="ltr" required />
                  </div>
                </div>
                <Button type="submit" className="w-full text-sm" disabled={loading}>
                  {loading ? "جاري الإرسال..." : "إرسال رابط الإعادة"}
                </Button>
                <div className="text-center text-sm">
                  <Link to="/auth" className="text-primary hover:underline">العودة لتسجيل الدخول</Link>
                </div>
              </form>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default ForgotPasswordPage;