import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Eye, EyeOff, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { staffEmailFromUsername } from "@/lib/admin-username";

const DriverLoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: staffEmailFromUsername(email),
        password,
      });
      if (error) throw error;

      // Verify driver role
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id);

      const isDriver = roles?.some((r) => r.role === "driver");
      if (!isDriver) {
        await supabase.auth.signOut();
        throw new Error("هذا الحساب غير مسجل كمندوب توصيل");
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
    <div className="min-h-screen bg-background flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-sm">
        <div className="bg-card rounded-2xl border p-6 shadow-sm">
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-3">
              <Truck className="h-8 w-8 text-primary-foreground" />
            </div>
            <h1 className="font-heading font-bold text-xl">واجهة المندوب</h1>
            <p className="text-muted-foreground text-sm mt-1">سنام سوبر ماركت</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Label htmlFor="email" className="text-sm">اسم المستخدم</Label>
              <Input
                id="email"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="username"
                className="mt-1 text-sm"
                dir="ltr"
                required
                autoComplete="username"
              />
            </div>

            <div>
              <Label htmlFor="password" className="text-sm">كلمة المرور</Label>
              <div className="relative mt-1">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="أدخل كلمة المرور"
                  className="pr-10 pl-10 text-sm"
                  dir="ltr"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "جاري الدخول..." : "تسجيل الدخول"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default DriverLoginPage;
