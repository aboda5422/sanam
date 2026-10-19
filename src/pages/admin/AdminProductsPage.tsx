import { useState, useEffect, useMemo, useDeferredValue } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { Search, Loader2, Plus, Pencil, Trash2, Tag, ToggleLeft, ToggleRight, Percent, Filter, BadgePercent, Star, FilterX, ChevronDown, ChevronLeft } from "lucide-react";
import { ImageIcon, ScanBarcode } from "lucide-react";
import { useAllCategories, useCategorySections } from "@/hooks/useCategories";
import ImageUpload from "@/components/admin/ImageUpload";
import ProductsBulkTools from "@/components/admin/ProductsBulkTools";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { applyBranchFilter, writeBranchId } from "@/lib/branch-scope";
import { Progress } from "@/components/ui/progress";
import { CATALOG_BRANCH_VIEW } from "@/lib/catalog";
import type { OfferChannel } from "@/lib/offer-channel";
import {
  applyUnitDiscount,
  clearUnitOffer,
  composeBaseStock,
  formatDualStock,
  hasDualUnit,
  mergeUnitStock,
  splitBaseStock,
  type OfferUnitTarget,
} from "@/lib/product-units";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const FEATURE_PRESETS = [
  "الأكثر مبيعاً",
  "الأوفر",
  "جديد",
  "توصية سنام",
  "كمية محدودة",
] as const;

type ProductForm = {
  name: string; name_en: string; price: string; original_price: string;
  image: string; unit: string; description: string; category_id: string;
  barcode: string;
  stock_quantity: string; cost_price: string;
  is_active: boolean; is_featured: boolean;
  dual: boolean;
  had_dual: boolean;
  alt_unit: string;
  alt_barcode: string;
  alt_image: string;
  alt_price: string;
  alt_original_price: string;
  units_per_pack: string;
  stock_cartons: string;
  stock_pieces: string;
};

function stockLabel(
  product: { units_per_pack?: number | null; unit?: string | null; alt_unit?: string | null },
  stock: number,
) {
  return hasDualUnit(product)
    ? formatDualStock(stock, Number(product.units_per_pack), product.unit || "قطعة", product.alt_unit || "حبة")
    : String(Math.max(0, Math.floor(Number(stock) || 0)));
}

function InlineStockEditor({
  product,
  branchId,
  stock,
}: {
  product: any;
  branchId: string;
  stock: number;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const dual = hasDualUnit(product);
  const pack = Number(product.units_per_pack) || 0;
  const [primaryQty, setPrimaryQty] = useState("0");
  const [pieceQty, setPieceQty] = useState("0");

  useEffect(() => {
    if (!open) return;
    if (dual) {
      const split = splitBaseStock(stock, pack);
      setPrimaryQty(String(split.cartons));
      setPieceQty(String(split.pieces));
    } else {
      setPrimaryQty(String(Math.max(0, Math.floor(Number(stock) || 0))));
      setPieceQty("0");
    }
  }, [open, stock, dual, pack]);

  const save = async () => {
    const next = dual
      ? composeBaseStock(Number(primaryQty) || 0, Number(pieceQty) || 0, pack)
      : Math.max(0, Math.floor(Number(primaryQty) || 0));
    if (!product?.catalog_id || !branchId) {
      toast.error("تعذر تحديد فرع هذا المخزون");
      return;
    }
    if (next === Math.max(0, Math.floor(Number(stock) || 0))) {
      setOpen(false);
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("product_branch" as any)
      .update({ stock_quantity: next })
      .eq("product_id", product.catalog_id)
      .eq("branch_id", branchId);
    setSaving(false);
    if (error) {
      toast.error("تعذر تحديث المخزون");
      return;
    }
    queryClient.setQueriesData({ queryKey: ["admin-products"] }, (old: any) => {
      if (!old?.rows) return old;
      return {
        ...old,
        rows: old.rows.map((row: any) => {
          if (row.catalog_id !== product.catalog_id) return row;
          return {
            ...row,
            stock_quantity: row.branch_id === branchId ? next : row.stock_quantity,
            branch_overlays: (row.branch_overlays || []).map((overlay: any) =>
              overlay.branch_id === branchId ? { ...overlay, stock_quantity: next } : overlay,
            ),
          };
        }),
      };
    });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`font-medium text-right hover:underline underline-offset-2 ${(stock ?? 0) < 5 ? "text-orange-600" : ""}`}
          title="تعديل المخزون"
        >
          {stockLabel(product, stock)}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 space-y-2" align="end" onClick={(e) => e.stopPropagation()}>
        <p className="text-xs font-medium">تحديث المخزون</p>
        <div className="space-y-1">
          <Label className="text-[11px]">{dual ? product.unit : "الكمية"}</Label>
          <Input
            type="number"
            min={0}
            value={primaryQty}
            onChange={(e) => setPrimaryQty(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
            }}
            className="h-8"
          />
        </div>
        {dual && (
          <div className="space-y-1">
            <Label className="text-[11px]">{product.alt_unit || "حبة"}</Label>
            <Input
              type="number"
              min={0}
              value={pieceQty}
              onChange={(e) => setPieceQty(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void save();
              }}
              className="h-8"
            />
          </div>
        )}
        <Button size="sm" className="w-full" disabled={saving} onClick={() => void save()}>
          {saving ? "جاري الحفظ…" : "حفظ"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

const emptyForm: ProductForm = {
  name: "", name_en: "", price: "", original_price: "", image: "", unit: "قطعة", description: "", category_id: "", barcode: "", stock_quantity: "0", cost_price: "", is_active: true, is_featured: false,
  dual: false, had_dual: false, alt_unit: "حبة", alt_barcode: "", alt_image: "", alt_price: "", alt_original_price: "", units_per_pack: "", stock_cartons: "0", stock_pieces: "0",
};

const AdminProductsPage = () => {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [categoryIdsFilter, setCategoryIdsFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [featuredFilter, setFeaturedFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "out">("all");
  const [offerFilter, setOfferFilter] = useState<"all" | "has_offer" | "no_offer">("all");
  const [unitFilter, setUnitFilter] = useState("all");
  const [unitSearch, setUnitSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const stock = searchParams.get("stock");
    if (stock === "low" || stock === "out") setStockFilter(stock);
  }, [searchParams]);
  const PAGE_SIZE_UI = 50;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [offerDialogOpen, setOfferDialogOpen] = useState(false);
  const [offerDiscount, setOfferDiscount] = useState("10");
  const [offerChannel, setOfferChannel] = useState<OfferChannel>("both");
  const [offerUnitTarget, setOfferUnitTarget] = useState<OfferUnitTarget>("primary");
  const [offerHasDual, setOfferHasDual] = useState(false);
  const [offerMode, setOfferMode] = useState<"selected" | "category">("selected");
  const [offerCategoryId, setOfferCategoryId] = useState("");
  const [removeOfferDialogOpen, setRemoveOfferDialogOpen] = useState(false);
  const [moveCategoryDialogOpen, setMoveCategoryDialogOpen] = useState(false);
  const [moveTargetCategoryId, setMoveTargetCategoryId] = useState("");
  const [customFeatureOpen, setCustomFeatureOpen] = useState(false);
  const [customFeatureLabel, setCustomFeatureLabel] = useState("");
  const [fetchingImage, setFetchingImage] = useState(false);
  const [fetchingAltImage, setFetchingAltImage] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergePack, setMergePack] = useState("12");
  const [mergeKeepId, setMergeKeepId] = useState("");
  const [mergeRows, setMergeRows] = useState<any[]>([]);
  const [bulkImageProgress, setBulkImageProgress] = useState<{ done: number; total: number; found: number } | null>(null);
  const [formSectionId, setFormSectionId] = useState("");
  const [moveSectionId, setMoveSectionId] = useState("");
  const [offerSectionId, setOfferSectionId] = useState("");
  const [deactivateAllOpen, setDeactivateAllOpen] = useState(false);
  const [activateAllOpen, setActivateAllOpen] = useState(false);
  const [bulkStatusProgress, setBulkStatusProgress] = useState<{
    mode: "deactivate" | "activate";
    done: number;
    total: number;
  } | null>(null);

  const { scopedBranchIds, filterBranchId, branches } = useAdminAuth();
  const deferredSearch = useDeferredValue(search);
  const effectiveBranchId = filterBranchId || writeBranchId(filterBranchId, scopedBranchIds);
  const showBranchColumns = !filterBranchId && (branches?.length ?? 0) > 1;
  const overlayBranches = showBranchColumns
    ? (scopedBranchIds?.length
        ? (branches || []).filter((b: any) => scopedBranchIds.includes(b.id))
        : (branches || []))
    : [];
  // catalog_branch_products has one row per branch. Anchor to one active branch so a
  // deactivated branch's overlays are not added on top of the shared catalog.
  const catalogAnchorBranchId =
    effectiveBranchId ||
    (showBranchColumns ? overlayBranches[0]?.id : branches?.[0]?.id) ||
    null;
  const anchorBranchName = ((branches || []).find((b: any) => b.id === catalogAnchorBranchId)?.name || "")
    .replace(/^سنام\s+/, "");
  const { data: categories, refetch: refetchCategories } = useAllCategories(scopedBranchIds);
  const { data: categorySectionsData } = useCategorySections();
  const categorySections = categorySectionsData ?? [];
  const categoryNameMap = new Map((categories || []).map((c: any) => [c.id, c.name]));

  const sectionSubs = useMemo(() => {
    if (sectionFilter === "all") return [];
    return [...(categories || [])]
      .filter((c) => c.section === sectionFilter)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, "ar"));
  }, [categories, sectionFilter]);

  const allSectionSubIds = useMemo(() => sectionSubs.map((c) => c.id), [sectionSubs]);
  const allSubsSelected =
    allSectionSubIds.length > 0 && allSectionSubIds.every((id) => categoryIdsFilter.includes(id));

  const sectionsWithSubs = useMemo(() => {
    const known = new Set(categorySections.map((s) => s.id));
    const grouped = categorySections.map((section) => ({
      section,
      subs: [...(categories || [])]
        .filter((c) => c.section === section.id)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, "ar")),
    }));
    const orphanSubs = [...(categories || [])].filter((c) => !c.section || !known.has(c.section));
    if (orphanSubs.length > 0) {
      grouped.push({
        section: { id: "__other__", title: "أقسام أخرى", titleEn: "Other" },
        subs: orphanSubs.sort((a, b) => a.name.localeCompare(b.name, "ar")),
      });
    }
    return grouped;
  }, [categorySections, categories]);

  const [expandedFilterSections, setExpandedFilterSections] = useState<Set<string>>(new Set());

  const categoriesFilterLabel = (() => {
    if (sectionFilter === "all") return "الأقسام";
    const sectionTitle =
      categorySections.find((s) => s.id === sectionFilter)?.title ??
      (sectionFilter === "__other__" ? "أقسام أخرى" : sectionFilter);
    if (allSubsSelected) return sectionTitle;
    if (categoryIdsFilter.length === 0) return sectionTitle;
    if (categoryIdsFilter.length === 1) {
      return categories?.find((c) => c.id === categoryIdsFilter[0])?.name ?? sectionTitle;
    }
    return `${sectionTitle} (${categoryIdsFilter.length})`;
  })();

  const clearCategoryFilters = () => {
    setSectionFilter("all");
    setCategoryIdsFilter([]);
    setExpandedFilterSections(new Set());
  };

  const selectSectionAll = (sectionId: string, subIds: string[]) => {
    setSectionFilter(sectionId);
    setCategoryIdsFilter([...subIds]);
    setExpandedFilterSections((prev) => new Set(prev).add(sectionId));
  };

  const toggleFilterSectionExpand = (sectionId: string) => {
    setExpandedFilterSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

  const toggleSubInFilter = (sectionId: string, subId: string, sectionSubIds: string[]) => {
    const base = sectionFilter === sectionId ? categoryIdsFilter : sectionSubIds;
    const next = base.includes(subId) ? base.filter((x) => x !== subId) : [...base, subId];
    setSectionFilter(sectionId);
    setCategoryIdsFilter(next);
    setExpandedFilterSections((prev) => new Set(prev).add(sectionId));
  };

  const toggleAllSubsInFilter = (sectionId: string, sectionSubIds: string[], checked: boolean) => {
    setSectionFilter(sectionId);
    setCategoryIdsFilter(checked ? [...sectionSubIds] : []);
    setExpandedFilterSections((prev) => new Set(prev).add(sectionId));
  };

  const formSectionSubs = useMemo(() => {
    if (!formSectionId) return [];
    return [...(categories || [])]
      .filter((c) => c.section === formSectionId)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, "ar"));
  }, [categories, formSectionId]);

  const moveSectionSubs = useMemo(() => {
    if (!moveSectionId) return [];
    return [...(categories || [])]
      .filter((c) => c.section === moveSectionId)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, "ar"));
  }, [categories, moveSectionId]);

  const offerSectionSubs = useMemo(() => {
    if (!offerSectionId) return [];
    return [...(categories || [])]
      .filter((c) => c.section === offerSectionId)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, "ar"));
  }, [categories, offerSectionId]);

  const resolveSectionForCategory = (categoryId: string) =>
    (categories || []).find((c) => c.id === categoryId)?.section || "";

  const applyCatalogBranchScope = <T extends { eq: (c: string, v: string) => T; in: (c: string, v: string[]) => T }>(q: T): T => {
    if (effectiveBranchId) return q.eq("branch_id", effectiveBranchId);
    return applyBranchFilter(q, scopedBranchIds);
  };

  const scopeOfferBranch = <T extends { eq: (c: string, v: string) => T }>(q: T): T => {
    if (catalogAnchorBranchId) return q.eq("branch_id", catalogAnchorBranchId);
    return applyCatalogBranchScope(q as T & { in: (c: string, v: string[]) => T });
  };

  const writeBranchOffer = async (row: { id: string; catalog_id?: string; branch_id?: string }, patch: Record<string, unknown>) => {
    const overlay: Record<string, unknown> = {};
    for (const key of ["price", "original_price", "alt_price", "alt_original_price", "offer_channel", "offer_unit"]) {
      if (key in patch) overlay[key] = patch[key];
    }
    if (row.catalog_id && row.branch_id && Object.keys(overlay).length > 0) {
      const { error } = await supabase
        .from("product_branch" as any)
        .update(overlay)
        .eq("product_id", row.catalog_id)
        .eq("branch_id", row.branch_id);
      if (error) throw error;
      return;
    }
    const { error } = await supabase.from("products").update(patch as any).eq("id", row.id);
    if (error) throw error;
  };

  const invalidateProductQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    queryClient.invalidateQueries({ queryKey: ["admin-product-stats"] });
  };

  const productsQueryKey = [
    "admin-products",
    currentPage,
    effectiveBranchId,
    catalogAnchorBranchId,
    scopedBranchIds,
    deferredSearch,
    sectionFilter,
    categoryIdsFilter,
    statusFilter,
    featuredFilter,
    stockFilter,
    offerFilter,
    unitFilter,
  ] as const;

  const { data: productsPage, isLoading } = useQuery({
    queryKey: productsQueryKey,
    queryFn: async () => {
      const selectCols =
        "id, catalog_id, name, name_en, price, original_price, image, is_active, is_featured, extra_label, unit, category_id, description, barcode, stock_quantity, cost_price, branch_id, offer_channel, has_offer, alt_unit, alt_barcode, alt_image, units_per_pack, alt_price, alt_original_price, offer_unit, catalog_is_active";
      const from = (currentPage - 1) * PAGE_SIZE_UI;
      const to = from + PAGE_SIZE_UI - 1;

      let q = supabase
        .from(CATALOG_BRANCH_VIEW as "products")
        .select(selectCols, { count: "exact" })
        .order("is_active", { ascending: false })
        .order("name")
        .range(from, to);
      if (catalogAnchorBranchId) {
        // One row per catalog product. Other branches are columns, not extra products.
        q = q.eq("branch_id", catalogAnchorBranchId);
      } else {
        q = applyCatalogBranchScope(q);
      }

      const term = deferredSearch.trim();
      if (term) {
        const safe = term.replace(/[%_,]/g, "");
        if (safe) {
          q = q.or(`name.ilike.%${safe}%,name_en.ilike.%${safe}%,barcode.eq.${safe}`);
        }
      }

      if (sectionFilter !== "all") {
        if (categoryIdsFilter.length > 0) {
          q = q.in("category_id", categoryIdsFilter);
        } else {
          q = q.eq("category_id", "00000000-0000-0000-0000-000000000000");
        }
      }

      if (statusFilter === "active") q = q.eq(filterBranchId ? "is_active" : "catalog_is_active", true);
      else if (statusFilter === "inactive") q = q.eq(filterBranchId ? "is_active" : "catalog_is_active", false);

      if (featuredFilter === "featured") q = q.eq("is_featured", true);
      else if (featuredFilter === "not_featured") q = q.eq("is_featured", false);
      else if (featuredFilter !== "all") {
        q = q.eq("is_featured", true);
        if (featuredFilter === "الأكثر مبيعاً") {
          q = q.or(`extra_label.eq.${featuredFilter},extra_label.is.null`);
        } else {
          q = q.eq("extra_label", featuredFilter);
        }
      }

      if (offerFilter === "has_offer") q = q.eq("has_offer", true);
      else if (offerFilter === "no_offer") q = q.eq("has_offer", false);

      if (stockFilter === "low") q = q.lt("stock_quantity", 5);
      else if (stockFilter === "out") q = q.lte("stock_quantity", 0);

      if (unitFilter !== "all") {
        const safe = unitFilter.replace(/"/g, '\\"');
        q = q.or(`unit.eq."${safe}",alt_unit.eq."${safe}"`);
      }

      const { data, error, count } = await q;
      if (error) throw error;
      const rows = (data || []) as any[];

      if (showBranchColumns && rows.length > 0) {
        const catalogIds = [...new Set(rows.map((r) => r.catalog_id).filter(Boolean))];
        if (catalogIds.length > 0) {
          let oq = supabase
            .from("product_branch" as "products")
            .select("product_id, branch_id, stock_quantity, price, original_price, alt_price, alt_original_price, is_active")
            .in("product_id", catalogIds);
          if (scopedBranchIds?.length) oq = oq.in("branch_id", scopedBranchIds);
          const { data: overlays, error: oErr } = await oq;
          if (oErr) throw oErr;
          const byCatalog = new Map<string, any[]>();
          for (const o of overlays || []) {
            const list = byCatalog.get(o.product_id) || [];
            list.push(o);
            byCatalog.set(o.product_id, list);
          }
          for (const row of rows) {
            row.branch_overlays = byCatalog.get(row.catalog_id) || [];
          }
        }
      }

      return { rows, total: count ?? 0 };
    },
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const products = productsPage?.rows;
  const filteredTotal = productsPage?.total ?? 0;

  const { data: unitOptions = [], isFetching: unitsLoading } = useQuery({
    queryKey: ["admin-unit-options", catalogAnchorBranchId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("catalog_unit_options" as any, {
        p_branch: catalogAnchorBranchId,
      });
      if (error) throw error;
      return (data || []) as { unit: string; n: number }[];
    },
    staleTime: 5 * 60 * 1000,
  });
  const visibleUnits = useMemo(() => {
    const term = unitSearch.trim().toLowerCase();
    const list = term
      ? unitOptions.filter((row) => row.unit.toLowerCase().includes(term))
      : unitOptions;
    return list.slice(0, 40);
  }, [unitOptions, unitSearch]);

  const { data: productStats } = useQuery({
    queryKey: ["admin-product-stats", effectiveBranchId, scopedBranchIds, catalogAnchorBranchId],
    queryFn: async () => {
      const head = async (extra?: (q: any) => any) => {
        let q = supabase
          .from(CATALOG_BRANCH_VIEW as "products")
          .select("id", { count: "exact", head: true });
        if (catalogAnchorBranchId) {
          q = q.eq("branch_id", catalogAnchorBranchId);
        } else {
          q = applyCatalogBranchScope(q);
        }
        if (extra) q = extra(q);
        const { count, error } = await q;
        if (error) throw error;
        return count ?? 0;
      };
      const statusColumn = filterBranchId ? "is_active" : "catalog_is_active";
      const [total, active, inactive, has_offer] = await Promise.all([
        head(),
        head((q) => q.eq(statusColumn, true)),
        head((q) => q.eq(statusColumn, false)),
        head((q) => q.eq("has_offer", true)),
      ]);
      return { total, active, inactive, has_offer };
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const bid =
        writeBranchId(filterBranchId, scopedBranchIds) ||
        (editingId ? (products?.find((p: any) => p.id === editingId)?.branch_id as string | undefined) : undefined) ||
        null;
      const pack = Number(form.units_per_pack);
      let stock: number;
      if (form.dual) {
        if (!form.alt_unit.trim()) throw new Error("اسم الوحدة الثانية مطلوب");
        if (!(pack >= 2)) throw new Error("عدد الحبات داخل الكرتون يجب أن يكون 2 أو أكثر");
        if (form.alt_price === "") throw new Error("سعر الوحدة الثانية مطلوب");
        if (form.barcode.trim() && form.alt_barcode.trim() && form.barcode.trim() === form.alt_barcode.trim()) {
          throw new Error("باركود الوحدة الثانية يطابق باركود الوحدة الأولى");
        }
        stock = composeBaseStock(Number(form.stock_cartons) || 0, Number(form.stock_pieces) || 0, pack);
      } else if (form.had_dual) {
        if ((Number(form.stock_pieces) || 0) !== 0) {
          throw new Error("يوجد حبات مفتوحة. بعها أو أكمل الكرتون قبل إزالة الوحدة الثانية");
        }
        stock = Number(form.stock_cartons) || 0;
      } else {
        stock = form.stock_quantity !== "" ? Number(form.stock_quantity) : 0;
      }

      const payload: any = {
        name: form.name, name_en: form.name_en || null, price: Number(form.price),
        original_price: form.original_price ? Number(form.original_price) : null,
        image: form.image || null, unit: form.unit, description: form.description || null,
        barcode: form.barcode || null,
        stock_quantity: stock,
        cost_price: form.cost_price !== "" ? Number(form.cost_price) : null,
        category_id: form.category_id || null, is_active: form.is_active, is_featured: form.is_featured,
      };

      const applyDual = async (productId: string) => {
        if (!bid) throw new Error("اختر فرعاً من أعلى الصفحة قبل حفظ الوحدات");
        const { error } = await supabase.rpc("catalog_admin_set_dual_unit" as any, {
          p_branch_id: bid,
          p_product_id: productId,
          p_enabled: form.dual,
          p_alt_unit: form.dual ? form.alt_unit.trim() : null,
          p_alt_barcode: form.dual ? form.alt_barcode.trim() || null : null,
          p_alt_image: form.dual ? form.alt_image || null : null,
          p_units_per_pack: form.dual ? pack : null,
          p_alt_price: form.dual ? Number(form.alt_price) : null,
          p_alt_original_price: form.dual && form.alt_original_price !== "" ? Number(form.alt_original_price) : null,
          p_stock_quantity: stock,
        });
        if (error) throw error;
      };

      if (editingId && (form.dual || form.had_dual)) {
        await applyDual(editingId);
      }

      let savedId = editingId;
      if (bid) {
        const { data, error } = await supabase.rpc("catalog_admin_save_product" as any, {
          p_branch_id: bid,
          p_product_id: editingId,
          p_name: form.name,
          p_name_en: form.name_en || null,
          p_price: Number(form.price),
          p_original_price: form.original_price ? Number(form.original_price) : null,
          p_image: form.image || null,
          p_unit: form.unit,
          p_description: form.description || null,
          p_barcode: form.barcode || null,
          p_stock_quantity: stock,
          p_cost_price: form.cost_price !== "" ? Number(form.cost_price) : null,
          p_category_id: form.category_id || null,
          p_is_active: form.is_active,
          p_is_featured: form.is_featured,
        });
        if (!error) {
          savedId = (data as any)?.id || editingId;
        } else {
          console.warn("catalog_admin_save_product failed, falling back", error);
          if (editingId) {
            const { error: upErr } = await supabase.from("products").update(payload).eq("id", editingId);
            if (upErr) throw upErr;
          } else {
            payload.branch_id = bid;
            const { data: inserted, error: insErr } = await supabase.from("products").insert(payload).select("id").single();
            if (insErr) throw insErr;
            savedId = inserted.id;
          }
        }
      } else if (editingId) {
        const { error } = await supabase.from("products").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        throw new Error("اختر فرعاً من أعلى الصفحة قبل إضافة منتج");
      }

      if (!editingId && form.dual && savedId) {
        try {
          await applyDual(savedId);
        } catch (e) {
          await supabase.from("products").update({ stock_quantity: Number(form.stock_cartons) || 0 }).eq("id", savedId);
          setEditingId(savedId);
          throw e;
        }
      }
    },
    onSuccess: () => {
      invalidateProductQueries();
      toast.success(editingId ? "تم التحديث" : "تمت الإضافة");
      setDialogOpen(false); setEditingId(null); setForm(emptyForm);
    },
    onError: (e: any) => toast.error(e?.message || "حدث خطأ"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateProductQueries();
      toast.success("تم الحذف"); setDeleteId(null);
    },
    onError: () => toast.error("حدث خطأ"),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: "is_active" | "is_featured"; value: boolean }) => {
      const updateData = field === "is_active" ? { is_active: value } : { is_featured: value };
      const { error } = await supabase.from("products").update(updateData).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateProductQueries();
      toast.success("تم التحديث");
    },
    onError: () => toast.error("حدث خطأ"),
  });

  const bulkToggleMutation = useMutation({
    mutationFn: async ({ value }: { field: "is_active"; value: boolean }) => {
      const branchId = catalogAnchorBranchId;
      if (!branchId) throw new Error("اختر الفرع من أعلى الصفحة");
      const ids = Array.from(selectedIds);
      for (const id of ids) {
        const { error } = await supabase.rpc("catalog_admin_set_branch_flag" as any, {
          p_branch_id: branchId,
          p_product_id: id,
          p_field: "is_active",
          p_value: value,
        });
        if (error) throw error;
      }
    },
    onSuccess: (_data, vars) => {
      invalidateProductQueries();
      const where = anchorBranchName ? ` في ${anchorBranchName}` : "";
      toast.success(vars.value ? `تم التفعيل${where}` : `تم التعطيل${where}`);
      setSelectedIds(new Set());
    },
    onError: (e: any) => toast.error(e?.message || "حدث خطأ"),
  });

  const deactivateAllMutation = useMutation({
    mutationFn: async (totalTarget: number) => {
      const PAGE = 500;
      const total = totalTarget;
      let totalUpdated = 0;
      setBulkStatusProgress({ mode: "deactivate", done: 0, total });
      try {
        // Batch updates: PostgREST max-rows can silently cap a single UPDATE+SELECT
        while (true) {
          let fetchQ = supabase
            .from("products")
            .select("id")
            .eq("is_active", true)
            .limit(PAGE);
          if (filterBranchId) {
            fetchQ = fetchQ.eq("branch_id", filterBranchId);
          } else {
            fetchQ = applyBranchFilter(fetchQ, scopedBranchIds);
          }
          const { data: batch, error: fetchError } = await fetchQ;
          if (fetchError) throw fetchError;
          if (!batch?.length) break;

          const ids = batch.map((r) => r.id);
          const { error } = await supabase
            .from("products")
            .update({ is_active: false })
            .in("id", ids);
          if (error) throw error;
          totalUpdated += ids.length;
          setBulkStatusProgress({
            mode: "deactivate",
            done: totalUpdated,
            total: Math.max(total, totalUpdated),
          });
          if (ids.length < PAGE) break;
        }
        return totalUpdated;
      } catch (e) {
        setBulkStatusProgress(null);
        throw e;
      }
    },
    onSuccess: (count) => {
      invalidateProductQueries();
      toast.success(count > 0 ? `تم تعطيل ${count} منتج` : "لا توجد منتجات مفعّلة");
      setSelectedIds(new Set());
      setBulkStatusProgress(null);
      setDeactivateAllOpen(false);
    },
    onError: () => {
      setBulkStatusProgress(null);
      toast.error("تعذر تعطيل المنتجات");
    },
  });

  const activateAllMutation = useMutation({
    mutationFn: async (totalTarget: number) => {
      const PAGE = 500;
      const total = totalTarget;
      let totalUpdated = 0;
      setBulkStatusProgress({ mode: "activate", done: 0, total });
      try {
        while (true) {
          let fetchQ = supabase
            .from("products")
            .select("id")
            .eq("is_active", false)
            .limit(PAGE);
          if (filterBranchId) {
            fetchQ = fetchQ.eq("branch_id", filterBranchId);
          } else {
            fetchQ = applyBranchFilter(fetchQ, scopedBranchIds);
          }
          const { data: batch, error: fetchError } = await fetchQ;
          if (fetchError) throw fetchError;
          if (!batch?.length) break;

          const ids = batch.map((r) => r.id);
          const { error } = await supabase
            .from("products")
            .update({ is_active: true })
            .in("id", ids);
          if (error) throw error;
          totalUpdated += ids.length;
          setBulkStatusProgress({
            mode: "activate",
            done: totalUpdated,
            total: Math.max(total, totalUpdated),
          });
          if (ids.length < PAGE) break;
        }
        return totalUpdated;
      } catch (e) {
        setBulkStatusProgress(null);
        throw e;
      }
    },
    onSuccess: (count) => {
      invalidateProductQueries();
      toast.success(count > 0 ? `تم تفعيل ${count} منتج` : "لا توجد منتجات معطّلة");
      setSelectedIds(new Set());
      setBulkStatusProgress(null);
      setActivateAllOpen(false);
    },
    onError: () => {
      setBulkStatusProgress(null);
      toast.error("تعذر تفعيل المنتجات");
    },
  });

  const bulkStatusPct =
    bulkStatusProgress && bulkStatusProgress.total > 0
      ? Math.min(100, Math.round((bulkStatusProgress.done / bulkStatusProgress.total) * 100))
      : null;

  const bulkFeatureMutation = useMutation({
    mutationFn: async (label: string | null) => {
      const ids = Array.from(selectedIds);
      const trimmed = label?.trim() || null;
      for (const id of ids) {
        const { error } = await supabase
          .from("products")
          .update(
            trimmed
              ? { is_featured: true, extra_label: trimmed }
              : { is_featured: false, extra_label: null },
          )
          .eq("id", id);
        if (error) throw error;
      }
      return trimmed;
    },
    onSuccess: (label) => {
      invalidateProductQueries();
      queryClient.invalidateQueries({ queryKey: ["featured-products"] });
      toast.success(
        label
          ? `تم تمييز ${selectedIds.size} منتج بـ «${label}»`
          : `تم إلغاء التمييز عن ${selectedIds.size} منتج`,
      );
      setSelectedIds(new Set());
      setCustomFeatureOpen(false);
      setCustomFeatureLabel("");
    },
    onError: () => toast.error("حدث خطأ"),
  });

  // Apply offer to selected products OR entire category (paged from DB)
  const bulkOfferMutation = useMutation({
    mutationFn: async ({
      discountPercent,
      mode,
      catId,
      channel,
      unitTarget,
    }: {
      discountPercent: number;
      mode: "selected" | "category";
      catId?: string;
      channel: OfferChannel;
      unitTarget: OfferUnitTarget;
    }) => {
      const PAGE = 500;
      let updated = 0;

      const applyToRows = async (rows: any[]) => {
        for (const p of rows) {
          const patch = Object.fromEntries(
            Object.entries(applyUnitDiscount(p, discountPercent, channel, unitTarget)).filter(([, v]) => v !== undefined),
          );
          await writeBranchOffer(p, patch);
          updated++;
        }
      };

      if (mode === "selected") {
        const ids = Array.from(selectedIds);
        for (let i = 0; i < ids.length; i += PAGE) {
          const chunk = ids.slice(i, i + PAGE);
          let fq = supabase
            .from(CATALOG_BRANCH_VIEW as "products")
            .select("id, catalog_id, branch_id, price, original_price, alt_price, alt_original_price, alt_unit, units_per_pack, offer_unit")
            .in("id", chunk);
          fq = scopeOfferBranch(fq);
          const { data, error } = await fq;
          if (error) throw error;
          await applyToRows((data || []) as any[]);
        }
      } else if (mode === "category" && catId) {
        let from = 0;
        while (true) {
          let fq = supabase
            .from(CATALOG_BRANCH_VIEW as "products")
            .select("id, catalog_id, branch_id, price, original_price, alt_price, alt_original_price, alt_unit, units_per_pack, offer_unit")
            .eq("category_id", catId)
            .range(from, from + PAGE - 1);
          fq = scopeOfferBranch(fq);
          const { data, error } = await fq;
          if (error) throw error;
          if (!data?.length) break;
          await applyToRows(data as any[]);
          if (data.length < PAGE) break;
          from += PAGE;
        }
      }
      return updated;
    },
    onSuccess: (count) => {
      invalidateProductQueries();
      toast.success(`تم تطبيق العرض على ${count} منتج`);
      setSelectedIds(new Set());
      setOfferDialogOpen(false);
      setOfferChannel("both");
      setOfferUnitTarget("primary");
    },
    onError: () => toast.error("حدث خطأ"),
  });

  // Remove offers (restore original price)
  const removeOfferMutation = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selectedIds);
      const PAGE = 500;
      for (let i = 0; i < ids.length; i += PAGE) {
        const chunk = ids.slice(i, i + PAGE);
        let fq = supabase
          .from(CATALOG_BRANCH_VIEW as "products")
          .select("id, catalog_id, branch_id, price, original_price, alt_price, alt_original_price, alt_unit, units_per_pack, offer_unit")
          .in("id", chunk);
        fq = scopeOfferBranch(fq);
        const { data, error } = await fq;
        if (error) throw error;
        for (const product of data || []) {
          const patch = clearUnitOffer(product as any);
          const hasPrimary = patch.price != null;
          const hasAlt = patch.alt_price != null;
          if (!hasPrimary && !hasAlt && !product.original_price && !product.alt_original_price) continue;
          await writeBranchOffer(product, patch);
        }
      }
    },
    onSuccess: () => {
      invalidateProductQueries();
      toast.success("تم إزالة العروض");
      setSelectedIds(new Set());
      setRemoveOfferDialogOpen(false);
    },
    onError: () => toast.error("حدث خطأ"),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selectedIds);
      for (const id of ids) {
        const { error } = await supabase.from("products").delete().eq("id", id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      invalidateProductQueries();
      toast.success(`تم حذف ${selectedIds.size} منتج`);
      setSelectedIds(new Set());
    },
    onError: () => toast.error("حدث خطأ"),
  });

  // Move selected products to a different category
  const moveCategoryMutation = useMutation({
    mutationFn: async (targetCatId: string) => {
      const ids = Array.from(selectedIds);
      const { error } = await supabase.from("products").update({ category_id: targetCatId }).in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => {
      invalidateProductQueries();
      toast.success(`تم نقل ${count} منتج للقسم الجديد`);
      setSelectedIds(new Set());
      setMoveCategoryDialogOpen(false);
      setMoveTargetCategoryId("");
    },
    onError: () => toast.error("فشل نقل المنتجات"),
  });

  // Fetch image by barcode for the form
  const fetchImageForBarcode = async (barcode: string, field: "image" | "alt_image") => {
    if (!barcode.trim()) {
      toast.error("أدخل رقم الباركود أولاً");
      return;
    }
    const setBusy = field === "image" ? setFetchingImage : setFetchingAltImage;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-product-image", {
        body: { barcode: barcode.trim() },
      });
      if (error) throw error;
      if (data?.success && data.image_url) {
        setForm((prev) => ({ ...prev, [field]: data.image_url }));
        toast.success("تم جلب الصورة من المصادر المفتوحة");
      } else {
        toast.error(data?.error || "لم نجد صورة لهذا الباركود");
      }
    } catch (e: any) {
      toast.error(e.message || "فشل البحث");
    } finally {
      setBusy(false);
    }
  };

  const openMerge = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length !== 2) {
      toast.error("حدّد منتجين فقط: أحدهما للكرتون والآخر للحبة");
      return;
    }
    const { data, error } = await supabase
      .from(CATALOG_BRANCH_VIEW as "products")
      .select("id, name, unit, price, stock_quantity, barcode, units_per_pack, branch_id")
      .in("id", ids);
    if (error || !data || data.length !== 2) {
      toast.error("تعذر قراءة المنتجين");
      return;
    }
    if (data.some((p: any) => Number(p.units_per_pack) > 1)) {
      toast.error("أحد المنتجين لديه وحدة ثانية بالفعل");
      return;
    }
    setMergeRows(data);
    setMergeKeepId(data[0].id);
    setMergePack("12");
    setMergeOpen(true);
  };

  const prepareOfferDialog = (mode: "selected" | "category") => {
    setOfferMode(mode);
    setOfferUnitTarget("primary");
    setOfferHasDual(false);
    setOfferDialogOpen(true);
    if (mode !== "selected") {
      setOfferHasDual(true);
      return;
    }
    const ids = Array.from(selectedIds);
    const onPage = (products || []).filter((p: any) => ids.includes(p.id));
    if (onPage.length === ids.length) {
      setOfferHasDual(onPage.some((p: any) => hasDualUnit(p)));
      return;
    }
    supabase
      .from(CATALOG_BRANCH_VIEW as "products")
      .select("id, units_per_pack, alt_unit")
      .in("id", ids)
      .then(({ data }) => setOfferHasDual((data || []).some((p: any) => hasDualUnit(p))));
  };

  const mergeMutation = useMutation({
    mutationFn: async () => {
      const keep = mergeRows.find((p) => p.id === mergeKeepId);
      const drop = mergeRows.find((p) => p.id !== mergeKeepId);
      if (!keep || !drop) throw new Error("اختر منتج الكرتون");
      const pack = Number(mergePack);
      if (!(pack >= 2)) throw new Error("عدد الحبات داخل الكرتون يجب أن يكون 2 أو أكثر");
      const bid = keep.branch_id as string;
      const { error } = await supabase.rpc("catalog_merge_product_units" as any, {
        p_branch_id: bid,
        p_keep_id: keep.id,
        p_drop_id: drop.id,
        p_units_per_pack: pack,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateProductQueries();
      toast.success("تم دمج الوحدتين في صنف واحد");
      setSelectedIds(new Set());
      setMergeOpen(false);
    },
    onError: (e: any) => toast.error(e?.message || "تعذر الدمج"),
  });

  // Bulk fetch images for selected products that have a barcode but no image
  const bulkFetchImages = async () => {
    let targets = products?.filter((p: any) => selectedIds.has(p.id) && p.barcode && !p.image) || [];
    if (targets.length === 0 && selectedIds.size > 0) {
      const ids = Array.from(selectedIds);
      let fq = supabase
        .from(CATALOG_BRANCH_VIEW as "products")
        .select("id, barcode, image")
        .in("id", ids);
      fq = applyCatalogBranchScope(fq);
      const { data } = await fq;
      targets = (data || []).filter((p: any) => p.barcode && !p.image);
    }
    if (targets.length === 0) {
      toast.error("لا توجد منتجات محددة لها باركود وبدون صورة");
      return;
    }
    setBulkImageProgress({ done: 0, total: targets.length, found: 0 });
    let found = 0;
    for (let i = 0; i < targets.length; i++) {
      const p = targets[i];
      try {
        const { data } = await supabase.functions.invoke("fetch-product-image", {
          body: { barcode: p.barcode },
        });
        if (data?.success && data.image_url) {
          await supabase.from("products").update({ image: data.image_url }).eq("id", p.id);
          found++;
        }
      } catch {}
      setBulkImageProgress({ done: i + 1, total: targets.length, found });
    }
    invalidateProductQueries();
    toast.success(`اكتمل: ${found} صورة من ${targets.length} منتج`);
    setBulkImageProgress(null);
    setSelectedIds(new Set());
  };

  const openEdit = (p: any) => {
    setEditingId(p.id);
    const dual = hasDualUnit(p);
    const split = dual ? splitBaseStock(Number(p.stock_quantity) || 0, Number(p.units_per_pack)) : null;
    setForm({
      name: p.name, name_en: p.name_en || "", price: String(p.price),
      original_price: p.original_price ? String(p.original_price) : "",
      image: p.image || "", unit: p.unit, description: p.description || "",
      barcode: p.barcode || "",
      stock_quantity: p.stock_quantity != null ? String(p.stock_quantity) : "0",
      cost_price: p.cost_price != null ? String(p.cost_price) : "",
      category_id: p.category_id || "", is_active: p.is_active, is_featured: p.is_featured,
      dual,
      had_dual: dual,
      alt_unit: p.alt_unit || "حبة",
      alt_barcode: p.alt_barcode || "",
      alt_image: p.alt_image || "",
      alt_price: p.alt_price != null ? String(p.alt_price) : "",
      alt_original_price: p.alt_original_price != null ? String(p.alt_original_price) : "",
      units_per_pack: p.units_per_pack ? String(p.units_per_pack) : "",
      stock_cartons: split ? String(split.cartons) : (p.stock_quantity != null ? String(p.stock_quantity) : "0"),
      stock_pieces: split ? String(split.pieces) : "0",
    });
    setFormSectionId(resolveSectionForCategory(p.category_id || ""));
    setDialogOpen(true);
  };

  const openAdd = () => {
    const preferred =
      categoryIdsFilter[0] ||
      (sectionFilter !== "all" ? allSectionSubIds[0] : "") ||
      "";
    const sectionId =
      sectionFilter !== "all" ? sectionFilter : resolveSectionForCategory(preferred);
    setEditingId(null);
    setForm({ ...emptyForm, category_id: preferred });
    setFormSectionId(sectionId);
    setDialogOpen(true);
  };

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [deferredSearch, sectionFilter, categoryIdsFilter, statusFilter, featuredFilter, stockFilter, offerFilter, unitFilter, effectiveBranchId]);

  const totalPages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE_UI));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE_UI;
  const pageItems = products;

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (!pageItems) return;
    const pageIds = pageItems.map(p => p.id);
    const allSelected = pageIds.every(id => selectedIds.has(id));
    const next = new Set(selectedIds);
    if (allSelected) {
      pageIds.forEach(id => next.delete(id));
    } else {
      pageIds.forEach(id => next.add(id));
    }
    setSelectedIds(next);
  };

  // Stats (lightweight COUNT queries — not full row download)
  const totalProducts = productStats?.total || 0;
  const activeProducts = productStats?.active || 0;
  const inactiveProducts = productStats?.inactive || 0;
  const totalProductsCount = totalProducts;
  // Green "activate all" when majority (>50%) are inactive
  const showActivateAll =
    totalProductsCount > 0 && inactiveProducts / totalProductsCount > 0.5;
  const productsWithOffer = productStats?.has_offer || 0;

  const selectedProducts = (products || []).filter((p) => selectedIds.has(p.id));
  const selectedHasUnknown = selectedIds.size > selectedProducts.length;
  const productHasOffer = (p: { original_price: unknown; price: unknown }) =>
    p.original_price !== null && p.original_price !== undefined && Number(p.original_price) > Number(p.price);
  const selectedAnyWithOffer = selectedProducts.some(productHasOffer);
  const selectedAnyWithoutOffer = selectedProducts.some((p) => !productHasOffer(p));
  const shownActive = (p: { is_active?: boolean; catalog_is_active?: boolean }) =>
    filterBranchId ? !!p.is_active : !!(p.catalog_is_active ?? p.is_active);
  const selectedAnyActive = selectedProducts.some((p) => shownActive(p));
  const selectedAnyInactive = selectedProducts.some((p) => !shownActive(p));
  const selectedAnyFeatured = selectedProducts.some((p) => p.is_featured);
  const selectedAnyNotFeatured = selectedProducts.some((p) => !p.is_featured);
  // Prefer a single direct action when selection is uniform
  const offerAction: "apply" | "remove" | "both" =
    selectedHasUnknown
      ? "both"
      : selectedAnyWithOffer && !selectedAnyWithoutOffer
        ? "remove"
        : !selectedAnyWithOffer && selectedAnyWithoutOffer
          ? "apply"
          : "both";
  const activeAction: "enable" | "disable" | "both" =
    selectedHasUnknown
      ? "both"
      : selectedAnyActive && !selectedAnyInactive
        ? "disable"
        : !selectedAnyActive && selectedAnyInactive
          ? "enable"
          : "both";
  const featuredAction: "feature" | "unfeature" | "both" =
    selectedHasUnknown
      ? "both"
      : selectedAnyFeatured && !selectedAnyNotFeatured
        ? "unfeature"
        : !selectedAnyFeatured && selectedAnyNotFeatured
          ? "feature"
          : "both";
  const singleSelectedProduct = selectedIds.size === 1 ? selectedProducts[0] : null;

  return (
    <AdminLayout title="إدارة المنتجات">
      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="bg-card rounded-xl border p-3 text-center">
          <p className="text-2xl font-bold">{totalProducts}</p>
          <p className="text-xs text-muted-foreground">إجمالي المنتجات</p>
        </div>
        <div className="bg-card rounded-xl border p-3 text-center">
          <p className="text-2xl font-bold text-green-600">{activeProducts}</p>
          <p className="text-xs text-muted-foreground">{filterBranchId ? "منتج مفعّل" : "مفعّل في أي فرع"}</p>
        </div>
        <div className="bg-card rounded-xl border p-3 text-center">
          <p className="text-2xl font-bold text-muted-foreground">{inactiveProducts}</p>
          <p className="text-xs text-muted-foreground">{filterBranchId ? "منتج معطّل" : "معطّل في كل الفروع"}</p>
        </div>
        <div className="bg-card rounded-xl border p-3 text-center">
          <p className="text-2xl font-bold text-orange-600">{productsWithOffer}</p>
          <p className="text-xs text-muted-foreground">عليه عرض</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="بحث عن منتج..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9" />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="h-10 w-[170px] justify-between font-normal"
            >
              <span className="truncate">{categoriesFilterLabel}</span>
              <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-2" align="start">
            <div className="space-y-1 max-h-80 overflow-y-auto">
              <button
                type="button"
                className={`w-full text-right rounded-md px-2 py-1.5 text-sm hover:bg-muted ${sectionFilter === "all" ? "bg-muted font-medium" : ""}`}
                onClick={clearCategoryFilters}
              >
                كل الأقسام
              </button>
              <div className="border-t my-1" />
              {sectionsWithSubs.map(({ section, subs }) => {
                const expanded = expandedFilterSections.has(section.id) || sectionFilter === section.id;
                const sectionAllSelected =
                  sectionFilter === section.id &&
                  subs.length > 0 &&
                  subs.every((c) => categoryIdsFilter.includes(c.id));
                const subIds = subs.map((c) => c.id);
                return (
                  <div key={section.id} className="rounded-md">
                    <button
                      type="button"
                      className="w-full flex items-center gap-1 rounded-md px-2 py-1.5 text-sm hover:bg-muted font-medium"
                      onClick={() => {
                        toggleFilterSectionExpand(section.id);
                        if (sectionFilter !== section.id) selectSectionAll(section.id, subIds);
                      }}
                    >
                      <ChevronLeft className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "-rotate-90" : ""}`} />
                      <span className="truncate flex-1 text-right">{section.title}</span>
                      <span className="text-[11px] text-muted-foreground">{subs.length}</span>
                    </button>
                    {expanded && (
                      <div className="me-3 ms-1 border-e pe-2 space-y-0.5 pb-1">
                        <label className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted cursor-pointer">
                          <Checkbox
                            checked={sectionAllSelected}
                            onCheckedChange={(v) =>
                              toggleAllSubsInFilter(section.id, subIds, v === true)
                            }
                          />
                          <span>كل الفرعية</span>
                        </label>
                        {subs.map((c) => (
                          <label
                            key={c.id}
                            className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted cursor-pointer"
                          >
                            <Checkbox
                              checked={sectionFilter === section.id && categoryIdsFilter.includes(c.id)}
                              onCheckedChange={() => toggleSubInFilter(section.id, c.id, subIds)}
                            />
                            <span className="truncate">{c.name}</span>
                          </label>
                        ))}
                        {subs.length === 0 && (
                          <p className="text-[11px] text-muted-foreground px-2 py-1">لا توجد أقسام فرعية</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | "active" | "inactive")}>
          <SelectTrigger className="w-[110px]">
            <span className="truncate">
              {statusFilter === "all" ? "الحالة" : statusFilter === "active" ? "مفعّل" : "معطّل"}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="active">مفعّل</SelectItem>
            <SelectItem value="inactive">معطّل</SelectItem>
          </SelectContent>
        </Select>
        <Select value={offerFilter} onValueChange={(v) => setOfferFilter(v as "all" | "has_offer" | "no_offer")}>
          <SelectTrigger className="w-[110px]">
            <span className="truncate">
              {offerFilter === "all" ? "العرض" : offerFilter === "has_offer" ? "عليه عرض" : "بدون عرض"}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="has_offer">عليه عرض</SelectItem>
            <SelectItem value="no_offer">بدون عرض</SelectItem>
          </SelectContent>
        </Select>
        <Select value={featuredFilter} onValueChange={setFeaturedFilter}>
          <SelectTrigger className="w-[130px]">
            <span className="truncate">
              {featuredFilter === "all"
                ? "المبيع"
                : featuredFilter === "featured"
                  ? "أي تمييز"
                  : featuredFilter === "not_featured"
                    ? "لا يوجد تمييز"
                    : featuredFilter}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="featured">أي تمييز</SelectItem>
            {FEATURE_PRESETS.map((label) => (
              <SelectItem key={label} value={label}>{label}</SelectItem>
            ))}
            <SelectItem value="not_featured">لا يوجد تمييز</SelectItem>
          </SelectContent>
        </Select>
        <Select value={stockFilter} onValueChange={(v: "all" | "low" | "out") => setStockFilter(v)}>
          <SelectTrigger className="w-[150px]">
            <span className="truncate">
              {stockFilter === "all"
                ? "المخزون"
                : stockFilter === "low"
                  ? "منخفض المخزون"
                  : "نفد المخزون"}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="low">منخفض المخزون (أقل من 5)</SelectItem>
            <SelectItem value="out">نفد المخزون</SelectItem>
          </SelectContent>
        </Select>
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" className="w-[140px] justify-between font-normal">
              <span className="truncate">{unitFilter === "all" ? "الوحدة" : unitFilter}</span>
              <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="start">
            <Input
              value={unitSearch}
              onChange={(e) => setUnitSearch(e.target.value)}
              placeholder="ابحث عن وحدة"
              className="mb-2 h-8"
            />
            <div className="max-h-64 overflow-y-auto space-y-0.5">
              <button
                type="button"
                className={`w-full text-right rounded-md px-2 py-1.5 text-sm hover:bg-muted ${unitFilter === "all" ? "bg-muted font-medium" : ""}`}
                onClick={() => setUnitFilter("all")}
              >
                كل الوحدات
              </button>
              {unitsLoading && <p className="px-2 py-1 text-xs text-muted-foreground">جاري التحميل…</p>}
              {visibleUnits.map((row) => (
                <button
                  key={row.unit}
                  type="button"
                  className={`w-full flex items-center justify-between gap-2 text-right rounded-md px-2 py-1.5 text-sm hover:bg-muted ${unitFilter === row.unit ? "bg-muted font-medium" : ""}`}
                  onClick={() => setUnitFilter(row.unit)}
                >
                  <span className="truncate">{row.unit}</span>
                  <span className="text-[11px] text-muted-foreground">{row.n}</span>
                </button>
              ))}
              {!unitsLoading && visibleUnits.length === 0 && (
                <p className="px-2 py-1 text-xs text-muted-foreground">لا توجد وحدة بهذا الاسم</p>
              )}
            </div>
          </PopoverContent>
        </Popover>
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="h-10 w-10 shrink-0"
          title="مسح التصفية"
          aria-label="مسح التصفية"
          disabled={
            !search &&
            sectionFilter === "all" &&
            statusFilter === "all" &&
            offerFilter === "all" &&
            featuredFilter === "all" &&
            stockFilter === "all" &&
            unitFilter === "all"
          }
          onClick={() => {
            setSearch("");
            setSectionFilter("all");
            setCategoryIdsFilter([]);
            setExpandedFilterSections(new Set());
            setStatusFilter("all");
            setOfferFilter("all");
            setFeaturedFilter("all");
            setStockFilter("all");
            setUnitFilter("all");
            setUnitSearch("");
            setCurrentPage(1);
          }}
        >
          <FilterX className="h-4 w-4" />
        </Button>
      </div>

      {/* Actions Bar — always visible */}
      <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-primary/10 rounded-xl border border-primary/20">
          <Badge className={selectedIds.size > 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}>
            {selectedIds.size > 0 ? `${selectedIds.size} محدد` : "حدد منتجاً"}
          </Badge>

          {activeAction === "both" ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" disabled={selectedIds.size === 0} aria-label="تفعيل أو تعطيل المنتجات المحددة">
                  <ToggleRight className="ml-1 h-4 w-4" />
                  تفعيل / تعطيل
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[9rem]">
                <DropdownMenuItem
                  className="cursor-pointer gap-2"
                  onClick={() => bulkToggleMutation.mutate({ field: "is_active", value: true })}
                >
                  <ToggleRight className="h-4 w-4" />
                  تفعيل
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer gap-2"
                  onClick={() => bulkToggleMutation.mutate({ field: "is_active", value: false })}
                >
                  <ToggleLeft className="h-4 w-4" />
                  تعطيل
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={selectedIds.size === 0}
              aria-label={activeAction === "enable" ? "تفعيل المنتجات المحددة" : "تعطيل المنتجات المحددة"}
              onClick={() =>
                bulkToggleMutation.mutate({
                  field: "is_active",
                  value: activeAction === "enable",
                })
              }
            >
              {activeAction === "enable" ? (
                <ToggleRight className="ml-1 h-4 w-4" />
              ) : (
                <ToggleLeft className="ml-1 h-4 w-4" />
              )}
              {activeAction === "enable" ? "تفعيل" : "تعطيل"}
            </Button>
          )}

          {showActivateAll ? (
            <Button
              size="sm"
              className="bg-green-600 text-white hover:bg-green-700"
              disabled={activateAllMutation.isPending || inactiveProducts === 0}
              onClick={() => setActivateAllOpen(true)}
            >
              {activateAllMutation.isPending ? (
                <Loader2 className="ml-1 h-4 w-4 animate-spin" />
              ) : (
                <ToggleRight className="ml-1 h-4 w-4" />
              )}
              تفعيل كل المنتجات
            </Button>
          ) : (
            <Button
              size="sm"
              variant="destructive"
              disabled={deactivateAllMutation.isPending || activeProducts === 0}
              onClick={() => setDeactivateAllOpen(true)}
            >
              {deactivateAllMutation.isPending ? (
                <Loader2 className="ml-1 h-4 w-4 animate-spin" />
              ) : (
                <ToggleLeft className="ml-1 h-4 w-4" />
              )}
              تعطيل كل المنتجات
            </Button>
          )}

          <Button
            size="sm"
            variant="outline"
            disabled={selectedIds.size === 0}
            onClick={() => {
              setMoveTargetCategoryId("");
              setMoveCategoryDialogOpen(true);
              void refetchCategories();
            }}
          >
            <Filter className="ml-1 h-4 w-4" />نقل لقسم
          </Button>

          <Button
            size="sm"
            variant="outline"
            disabled={!singleSelectedProduct}
            onClick={() => singleSelectedProduct && openEdit(singleSelectedProduct)}
          >
            <Pencil className="ml-1 h-4 w-4" />تعديل المنتج
          </Button>

          {featuredAction === "unfeature" ? (
            <Button
              size="sm"
              variant="outline"
              aria-label="إلغاء تمييز المنتجات المحددة"
              onClick={() => bulkFeatureMutation.mutate(null)}
              disabled={selectedIds.size === 0 || bulkFeatureMutation.isPending}
            >
              <Star className="ml-1 h-4 w-4 fill-amber-400 text-amber-500" />
              إلغاء التمييز
            </Button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" disabled={selectedIds.size === 0} aria-label="اختيار نوع التمييز">
                  <Star className="ml-1 h-4 w-4" />
                  تمييز
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[12rem]">
                {FEATURE_PRESETS.map((label) => (
                  <DropdownMenuItem
                    key={label}
                    className="cursor-pointer gap-2"
                    onClick={() => bulkFeatureMutation.mutate(label)}
                  >
                    <Star className="h-4 w-4" />
                    {label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer gap-2"
                  onClick={() => {
                    setCustomFeatureLabel("");
                    setCustomFeatureOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" />
                  وصف مخصص...
                </DropdownMenuItem>
                {selectedAnyFeatured && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="cursor-pointer gap-2 text-destructive focus:text-destructive"
                      onClick={() => bulkFeatureMutation.mutate(null)}
                    >
                      إلغاء التمييز
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {offerAction === "both" ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" disabled={selectedIds.size === 0} aria-label="إضافة أو إزالة عرض">
                  <BadgePercent className="ml-1 h-4 w-4" />
                  العروض
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[10rem]">
                <DropdownMenuItem
                  className="cursor-pointer gap-2"
                  onClick={() => prepareOfferDialog("selected")}
                >
                  <Tag className="h-4 w-4" />
                  تطبيق عرض
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer gap-2 text-destructive focus:text-destructive"
                  onClick={() => setRemoveOfferDialogOpen(true)}
                >
                  <Percent className="h-4 w-4" />
                  إزالة العرض
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : offerAction === "apply" ? (
            <Button
              size="sm"
              variant="outline"
              disabled={selectedIds.size === 0}
              aria-label="تطبيق عرض على المنتجات المحددة"
              onClick={() => prepareOfferDialog("selected")}
            >
              <Tag className="ml-1 h-4 w-4" />
              تطبيق عرض
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              disabled={selectedIds.size === 0}
              aria-label="إزالة العرض من المنتجات المحددة"
              onClick={() => setRemoveOfferDialogOpen(true)}
            >
              <Percent className="ml-1 h-4 w-4" />
              إزالة العرض
            </Button>
          )}

          <Button
            size="sm"
            variant="outline"
            onClick={bulkFetchImages}
            disabled={selectedIds.size === 0 || !!bulkImageProgress}
          >
            <ImageIcon className="ml-1 h-4 w-4" />
            {bulkImageProgress ? `جاري ${bulkImageProgress.done}/${bulkImageProgress.total}` : "جلب صور بالباركود"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={selectedIds.size !== 2}
            onClick={openMerge}
          >
            دمج وحدتين
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={selectedIds.size === 0}
            onClick={() => bulkDeleteMutation.mutate()}
          >
            <Trash2 className="ml-1 h-4 w-4" />حذف
          </Button>
          <Button size="sm" className="mr-auto" onClick={openAdd}>
            <Plus className="ml-1 h-4 w-4" />إضافة منتج
          </Button>
      </div>

      {isLoading && !products?.length ? (
        <div className="flex flex-col items-center justify-center gap-3 py-12 px-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">جاري تحميل المنتجات…</p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
          <table className={`w-full table-fixed ${showBranchColumns ? "text-[15px] min-w-[640px]" : "text-sm min-w-[720px]"}`}>
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="p-2 w-10">
                  <Checkbox
                    checked={pageItems?.length ? pageItems.every(p => selectedIds.has(p.id)) : false}
                    onCheckedChange={toggleSelectAll}
                  />
                </th>
                <th className={`text-right p-2 font-medium ${showBranchColumns ? "w-[42%]" : "w-[38%]"}`}>المنتج</th>
                <th className="text-right p-2 font-medium w-24" title={anchorBranchName || undefined}>
                  السعر
                </th>
                {!showBranchColumns && (
                  <th className="text-right p-2 font-medium w-24" title={anchorBranchName || undefined}>
                    المخزون
                  </th>
                )}
                <th className="text-right p-2 font-medium w-16">التكلفة</th>
                <th className="text-center p-2 font-medium w-12" title="الحالة">حالة</th>
                <th className="text-center p-2 font-medium w-12" title="التمييز">مييز</th>
                <th className="text-center p-2 font-medium w-14" title={anchorBranchName ? `العرض · ${anchorBranchName}` : "العرض"}>عرض</th>
                {showBranchColumns &&
                  overlayBranches.map((b: any) => (
                    <th key={b.id} className="text-right p-2 font-medium w-28 truncate" title={b.name}>
                      {b.name}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {pageItems?.map((p, rowIndex) => {
                const hasOffer = p.has_offer ?? (!!p.original_price && Number(p.original_price) > Number(p.price));
                const discountPct = p.original_price && Number(p.original_price) > Number(p.price)
                  ? Math.round((1 - p.price / Number(p.original_price)) * 100)
                  : p.alt_original_price && Number(p.alt_original_price) > Number(p.alt_price)
                    ? Math.round((1 - Number(p.alt_price) / Number(p.alt_original_price)) * 100)
                    : 0;
                const offerUnitLabel = p.offer_unit === "alt" ? (p.alt_unit || "حبة") : p.offer_unit === "primary" ? p.unit : p.offer_unit === "both" ? "الوحدتين" : "";
                const offerTitle = hasOffer
                  ? `خصم ${discountPct}%${offerUnitLabel ? ` · ${offerUnitLabel}` : ""}${p.offer_channel && p.offer_channel !== "both" ? ` · ${p.offer_channel === "app" ? "تطبيق" : "كاشير"}` : ""}`
                  : "بدون عرض";
                const rowActive = filterBranchId ? p.is_active : (p.catalog_is_active ?? p.is_active);
                const eagerImage = rowIndex < 12;
                return (
                  <tr
                    key={p.id}
                    className={`border-b last:border-0 hover:bg-muted/10 cursor-pointer ${selectedIds.has(p.id) ? "bg-primary/5" : ""}`}
                    onClick={() => openEdit(p)}
                  >
                    <td className="p-2" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={selectedIds.has(p.id)} onCheckedChange={() => toggleSelect(p.id)} />
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={p.image || "/placeholder.png"}
                          alt={p.name}
                          width={40}
                          height={40}
                          loading={eagerImage ? "eager" : "lazy"}
                          decoding="async"
                          fetchPriority={eagerImage ? "high" : "low"}
                          className="w-10 h-10 rounded-md object-cover bg-muted border flex-shrink-0"
                          onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/placeholder.png"; }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate" title={p.name}>{p.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {categoryNameMap.get(p.category_id) || "بدون قسم"} · {p.unit}{hasDualUnit(p) ? ` + ${p.alt_unit}` : ""}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="p-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-col">
                        <span className="font-medium whitespace-nowrap">{Number(p.price).toFixed(2)}</span>
                        {p.original_price != null && Number(p.original_price) > Number(p.price) && (
                          <span className="text-[11px] text-muted-foreground line-through">{Number(p.original_price).toFixed(2)}</span>
                        )}
                        {hasDualUnit(p) && p.alt_price != null && (
                          <span className="text-[11px] text-muted-foreground whitespace-nowrap truncate" title={`${p.alt_unit}: ${Number(p.alt_price).toFixed(2)}`}>
                            {p.alt_unit}: {Number(p.alt_price).toFixed(2)}
                          </span>
                        )}
                      </div>
                    </td>
                    {!showBranchColumns && (
                      <td className="p-2" onClick={(e) => e.stopPropagation()}>
                        <InlineStockEditor
                          product={p}
                          branchId={p.branch_id}
                          stock={Number(p.stock_quantity) || 0}
                        />
                      </td>
                    )}
                    <td className="p-2">
                      <span className="text-muted-foreground whitespace-nowrap">
                        {p.cost_price != null ? Number(p.cost_price).toFixed(2) : "—"}
                      </span>
                    </td>
                    <td className="p-2 text-center">
                      <Badge
                        variant={rowActive ? "default" : "secondary"}
                        className={`text-[10px] px-1.5 ${rowActive ? "bg-green-600 hover:bg-green-600" : ""}`}
                        title={rowActive ? "مفعّل" : "معطّل"}
                      >
                        {rowActive ? "✓" : "—"}
                      </Badge>
                    </td>
                    <td className="p-2 text-center">
                      {p.is_featured ? (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 border-amber-400 text-amber-700 bg-amber-50"
                          title={p.extra_label || "مميز"}
                        >
                          ★
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground/40 text-xs">·</span>
                      )}
                    </td>
                    <td className="p-2 text-center">
                      {hasOffer ? (
                        <Badge variant="destructive" className="text-[10px] px-1.5" title={offerTitle}>
                          {discountPct}%
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground/40 text-xs">·</span>
                      )}
                    </td>
                    {showBranchColumns &&
                      overlayBranches.map((b: any) => {
                        const ov = (p.branch_overlays || []).find((o: any) => o.branch_id === b.id);
                        return (
                          <td key={b.id} className="p-2" onClick={(e) => e.stopPropagation()}>
                            {ov ? (
                              <div className="flex flex-col gap-0.5 text-xs">
                                <InlineStockEditor
                                  product={p}
                                  branchId={b.id}
                                  stock={Number(ov.stock_quantity) || 0}
                                />
                                <span className="text-muted-foreground">{Number(ov.price).toFixed(2)}</span>
                                {Number(ov.original_price) > Number(ov.price) && (
                                  <span className="text-[10px] text-destructive">خصم</span>
                                )}
                                <Badge
                                  variant={ov.is_active ? "default" : "secondary"}
                                  className={`text-[10px] w-fit px-1 ${ov.is_active ? "bg-green-600 hover:bg-green-600" : ""}`}
                                  title={ov.is_active ? "مفعّل" : "معطّل"}
                                >
                                  {ov.is_active ? "✓" : "—"}
                                </Badge>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        );
                      })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>

          {/* Pagination footer */}
          {filteredTotal > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 border-t bg-muted/20">
              <p className="text-xs text-muted-foreground">
                عرض {pageStart + 1} - {Math.min(pageStart + (pageItems?.length || 0), filteredTotal)} من {filteredTotal}
              </p>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="outline" disabled={safePage <= 1} onClick={() => setCurrentPage(1)}>الأولى</Button>
                <Button size="sm" variant="outline" disabled={safePage <= 1} onClick={() => setCurrentPage(safePage - 1)}>السابق</Button>
                <span className="text-xs px-2">صفحة {safePage} / {totalPages}</span>
                <Button size="sm" variant="outline" disabled={safePage >= totalPages} onClick={() => setCurrentPage(safePage + 1)}>التالي</Button>
                <Button size="sm" variant="outline" disabled={safePage >= totalPages} onClick={() => setCurrentPage(totalPages)}>الأخيرة</Button>
              </div>
            </div>
          )}
        </div>
      )}

      <ProductsBulkTools
        categories={categories}
        productsCount={products?.length || 0}
        scopedBranchIds={scopedBranchIds}
        writeBranchId={writeBranchId(filterBranchId, scopedBranchIds)}
      />

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? "تعديل منتج" : "إضافة منتج جديد"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>القسم الرئيسي *</Label>
                <Select
                  value={formSectionId || undefined}
                  onValueChange={(v) => {
                    setFormSectionId(v);
                    setForm({ ...form, category_id: "" });
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="اختر القسم" /></SelectTrigger>
                  <SelectContent>
                    {categorySections.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>القسم الفرعي *</Label>
                <Select
                  value={form.category_id || undefined}
                  onValueChange={(v) => setForm({ ...form, category_id: v })}
                  disabled={!formSectionId}
                >
                  <SelectTrigger><SelectValue placeholder={formSectionId ? "اختر الفرعي" : "الرئيسي أولاً"} /></SelectTrigger>
                  <SelectContent>
                    {formSectionSubs.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>اسم المنتج *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>بالإنجليزية</Label><Input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} /></div>
            </div>

            <div className="rounded-lg border p-3 space-y-3">
              <p className="text-sm font-medium">الوحدة الأولى</p>
              <div>
                <Label>اسم الوحدة</Label>
                <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="كرتون" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>السعر *</Label><Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
                <div><Label>قبل الخصم</Label><Input type="number" value={form.original_price} onChange={(e) => setForm({ ...form, original_price: e.target.value })} placeholder="بدون عرض" /></div>
              </div>
              {form.original_price && Number(form.original_price) > Number(form.price) && (
                <p className="text-xs text-red-700 flex items-center gap-1">
                  <Tag className="h-3.5 w-3.5" />
                  خصم {Math.round((1 - Number(form.price) / Number(form.original_price)) * 100)}%
                </p>
              )}
              <div>
                <Label>الباركود</Label>
                <div className="flex gap-2">
                  <Input
                    value={form.barcode}
                    onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                    placeholder="6281007012345"
                    className="flex-1"
                  />
                  <Button type="button" variant="outline" onClick={() => fetchImageForBarcode(form.barcode, "image")} disabled={fetchingImage || !form.barcode.trim()}>
                    {fetchingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanBarcode className="h-4 w-4" />}
                    <span className="mr-1">جلب</span>
                  </Button>
                </div>
              </div>
              <ImageUpload value={form.image} onChange={(url) => setForm({ ...form, image: url })} folder="products" />
            </div>

            {!form.dual ? (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setForm({
                    ...form,
                    dual: true,
                    alt_unit: form.alt_unit || "حبة",
                    stock_cartons: form.had_dual ? form.stock_cartons : (form.stock_quantity || "0"),
                    stock_pieces: form.had_dual ? form.stock_pieces : "0",
                  })
                }
              >
                <Plus className="ml-1 h-4 w-4" />
                إضافة وحدة أخرى
              </Button>
            ) : (
              <div className="rounded-lg border p-3 space-y-3 bg-muted/20">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">الوحدة الثانية</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if ((Number(form.stock_pieces) || 0) > 0) {
                        toast.error("يوجد حبات مفتوحة. بعها أو أكمل الكرتون قبل إزالة الوحدة الثانية");
                        return;
                      }
                      setForm({ ...form, dual: false, stock_quantity: form.stock_cartons || "0" });
                    }}
                  >
                    إزالة
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>اسم الوحدة</Label>
                    <Input value={form.alt_unit} onChange={(e) => setForm({ ...form, alt_unit: e.target.value })} placeholder="حبة" />
                  </div>
                  <div>
                    <Label>كم داخل {form.unit || "الأولى"} *</Label>
                    <Input type="number" min="2" value={form.units_per_pack} onChange={(e) => setForm({ ...form, units_per_pack: e.target.value })} placeholder="12" />
                  </div>
                </div>
                <div>
                  <Label>السعر *</Label>
                  <Input type="number" min="0" step="0.01" value={form.alt_price} onChange={(e) => setForm({ ...form, alt_price: e.target.value })} />
                </div>
                <div>
                  <Label>الباركود</Label>
                  <div className="flex gap-2">
                    <Input
                      value={form.alt_barcode}
                      onChange={(e) => setForm({ ...form, alt_barcode: e.target.value })}
                      placeholder="باركود مستقل"
                      className="flex-1"
                    />
                    <Button type="button" variant="outline" onClick={() => fetchImageForBarcode(form.alt_barcode, "alt_image")} disabled={fetchingAltImage || !form.alt_barcode.trim()}>
                      {fetchingAltImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanBarcode className="h-4 w-4" />}
                      <span className="mr-1">جلب</span>
                    </Button>
                  </div>
                </div>
                <ImageUpload value={form.alt_image} onChange={(url) => setForm({ ...form, alt_image: url })} folder="products" />
              </div>
            )}

            {form.dual ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>مخزون {form.unit || "الوحدة الأولى"}</Label>
                  <Input
                    type="number"
                    min="0"
                    value={form.stock_cartons}
                    onChange={(e) => setForm({ ...form, stock_cartons: e.target.value })}
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label>مخزون {form.alt_unit || "الوحدة الثانية"}</Label>
                  <Input
                    type="number"
                    min="0"
                    value={form.stock_pieces}
                    onChange={(e) => setForm({ ...form, stock_pieces: e.target.value })}
                    placeholder="0"
                  />
                </div>
              </div>
            ) : (
              <div>
                <Label>المخزون</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.stock_quantity}
                  onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })}
                  placeholder="0"
                />
              </div>
            )}
            <div>
              <Label>التكلفة</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.cost_price}
                onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
                placeholder="اختياري"
              />
            </div>
            <p className="text-[11px] text-muted-foreground -mt-1">
              {form.dual && Number(form.units_per_pack) >= 2
                ? `كرتون أو حبة أو الاثنان معًا. الرصيد: ${formatDualStock(
                    composeBaseStock(Number(form.stock_cartons) || 0, Number(form.stock_pieces) || 0, Number(form.units_per_pack)),
                    Number(form.units_per_pack),
                    form.unit || "كرتون",
                    form.alt_unit || "حبة",
                  )}`
                : form.dual
                  ? "أدخل عدد الوحدة الثانية داخل الأولى"
                  : "المخزون والتكلفة للإدارة فقط"}
            </p>
            <div><Label>الوصف</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} /></div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />مفعّل</label>
              <label className="flex items-center gap-2 text-sm"><Switch checked={form.is_featured} onCheckedChange={(v) => setForm({ ...form, is_featured: v })} />مميز</label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!form.name || !form.price || !form.category_id || saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}
              {editingId ? "تحديث" : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>تأكيد الحذف</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">هل أنت متأكد من حذف هذا المنتج؟ لا يمكن التراجع عن هذا الإجراء.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>إلغاء</Button>
            <Button variant="destructive" onClick={() => deleteId && deleteMutation.mutate(deleteId)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}حذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>دمج وحدتين في صنف واحد</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">اختر أي المنتج هو الكرتون. منتج الحبة يُغلق ويُنقل باركوده وسعره ومخزونه إلى الصنف المتبقي.</p>
            <div className="space-y-2">
              {mergeRows.map((p) => (
                <label key={p.id} className="flex items-start gap-2 rounded-lg border p-2 cursor-pointer">
                  <input
                    type="radio"
                    name="merge-keep"
                    checked={mergeKeepId === p.id}
                    onChange={() => setMergeKeepId(p.id)}
                  />
                  <span>
                    <span className="font-medium">{p.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {p.unit} · مخزون {p.stock_quantity ?? 0} · {p.barcode || "بدون باركود"}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <div>
              <Label>كم حبة داخل الكرتون</Label>
              <Input type="number" min="2" value={mergePack} onChange={(e) => setMergePack(e.target.value)} />
            </div>
            {mergeKeepId && Number(mergePack) >= 2 && (
              <p className="text-xs text-muted-foreground">
                المخزون بعد الدمج:{" "}
                {formatDualStock(
                  mergeUnitStock(
                    Number(mergeRows.find((p) => p.id === mergeKeepId)?.stock_quantity) || 0,
                    Number(mergeRows.find((p) => p.id !== mergeKeepId)?.stock_quantity) || 0,
                    Number(mergePack),
                  ),
                  Number(mergePack),
                  mergeRows.find((p) => p.id === mergeKeepId)?.unit || "كرتون",
                  mergeRows.find((p) => p.id !== mergeKeepId)?.unit || "حبة",
                )}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeOpen(false)}>إلغاء</Button>
            <Button onClick={() => mergeMutation.mutate()} disabled={mergeMutation.isPending || !mergeKeepId}>
              {mergeMutation.isPending && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}
              دمج
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Offer Dialog - supports selected products or entire category */}
      <Dialog open={offerDialogOpen} onOpenChange={setOfferDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>تطبيق عرض خصم</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button size="sm" variant={offerMode === "selected" ? "default" : "outline"} onClick={() => setOfferMode("selected")} disabled={selectedIds.size === 0}>
                المحدد ({selectedIds.size})
              </Button>
              <Button size="sm" variant={offerMode === "category" ? "default" : "outline"} onClick={() => { setOfferMode("category"); setOfferHasDual(true); }}>
                قسم كامل
              </Button>
            </div>
            
            {offerMode === "category" && (
              <div className="space-y-3">
                <div>
                  <Label>القسم الرئيسي</Label>
                  <Select
                    value={offerSectionId || undefined}
                    onValueChange={(v) => {
                      setOfferSectionId(v);
                      setOfferCategoryId("");
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="اختر القسم الرئيسي" /></SelectTrigger>
                    <SelectContent>
                      {categorySections.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>القسم الفرعي</Label>
                  <Select
                    value={offerCategoryId || undefined}
                    onValueChange={setOfferCategoryId}
                    disabled={!offerSectionId}
                  >
                    <SelectTrigger><SelectValue placeholder={offerSectionId ? "اختر القسم الفرعي" : "اختر الرئيسي أولاً"} /></SelectTrigger>
                    <SelectContent>
                      {offerSectionSubs.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

                                    <div>
              <Label>نسبة الخصم %</Label>
              <Input type="number" min="1" max="90" value={offerDiscount} onChange={(e) => setOfferDiscount(e.target.value)} />
            </div>

            {(offerHasDual || offerMode === "category") && (
              <div>
                <Label>الخصم على</Label>
                <div className="flex gap-2 mt-1">
                  <Button type="button" size="sm" variant={offerUnitTarget === "primary" ? "default" : "outline"} onClick={() => setOfferUnitTarget("primary")}>
                    الكرتون
                  </Button>
                  <Button type="button" size="sm" variant={offerUnitTarget === "alt" ? "default" : "outline"} onClick={() => setOfferUnitTarget("alt")}>
                    الحبة
                  </Button>
                  <Button type="button" size="sm" variant={offerUnitTarget === "both" ? "default" : "outline"} onClick={() => setOfferUnitTarget("both")}>
                    الوحدتين
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  يظهر هذا الخيار للمنتج الذي فيه كرتون وحبة. منتج الوحدة الواحدة يُخصم سعره كالمعتاد.
                </p>
              </div>
            )}

            <div>
              <Label>قناة العرض</Label>
              <div className="flex gap-2 mt-1">
                <Button
                  type="button"
                  size="sm"
                  variant={offerChannel === "app" ? "default" : "outline"}
                  onClick={() => setOfferChannel("app")}
                >
                  تطبيق
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={offerChannel === "cashier" ? "default" : "outline"}
                  onClick={() => setOfferChannel("cashier")}
                >
                  كاشير
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={offerChannel === "both" ? "default" : "outline"}
                  onClick={() => setOfferChannel("both")}
                >
                  الاثنين
                </Button>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              {offerMode === "selected" 
                ? `سيتم تطبيق الخصم على ${selectedIds.size} منتج محدد`
                : offerCategoryId 
                  ? "سيتم تطبيق الخصم على جميع منتجات القسم (من قاعدة البيانات)"
                  : "اختر قسم أولاً"
              }
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOfferDialogOpen(false)}>إلغاء</Button>
            <Button 
              onClick={() => bulkOfferMutation.mutate({ discountPercent: Number(offerDiscount), mode: offerMode, catId: offerCategoryId, channel: offerChannel, unitTarget: offerUnitTarget })} 
              disabled={bulkOfferMutation.isPending || (offerMode === "selected" && selectedIds.size === 0) || (offerMode === "category" && !offerCategoryId)}
            >
              {bulkOfferMutation.isPending && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}تطبيق العرض
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Offer Dialog */}
      <Dialog open={removeOfferDialogOpen} onOpenChange={setRemoveOfferDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>إزالة العروض</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">سيتم إعادة الأسعار الأصلية لـ {selectedIds.size} منتج محدد وإزالة العرض.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveOfferDialogOpen(false)}>إلغاء</Button>
            <Button variant="destructive" onClick={() => removeOfferMutation.mutate()} disabled={removeOfferMutation.isPending}>
              {removeOfferMutation.isPending && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}إزالة العروض
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Custom feature label dialog */}
      <Dialog open={customFeatureOpen} onOpenChange={setCustomFeatureOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>وصف تمييز مخصص</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              سيظهر هذا الوصف كشارة على {selectedIds.size} منتج محدد.
            </p>
            <div>
              <Label>نص التمييز</Label>
              <Input
                value={customFeatureLabel}
                onChange={(e) => setCustomFeatureLabel(e.target.value)}
                placeholder="مثال: عرض اليوم، اختيارات الشيف..."
                className="mt-1"
                maxLength={40}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomFeatureOpen(false)}>إلغاء</Button>
            <Button
              onClick={() => bulkFeatureMutation.mutate(customFeatureLabel.trim())}
              disabled={!customFeatureLabel.trim() || bulkFeatureMutation.isPending}
            >
              {bulkFeatureMutation.isPending && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}
              تطبيق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move Category Dialog */}
      <Dialog
        open={moveCategoryDialogOpen}
        onOpenChange={(open) => {
          setMoveCategoryDialogOpen(open);
          if (open) void refetchCategories();
          if (!open) setMoveTargetCategoryId("");
        }}
      >
        <DialogContent>
          <DialogHeader><DialogTitle>نقل المنتجات لقسم آخر</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">سيتم نقل {selectedIds.size} منتج محدد إلى القسم الذي تختاره.</p>
            <div className="space-y-3">
              <div>
                <Label>القسم الرئيسي</Label>
                <Select
                  value={moveSectionId || undefined}
                  onValueChange={(v) => {
                    setMoveSectionId(v);
                    setMoveTargetCategoryId("");
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="اختر القسم الرئيسي" /></SelectTrigger>
                  <SelectContent>
                    {categorySections.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>القسم الفرعي الجديد</Label>
                <Select
                  value={moveTargetCategoryId || undefined}
                  onValueChange={setMoveTargetCategoryId}
                  disabled={!moveSectionId}
                >
                  <SelectTrigger><SelectValue placeholder={moveSectionId ? "اختر القسم الفرعي" : "اختر الرئيسي أولاً"} /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {moveSectionSubs.length === 0 ? (
                      <div className="px-2 py-3 text-sm text-muted-foreground text-center">لا توجد أقسام فرعية</div>
                    ) : (
                      moveSectionSubs.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                          {!c.is_active ? " (معطّل)" : ""}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveCategoryDialogOpen(false)}>إلغاء</Button>
            <Button onClick={() => moveTargetCategoryId && moveCategoryMutation.mutate(moveTargetCategoryId)} disabled={!moveTargetCategoryId || moveCategoryMutation.isPending}>
              {moveCategoryMutation.isPending && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}نقل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deactivateAllOpen}
        onOpenChange={(open) => {
          if (deactivateAllMutation.isPending) return;
          setDeactivateAllOpen(open);
        }}
      >
        <DialogContent dir="rtl" onPointerDownOutside={(e) => deactivateAllMutation.isPending && e.preventDefault()} onEscapeKeyDown={(e) => deactivateAllMutation.isPending && e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>تعطيل كل المنتجات؟</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            سيتم تعطيل جميع المنتجات المفعّلة في نطاق الفروع الحالي ({activeProducts.toLocaleString("ar-SA")} منتج).
            بعدها يمكنك تفعيل المنتجات واحداً واحداً أو بالمجموعة المحددة، أو تفعيل الكل من نفس الزر.
          </p>
          {(deactivateAllMutation.isPending || bulkStatusProgress?.mode === "deactivate") && (
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  جاري التعطيل… يرجى الانتظار
                </span>
                <span>
                  {(bulkStatusProgress?.done ?? 0).toLocaleString("ar-SA")}
                  {" / "}
                  {(bulkStatusProgress?.total ?? activeProducts).toLocaleString("ar-SA")}
                  {bulkStatusPct != null ? ` (${bulkStatusPct}%)` : ""}
                </span>
              </div>
              <Progress value={bulkStatusPct ?? 0} className="h-2" />
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={deactivateAllMutation.isPending}
              onClick={() => setDeactivateAllOpen(false)}
            >
              إلغاء
            </Button>
            <Button
              variant="destructive"
              disabled={deactivateAllMutation.isPending}
              onClick={() => deactivateAllMutation.mutate(activeProducts)}
            >
              {deactivateAllMutation.isPending && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}
              تعطيل الكل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={activateAllOpen}
        onOpenChange={(open) => {
          if (activateAllMutation.isPending) return;
          setActivateAllOpen(open);
        }}
      >
        <DialogContent dir="rtl" onPointerDownOutside={(e) => activateAllMutation.isPending && e.preventDefault()} onEscapeKeyDown={(e) => activateAllMutation.isPending && e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>تفعيل كل المنتجات؟</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            سيتم تفعيل جميع المنتجات المعطّلة في نطاق الفروع الحالي ({inactiveProducts.toLocaleString("ar-SA")} منتج).
          </p>
          {(activateAllMutation.isPending || bulkStatusProgress?.mode === "activate") && (
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  جاري التفعيل… يرجى الانتظار
                </span>
                <span>
                  {(bulkStatusProgress?.done ?? 0).toLocaleString("ar-SA")}
                  {" / "}
                  {(bulkStatusProgress?.total ?? inactiveProducts).toLocaleString("ar-SA")}
                  {bulkStatusPct != null ? ` (${bulkStatusPct}%)` : ""}
                </span>
              </div>
              <Progress value={bulkStatusPct ?? 0} className="h-2" />
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={activateAllMutation.isPending}
              onClick={() => setActivateAllOpen(false)}
            >
              إلغاء
            </Button>
            <Button
              className="bg-green-600 text-white hover:bg-green-700"
              disabled={activateAllMutation.isPending}
              onClick={() => activateAllMutation.mutate(inactiveProducts)}
            >
              {activateAllMutation.isPending && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}
              تفعيل الكل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminProductsPage;
