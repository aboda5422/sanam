import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Search, Loader2, Plus, Pencil, Trash2, FolderInput } from "lucide-react";
import ImageUpload from "@/components/admin/ImageUpload";
import { CATEGORY_SECTIONS_SETTING_KEY, invalidateCategoryQueries } from "@/hooks/useCategories";
import { categorySections as defaultSections, type CategorySection } from "@/data/store-data";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { applyBranchFilter, writeBranchId } from "@/lib/branch-scope";

type CategoryRow = {
  id: string;
  name: string;
  name_en: string | null;
  image: string | null;
  slug: string;
  section: string | null;
  is_active: boolean;
  sort_order: number;
};

type CategoryForm = {
  name: string;
  name_en: string;
  slug: string;
  image: string;
  is_active: boolean;
  sort_order: string;
  section: string;
};

type SectionForm = {
  id: string;
  title: string;
  title_en: string;
  image: string;
  sort_order: string;
};

const emptyCategoryForm: CategoryForm = {
  name: "", name_en: "", slug: "", image: "", is_active: true, sort_order: "0", section: "",
};

const emptySectionForm: SectionForm = { id: "", title: "", title_en: "", image: "", sort_order: "0" };

const autoSlug = (name: string) =>
  name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

const withSortOrders = (list: CategorySection[]): CategorySection[] =>
  list.map((s, i) => ({ ...s, sortOrder: s.sortOrder ?? i + 1 }));

const sortedSections = (list: CategorySection[]) =>
  [...withSortOrders(list)].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

const AdminCategoriesPage = () => {
  const queryClient = useQueryClient();
  const { scopedBranchIds, filterBranchId } = useAdminAuth();
  const [search, setSearch] = useState("");
  const [searchScope, setSearchScope] = useState<"main" | "sub">("main");
  const [statusFilter, setStatusFilter] = useState("all");

  const [subDialogOpen, setSubDialogOpen] = useState(false);
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [subForm, setSubForm] = useState<CategoryForm>(emptyCategoryForm);

  const [mainDialogOpen, setMainDialogOpen] = useState(false);
  const [editingMainId, setEditingMainId] = useState<string | null>(null);
  const [mainForm, setMainForm] = useState<SectionForm>(emptySectionForm);

  const [deleteSubId, setDeleteSubId] = useState<string | null>(null);
  const [deleteMainId, setDeleteMainId] = useState<string | null>(null);

  const [moveSubId, setMoveSubId] = useState<string | null>(null);
  const [moveTargetSection, setMoveTargetSection] = useState("");

  const { data: categories, isLoading: catsLoading } = useQuery({
    queryKey: ["admin-categories", scopedBranchIds],
    queryFn: async () => {
      let q = supabase
        .from("categories")
        .select("id, name, name_en, image, slug, section, is_active, sort_order, branch_id")
        .order("sort_order");
      q = applyBranchFilter(q, scopedBranchIds);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as CategoryRow[];
    },
  });

  const { data: savedSections, isLoading: sectionsLoading } = useQuery({
    queryKey: ["store-settings", CATEGORY_SECTIONS_SETTING_KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_settings")
        .select("value")
        .eq("key", CATEGORY_SECTIONS_SETTING_KEY)
        .maybeSingle();
      if (error) throw error;
      const value = data?.value;
      if (Array.isArray(value) && value.length > 0) {
        return value as CategorySection[];
      }
      return defaultSections;
    },
  });

  const sections = useMemo(() => {
    const base = savedSections ?? defaultSections;
    const byId = new Map(withSortOrders(base).map((s) => [s.id, s]));
    for (const c of categories || []) {
      if (c.section && !byId.has(c.section)) {
        byId.set(c.section, {
          id: c.section,
          title: c.section,
          titleEn: c.section,
          sortOrder: byId.size + 1,
        });
      }
    }
    return sortedSections(Array.from(byId.values()));
  }, [savedSections, categories]);

  const persistSections = async (next: CategorySection[]) => {
    const normalized = sortedSections(next).map((s, i) => ({ ...s, sortOrder: i + 1 }));
    const { error } = await supabase
      .from("store_settings")
      .upsert({ key: CATEGORY_SECTIONS_SETTING_KEY, value: normalized }, { onConflict: "key" });
    if (error) throw error;
  };

  const invalidateAll = () => {
    invalidateCategoryQueries(queryClient);
    queryClient.invalidateQueries({ queryKey: ["store-settings", CATEGORY_SECTIONS_SETTING_KEY] });
  };

  const saveSubMutation = useMutation({
    mutationFn: async () => {
      const sectionId = subForm.section || null;
      const siblings = [...(categories || [])]
        .filter((c) => c.section === sectionId && c.id !== editingSubId)
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "ar"));
      const desired = Math.max(1, Math.min(Number(subForm.sort_order) || siblings.length + 1, siblings.length + 1));

      const payload: any = {
        name: subForm.name,
        name_en: subForm.name_en || null,
        slug: subForm.slug,
        image: subForm.image || null,
        is_active: subForm.is_active,
        sort_order: desired,
        section: sectionId,
      };

      let savedId = editingSubId;
      if (editingSubId) {
        const { error } = await supabase.from("categories").update(payload).eq("id", editingSubId);
        if (error) throw error;
      } else {
        const bid = writeBranchId(filterBranchId, scopedBranchIds);
        if (!bid) throw new Error("اختر فرعاً من أعلى الصفحة قبل إضافة قسم");
        payload.branch_id = bid;
        const { data, error } = await supabase.from("categories").insert(payload).select("id").single();
        if (error) throw error;
        savedId = data.id;
      }

      if (sectionId && savedId) {
        const ordered = [...siblings];
        const idx = Math.max(0, Math.min(desired - 1, ordered.length));
        const self = { id: savedId } as CategoryRow;
        ordered.splice(idx, 0, self);
        await renumberSectionSubs(sectionId, ordered.map((c) => c.id));
      }
    },
    onSuccess: () => {
      invalidateAll();
      toast.success(editingSubId ? "تم تحديث القسم الفرعي" : "تمت إضافة القسم الفرعي");
      setSubDialogOpen(false);
      setEditingSubId(null);
      setSubForm(emptyCategoryForm);
    },
    onError: (e: any) => toast.error(e?.message || "حدث خطأ"),
  });

  const saveMainMutation = useMutation({
    mutationFn: async () => {
      const id = (editingMainId || mainForm.id || autoSlug(mainForm.title_en || mainForm.title)).trim();
      if (!id) throw new Error("missing id");
      const sortOrder = Number(mainForm.sort_order) || sections.length + 1;
      const entry: CategorySection = {
        id,
        title: mainForm.title.trim(),
        titleEn: mainForm.title_en.trim() || mainForm.title.trim(),
        image: mainForm.image || undefined,
        sortOrder,
      };
      let next: CategorySection[];
      if (editingMainId) {
        const without = sections.filter((s) => s.id !== editingMainId);
        const idx = Math.max(0, Math.min(sortOrder - 1, without.length));
        without.splice(idx, 0, { ...entry, id: editingMainId });
        next = without.map((s, i) => ({ ...s, sortOrder: i + 1 }));
      } else {
        if (sections.some((s) => s.id === id)) throw new Error("duplicate");
        const without = [...sections];
        const idx = Math.max(0, Math.min(sortOrder - 1, without.length));
        without.splice(idx, 0, entry);
        next = without.map((s, i) => ({ ...s, sortOrder: i + 1 }));
      }
      await persistSections(next);
    },
    onSuccess: () => {
      invalidateAll();
      toast.success(editingMainId ? "تم تحديث القسم الرئيسي" : "تمت إضافة القسم الرئيسي");
      setMainDialogOpen(false);
      setEditingMainId(null);
      setMainForm(emptySectionForm);
    },
    onError: (err: any) => {
      toast.error(err?.message === "duplicate" ? "معرف القسم موجود مسبقاً" : "حدث خطأ");
    },
  });

  const deleteSubMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("تم الحذف");
      setDeleteSubId(null);
    },
    onError: () => toast.error("حدث خطأ"),
  });

  const deleteMainMutation = useMutation({
    mutationFn: async (sectionId: string) => {
      const childCount = (categories || []).filter((c) => c.section === sectionId).length;
      if (childCount > 0) throw new Error("has_children");
      await persistSections(sections.filter((s) => s.id !== sectionId));
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("تم حذف القسم الرئيسي");
      setDeleteMainId(null);
    },
    onError: (err: any) => {
      toast.error(err?.message === "has_children" ? "احذف الأقسام الفرعية أولاً" : "حدث خطأ");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase.from("categories").update({ is_active: value }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("تم التحديث");
    },
    onError: () => toast.error("حدث خطأ"),
  });

  const setMainOrderMutation = useMutation({
    mutationFn: async ({ sectionId, sortOrder }: { sectionId: string; sortOrder: number }) => {
      const without = sections.filter((s) => s.id !== sectionId);
      const current = sections.find((s) => s.id === sectionId);
      if (!current) return;
      const idx = Math.max(0, Math.min(sortOrder - 1, without.length));
      without.splice(idx, 0, { ...current, sortOrder });
      await persistSections(without.map((s, i) => ({ ...s, sortOrder: i + 1 })));
    },
    onSuccess: () => invalidateAll(),
    onError: () => toast.error("حدث خطأ"),
  });

  const renumberSectionSubs = async (sectionId: string, orderedIds: string[]) => {
    for (let i = 0; i < orderedIds.length; i++) {
      const { error } = await supabase
        .from("categories")
        .update({ sort_order: i + 1 })
        .eq("id", orderedIds[i]);
      if (error) throw error;
    }
  };

  const setSubOrderMutation = useMutation({
    mutationFn: async ({ id, sortOrder }: { id: string; sortOrder: number }) => {
      const cat = categories?.find((c) => c.id === id);
      if (!cat?.section) return;
      const siblings = [...(categories || [])]
        .filter((c) => c.section === cat.section)
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "ar"));
      const without = siblings.filter((c) => c.id !== id);
      const idx = Math.max(0, Math.min(sortOrder - 1, without.length));
      without.splice(idx, 0, cat);
      await renumberSectionSubs(cat.section, without.map((c) => c.id));
    },
    onSuccess: () => invalidateAll(),
    onError: () => toast.error("حدث خطأ"),
  });

  const moveSubSectionMutation = useMutation({
    mutationFn: async ({ id, section }: { id: string; section: string }) => {
      const siblings = [...(categories || [])]
        .filter((c) => c.section === section && c.id !== id)
        .sort((a, b) => a.sort_order - b.sort_order);
      const nextOrder = siblings.length + 1;
      const { error } = await supabase
        .from("categories")
        .update({ section, sort_order: nextOrder })
        .eq("id", id);
      if (error) throw error;
      // Normalize destination to 1..n
      await renumberSectionSubs(section, [...siblings.map((c) => c.id), id]);
      // Normalize source section if needed
      const moved = categories?.find((c) => c.id === id);
      if (moved?.section && moved.section !== section) {
        const sourceSiblings = [...(categories || [])]
          .filter((c) => c.section === moved.section && c.id !== id)
          .sort((a, b) => a.sort_order - b.sort_order);
        if (sourceSiblings.length) {
          await renumberSectionSubs(moved.section, sourceSiblings.map((c) => c.id));
        }
      }
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("تم نقل القسم الفرعي");
      setMoveSubId(null);
      setMoveTargetSection("");
    },
    onError: () => toast.error("حدث خطأ"),
  });

  const openAddMain = () => {
    setEditingMainId(null);
    setMainForm({ ...emptySectionForm, sort_order: String(sections.length + 1) });
    setMainDialogOpen(true);
  };

  const openEditMain = (s: CategorySection) => {
    setEditingMainId(s.id);
    setMainForm({
      id: s.id,
      title: s.title,
      title_en: s.titleEn,
      image: s.image || "",
      sort_order: String(s.sortOrder ?? sections.findIndex((x) => x.id === s.id) + 1),
    });
    setMainDialogOpen(true);
  };

  const openAddSub = (sectionId: string) => {
    setEditingSubId(null);
    const siblings = (categories || []).filter((c) => c.section === sectionId);
    setSubForm({ ...emptyCategoryForm, section: sectionId, sort_order: String(siblings.length + 1) });
    setSubDialogOpen(true);
  };

  const openEditSub = (c: CategoryRow) => {
    setEditingSubId(c.id);
    const siblings = [...(categories || [])]
      .filter((x) => x.section === c.section)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "ar"));
    const localOrder = siblings.findIndex((x) => x.id === c.id) + 1;
    setSubForm({
      name: c.name,
      name_en: c.name_en || "",
      slug: c.slug,
      image: c.image || "",
      is_active: c.is_active,
      sort_order: String(localOrder || 1),
      section: c.section || "",
    });
    setSubDialogOpen(true);
  };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sections
      .map((section, sectionIndex) => {
        let subs = (categories || [])
          .filter((c) => c.section === section.id)
          .sort((a, b) => a.sort_order - b.sort_order);
        if (statusFilter === "active") subs = subs.filter((c) => c.is_active);
        if (statusFilter === "inactive") subs = subs.filter((c) => !c.is_active);
        if (q) {
          if (searchScope === "main") {
            const sectionHit = section.title.includes(search) || section.titleEn.toLowerCase().includes(q);
            if (!sectionHit) return null;
          } else {
            subs = subs.filter(
              (c) =>
                c.name.includes(search) ||
                (c.name_en && c.name_en.toLowerCase().includes(q)) ||
                c.slug.toLowerCase().includes(q),
            );
            if (subs.length === 0) return null;
          }
        }
        const displayImage = section.image || subs.find((c) => c.image)?.image || "/placeholder.png";
        return { section, subs, sectionIndex, displayImage };
      })
      .filter(Boolean) as {
      section: CategorySection;
      subs: CategoryRow[];
      sectionIndex: number;
      displayImage: string;
    }[];
  }, [sections, categories, search, searchScope, statusFilter]);

  const totalSubs = categories?.length ?? 0;
  const isLoading = catsLoading || sectionsLoading;
  const moveSubCat = categories?.find((c) => c.id === moveSubId);

  return (
    <AdminLayout title="إدارة الأقسام">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Select value={searchScope} onValueChange={(v) => setSearchScope(v as "main" | "sub")}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="نوع البحث" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="main">قسم رئيسي</SelectItem>
            <SelectItem value="sub">قسم فرعي</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={searchScope === "main" ? "بحث عن قسم رئيسي..." : "بحث عن قسم فرعي..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[120px]"><SelectValue placeholder="الحالة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="active">مفعّل</SelectItem>
            <SelectItem value="inactive">معطّل</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="outline" className="h-10 px-4 text-sm font-bold rounded-lg border-2">
          {rows.length} رئيسي · {totalSubs} فرعي
        </Badge>
        <Button onClick={openAddMain} className="mr-auto">
          <Plus className="ml-1 h-4 w-4" />إضافة قسم رئيسي
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <div className="bg-card rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-right p-3 font-medium w-[280px]">القسم الرئيسي</th>
                  <th className="text-center p-3 font-medium w-[88px]">الترتيب</th>
                  <th className="text-right p-3 font-medium">الأقسام الفرعية</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ section, subs, sectionIndex, displayImage }) => (
                  <tr key={section.id} className="border-b last:border-0 align-top hover:bg-muted/10">
                    <td className="p-3 border-l">
                      <div className="flex gap-3">
                        <img
                          src={displayImage}
                          alt={section.title}
                          className="w-14 h-14 rounded-xl object-cover bg-white border shrink-0"
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = "/placeholder.png";
                          }}
                        />
                        <div className="flex flex-col gap-2 min-w-0 flex-1">
                          <div>
                            <p className="font-semibold">{section.title}</p>
                            <p className="text-xs text-muted-foreground">{section.titleEn}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5" dir="ltr">{section.id}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-1">
                            <Button size="sm" variant="outline" className="h-8" onClick={() => openAddSub(section.id)}>
                              <Plus className="ml-1 h-3.5 w-3.5" />
                              فرعي
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditMain(section)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => setDeleteMainId(section.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            <Badge variant="secondary" className="mr-auto">{subs.length}</Badge>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-center align-middle">
                      <Input
                        type="number"
                        min={1}
                        className="h-9 w-16 mx-auto text-center px-1"
                        defaultValue={section.sortOrder ?? sectionIndex + 1}
                        key={`${section.id}-${section.sortOrder ?? sectionIndex + 1}`}
                        disabled={setMainOrderMutation.isPending}
                        onBlur={(e) => {
                          const next = Number(e.target.value);
                          const current = section.sortOrder ?? sectionIndex + 1;
                          if (!Number.isFinite(next) || next < 1 || next === current) {
                            e.target.value = String(current);
                            return;
                          }
                          setMainOrderMutation.mutate({ sectionId: section.id, sortOrder: next });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        }}
                      />
                    </td>
                    <td className="p-3">
                      {subs.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2">لا توجد أقسام فرعية — اضغط «فرعي» للإضافة</p>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center gap-3 px-2 text-[11px] font-medium text-muted-foreground">
                            <span className="w-9 shrink-0" />
                            <span className="flex-1">القسم</span>
                            <span className="w-16 text-center">الترتيب</span>
                            <span className="w-8 text-center">نقل</span>
                            <span className="w-[120px] text-center border-s ps-3">إجراءات</span>
                          </div>
                          {subs.map((c, localIndex) => (
                            <div
                              key={c.id}
                              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-background/80 px-2 py-1.5"
                            >
                              <img
                                src={c.image || "/placeholder.png"}
                                alt={c.name}
                                className="w-9 h-9 rounded-md object-cover bg-white border shrink-0"
                                onError={(e) => {
                                  e.currentTarget.onerror = null;
                                  e.currentTarget.src = "/placeholder.png";
                                }}
                              />
                              <div className="min-w-0 flex-1">
                                <p className="font-medium truncate">{c.name}</p>
                                <p className="text-[11px] text-muted-foreground truncate">
                                  {c.name_en || "—"} · <span dir="ltr">{c.slug}</span>
                                </p>
                              </div>
                              <Input
                                type="number"
                                min={1}
                                max={subs.length}
                                className="h-8 w-16 text-center px-1 shrink-0"
                                defaultValue={localIndex + 1}
                                key={`${c.id}-${localIndex + 1}-${subs.length}`}
                                disabled={setSubOrderMutation.isPending}
                                onBlur={(e) => {
                                  const next = Number(e.target.value);
                                  const current = localIndex + 1;
                                  if (!Number.isFinite(next) || next < 1 || next === current) {
                                    e.target.value = String(current);
                                    return;
                                  }
                                  setSubOrderMutation.mutate({ id: c.id, sortOrder: next });
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                }}
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                title="نقل إلى قسم رئيسي آخر"
                                onClick={() => {
                                  setMoveSubId(c.id);
                                  setMoveTargetSection(c.section || "");
                                }}
                              >
                                <FolderInput className="h-4 w-4" />
                              </Button>
                              <div className="flex items-center gap-2 w-[120px] justify-center border-s ps-3 shrink-0">
                                <Switch
                                  checked={c.is_active}
                                  onCheckedChange={(v) => toggleMutation.mutate({ id: c.id, value: v })}
                                />
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditSub(c)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  onClick={() => setDeleteSubId(c.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Main section dialog */}
      <Dialog open={mainDialogOpen} onOpenChange={setMainDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingMainId ? "تعديل قسم رئيسي" : "إضافة قسم رئيسي"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>الاسم *</Label>
              <Input
                value={mainForm.title}
                onChange={(e) => setMainForm({ ...mainForm, title: e.target.value })}
              />
            </div>
            <div>
              <Label>الاسم بالإنجليزية</Label>
              <Input
                value={mainForm.title_en}
                onChange={(e) => {
                  const title_en = e.target.value;
                  setMainForm({
                    ...mainForm,
                    title_en,
                    id: !editingMainId ? autoSlug(title_en || mainForm.title) : mainForm.id,
                  });
                }}
              />
            </div>
            <div>
              <Label>المعرّف (id)</Label>
              <Input
                value={mainForm.id}
                dir="ltr"
                disabled={!!editingMainId}
                onChange={(e) => setMainForm({ ...mainForm, id: autoSlug(e.target.value) || e.target.value })}
                placeholder="daily"
              />
              <p className="text-[11px] text-muted-foreground mt-1">يُستخدم لربط الأقسام الفرعية ولا يمكن تغييره لاحقاً</p>
            </div>
            <ImageUpload
              value={mainForm.image}
              onChange={(url) => setMainForm({ ...mainForm, image: url })}
              folder="category-sections"
              label="صورة القسم الرئيسي"
            />
            <div>
              <Label>ترتيب العرض بين الأقسام الرئيسية</Label>
              <Input
                type="number"
                min={1}
                value={mainForm.sort_order}
                onChange={(e) => setMainForm({ ...mainForm, sort_order: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMainDialogOpen(false)}>إلغاء</Button>
            <Button
              onClick={() => saveMainMutation.mutate()}
              disabled={!mainForm.title || !(editingMainId || mainForm.id) || saveMainMutation.isPending}
            >
              {saveMainMutation.isPending && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}
              {editingMainId ? "تحديث" : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Subcategory dialog */}
      <Dialog open={subDialogOpen} onOpenChange={setSubDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSubId ? "تعديل قسم فرعي" : "إضافة قسم فرعي"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{editingSubId ? "القسم الرئيسي (نقل)" : "القسم الرئيسي *"}</Label>
              <Select value={subForm.section} onValueChange={(v) => setSubForm({ ...subForm, section: v })}>
                <SelectTrigger><SelectValue placeholder="اختر القسم الرئيسي" /></SelectTrigger>
                <SelectContent>
                  {sections.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>اسم القسم *</Label><Input value={subForm.name} onChange={(e) => setSubForm({ ...subForm, name: e.target.value })} /></div>
            <div>
              <Label>الاسم بالإنجليزية</Label>
              <Input
                value={subForm.name_en}
                onChange={(e) => {
                  const name_en = e.target.value;
                  setSubForm({
                    ...subForm,
                    name_en,
                    slug: !editingSubId ? autoSlug(name_en) : subForm.slug,
                  });
                }}
              />
            </div>
            <div><Label>الرابط (slug)</Label><Input value={subForm.slug} onChange={(e) => setSubForm({ ...subForm, slug: e.target.value })} dir="ltr" /></div>
            <ImageUpload value={subForm.image} onChange={(url) => setSubForm({ ...subForm, image: url })} folder="categories" />
            <div>
              <Label>ترتيب العرض داخل القسم الرئيسي (يبدأ من 1)</Label>
              <Input type="number" min={1} value={subForm.sort_order} onChange={(e) => setSubForm({ ...subForm, sort_order: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={subForm.is_active} onCheckedChange={(v) => setSubForm({ ...subForm, is_active: v })} />
              مفعّل
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubDialogOpen(false)}>إلغاء</Button>
            <Button
              onClick={() => saveSubMutation.mutate()}
              disabled={!subForm.name || !subForm.slug || !subForm.section || saveSubMutation.isPending}
            >
              {saveSubMutation.isPending && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}
              {editingSubId ? "تحديث" : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move subcategory dialog */}
      <Dialog open={!!moveSubId} onOpenChange={() => { setMoveSubId(null); setMoveTargetSection(""); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>نقل قسم فرعي</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            نقل «{moveSubCat?.name}» إلى قسم رئيسي آخر
          </p>
          <div>
            <Label>القسم الرئيسي الجديد</Label>
            <Select value={moveTargetSection} onValueChange={setMoveTargetSection}>
              <SelectTrigger><SelectValue placeholder="اختر القسم" /></SelectTrigger>
              <SelectContent>
                {sections.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setMoveSubId(null); setMoveTargetSection(""); }}>إلغاء</Button>
            <Button
              disabled={
                !moveSubId ||
                !moveTargetSection ||
                moveTargetSection === moveSubCat?.section ||
                moveSubSectionMutation.isPending
              }
              onClick={() => moveSubId && moveSubSectionMutation.mutate({ id: moveSubId, section: moveTargetSection })}
            >
              {moveSubSectionMutation.isPending && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}
              نقل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteSubId} onOpenChange={() => setDeleteSubId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>تأكيد الحذف</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">هل أنت متأكد من حذف هذا القسم الفرعي؟</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteSubId(null)}>إلغاء</Button>
            <Button variant="destructive" onClick={() => deleteSubId && deleteSubMutation.mutate(deleteSubId)} disabled={deleteSubMutation.isPending}>
              {deleteSubMutation.isPending && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}حذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteMainId} onOpenChange={() => setDeleteMainId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>حذف القسم الرئيسي</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">سيتم حذف القسم الرئيسي فقط إن لم يكن له أقسام فرعية.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteMainId(null)}>إلغاء</Button>
            <Button variant="destructive" onClick={() => deleteMainId && deleteMainMutation.mutate(deleteMainId)} disabled={deleteMainMutation.isPending}>
              {deleteMainMutation.isPending && <Loader2 className="ml-1 h-4 w-4 animate-spin" />}حذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminCategoriesPage;
