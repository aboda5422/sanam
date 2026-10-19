import { Outlet, Link, useNavigate, useLocation } from "react-router-dom";
import { Loader2, LogOut, PackageCheck, ListOrdered, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { usePreparerAuth } from "@/hooks/usePreparerAuth";

const PreparerLayout = () => {
  const { loading, session, setSession } = usePreparerAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const logout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    navigate("/preparer/login", { replace: true });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) return null;

  if (!session.notificationsOk && session.features.require_notifications) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" dir="rtl">
        <div className="max-w-md text-center space-y-4">
          <Bell className="h-12 w-12 text-amber-500 mx-auto" />
          <h1 className="text-xl font-bold">الإشعارات مطلوبة</h1>
          <p className="text-muted-foreground text-sm">
            لا يمكن استخدام واجهة محضّر الطلبات دون السماح بإشعارات النظام من إعدادات الجوال/المتصفح.
          </p>
          <Button
            onClick={async () => {
              const ok =
                "Notification" in window &&
                (Notification.permission === "granted" ||
                  (await Notification.requestPermission()) === "granted");
              if (ok) window.location.reload();
              else alert("فعّل الإشعارات من إعدادات الجهاز ثم أعد المحاولة");
            }}
          >
            طلب إذن الإشعارات
          </Button>
          <Button variant="ghost" onClick={logout}>
            تسجيل الخروج
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/20" dir="rtl">
      <header className="sticky top-0 z-40 bg-background border-b">
        <div className="container h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-semibold">
            <PackageCheck className="h-5 w-5 text-primary" />
            {session.features.label_ar}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground hidden sm:inline">{session.fullName}</span>
            <Button variant="ghost" size="icon" asChild>
              <Link to="/preparer" title="الطلبات">
                <ListOrdered className="h-5 w-5" />
              </Link>
            </Button>
            <Button variant="ghost" size="icon" onClick={logout} title="خروج">
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>
      <main className="container py-4 pb-24" key={location.pathname}>
        <Outlet context={session} />
      </main>
    </div>
  );
};

export default PreparerLayout;
