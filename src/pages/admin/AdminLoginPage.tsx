import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import logoFull from "@/assets/logo-full-light.png";

const REMEMBER_KEY = "sanam:admin-login-remember";

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

const AdminLoginPage = () => {
  const navigate = useNavigate();
  const remembered = loadRemembered();
  const [email, setEmail] = useState(remembered?.email || "");
  const [password, setPassword] = useState(remembered?.password || "");
  const [rememberPassword, setRememberPassword] = useState(!!remembered);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!rememberPassword) {
      localStorage.removeItem(REMEMBER_KEY);
    }
  }, [rememberPassword]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast.error("فشل تسجيل الدخول: " + error.message);
      setLoading(false);
      return;
    }

    // Check admin role
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);

    const isAdmin = roles?.some(r => r.role === "store_admin" || r.role === "site_admin");
    if (!isAdmin) {
      await supabase.auth.signOut();
      toast.error("ليس لديك صلاحية الوصول للوحة التحكم");
      setLoading(false);
      return;
    }

    if (rememberPassword) {
      localStorage.setItem(REMEMBER_KEY, JSON.stringify({ email, password }));
    } else {
      localStorage.removeItem(REMEMBER_KEY);
    }

    toast.success("مرحباً بك في لوحة التحكم");
    navigate("/admin");
    setLoading(false);
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
              <ShieldCheck className="h-5 w-5 text-primary" />
              لوحة التحكم
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">سجل الدخول بحساب المشرف</p>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Label>البريد الإلكتروني</Label>
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@example.com"
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
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                dir="ltr"
                required
                className="mt-1"
                autoComplete="current-password"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <Checkbox
                checked={rememberPassword}
                onCheckedChange={(v) => setRememberPassword(v === true)}
                id="remember-password"
              />
              <span className="text-sm text-muted-foreground">حفظ كلمة المرور</span>
            </label>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <ShieldCheck className="h-4 w-4 ml-2" />}
              {loading ? "جاري الدخول..." : "تسجيل الدخول"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminLoginPage;
