import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Product } from "@/types/product";
import { useBranch } from "@/contexts/BranchContext";

const PRODUCT_SELECT =
  "id, name, name_en, price, original_price, image, category_id, unit, description, is_active, is_featured, sort_order, barcode, brand, origin_country, size_label, product_form, gallery_urls, extra_label, stock_quantity, cost_price, branch_id";

export const useProducts = (categoryId?: string) => {
  const { selectedBranch } = useBranch();
  const branchId = selectedBranch?.id;
  return useQuery<Product[]>({
    queryKey: ["products", categoryId, branchId],
    enabled: !!branchId,
    queryFn: async () => {
      let query = supabase
        .from("products")
        .select(PRODUCT_SELECT)
        .eq("is_active", true)
        .eq("branch_id", branchId!)
        .order("sort_order");
      if (categoryId) {
        query = query.eq("category_id", categoryId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Product[];
    },
  });
};

export const useFeaturedProducts = () => {
  const { selectedBranch } = useBranch();
  const branchId = selectedBranch?.id;
  return useQuery<Product[]>({
    queryKey: ["featured-products", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(PRODUCT_SELECT)
        .eq("is_active", true)
        .eq("is_featured", true)
        .eq("branch_id", branchId!)
        .order("sort_order");
      if (error) throw error;
      return (data || []) as Product[];
    },
  });
};

export const useProduct = (id?: string) => {
  const { selectedBranch } = useBranch();
  const branchId = selectedBranch?.id;
  return useQuery<Product | null>({
    queryKey: ["product", id, branchId],
    enabled: !!id && !!branchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(PRODUCT_SELECT)
        .eq("id", id!)
        .eq("branch_id", branchId!)
        .maybeSingle();
      if (error) throw error;
      return data as Product | null;
    },
  });
};

export const useAllProducts = () => {
  const { selectedBranch } = useBranch();
  const branchId = selectedBranch?.id;
  return useQuery<Product[]>({
    queryKey: ["all-products", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(PRODUCT_SELECT)
        .eq("branch_id", branchId!)
        .order("sort_order");
      if (error) throw error;
      return (data || []) as Product[];
    },
  });
};
