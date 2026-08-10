import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, LayoutGrid, ShoppingCart, User, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCart } from "@/contexts/CartContext";
import { useLanguage } from "@/contexts/LanguageContext";
import QuickOrderSheet from "@/components/quick-order/QuickOrderSheet";

const MobileBottomNav = () => {
  const location = useLocation();
  const { uniqueItems } = useCart();
  const { t } = useLanguage();
  const [quickOrderOpen, setQuickOrderOpen] = useState(false);

  const items = [
    { path: "/", icon: Home, label: t("الرئيسية", "Home") },
    { path: "/categories", icon: LayoutGrid, label: t("الأقسام", "Categories") },
    { path: "/cart", icon: ShoppingCart, label: t("السلة", "Cart"), badge: uniqueItems },
    { path: "/profile", icon: User, label: t("حسابي", "Account") },
  ];

  // Hide on admin/driver routes
  if (location.pathname.startsWith("/admin") || location.pathname.startsWith("/driver")) {
    return null;
  }

  // first 2 items go to the right of FAB, last 2 to the left (RTL-aware visually)
  const leftItems = items.slice(0, 2);
  const rightItems = items.slice(2);

  const renderItem = (item: typeof items[number]) => {
    const isActive =
      item.path === "/"
        ? location.pathname === "/"
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
        <div className="relative">
          <Icon className={cn("h-6 w-6", isActive && "text-primary")} />
          {item.badge && item.badge > 0 ? (
            <span className="absolute -top-1.5 -right-2 bg-primary text-primary-foreground text-[10px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1">
              {item.badge}
            </span>
          ) : null}
        </div>
        <span>{item.label}</span>
      </Link>
    );
  };

  return (
    <>
      {/* spacer so content isn't hidden behind the nav on mobile */}
      <div className="h-16 md:hidden" aria-hidden />
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
        <div className="relative flex items-center justify-around h-16">
          {leftItems.map(renderItem)}

          {/* Center AI Quick Order FAB */}
          <div className="flex-1 flex items-start justify-center">
            <button
              onClick={() => setQuickOrderOpen(true)}
              aria-label={t("الطلب السريع AI", "Quick Order AI")}
              className="-mt-7 relative group"
            >
              {/* Glow ring */}
              <span className="absolute inset-0 rounded-full bg-primary/40 blur-md animate-pulse" aria-hidden />
              <span
                className="relative flex items-center justify-center w-[58px] h-[58px] rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-xl shadow-primary/40 ring-4 ring-background transition-transform group-active:scale-95"
              >
                <Sparkles className="h-7 w-7" />
                <span className="absolute -top-1 -right-1 bg-amber-400 text-amber-950 text-[9px] font-black px-1.5 py-0.5 rounded-full shadow">
                  AI
                </span>
              </span>
              <span className="block text-center mt-0.5 text-[10px] font-bold text-primary">
                {t("طلب سريع", "Quick")}
              </span>
            </button>
          </div>

          {rightItems.map(renderItem)}
        </div>
      </nav>

      <QuickOrderSheet open={quickOrderOpen} onOpenChange={setQuickOrderOpen} />
    </>
  );
};

export default MobileBottomNav;