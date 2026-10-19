import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function adminCardTabsListClass(tabCount: number) {
  return cn(
    "grid w-full h-auto gap-3 p-0 bg-transparent text-foreground",
    tabCount === 1 && "grid-cols-1 max-w-md",
    tabCount === 2 && "grid-cols-1 sm:grid-cols-2",
    tabCount === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    tabCount === 4 && "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4",
    tabCount >= 5 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5",
  );
}

export const adminCardTabTriggerClassName = cn(
  "group flex flex-col items-center justify-center gap-2.5",
  "min-h-[5.5rem] sm:min-h-[6.25rem] w-full rounded-xl border-2 border-border",
  "bg-card px-3 py-4 text-center shadow-sm",
  "whitespace-normal leading-snug",
  "text-sm sm:text-[0.9375rem] font-semibold",
  "transition-all hover:border-primary/40 hover:bg-muted/30",
  "data-[state=active]:border-primary data-[state=active]:bg-primary/5",
  "data-[state=active]:shadow-md data-[state=active]:ring-2 data-[state=active]:ring-primary/20",
  "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
);

export function AdminCardTabIcon({ icon: Icon, accent }: { icon: LucideIcon; accent: string }) {
  return (
    <span
      className={cn(
        "flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-xl",
        "transition-transform group-data-[state=active]:scale-105",
        accent,
      )}
    >
      <Icon className="h-5 w-5 sm:h-6 sm:w-6 shrink-0" aria-hidden />
    </span>
  );
}

export function AdminCardTabText({ shortLabel, label }: { shortLabel: string; label: string }) {
  return (
    <>
      <span className="block sm:hidden">{shortLabel}</span>
      <span className="hidden sm:block">{label}</span>
    </>
  );
}
