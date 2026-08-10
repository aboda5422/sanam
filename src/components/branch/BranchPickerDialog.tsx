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

/** Forced branch picker — cannot dismiss without choosing (unless URL already set). */
const BranchPickerDialog = () => {
  const { branches, loading, pickerOpen, selectBranch, selectedBranch, setPickerOpen } = useBranch();
  const { t } = useLanguage();

  const mustChoose = !selectedBranch;
  const open = pickerOpen && !loading && branches.length > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Allow closing only after a branch is already selected (change-branch flow)
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
            {t("اختر فرعك", "Choose your branch")}
          </DialogTitle>
          <DialogDescription className="text-center">
            {t(
              "سنعرض لك المنتجات ونطاق التوصيل الخاص بالفرع الذي تختاره",
              "We'll show products and delivery coverage for your selected branch"
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 mt-2">
          {branches.map((branch) => (
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
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BranchPickerDialog;
