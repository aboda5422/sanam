import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2, MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { staffEmailFromUsername } from "@/lib/admin-username";
import { LoginBrandLogo } from "@/components/auth/LoginBrandLogo";
import { DEFAULT_POS_FEATURES, type PosFeatures } from "@/lib/pos";

const REMEMBER_KEY = "sanam:cashier-login-remember";

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

const CashierLoginPage = () => {
  const remembered = loadRemembered();
  const [email, setEmail] = useState(remembered?.email || "");
  const [password, setPassword] = useState(remembered?.password || "");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberPassword, setRememberPassword] = useState(!!remembered);
  const [loading, setLoading] = useState(false);
  const [posEnabled, setPosEnabled] = useState<boolean | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    supabase
      .from("store_settings")
      .select("value")
      .eq("key", "pos_features")
      .maybeSingle()
      .then(({ data }) => {
        const feat = { ...DEFAULT_POS_FEATURES, ...((data?.value as Partial<PosFeatures>) || {}) };
        setPosEnabled(!!feat.enabled);
      });
  }, []);

  useEffect(() => {
    if (!rememberPassword) {
      localStorage.removeItem(REMEMBER_KEY);
    }
  }, [rememberPassword]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!posEnabled) {
      toast.error("نظام الكاشير غير مفعّل من لوحة التحكم");
      return;
    }
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

      const ok = roles?.some((r) =>
        ["cashier", "store_admin", "site_admin"].includes(r.role),
      );
      if (!ok) {
        await supabase.auth.signOut();
        throw new Error("هذا الحساب غير مصرح له بالكاشير");
      }

      if (rememberPassword) {
        localStorage.setItem(REMEMBER_KEY, JSON.stringify({ email, password }));
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }

      toast.success("مرحباً بك في كاشير سنام");
      navigate("/cashier");
    } catch (err: any) {
      toast.error(err.message || "فشل الدخول");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4" dir="rtl">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-[1.2rem]">
          <LoginBrandLogo />
          <div>
            <CardTitle className="text-xl flex items-center justify-center gap-2">
              <MonitorSmartphone className="h-5 w-5 text-primary" />
              كاشير سنام
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">بيع فرعي · مخزون لحظي · طباعة إيصال</p>
          </div>
        </CardHeader>
        <CardContent>
          {posEnabled === false && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-sm p-3">
              نظام الكاشير متوقف حالياً. اطلب من المدير تفعيله من الإعدادات.
            </div>
          )}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Label>اسم المستخدم أو البريد</Label>
              <Input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="cashier1"
                dir="ltr"
                required
                className="mt-1"
                autoComplete="username"
              />
            </div>
            <div>
              <Label>كلمة المرور</Label>
              <div className="relative mt-1">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  dir="ltr"
                  required
                  className="pl-10"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <label htmlFor="cashier-remember-password" className="flex items-center gap-2 cursor-pointer select-none">
              <Checkbox
                id="cashier-remember-password"
                checked={rememberPassword}
                onCheckedChange={(v) => setRememberPassword(v === true)}
              />
              <span className="text-sm text-muted-foreground">حفظ كلمة المرور</span>
            </label>
            <Button type="submit" disabled={loading || posEnabled === false} className="w-full">
              {loading ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
              دخول الكاشير
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default CashierLoginPage;
