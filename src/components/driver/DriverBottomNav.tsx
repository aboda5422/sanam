import { Link, useLocation } from "react-router-dom";
import { Home, Package, Clock, Wallet, User } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { path: "/driver", icon: Home, label: "الرئيسية", exact: true },
  { path: "/driver/orders", icon: Package, label: "الطلبات" },
  { path: "/driver/history", icon: Clock, label: "السجل" },
  { path: "/driver/earnings", icon: Wallet, label: "التحصيلات" },
  { path: "/driver/profile", icon: User, label: "حسابي" },
];

const DriverBottomNav = () => {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
        <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
          {navItems.map((item) => {
            const isActive = item.exact
              ? location.pathname === item.path
              : location.pathname.startsWith(item.path);
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-1 flex-1 h-full text-[11px] transition-colors",
                  isActive ? "text-primary font-bold" : "text-muted-foreground"
                )}
              >
                <Icon className={cn("h-6 w-6", isActive && "text-primary")} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
  );
};

export default DriverBottomNav;
