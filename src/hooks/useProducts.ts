import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Product } from "@/types/product";

const PRODUCT_SELECT =
  "id, name, name_en, price, original_price, image, category_id, unit, description, is_active, is_featured, sort_order, barcode, brand, origin_country, size_label, product_form, gallery_urls, extra_label, stock_quantity, cost_price";

export const useProducts = (categoryId?: string) => {
  return useQuery<Product[]>({
    queryKey: ["products", categoryId],
    queryFn: async () => {
      let query = supabase
        .from("products")
        .select(PRODUCT_SELECT)
        .eq("is_active", true)
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
  return useQuery<Product[]>({
    queryKey: ["featured-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(PRODUCT_SELECT)
        .eq("is_active", true)
        .eq("is_featured", true)
        .order("sort_order");
      if (error) throw error;
      return (data || []) as Product[];
    },
  });
};

export const useProduct = (id?: string) => {
  return useQuery<Product | null>({
    queryKey: ["product", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(PRODUCT_SELECT)
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data as Product | null;
    },
  });
};

export const useAllProducts = () => {
  return useQuery<Product[]>({
    queryKey: ["all-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(PRODUCT_SELECT)
        .order("sort_order");
      if (error) throw error;
      return (data || []) as Product[];
    },
  });
};
