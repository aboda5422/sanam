import { supabase } from "@/integrations/supabase/client";

/** Row shape from catalog_branch_categories (and legacy categories fallback). */
export type AdminCategoryRow = {
  id: string;
  catalog_id?: string | null;
  legacy_category_id?: string | null;
  branch_id?: string | null;
  name: string;
  name_en: string | null;
  image: string | null;
  slug: string;
  section: string | null;
  is_active: boolean;
  sort_order: number;
};

/**
 * Toggle / set is_active on the per-branch overlay.
 * Catalog unify stores activation on category_branch; updating categories alone
 * often targets the wrong branch (or a canonical row with no overlay for the
 * branch the admin is viewing), so the switch appears to snap back.
 */
export async function setCategoryBranchActive(opts: {
  catalogId: string;
  branchId: string;
  legacyCategoryId?: string | null;
  value: boolean;
}): Promise<void> {
  const { catalogId, branchId, legacyCategoryId, value } = opts;

  const { data, error } = await supabase
    .from("category_branch" as any)
    .update({ is_active: value })
    .eq("category_id", catalogId)
    .eq("branch_id", branchId)
    .select("id");
  if (error) throw error;

  if (!data?.length) {
    const { error: upsertErr } = await supabase.from("category_branch" as any).upsert(
      {
        category_id: catalogId,
        branch_id: branchId,
        legacy_category_id: legacyCategoryId || null,
        is_active: value,
        sort_order: 0,
      },
      { onConflict: "category_id,branch_id" },
    );
    if (upsertErr) throw upsertErr;
  }

  // Keep legacy categories row in sync when this branch owns one (dual-write).
  if (legacyCategoryId) {
    const { error: legacyErr } = await supabase
      .from("categories")
      .update({ is_active: value })
      .eq("id", legacyCategoryId);
    if (legacyErr) throw legacyErr;
  }
}

/** Resolve catalog + branch ids from a list row for writes. */
export function resolveCategoryWriteTarget(
  row: AdminCategoryRow,
  filterBranchId: string | null,
): { catalogId: string; branchId: string; legacyCategoryId: string | null } | null {
  const catalogId = String(row.catalog_id || row.id);
  const branchId = filterBranchId || row.branch_id || null;
  if (!branchId) return null;
  const legacyCategoryId = row.legacy_category_id || (row.catalog_id && row.id !== row.catalog_id ? row.id : null);
  return { catalogId, branchId, legacyCategoryId };
}

/**
 * Load admin category rows for a branch scope.
 * Prefers catalog_branch_categories; falls back to legacy categories when the
 * unified view is empty for the selected branch (so admins still see subs).
 */
export async function fetchAdminCategories(opts: {
  filterBranchId: string | null;
  scopedBranchIds: string[] | null;
}): Promise<AdminCategoryRow[]> {
  const { filterBranchId, scopedBranchIds } = opts;
  const select =
    "id, catalog_id, legacy_category_id, name, name_en, image, slug, section, is_active, sort_order, branch_id";

  let q = supabase
    .from("catalog_branch_categories" as "categories")
    .select(select)
    .order("sort_order");
  if (filterBranchId) q = q.eq("branch_id", filterBranchId);
  else if (scopedBranchIds?.length) q = q.in("branch_id", scopedBranchIds);

  const { data, error } = await q;
  if (error) throw error;

  let rows = (data || []) as AdminCategoryRow[];

  // Branch selected but unified overlays missing → show legacy per-branch rows.
  if (filterBranchId && rows.length === 0) {
    const { data: legacy, error: legacyErr } = await supabase
      .from("categories")
      .select("id, name, name_en, image, slug, section, is_active, sort_order, branch_id")
      .eq("branch_id", filterBranchId)
      .order("sort_order");
    if (legacyErr) throw legacyErr;
    rows = (legacy || []).map((r: any) => ({
      ...r,
      catalog_id: r.id,
      legacy_category_id: r.id,
    }));
  }

  // One row per logical category when viewing multiple branches.
  if (!filterBranchId) {
    const byCatalog = new Map<string, AdminCategoryRow>();
    for (const row of rows) {
      const key = String(row.catalog_id || row.id);
      const prev = byCatalog.get(key);
      if (!prev) {
        byCatalog.set(key, row);
        continue;
      }
      const prevScore = (prev.is_active ? 10 : 0) + (prev.legacy_category_id ? 1 : 0);
      const nextScore = (row.is_active ? 10 : 0) + (row.legacy_category_id ? 1 : 0);
      if (nextScore > prevScore) byCatalog.set(key, row);
    }
    return [...byCatalog.values()];
  }

  return rows;
}
