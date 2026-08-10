import { useMemo } from "react";
import { MapPin, Store } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useBranch } from "@/contexts/BranchContext";
import { useLanguage } from "@/contexts/LanguageContext";

function matchesCityFilter(city: string | null | undefined, filter: string) {
  const c = (city || "").trim();
  const f = filter.trim();
  if (!f) return true;
  if (f.includes("رياض") || f.toLowerCase().includes("riyadh")) {
    return c.includes("رياض") || c.toLowerCase().includes("riyadh");
  }
  if (f.includes("مكة") || f.toLowerCase().includes("makkah") || f.toLowerCase().includes("mecca")) {
    return c.includes("مكة") || c.toLowerCase().includes("makkah") || c.toLowerCase().includes("mecca");
  }
  return c.includes(f) || c.toLowerCase().includes(f.toLowerCase());
}

/** Forced branch picker — cannot dismiss without choosing (unless URL already set). */
const BranchPickerDialog = () => {
  const {
    branches,
    loading,
    pickerOpen,
    selectBranch,
    selectedBranch,
    setPickerOpen,
    pickerCityFilter,
  } = useBranch();
  const { t } = useLanguage();

  const filtered = useMemo(() => {
    if (!pickerCityFilter) return branches;
    return branches.filter((b) => matchesCityFilter(b.city, pickerCityFilter));
  }, [branches, pickerCityFilter]);

  const mustChoose = !selectedBranch;
  const open = pickerOpen && !loading && branches.length > 0;

  const title = pickerCityFilter
    ? t(`فروع ${pickerCityFilter}`, `${pickerCityFilter} branches`)
    : t("اختر فرعك", "Choose your branch");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && mustChoose) return;
        setPickerOpen(next);
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        dir="rtl"
        hideClose={mustChoose}
        onPointerDownOutside={(e) => {
          if (mustChoose) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (mustChoose) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 justify-center text-xl">
            <Store className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription className="text-center">
            {t(
              "سنعرض لك المنتجات ونطاق التوصيل الخاص بالفرع الذي تختاره",
              "We'll show products and delivery coverage for your selected branch"
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 mt-2">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {t("لا توجد فروع في هذه المدينة حالياً", "No branches in this city yet")}
            </p>
          ) : (
            filtered.map((branch) => (
              <Button
                key={branch.id}
                variant={selectedBranch?.id === branch.id ? "default" : "outline"}
                className="h-auto py-3 px-4 justify-start gap-3 text-right"
                onClick={() => selectBranch(branch)}
              >
                <MapPin className="h-5 w-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">{branch.name}</div>
                  <div className="text-xs opacity-70 truncate">
                    {branch.city || branch.address}
                  </div>
                </div>
              </Button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BranchPickerDialog;
