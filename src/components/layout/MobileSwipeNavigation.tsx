import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";

/** Main storefront tabs — same order as MobileBottomNav */
const TABS = ["/", "/categories", "/cart", "/profile"] as const;

const MIN_DX = 72;
const MAX_DURATION_MS = 700;
const HORIZONTAL_RATIO = 1.35;

function resolveTabIndex(pathname: string): number {
  if (pathname === "/") return 0;
  if (pathname.startsWith("/categories") || pathname.startsWith("/category/")) return 1;
  if (pathname.startsWith("/cart")) return 2;
  if (pathname.startsWith("/profile")) return 3;
  return -1;
}

function isIgnoredTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  return Boolean(
    target.closest(
      [
        "input",
        "textarea",
        "select",
        "[contenteditable='true']",
        "[data-no-swipe]",
        "[role='dialog']",
        "[data-state='open']",
        ".overflow-x-auto",
        "[data-radix-scroll-area-viewport]",
        "[data-radix-dialog-content]",
        "[data-radix-sheet-content]",
      ].join(",")
    )
  );
}

/**
 * Mobile-only horizontal swipe between main tabs (Home → Categories → Cart → Profile).
 * Ignores vertical scrolls, form fields, dialogs, and horizontal carousels.
 */
const MobileSwipeNavigation = () => {
  const isMobile = useIsMobile();
  const location = useLocation();
  const navigate = useNavigate();
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const pathnameRef = useRef(location.pathname);
  pathnameRef.current = location.pathname;

  useEffect(() => {
    if (!isMobile) return;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      if (resolveTabIndex(pathnameRef.current) < 0) return;
      if (isIgnoredTarget(e.target)) return;

      const touch = e.touches[0];
      startRef.current = { x: touch.clientX, y: touch.clientY, t: Date.now() };
    };

    const onEnd = (e: TouchEvent) => {
      const start = startRef.current;
      startRef.current = null;
      if (!start || e.changedTouches.length !== 1) return;

      const current = resolveTabIndex(pathnameRef.current);
      if (current < 0) return;

      const touch = e.changedTouches[0];
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      const dt = Date.now() - start.t;

      if (dt > MAX_DURATION_MS) return;
      if (Math.abs(dx) < MIN_DX) return;
      if (Math.abs(dx) < Math.abs(dy) * HORIZONTAL_RATIO) return;

      // Physical swipe left → next tab, swipe right → previous tab
      if (dx < 0 && current < TABS.length - 1) {
        navigate(TABS[current + 1]);
      } else if (dx > 0 && current > 0) {
        navigate(TABS[current - 1]);
      }
    };

    const onCancel = () => {
      startRef.current = null;
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", onCancel, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onCancel);
    };
  }, [isMobile, navigate]);

  return null;
};

export default MobileSwipeNavigation;
