import logoFullLight from "@/assets/logo-full-light.png";
import logoFullOnDark from "@/assets/logo-full.png";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** Shared full brand logo for customer / admin / driver / cashier login screens. */
export function LoginBrandLogo({
  className,
  size = "lg",
  /** Use transparent full logo on dark headers (cashier / admin chrome). */
  onDark = false,
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
  onDark?: boolean;
}) {
  const height = size === "sm" ? "h-8" : size === "md" ? "h-10" : "h-12";
  return (
    <div className={cn("flex justify-center", className)}>
      <img
        src={onDark ? logoFullOnDark : logoFullLight}
        alt={BRAND.nameAr}
        className={cn(height, "w-auto max-w-[16rem] object-contain")}
      />
    </div>
  );
}

