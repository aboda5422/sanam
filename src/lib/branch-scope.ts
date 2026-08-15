import { supabase } from "@/integrations/supabase/client";

/** Apply .in(column, ids) when admin is scoped to specific branches. null = all branches. */
export function applyBranchFilter<T extends { in: (column: string, values: string[]) => T }>(
  query: T,
  scopedBranchIds: string[] | null | undefined,
  column = "branch_id",
): T {
  if (scopedBranchIds && scopedBranchIds.length > 0) {
    return query.in(column, scopedBranchIds);
  }
  return query;
}

/** Branch ids assigned to a driver. Empty if none. */
export async function fetchDriverBranchIds(driverId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("driver_branches" as any)
    .select("branch_id")
    .eq("driver_id", driverId);
  if (error) throw error;
  return [...new Set(((data || []) as { branch_id: string }[]).map((r) => r.branch_id).filter(Boolean))];
}

/** Driver ids assigned to the scoped branches. null = no filter (all branches). */
export async function fetchDriverIdsForBranches(
  scopedBranchIds: string[] | null | undefined,
): Promise<string[] | null> {
  if (!scopedBranchIds?.length) return null;
  const { data, error } = await supabase
    .from("driver_branches" as any)
    .select("driver_id")
    .in("branch_id", scopedBranchIds);
  if (error) throw error;
  return [...new Set(((data || []) as { driver_id: string }[]).map((r) => r.driver_id))];
}

/** Branch to write new rows to. Null if site-wide view with no header filter. */
export function writeBranchId(
  filterBranchId: string | null,
  scopedBranchIds: string[] | null,
): string | null {
  if (filterBranchId) return filterBranchId;
  if (scopedBranchIds?.length === 1) return scopedBranchIds[0];
  return null;
}
