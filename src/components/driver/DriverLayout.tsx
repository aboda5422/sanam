import { ReactNode, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, MapPin, Loader2 } from "lucide-react";
import DriverBottomNav from "./DriverBottomNav";
import { useDriverAuth } from "@/hooks/useDriverAuth";
import { supabase } from "@/integrations/supabase/client";
import logoMark from "@/assets/logo-mark.png";
import { BRAND } from "@/lib/brand";
import { Badge } from "@/components/ui/badge";

interface DriverLayoutProps {
  children: ReactNode;
  title?: string;
  backTo?: string;
  headerExtra?: ReactNode;
}

function branchLabel(name: string) {
  const n = name.trim();
  return n.startsWith("فرع") ? n : `فرع ${n}`;
}

const DriverLayout = ({ children, title, backTo, headerExtra }: DriverLayoutProps) => {
  const { loading, driverId } = useDriverAuth();
  const navigate = useNavigate();
  const [branchName, setBranchName] = useState<string | null>(null);

  useEffect(() => {
    if (!driverId) return;
    let cancelled = false;
    (async () => {
      const { data: links } = await supabase
        .from("driver_branches" as any)
        .select("branch_id")
        .eq("driver_id", driverId);
      const ids = [...new Set((links || []).map((r: any) => r.branch_id).filter(Boolean))];
      if (!ids.length) {
        if (!cancelled) setBranchName(null);
        return;
      }
      const { data: branches } = await supabase.from("branches").select("name").in("id", ids);
      if (cancelled) return;
      const names = (branches || []).map((b) => b.name).filter(Boolean);
      setBranchName(names.length ? names.map(branchLabel).join(" · ") : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [driverId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" dir="rtl">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <header className="sticky top-0 z-40 h-14 shrink-0 flex items-center gap-3 border-b bg-background/95 backdrop-blur px-4">
        {backTo ? (
          <button
            type="button"
            onClick={() => navigate(backTo)}
            className="shrink-0 rounded-full p-1.5 hover:bg-muted text-foreground"
            aria-label="رجوع"
          >
            <ArrowRight className="h-5 w-5" />
          </button>
        ) : (
          <Link to="/driver" className="shrink-0">
            <img src={logoMark} alt={BRAND.fullNameAr} className="h-9 w-auto" />
          </Link>
        )}
        {title && <h1 className="font-heading font-bold text-lg truncate">{title}</h1>}
        <div className="mr-auto flex items-center gap-2 min-w-0">
          {headerExtra}
          {!backTo && (
            <Badge variant="secondary" className="max-w-[200px] truncate gap-1 font-medium">
              <MapPin className="h-3 w-3 shrink-0 text-primary" />
              <span className="truncate">{branchName || "لم يُربط بفرع"}</span>
            </Badge>
          )}
        </div>
      </header>
      <main className="flex-1 overflow-y-auto pb-16">
        {children}
      </main>
      <DriverBottomNav />
    </div>
  );
};

export default DriverLayout;
