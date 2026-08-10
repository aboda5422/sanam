import { Link, useLocation } from "react-router-dom";
import { Home, Package, Clock, DollarSign, User } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { path: "/driver", icon: Home, label: "الرئيسية" },
  { path: "/driver/orders", icon: Package, label: "الطلبات" },
  { path: "/driver/history", icon: Clock, label: "السجل" },
  { path: "/driver/earnings", icon: DollarSign, label: "التحصيلات" },
  { path: "/driver/profile", icon: User, label: "حسابي" },
];

const DriverBottomNav = () => {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border shadow-lg">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex flex-col items-center gap-0.5 px-3 py-1 text-xs transition-colors",
                isActive
                  ? "text-primary font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <item.icon className={cn("h-5 w-5", isActive && "text-primary")} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default DriverBottomNav;
