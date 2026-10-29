import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, Package, User, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import QuickOrderSheet from "@/components/quick-order/QuickOrderSheet";
import CartNavLink from "@/components/layout/CartNavLink";

const MobileBottomNav = () => {
  const location = useLocation();
  const { t } = useLanguage();
  const [quickOrderOpen, setQuickOrderOpen] = useState(false);

  const items = [
    { path: "/", icon: Home, label: t("الرئيسية", "Home"), match: "home" as const },
    { path: "/profile?tab=orders", icon: Package, label: t("الطلبات", "Orders"), match: "orders" as const },
    { path: "/cart", match: "cart" as const, cart: true as const },
    { path: "/profile", icon: User, label: t("حسابي", "Account"), match: "account" as const },
  ];

  // Hide on admin/driver routes
  if (location.pathname.startsWith("/admin") || location.pathname.startsWith("/driver")) {
    return null;
  }

  // first 2 items go to the right of FAB, last 2 to the left (RTL-aware visually)
  const leftItems = items.slice(0, 2);
  const rightItems = items.slice(2);

  const isItemActive = (match: (typeof items)[number]["match"]) => {
    const tab = new URLSearchParams(location.search).get("tab");
    if (match === "home") return location.pathname === "/";
    if (match === "orders") {
      return location.pathname.startsWith("/profile") && tab === "orders";
    }
    if (match === "cart") {
      return location.pathname.startsWith("/cart") || location.pathname.startsWith("/order/");
    }
    if (match === "account") {
      return location.pathname.startsWith("/profile") && tab !== "orders";
    }
    return false;
  };

  const renderItem = (item: (typeof items)[number]) => {
    const isActive = isItemActive(item.match);
    if ("cart" in item && item.cart) {
      return (
        <CartNavLink
          key={item.path}
          variant="nav"
          label={t("السلة", "Cart")}
          active={isActive}
        />
      );
    }
    const Icon = item.icon!;
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
        </div>
        <span>{item.label}</span>
      </Link>
    );
  };

  return (
    <>
      {/* spacer so content isn't hidden behind the nav on mobile */}
      <div className="h-16 md:hidden" aria-hidden />
      <nav
        className={cn(
          "md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border shadow-[0_-2px_10px_rgba(0,0,0,0.05)]",
          quickOrderOpen && "invisible pointer-events-none"
        )}
      >
        <div className="relative flex items-center justify-around h-16">
          {leftItems.map(renderItem)}

          {/* Center Smart Search FAB */}
          <div className="flex-1 flex items-center justify-center">
            <button
              onClick={() => setQuickOrderOpen(true)}
              aria-label={t("بحث ذكي", "Smart Search")}
              className="-mt-4 relative group"
            >
              <span className="absolute inset-0 rounded-full bg-primary/35 blur-md animate-pulse" aria-hidden />
              <span className="relative flex items-center justify-center w-[38px] h-[38px] rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-lg shadow-primary/30 ring-2 ring-background transition-transform group-active:scale-95">
                <Sparkles className="h-[18px] w-[18px]" />
              </span>
            </button>
          </div>

          {rightItems.map(renderItem)}
        </div>
      </nav>

      <QuickOrderSheet open={quickOrderOpen} onOpenChange={setQuickOrderOpen} />

      {/* Desktop: floating Smart Search — bottom-left, very soft pulse */}
      <button
        type="button"
        onClick={() => setQuickOrderOpen(true)}
        aria-label={t("بحث ذكي", "Smart Search")}
        title={t("بحث ذكي", "Smart Search")}
        className={cn(
          "hidden md:flex fixed bottom-6 left-6 z-50 items-center justify-center group",
          quickOrderOpen && "invisible pointer-events-none"
        )}
      >
        <span
          className="absolute inset-[-6px] rounded-full bg-primary/25 blur-md animate-soft-glow"
          aria-hidden
        />
        <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/75 text-primary-foreground shadow-lg shadow-primary/25 ring-2 ring-background transition-transform group-hover:scale-105 group-active:scale-95">
          <Sparkles className="h-6 w-6" />
        </span>
      </button>
    </>
  );
};

export default MobileBottomNav;
