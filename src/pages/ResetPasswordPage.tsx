import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { translateError } from "@/lib/error-messages";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

const ResetPasswordPage = () => {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast({ title: "خطأ", description: "كلمة المرور يجب أن تكون 6 أحرف على الأقل", variant: "destructive" });
      return;
    }
    if (password !== confirm) {
      toast({ title: "خطأ", description: "كلمتا المرور غير متطابقتين", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({ title: "تم", description: "تم تحديث كلمة المرور بنجاح" });
      navigate("/");
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
            <h1 className="font-heading font-bold text-xl text-center mb-6">إعادة تعيين كلمة المرور</h1>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="password" className="text-sm">كلمة المرور الجديدة</Label>
                <div className="relative mt-1">
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="pr-10 text-sm" dir="ltr" required minLength={6} />
                </div>
              </div>
              <div>
                <Label htmlFor="confirm" className="text-sm">تأكيد كلمة المرور</Label>
                <div className="relative mt-1">
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="pr-10 text-sm" dir="ltr" required minLength={6} />
                </div>
              </div>
              <Button type="submit" className="w-full text-sm" disabled={loading || !ready}>
                {loading ? "جاري التحديث..." : "تحديث كلمة المرور"}
              </Button>
              {!ready && (
                <p className="text-xs text-muted-foreground text-center">جارٍ التحقق من رابط الإعادة...</p>
              )}
            </form>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default ResetPasswordPage;