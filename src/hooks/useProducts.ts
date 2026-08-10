import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Product } from "@/types/product";

export const useProducts = (categoryId?: string) => {
  return useQuery<Product[]>({
    queryKey: ["products", categoryId],
    queryFn: async () => {
      let query = supabase
        .from("products")
        .select("id, name, name_en, price, original_price, image, category_id, unit, description, is_active, is_featured, sort_order")
        .eq("is_active", true)
        .order("sort_order");
      if (categoryId) {
        query = query.eq("category_id", categoryId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });
};

export const useFeaturedProducts = () => {
  return useQuery<Product[]>({
    queryKey: ["featured-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, name_en, price, original_price, image, category_id, unit, description, is_active, is_featured, sort_order")
        .eq("is_active", true)
        .eq("is_featured", true)
        .order("sort_order");
      if (error) throw error;
      return data || [];
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
        .select("id, name, name_en, price, original_price, image, category_id, unit, description, is_active, is_featured, sort_order")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
};

export const useAllProducts = () => {
  return useQuery<Product[]>({
    queryKey: ["all-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, name_en, price, original_price, image, category_id, unit, description, is_active, is_featured, sort_order")
        .order("sort_order");
      if (error) throw error;
      return data || [];
    },
  });
};
