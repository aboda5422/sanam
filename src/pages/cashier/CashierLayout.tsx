import { Link, Outlet, useNavigate } from "react-router-dom";
import { Loader2, LogOut, MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useCashierAuth } from "@/hooks/useCashierAuth";
import { LoginBrandLogo } from "@/components/auth/LoginBrandLogo";

const CashierLayout = () => {
  const { loading, session } = useCashierAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="min-h-screen bg-[#f4f6f5] flex flex-col" dir="rtl">
      <header className="bg-[#14352C] text-white px-4 py-3 flex items-center justify-between gap-3 shadow">
        <div className="flex items-center gap-3">
          <LoginBrandLogo size="sm" onDark />
          <div>
            <p className="font-semibold flex items-center gap-1.5 text-sm">
              <MonitorSmartphone className="h-4 w-4 text-[#B4E87A]" />
              كاشير سنام
            </p>
            <p className="text-xs text-white/70">{session.fullName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="secondary" size="sm" className="bg-white/10 text-white hover:bg-white/20 border-0">
            <Link to="/cashier">البيع</Link>
          </Button>
          <Button asChild variant="secondary" size="sm" className="bg-white/10 text-white hover:bg-white/20 border-0">
            <Link to="/cashier/shift">الوردية</Link>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-white hover:bg-white/10"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate("/cashier/login");
            }}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>
      <main className="flex-1">
        <Outlet context={{ session }} />
      </main>
    </div>
  );
};

export default CashierLayout;
