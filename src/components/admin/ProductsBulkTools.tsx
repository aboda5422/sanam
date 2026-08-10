import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Trash2, FileSpreadsheet, Upload, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  downloadProductsTemplate,
  parseAndValidateProductsFile,
  toInsertPayload,
  type CategoryOption,
  type ImportError,
} from "@/lib/product-excel";

type Props = {
  categories: CategoryOption[] | undefined;
  productsCount: number;
};

const BATCH_SIZE = 50;

const ProductsBulkTools = ({ categories, productsCount }: Props) => {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState({ done: 0, total: 0 });

  const [templateLoading, setTemplateLoading] = useState(false);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });
  const [importErrors, setImportErrors] = useState<ImportError[]>([]);
  const [importSuccessCount, setImportSuccessCount] = useState<number | null>(null);

  const refreshCategories = async (): Promise<CategoryOption[]> => {
    const { data, error } = await supabase
      .from("categories")
      .select("id, name, name_en, is_active, sort_order")
      .order("sort_order");
    if (error) throw error;
    return data || [];
  };

  const handleDownloadTemplate = async () => {
    setTemplateLoading(true);
    try {
      // Live check: re-fetch categories so template matches current site state
      const liveCats = await refreshCategories();
      const active = liveCats.filter((c) => c.is_active !== false);
      if (!active.length) {
        toast.error("لا توجد أقسام مفعّلة لإنشاء القالب");
        return;
      }
      // Invalidate cache so admin UI stays in sync
      queryClient.invalidateQueries({ queryKey: ["all-categories"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });

      const meta = downloadProductsTemplate(liveCats);
      toast.success(
        `تم تنزيل القالب — ${meta.fieldsCount} حقل · ${meta.categoriesCount} قسم مفعّل`,
      );
    } catch {
      toast.error("فشل إنشاء القالب، حاول مجددًا");
    } finally {
      setTemplateLoading(false);
    }
  };

  const handleDeleteAll = async () => {
    if (deleteConfirmText.trim() !== "حذف") return;
    setDeleting(true);
    try {
      // Collect all product ids in pages
      const PAGE = 1000;
      let ids: string[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("products")
          .select("id")
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data?.length) break;
        ids = ids.concat(data.map((p) => p.id));
        if (data.length < PAGE) break;
        from += PAGE;
      }

      if (!ids.length) {
        toast.message("لا توجد منتجات للحذف");
        setDeleteOpen(false);
        return;
      }

      setDeleteProgress({ done: 0, total: ids.length });
      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const chunk = ids.slice(i, i + BATCH_SIZE);
        const { error } = await supabase.from("products").delete().in("id", chunk);
        if (error) throw error;
        setDeleteProgress({ done: Math.min(i + chunk.length, ids.length), total: ids.length });
      }

      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      toast.success(`تم حذف ${ids.length} منتج (الأقسام لم تُمس)`);
      setDeleteOpen(false);
      setDeleteConfirmText("");
    } catch {
      toast.error("فشل حذف المنتجات");
    } finally {
      setDeleting(false);
      setDeleteProgress({ done: 0, total: 0 });
    }
  };

  const onFileChosen = (file: File | null) => {
    if (!file) return;
    const okExt = /\.(xlsx|xls|csv)$/i.test(file.name);
    if (!okExt) {
      toast.error("الرجاء رفع ملف Excel بصيغة .xlsx");
      return;
    }
    setPendingFile(file);
    setImportErrors([]);
    setImportSuccessCount(null);
    setImportProgress({ done: 0, total: 0 });
    setUploadOpen(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleConfirmImport = async () => {
    if (!pendingFile) return;
    setValidating(true);
    setImportErrors([]);
    setImportSuccessCount(null);
    try {
      const liveCats = categories?.length ? categories : await refreshCategories();
      const result = await parseAndValidateProductsFile(pendingFile, liveCats);
      setValidating(false);

      if (!result.ok) {
        setImportErrors(result.errors);
        toast.error(`وُجد ${result.errors.length} خطأ — لم يتم الإدراج`);
        return;
      }

      setImporting(true);
      const items = result.products;
      setImportProgress({ done: 0, total: items.length });

      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const chunk = items.slice(i, i + BATCH_SIZE).map(toInsertPayload);
        const { error } = await supabase.from("products").insert(chunk);
        if (error) {
          throw new Error(error.message);
        }
        setImportProgress({ done: Math.min(i + chunk.length, items.length), total: items.length });
      }

      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      setImportSuccessCount(items.length);
      toast.success(`تم إدراج ${items.length} منتج بنجاح`);
    } catch (e: any) {
      toast.error(e?.message || "فشل رفع المنتجات");
      setImportErrors([{ row: 0, field: "النظام", message: e?.message || "فشل الإدراج في قاعدة البيانات" }]);
    } finally {
      setValidating(false);
      setImporting(false);
    }
  };

  const progressPct =
    importProgress.total > 0
      ? Math.round((importProgress.done / importProgress.total) * 100)
      : deleteProgress.total > 0
        ? Math.round((deleteProgress.done / deleteProgress.total) * 100)
        : 0;

  return (
    <>
      <div className="mb-4 rounded-xl border-2 border-red-500/80 bg-red-50/80 dark:bg-red-950/20 p-4 shadow-sm">
        <div className="flex items-start gap-3 mb-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-red-700 dark:text-red-400">أدوات حساسة — للمنتجات فقط</h3>
            <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-0.5">
              احذر: حذف الكل لا يمكن التراجع عنه. تنزيل القالب يحدّث نفسه من الأقسام وحقول بطاقة المنتج الحالية.
              مسار العمل: تنزيل النموذج ← تعبئة ← رفع الملف.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Delete all */}
          <button
            type="button"
            onClick={() => {
              setDeleteConfirmText("");
              setDeleteOpen(true);
            }}
            className="group flex flex-col items-center gap-2 rounded-xl border border-red-300 bg-white/90 px-3 py-4 text-center transition hover:border-red-500 hover:bg-red-50 hover:shadow-md"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 group-hover:bg-red-600 group-hover:text-white transition">
              <Trash2 className="h-6 w-6" />
            </span>
            <span className="text-sm font-semibold text-red-700">حذف كل المنتجات</span>
            <span className="text-[11px] text-muted-foreground leading-snug">
              يحذف المنتجات فقط ({productsCount}) — الأقسام تبقى كما هي
            </span>
          </button>

          {/* Download template */}
          <button
            type="button"
            onClick={handleDownloadTemplate}
            disabled={templateLoading}
            className="group flex flex-col items-center gap-2 rounded-xl border border-red-300 bg-white/90 px-3 py-4 text-center transition hover:border-amber-500 hover:bg-amber-50 hover:shadow-md disabled:opacity-60"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700 group-hover:bg-amber-500 group-hover:text-white transition">
              {templateLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : <FileSpreadsheet className="h-6 w-6" />}
            </span>
            <span className="text-sm font-semibold text-amber-800">نموذج ملف جاهز لرفع المنتجات</span>
            <span className="text-[11px] text-muted-foreground leading-snug">
              يفحص الأقسام وحقول البطاقة ثم يولّد قالب Excel محدّث
            </span>
          </button>

          {/* Upload file */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="group flex flex-col items-center gap-2 rounded-xl border border-red-300 bg-white/90 px-3 py-4 text-center transition hover:border-emerald-500 hover:bg-emerald-50 hover:shadow-md"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white transition">
              <Upload className="h-6 w-6" />
            </span>
            <span className="text-sm font-semibold text-emerald-800">رفع المنتجات عبر ملف</span>
            <span className="text-[11px] text-muted-foreground leading-snug">
              فحص صارم للحقول والأقسام ثم الإدراج مع شريط تقدم
            </span>
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          className="hidden"
          onChange={(e) => onFileChosen(e.target.files?.[0] ?? null)}
        />
      </div>

      {/* Delete confirmation */}
      <Dialog open={deleteOpen} onOpenChange={(o) => !deleting && setDeleteOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-700 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              تأكيد حذف كل المنتجات
            </DialogTitle>
            <DialogDescription className="text-right">
              سيتم حذف <strong>جميع المنتجات</strong> ({productsCount}) نهائيًا.
              الأقسام لن تُحذف. اكتب كلمة <strong>حذف</strong> للتأكيد.
            </DialogDescription>
          </DialogHeader>
          <input
            className="w-full rounded-md border px-3 py-2 text-sm"
            placeholder='اكتب "حذف" هنا'
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            disabled={deleting}
          />
          {deleting && deleteProgress.total > 0 && (
            <div className="space-y-2">
              <Progress value={progressPct} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">
                جاري الحذف… {deleteProgress.done} / {deleteProgress.total}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              إلغاء
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAll}
              disabled={deleting || deleteConfirmText.trim() !== "حذف"}
            >
              {deleting && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}
              حذف الكل نهائيًا
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload / validate / import */}
      <Dialog
        open={uploadOpen}
        onOpenChange={(o) => {
          if (validating || importing) return;
          setUploadOpen(o);
          if (!o) {
            setPendingFile(null);
            setImportErrors([]);
            setImportSuccessCount(null);
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>رفع المنتجات عبر ملف</DialogTitle>
            <DialogDescription className="text-right">
              سيتم فحص الملف بدقة مقابل حقول بطاقة المنتج وأقسام الموقع الحالية.
              عند وجود أي خطأ لن يتم الإدراج.
            </DialogDescription>
          </DialogHeader>

          {pendingFile && (
            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-emerald-600 shrink-0" />
              <span className="truncate font-medium">{pendingFile.name}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                ({(pendingFile.size / 1024).toFixed(1)} KB)
              </span>
            </div>
          )}

          {(validating || importing) && (
            <div className="space-y-2">
              <Progress
                value={importing ? progressPct : 15}
                className={`h-2 ${validating ? "animate-pulse" : ""}`}
              />
              <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {validating
                  ? "جاري فحص الملف والحقول والأقسام…"
                  : `جاري الإدراج… ${importProgress.done} / ${importProgress.total} (${progressPct}%)`}
              </p>
            </div>
          )}

          {importSuccessCount != null && !importing && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800 flex items-start gap-2">
              <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">تم الإدراج بنجاح</p>
                <p className="text-xs mt-0.5">أُضيف {importSuccessCount} منتج إلى الموقع.</p>
              </div>
            </div>
          )}

          {importErrors.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 space-y-2">
              <div className="flex items-center gap-2 text-red-700 font-semibold text-sm">
                <XCircle className="h-4 w-4" />
                أخطاء التحقق ({importErrors.length}) — لم يتم الإدراج
              </div>
              <ul className="max-h-48 overflow-y-auto space-y-1.5 text-xs">
                {importErrors.map((err, i) => (
                  <li key={i} className="rounded-md bg-white/70 border border-red-100 px-2 py-1.5 text-red-800">
                    {err.row > 0 && <span className="font-semibold">صف {err.row}</span>}
                    {err.row > 0 && " · "}
                    <span className="font-medium text-red-600">{err.field}</span>
                    {" — "}
                    {err.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setUploadOpen(false)}
              disabled={validating || importing}
            >
              {importSuccessCount != null ? "إغلاق" : "إلغاء"}
            </Button>
            {importSuccessCount == null && (
              <Button onClick={handleConfirmImport} disabled={!pendingFile || validating || importing}>
                {(validating || importing) && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}
                فحص ثم إدراج
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ProductsBulkTools;
