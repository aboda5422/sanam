import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { staffEmailFromUsername } from "@/lib/admin-username";
import logoFull from "@/assets/logo-full-light.png";

const REMEMBER_KEY = "sanam:driver-login-remember";

type Remembered = { email: string; password: string };

const loadRemembered = (): Remembered | null => {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (typeof v?.email === "string" && typeof v?.password === "string") return v;
  } catch {}
  return null;
};

const DriverLoginPage = () => {
  const remembered = loadRemembered();
  const [email, setEmail] = useState(remembered?.email || "");
  const [password, setPassword] = useState(remembered?.password || "");
  const [rememberLogin, setRememberLogin] = useState(!!remembered);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!rememberLogin) {
      localStorage.removeItem(REMEMBER_KEY);
    }
  }, [rememberLogin]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: staffEmailFromUsername(email),
        password,
      });
      if (error) throw error;

      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id);

      const isDriver = roles?.some((r) => r.role === "driver");
      if (!isDriver) {
        await supabase.auth.signOut();
        throw new Error("هذا الحساب غير مسجل كمندوب توصيل");
      }

      if (rememberLogin) {
        localStorage.setItem(REMEMBER_KEY, JSON.stringify({ email, password }));
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }

      toast({ title: "مرحباً بك", description: "تم تسجيل الدخول بنجاح" });
      navigate("/driver");
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4" dir="rtl">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-[1.2rem]">
          <div className="flex justify-center">
            <img src={logoFull} alt="سنام" className="h-11 w-auto max-w-[224px] object-contain" />
          </div>
          <div>
            <CardTitle className="text-xl flex items-center justify-center gap-2">
              <Truck className="h-5 w-5 text-primary" />
              واجهة المندوب
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">سجل الدخول بحساب المندوب</p>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Label>اسم المستخدم أو البريد</Label>
              <Input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="username"
                dir="ltr"
                required
                className="mt-1"
                autoComplete="username"
              />
            </div>
            <div>
              <Label>كلمة المرور</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                dir="ltr"
                required
                className="mt-1"
                autoComplete="current-password"
              />
            </div>
            <label htmlFor="driver-remember-login" className="flex items-center gap-2 cursor-pointer select-none">
              <Checkbox
                id="driver-remember-login"
                checked={rememberLogin}
                onCheckedChange={(v) => setRememberLogin(v === true)}
              />
              <span className="text-sm text-muted-foreground">حفظ تسجيل الدخول</span>
            </label>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Truck className="h-4 w-4 ml-2" />}
              {loading ? "جاري الدخول..." : "تسجيل الدخول"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default DriverLoginPage;
