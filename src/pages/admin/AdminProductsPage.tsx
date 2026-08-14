import { useState, useEffect, useMemo } from "react";
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
};

const emptyForm: ProductForm = { name: "", name_en: "", price: "", original_price: "", image: "", unit: "قطعة", description: "", category_id: "", barcode: "", stock_quantity: "0", cost_price: "", is_active: true, is_featured: false };

const AdminProductsPage = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [categoryIdsFilter, setCategoryIdsFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [featuredFilter, setFeaturedFilter] = useState("all");
  const [priceRange, setPriceRange] = useState<"all" | "low" | "mid" | "high">("all");
  const [offerFilter, setOfferFilter] = useState<"all" | "has_offer" | "no_offer">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE_UI = 50;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [offerDialogOpen, setOfferDialogOpen] = useState(false);
  const [offerDiscount, setOfferDiscount] = useState("10");
  const [offerMode, setOfferMode] = useState<"selected" | "category">("selected");
  const [offerCategoryId, setOfferCategoryId] = useState("");
  const [removeOfferDialogOpen, setRemoveOfferDialogOpen] = useState(false);
  const [moveCategoryDialogOpen, setMoveCategoryDialogOpen] = useState(false);
  const [moveTargetCategoryId, setMoveTargetCategoryId] = useState("");
  const [customFeatureOpen, setCustomFeatureOpen] = useState(false);
  const [customFeatureLabel, setCustomFeatureLabel] = useState("");
  const [fetchingImage, setFetchingImage] = useState(false);
  const [bulkImageProgress, setBulkImageProgress] = useState<{ done: number; total: number; found: number } | null>(null);
  const [formSectionId, setFormSectionId] = useState("");
  const [moveSectionId, setMoveSectionId] = useState("");
  const [offerSectionId, setOfferSectionId] = useState("");

  const { scopedBranchIds, filterBranchId } = useAdminAuth();
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

  const { data: products, isLoading } = useQuery({
    queryKey: ["admin-products", scopedBranchIds],
    queryFn: async () => {
      const PAGE_SIZE = 1000;
      let all: any[] = [];
      let from = 0;
      while (true) {
        let q = supabase
          .from("products")
          .select("id, name, name_en, price, original_price, image, is_active, is_featured, extra_label, unit, category_id, description, barcode, stock_quantity, cost_price, branch_id")
          .order("id")
          .range(from, from + PAGE_SIZE - 1);
        q = applyBranchFilter(q, scopedBranchIds);
        const { data, error } = await q;
        if (error) throw error;
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      return all;
    },
    staleTime: 5 * 60 * 1000, // 5 min — keep cache fresh, no refetch on focus
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        name: form.name, name_en: form.name_en || null, price: Number(form.price),
        original_price: form.original_price ? Number(form.original_price) : null,
        image: form.image || null, unit: form.unit, description: form.description || null,
        barcode: form.barcode || null,
        stock_quantity: form.stock_quantity !== "" ? Number(form.stock_quantity) : 0,
        cost_price: form.cost_price !== "" ? Number(form.cost_price) : null,
        category_id: form.category_id || null, is_active: form.is_active, is_featured: form.is_featured,
      };
      if (editingId) {
        const { error } = await supabase.from("products").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const bid = writeBranchId(filterBranchId, scopedBranchIds);
        if (!bid) throw new Error("اختر فرعاً من أعلى الصفحة قبل إضافة منتج");
        payload.branch_id = bid;
        const { error } = await supabase.from("products").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
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
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
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
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      toast.success("تم التحديث");
    },
    onError: () => toast.error("حدث خطأ"),
  });

  const bulkToggleMutation = useMutation({
    mutationFn: async ({ field, value }: { field: "is_active"; value: boolean }) => {
      const ids = Array.from(selectedIds);
      for (const id of ids) {
        const { error } = await supabase.from("products").update({ is_active: value }).eq("id", id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      toast.success(`تم تحديث ${selectedIds.size} منتج`);
      setSelectedIds(new Set());
    },
    onError: () => toast.error("حدث خطأ"),
  });

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
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
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

  // Apply offer to selected products OR entire category
  const bulkOfferMutation = useMutation({
    mutationFn: async ({ discountPercent, mode, catId }: { discountPercent: number; mode: "selected" | "category"; catId?: string }) => {
      let targetProducts: typeof products = [];
      if (mode === "selected") {
        targetProducts = products?.filter(p => selectedIds.has(p.id)) || [];
      } else if (mode === "category" && catId) {
        targetProducts = products?.filter(p => p.category_id === catId) || [];
      }
      for (const p of targetProducts) {
        const originalPrice = p.original_price || p.price;
        const newPrice = +(Number(originalPrice) * (1 - discountPercent / 100)).toFixed(2);
        const { error } = await supabase.from("products").update({
          original_price: Number(originalPrice),
          price: newPrice,
        }).eq("id", p.id);
        if (error) throw error;
      }
      return targetProducts.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      toast.success(`تم تطبيق العرض على ${count} منتج`);
      setSelectedIds(new Set());
      setOfferDialogOpen(false);
    },
    onError: () => toast.error("حدث خطأ"),
  });

  // Remove offers (restore original price)
  const removeOfferMutation = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selectedIds);
      for (const id of ids) {
        const product = products?.find(p => p.id === id);
        if (!product || !product.original_price) continue;
        const { error } = await supabase.from("products").update({
          price: product.original_price,
          original_price: null,
        }).eq("id", id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
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
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
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
      queryClient.invalidateQueries({ queryKey: ["admin-products"] });
      toast.success(`تم نقل ${count} منتج للقسم الجديد`);
      setSelectedIds(new Set());
      setMoveCategoryDialogOpen(false);
      setMoveTargetCategoryId("");
    },
    onError: () => toast.error("فشل نقل المنتجات"),
  });

  // Fetch image by barcode for the form
  const fetchImageForForm = async () => {
    if (!form.barcode.trim()) {
      toast.error("أدخل رقم الباركود أولاً");
      return;
    }
    setFetchingImage(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-product-image", {
        body: { barcode: form.barcode.trim() },
      });
      if (error) throw error;
      if (data?.success && data.image_url) {
        setForm({ ...form, image: data.image_url });
        toast.success("تم جلب الصورة من المصادر المفتوحة");
      } else {
        toast.error(data?.error || "لم نجد صورة لهذا الباركود");
      }
    } catch (e: any) {
      toast.error(e.message || "فشل البحث");
    } finally {
      setFetchingImage(false);
    }
  };

  // Bulk fetch images for selected products that have a barcode but no image
  const bulkFetchImages = async () => {
    const targets = products?.filter(p => selectedIds.has(p.id) && p.barcode && !p.image) || [];
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
    queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    toast.success(`اكتمل: ${found} صورة من ${targets.length} منتج`);
    setBulkImageProgress(null);
    setSelectedIds(new Set());
  };

  const openEdit = (p: any) => {
    setEditingId(p.id);
    setForm({
      name: p.name, name_en: p.name_en || "", price: String(p.price),
      original_price: p.original_price ? String(p.original_price) : "",
      image: p.image || "", unit: p.unit, description: p.description || "",
      barcode: p.barcode || "",
      stock_quantity: p.stock_quantity != null ? String(p.stock_quantity) : "0",
      cost_price: p.cost_price != null ? String(p.cost_price) : "",
      category_id: p.category_id || "", is_active: p.is_active, is_featured: p.is_featured,
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

  const filtered = products?.filter((p) => {
    const matchSearch = search === "" || p.name.includes(search) || (p.name_en && p.name_en.toLowerCase().includes(search.toLowerCase()));
    const matchCat =
      sectionFilter === "all"
        ? true
        : categoryIdsFilter.length > 0 && !!p.category_id && categoryIdsFilter.includes(p.category_id);
    const matchStatus = statusFilter === "all" || (statusFilter === "active" ? p.is_active : !p.is_active);
    const matchFeatured =
      featuredFilter === "all"
        ? true
        : featuredFilter === "featured"
          ? p.is_featured
          : featuredFilter === "not_featured"
            ? !p.is_featured
            : p.is_featured && (p.extra_label || "الأكثر مبيعاً") === featuredFilter;
    const productOnOffer = !!p.original_price && Number(p.original_price) > Number(p.price);
    const matchOffer =
      offerFilter === "all"
        ? true
        : offerFilter === "has_offer"
          ? productOnOffer
          : !productOnOffer;
    let matchPrice = true;
    if (priceRange === "low") matchPrice = p.price < 10;
    else if (priceRange === "mid") matchPrice = p.price >= 10 && p.price <= 50;
    else if (priceRange === "high") matchPrice = p.price > 50;
    return matchSearch && matchCat && matchStatus && matchFeatured && matchOffer && matchPrice;
  });

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, sectionFilter, categoryIdsFilter, statusFilter, featuredFilter, priceRange, offerFilter]);

  const totalPages = Math.max(1, Math.ceil((filtered?.length || 0) / PAGE_SIZE_UI));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE_UI;
  const pageItems = filtered?.slice(pageStart, pageStart + PAGE_SIZE_UI);

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

  // Stats
  const totalProducts = products?.length || 0;
  const activeProducts = products?.filter(p => p.is_active).length || 0;
  const productsWithOffer = products?.filter(p => p.original_price !== null && Number(p.original_price) > Number(p.price)).length || 0;

  const selectedProducts = (products || []).filter((p) => selectedIds.has(p.id));
  const productHasOffer = (p: { original_price: unknown; price: unknown }) =>
    p.original_price !== null && p.original_price !== undefined && Number(p.original_price) > Number(p.price);
  const selectedAnyWithOffer = selectedProducts.some(productHasOffer);
  const selectedAnyWithoutOffer = selectedProducts.some((p) => !productHasOffer(p));
  const selectedAnyActive = selectedProducts.some((p) => p.is_active);
  const selectedAnyInactive = selectedProducts.some((p) => !p.is_active);
  const selectedAnyFeatured = selectedProducts.some((p) => p.is_featured);
  const selectedAnyNotFeatured = selectedProducts.some((p) => !p.is_featured);
  // Prefer a single direct action when selection is uniform
  const offerAction: "apply" | "remove" | "both" =
    selectedAnyWithOffer && !selectedAnyWithoutOffer
      ? "remove"
      : !selectedAnyWithOffer && selectedAnyWithoutOffer
        ? "apply"
        : "both";
  const activeAction: "enable" | "disable" | "both" =
    selectedAnyActive && !selectedAnyInactive
      ? "disable"
      : !selectedAnyActive && selectedAnyInactive
        ? "enable"
        : "both";
  const featuredAction: "feature" | "unfeature" | "both" =
    selectedAnyFeatured && !selectedAnyNotFeatured
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
          <p className="text-xs text-muted-foreground">منتج مفعّل</p>
        </div>
        <div className="bg-card rounded-xl border p-3 text-center">
          <p className="text-2xl font-bold text-orange-600">{productsWithOffer}</p>
          <p className="text-xs text-muted-foreground">عليه عرض</p>
        </div>
        <div className="bg-card rounded-xl border p-3 text-center">
          <p className="text-2xl font-bold">{categories?.length || 0}</p>
          <p className="text-xs text-muted-foreground">قسم</p>
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
        <Select value={priceRange} onValueChange={(v: any) => setPriceRange(v)}>
          <SelectTrigger className="w-[130px]">
            <span className="truncate">
              {priceRange === "all"
                ? "السعر"
                : priceRange === "low"
                  ? "أقل من 10 ر.س"
                  : priceRange === "mid"
                    ? "10 - 50 ر.س"
                    : "أكثر من 50 ر.س"}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="low">أقل من 10 ر.س</SelectItem>
            <SelectItem value="mid">10 - 50 ر.س</SelectItem>
            <SelectItem value="high">أكثر من 50 ر.س</SelectItem>
          </SelectContent>
        </Select>
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
            priceRange === "all"
          }
          onClick={() => {
            setSearch("");
            setSectionFilter("all");
            setCategoryIdsFilter([]);
            setExpandedFilterSections(new Set());
            setStatusFilter("all");
            setOfferFilter("all");
            setFeaturedFilter("all");
            setPriceRange("all");
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
                  onClick={() => {
                    setOfferMode("selected");
                    setOfferDialogOpen(true);
                  }}
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
              onClick={() => {
                setOfferMode("selected");
                setOfferDialogOpen(true);
              }}
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

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <div className="bg-card rounded-xl border overflow-hidden">
          <table className="w-full text-sm table-fixed">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="p-2 w-10">
                  <Checkbox
                    checked={pageItems?.length ? pageItems.every(p => selectedIds.has(p.id)) : false}
                    onCheckedChange={toggleSelectAll}
                  />
                </th>
                <th className="text-right p-2 font-medium">المنتج</th>
                <th className="text-right p-2 font-medium w-28">السعر</th>
                <th className="text-right p-2 font-medium w-20">المخزون</th>
                <th className="text-right p-2 font-medium w-24">التكلفة</th>
                <th className="text-right p-2 font-medium w-24">الحالة</th>
                <th className="text-right p-2 font-medium w-32">التمييز</th>
                <th className="text-right p-2 font-medium w-28">العرض</th>
              </tr>
            </thead>
            <tbody>
              {pageItems?.map((p) => {
                const hasOffer = !!p.original_price && p.original_price > p.price;
                const discountPct = hasOffer ? Math.round((1 - p.price / Number(p.original_price)) * 100) : 0;
                return (
                  <tr key={p.id} className={`border-b last:border-0 hover:bg-muted/10 ${selectedIds.has(p.id) ? "bg-primary/5" : ""}`}>
                    <td className="p-2">
                      <Checkbox checked={selectedIds.has(p.id)} onCheckedChange={() => toggleSelect(p.id)} />
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <img src={p.image || "/placeholder.png"} alt={p.name} className="w-9 h-9 rounded-md object-cover bg-white border flex-shrink-0" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/placeholder.png"; }} />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{p.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {categoryNameMap.get(p.category_id) || "بدون قسم"} · {p.unit}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="p-2">
                      <div className="flex flex-col">
                        <span className="font-medium whitespace-nowrap">{Number(p.price).toFixed(2)} ر.س</span>
                        {hasOffer && <span className="text-[10px] text-muted-foreground line-through">{Number(p.original_price).toFixed(2)}</span>}
                      </div>
                    </td>
                    <td className="p-2">
                      <span className={`font-medium ${(p.stock_quantity ?? 0) < 5 ? "text-orange-600" : ""}`}>
                        {p.stock_quantity ?? 0}
                      </span>
                    </td>
                    <td className="p-2">
                      <span className="text-muted-foreground whitespace-nowrap">
                        {p.cost_price != null ? `${Number(p.cost_price).toFixed(2)} ر.س` : "—"}
                      </span>
                    </td>
                    <td className="p-2">
                      <Badge
                        variant={p.is_active ? "default" : "secondary"}
                        className={`text-[10px] ${p.is_active ? "bg-green-600 hover:bg-green-600" : ""}`}
                      >
                        {p.is_active ? "مفعّل" : "معطّل"}
                      </Badge>
                    </td>
                    <td className="p-2">
                      {p.is_featured ? (
                        <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700 bg-amber-50 max-w-full truncate">
                          {p.extra_label || "مميز"}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">لا يوجد</span>
                      )}
                    </td>
                    <td className="p-2">
                      {hasOffer ? (
                        <Badge variant="destructive" className="text-[10px]">
                          خصم {discountPct}%
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">لا يوجد</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pagination footer */}
          {filtered && filtered.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 border-t bg-muted/20">
              <p className="text-xs text-muted-foreground">
                عرض {pageStart + 1} - {Math.min(pageStart + PAGE_SIZE_UI, filtered.length)} من {filtered.length}
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
            <div>
              <Label>القسم الرئيسي *</Label>
              <Select
                value={formSectionId || undefined}
                onValueChange={(v) => {
                  setFormSectionId(v);
                  setForm({ ...form, category_id: "" });
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
              <Label>القسم الفرعي *</Label>
              <Select
                value={form.category_id || undefined}
                onValueChange={(v) => setForm({ ...form, category_id: v })}
                disabled={!formSectionId}
              >
                <SelectTrigger><SelectValue placeholder={formSectionId ? "اختر القسم الفرعي" : "اختر الرئيسي أولاً"} /></SelectTrigger>
                <SelectContent>
                  {formSectionSubs.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>اسم المنتج *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>الاسم بالإنجليزية</Label><Input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>السعر *</Label><Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
              <div><Label>السعر قبل الخصم</Label><Input type="number" value={form.original_price} onChange={(e) => setForm({ ...form, original_price: e.target.value })} placeholder="اتركه فارغ إذا لا يوجد عرض" /></div>
            </div>
            {form.original_price && Number(form.original_price) > Number(form.price) && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-sm text-red-700 flex items-center gap-2">
                <Tag className="h-4 w-4" />
                خصم {Math.round((1 - Number(form.price) / Number(form.original_price)) * 100)}%
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>المخزون</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.stock_quantity}
                  onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })}
                  placeholder="0"
                />
                <p className="text-[11px] text-muted-foreground mt-1">للإدارة فقط — لا يظهر للعملاء</p>
              </div>
              <div>
                <Label>سعر التكلفة</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.cost_price}
                  onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
                  placeholder="اختياري"
                />
                <p className="text-[11px] text-muted-foreground mt-1">للإدارة فقط — لا يظهر للعملاء</p>
              </div>
            </div>
            <ImageUpload value={form.image} onChange={(url) => setForm({ ...form, image: url })} folder="products" />
            <div>
              <Label>الباركود (للبحث التلقائي عن الصورة)</Label>
              <div className="flex gap-2">
                <Input
                  value={form.barcode}
                  onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                  placeholder="مثال: 6281007012345"
                  className="flex-1"
                />
                <Button type="button" variant="outline" onClick={fetchImageForForm} disabled={fetchingImage || !form.barcode.trim()}>
                  {fetchingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanBarcode className="h-4 w-4" />}
                  <span className="mr-1">جلب الصورة</span>
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">يبحث في Open Food Facts ومصادر مفتوحة أخرى</p>
            </div>
            <div><Label>الوحدة</Label><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></div>
            <div><Label>الوصف</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} /></div>
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

      {/* Offer Dialog - supports selected products or entire category */}
      <Dialog open={offerDialogOpen} onOpenChange={setOfferDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>تطبيق عرض خصم</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button size="sm" variant={offerMode === "selected" ? "default" : "outline"} onClick={() => setOfferMode("selected")} disabled={selectedIds.size === 0}>
                المحدد ({selectedIds.size})
              </Button>
              <Button size="sm" variant={offerMode === "category" ? "default" : "outline"} onClick={() => setOfferMode("category")}>
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
                      {offerSectionSubs.map((c) => {
                        const count = products?.filter((p) => p.category_id === c.id).length || 0;
                        return <SelectItem key={c.id} value={c.id}>{c.name} ({count} منتج)</SelectItem>;
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div>
              <Label>نسبة الخصم %</Label>
              <Input type="number" min="1" max="90" value={offerDiscount} onChange={(e) => setOfferDiscount(e.target.value)} />
            </div>

            <p className="text-xs text-muted-foreground">
              {offerMode === "selected" 
                ? `سيتم تطبيق الخصم على ${selectedIds.size} منتج محدد`
                : offerCategoryId 
                  ? `سيتم تطبيق الخصم على جميع منتجات القسم (${products?.filter(p => p.category_id === offerCategoryId).length || 0} منتج)`
                  : "اختر قسم أولاً"
              }
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOfferDialogOpen(false)}>إلغاء</Button>
            <Button 
              onClick={() => bulkOfferMutation.mutate({ discountPercent: Number(offerDiscount), mode: offerMode, catId: offerCategoryId })} 
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
    </AdminLayout>
  );
};

export default AdminProductsPage;
