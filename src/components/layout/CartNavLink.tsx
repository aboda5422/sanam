import { Link } from "react-router-dom";
import { ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCart } from "@/contexts/CartContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useCustomerOrderAlerts } from "@/hooks/useCustomerOrderAlerts";

type Props = {
  /** bottom-nav compact layout vs header pill */
  variant?: "header" | "nav";
  className?: string;
  label?: string;
  /** when true, apply active text styles (mobile nav) */
  active?: boolean;
};

/**
 * Cart icon that also surfaces active orders + staff chat alerts for the customer.
 * Active order stays reachable from the cart tab until delivered/cancelled.
 */
export default function CartNavLink({ variant = "header", className, label, active }: Props) {
  const { uniqueItems } = useCart();
  const { t } = useLanguage();
  const {
    hasActiveOrder,
    activeOrderCount,
    hasUnreadStaffChat,
    primaryAlertOrderId,
  } = useCustomerOrderAlerts();

  const href =
    hasUnreadStaffChat && primaryAlertOrderId
      ? `/order/${primaryAlertOrderId}`
      : uniqueItems > 0
        ? "/cart"
        : hasActiveOrder
          ? primaryAlertOrderId
            ? `/order/${primaryAlertOrderId}`
            : "/profile?tab=orders"
          : "/cart";

  const aria = hasUnreadStaffChat
    ? t("رسالة جديدة على طلبك", "New message on your order")
    : hasActiveOrder && uniqueItems === 0
      ? t("لديك طلب نشط", "You have an active order")
      : t("عربتي", "Cart");

  if (variant === "nav") {
    return (
      <Link
        to={href}
        className={cn(
          "relative flex flex-col items-center justify-center gap-1 flex-1 h-full text-[11px] transition-colors",
          active ? "text-primary font-bold" : "text-muted-foreground",
          className,
        )}
        aria-label={aria}
      >
        <div className="relative">
          <ShoppingCart
            className={cn(
              "h-6 w-6",
              hasUnreadStaffChat ? "text-rose-600" : active ? "text-primary" : undefined,
            )}
          />
          {hasUnreadStaffChat ? (
            <span className="absolute -top-1.5 -right-2 bg-rose-600 text-white text-[10px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1 ring-2 ring-background animate-pulse">
              !
            </span>
          ) : uniqueItems > 0 ? (
            <span className="absolute -top-1.5 -right-2 bg-primary text-primary-foreground text-[10px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1">
              {uniqueItems}
            </span>
          ) : hasActiveOrder ? (
            <span className="absolute -top-1.5 -right-2 bg-amber-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1">
              {activeOrderCount > 9 ? "9+" : activeOrderCount}
            </span>
          ) : null}
        </div>
        {label ? <span>{label}</span> : null}
      </Link>
    );
  }

  return (
    <Link
      to={href}
      aria-label={aria}
      title={aria}
      className={cn(
        "relative flex items-center justify-center rounded-full p-2.5 transition-colors",
        hasUnreadStaffChat
          ? "bg-rose-100 hover:bg-rose-200 text-rose-700"
          : "bg-primary/10 hover:bg-primary/15 text-primary",
        className,
      )}
    >
      <ShoppingCart className="h-5 w-5" />
      {hasUnreadStaffChat ? (
        <span className="absolute -top-1 -left-1 bg-rose-600 text-white text-[10px] font-bold min-w-5 h-5 px-1 rounded-full flex items-center justify-center animate-pulse">
          !
        </span>
      ) : uniqueItems > 0 ? (
        <span className="absolute -top-1 -left-1 bg-primary text-primary-foreground text-[10px] font-bold min-w-5 h-5 px-1 rounded-full flex items-center justify-center">
          {uniqueItems}
        </span>
      ) : hasActiveOrder ? (
        <span className="absolute -top-1 -left-1 bg-amber-500 text-white text-[10px] font-bold min-w-5 h-5 px-1 rounded-full flex items-center justify-center">
          {activeOrderCount > 9 ? "9+" : activeOrderCount}
        </span>
      ) : null}
    </Link>
  );
}
