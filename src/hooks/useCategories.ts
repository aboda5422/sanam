import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Category } from "@/types/product";
import { categorySections as defaultCategorySections, type CategorySection } from "@/data/store-data";
import { useBranch } from "@/contexts/BranchContext";
import { applyBranchFilter } from "@/lib/branch-scope";

/** Keep storefront + admin product category lists in sync after CRUD. */
export const CATEGORY_QUERY_KEYS = ["categories", "all-categories", "admin-categories"] as const;
export const CATEGORY_SECTIONS_SETTING_KEY = "category_sections";

export function invalidateCategoryQueries(queryClient: ReturnType<typeof useQueryClient>) {
  for (const key of CATEGORY_QUERY_KEYS) {
    queryClient.invalidateQueries({ queryKey: [key] });
  }
  queryClient.invalidateQueries({ queryKey: ["store-settings", CATEGORY_SECTIONS_SETTING_KEY] });
}

const CATEGORY_SELECT =
  "id, catalog_id, name, name_en, image, slug, section, is_active, sort_order, branch_id";

/** Dedupe unified category rows (one per catalog_id) preferring an active overlay. */
function dedupeCategories(rows: any[]): Category[] {
  const map = new Map<string, any>();
  for (const row of rows) {
    const key = String(row.catalog_id || row.id);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, row);
      continue;
    }
    const prevScore = (prev.is_active ? 10 : 0) + (prev.legacy_category_id ? 1 : 0);
    const nextScore = (row.is_active ? 10 : 0) + (row.legacy_category_id ? 1 : 0);
    if (nextScore > prevScore) map.set(key, row);
  }
  return [...map.values()] as Category[];
}

export const useCategories = () => {
  const { selectedBranch } = useBranch();
  const branchId = selectedBranch?.id;
  return useQuery<Category[]>({
    queryKey: ["categories", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalog_branch_categories" as "categories")
        .select(CATEGORY_SELECT)
        .eq("is_active", true)
        .eq("branch_id", branchId!)
        .order("sort_order");
      if (error) throw error;
      return (data || []) as Category[];
    },
  });
};

export const useAllCategories = (scopedBranchIds?: string[] | null) => {
  return useQuery<Category[]>({
    queryKey: ["all-categories", scopedBranchIds],
    queryFn: async () => {
      let q = supabase
        .from("catalog_branch_categories" as "categories")
        .select(CATEGORY_SELECT)
        .order("sort_order");
      q = applyBranchFilter(q, scopedBranchIds);
      const { data, error } = await q;
      if (error) throw error;
      // Admin product filters need one entry per logical category when multi-branch
      return dedupeCategories(data || []);
    },
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
};

/** Main sections (الأقسام الرئيسية) — from store_settings with static fallback. */
export const useCategorySections = () => {
  return useQuery<CategorySection[]>({
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
        return [...(value as CategorySection[])].sort(
          (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
        );
      }
      return defaultCategorySections;
    },
    select: (rows) => (Array.isArray(rows) ? rows : defaultCategorySections),
  });
};
