// Product type matching the database schema
export interface Product {
  id: string;
  name: string;
  name_en: string | null;
  price: number;
  original_price: number | null;
  image: string | null;
  category_id: string | null;
  unit: string;
  description: string | null;
  is_active: boolean;
  is_featured: boolean;
  sort_order: number;
  barcode?: string | null;
  brand?: string | null;
  origin_country?: string | null;
  size_label?: string | null;
  product_form?: string | null;
  gallery_urls?: string[] | null;
  extra_label?: string | null;
  stock_quantity?: number;
  cost_price?: number | null;
}

export interface Category {
  id: string;
  name: string;
  name_en: string | null;
  image: string | null;
  slug: string;
  section?: string | null;
  is_active: boolean;
  sort_order: number;
}

// Adapter to convert DB product to legacy format for CartContext
export function toLegacyProduct(p: Product) {
  return {
    id: p.id,
    name: p.name,
    nameEn: p.name_en || "",
    price: p.price,
    oldPrice: p.original_price ?? undefined,
    image: p.image || "/placeholder.png",
    categoryId: p.category_id || "",
    unit: p.unit,
    description: p.description || "",
    inStock: p.is_active,
    isBestseller: p.is_featured,
    badge: p.original_price ? `${Math.round(((p.original_price - p.price) / p.original_price) * 100)}%-` : undefined,
  };
}
