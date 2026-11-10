import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Product } from "@/types/product";
import { useBranch } from "@/contexts/BranchContext";
import { CATALOG_BRANCH_PRODUCT_SELECT, CATALOG_BRANCH_VIEW } from "@/lib/catalog";

/** Lean columns for grids/lists — skip gallery/description blobs. */
const PRODUCT_LIST_SELECT =
  "id, name, name_en, price, original_price, image, category_id, unit, is_active, is_featured, sort_order, extra_label, brand, size_label, branch_id, stock_quantity";

const PRODUCT_DETAIL_SELECT =
  "id, name, name_en, price, original_price, image, category_id, unit, description, is_active, is_featured, sort_order, barcode, brand, origin_country, size_label, product_form, gallery_urls, extra_label, stock_quantity, cost_price, branch_id";

/** Resolve a product id (legacy or canonical) to the selected branch overlay when needed. */
async function resolveProductForBranch(productId: string, branchId: string): Promise<Product | null> {
  const { data: mapped } = await supabase
    .from("product_id_map" as any)
    .select("canonical_product_id")
    .eq("legacy_product_id", productId)
    .maybeSingle();
  const catalogId =
    (mapped as { canonical_product_id?: string } | null)?.canonical_product_id || productId;

  const { data, error } = await supabase
    .from(CATALOG_BRANCH_VIEW as any)
    .select(CATALOG_BRANCH_PRODUCT_SELECT)
    .eq("branch_id", branchId)
    .eq("catalog_id", catalogId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as Product & { is_active?: boolean };
  if (row.is_active === false) return null;
  return row as Product;
}

export const CATEGORY_PAGE_SIZE = 28;
export const HOME_RAIL_LIMIT = 7;
export const FEATURED_LIMIT = 14;
export const SIMILAR_LIMIT = 8;

type ListOpts = { limit?: number };

export const useProducts = (categoryId?: string, opts?: ListOpts) => {
  const { selectedBranch } = useBranch();
  const branchId = selectedBranch?.id;
  const limit = opts?.limit;
  return useQuery<Product[]>({
    queryKey: ["products", categoryId, branchId, limit ?? "all"],
    enabled: !!branchId && !!categoryId,
    staleTime: 60_000,
    queryFn: async () => {
      let query = supabase
        .from("products")
        .select(PRODUCT_LIST_SELECT)
        .eq("is_active", true)
        .eq("branch_id", branchId!)
        .eq("category_id", categoryId!)
        .order("sort_order");
      if (limit != null) query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Product[];
    },
  });
};

/** Paginated category grid — first page for paint, more on demand. */
export const useCategoryProductsInfinite = (
  categoryId?: string,
  pageSize: number = CATEGORY_PAGE_SIZE,
) => {
  const { selectedBranch } = useBranch();
  const branchId = selectedBranch?.id;
  return useInfiniteQuery({
    queryKey: ["products-infinite", categoryId, branchId, pageSize],
    enabled: !!branchId && !!categoryId,
    staleTime: 60_000,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const from = pageParam * pageSize;
      const to = from + pageSize - 1;
      const { data, error } = await supabase
        .from("products")
        .select(PRODUCT_LIST_SELECT)
        .eq("is_active", true)
        .eq("branch_id", branchId!)
        .eq("category_id", categoryId!)
        .order("sort_order")
        .range(from, to);
      if (error) throw error;
      const rows = (data || []) as Product[];
      return {
        rows,
        nextPage: rows.length === pageSize ? pageParam + 1 : undefined,
      };
    },
    getNextPageParam: (last) => last.nextPage,
  });
};

export const useFeaturedProducts = (limit: number = FEATURED_LIMIT) => {
  const { selectedBranch } = useBranch();
  const branchId = selectedBranch?.id;
  return useQuery<Product[]>({
    queryKey: ["featured-products", branchId, limit],
    enabled: !!branchId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(PRODUCT_LIST_SELECT)
        .eq("is_active", true)
        .eq("is_featured", true)
        .eq("branch_id", branchId!)
        .order("sort_order")
        .limit(limit);
      if (error) throw error;
      return (data || []) as Product[];
    },
  });
};

/**
 * Load a product by id even before branch selection (SEO / deep links).
 * Content renders behind the forced branch picker; after a branch is chosen,
 * remap to that branch's catalog overlay when the row belongs elsewhere.
 */
export const useProduct = (id?: string) => {
  const { selectedBranch } = useBranch();
  const branchId = selectedBranch?.id;
  return useQuery<Product | null>({
    queryKey: ["product", id, branchId ?? "any"],
    enabled: !!id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(PRODUCT_DETAIL_SELECT)
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      const product = data as Product;
      if (branchId && product.branch_id && product.branch_id !== branchId) {
        const remapped = await resolveProductForBranch(id!, branchId);
        if (remapped) return remapped;
        // Keep SEO content visible; cart remap handles availability after switch.
      }
      return product;
    },
  });
};

export const useAllProducts = () => {
  const { selectedBranch } = useBranch();
  const branchId = selectedBranch?.id;
  return useQuery<Product[]>({
    queryKey: ["all-products", branchId],
    enabled: !!branchId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(PRODUCT_LIST_SELECT)
        .eq("branch_id", branchId!)
        .order("sort_order")
        .limit(500);
      if (error) throw error;
      return (data || []) as Product[];
    },
  });
};
