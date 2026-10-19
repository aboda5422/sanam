import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { staffEmailFromUsername } from "@/lib/admin-username";
import { LoginBrandLogo } from "@/components/auth/LoginBrandLogo";
import { DEFAULT_PREPARER_FEATURES, type PreparerFeatures } from "@/lib/preparer";

const PreparerLoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    supabase
      .from("store_settings")
      .select("value")
      .eq("key", "preparer_features")
      .maybeSingle()
      .then(({ data }) => {
        const feat = {
          ...DEFAULT_PREPARER_FEATURES,
          ...((data?.value as Partial<PreparerFeatures>) || {}),
        };
        setEnabled(!!feat.enabled);
      });
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enabled) {
      toast.error("ميزة محضّر الطلبات غير مفعّلة من لوحة التحكم");
      return;
    }
    setLoading(true);
    try {
      if ("Notification" in window && Notification.permission !== "granted") {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          throw new Error("يجب السماح بإشعارات النظام للعمل كمحضّر طلبات");
        }
      }

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
        ["order_preparer", "store_admin", "site_admin"].includes(r.role),
      );
      if (!ok) {
        await supabase.auth.signOut();
        throw new Error("هذا الحساب غير مصرح له بتحضير الطلبات");
      }

      toast.success("مرحباً بك في واجهة التحضير");
      navigate("/preparer");
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
              <PackageCheck className="h-5 w-5 text-primary" />
              محضّر الطلبات
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              تجهيز طلبات التوصيل · يتطلب إشعارات النظام
            </p>
          </div>
        </CardHeader>
        <CardContent>
          {enabled === false && (
            <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-sm p-3">
              الميزة متوقفة من إعدادات الإدارة. لن يظهر هذا المدخل للموظفين بعد إيقافها.
            </div>
          )}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Label>اسم المستخدم</Label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
                dir="ltr"
              />
            </div>
            <div>
              <Label>كلمة المرور</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  dir="ltr"
                />
                <button
                  type="button"
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading || enabled === false}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "دخول"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default PreparerLoginPage;
