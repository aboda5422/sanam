import { Link } from "react-router-dom";
import { useProducts } from "@/hooks/useProducts";
import ProductCard from "@/components/product/ProductCard";
import type { Category } from "@/types/product";
import { Skeleton } from "@/components/ui/skeleton";

interface CategorySectionProps {
  category: Category;
}

const CategorySection = ({ category }: CategorySectionProps) => {
  const { data: products, isLoading } = useProducts(category.id);

  if (isLoading) {
    return (
      <section className="mb-10">
        <h2 className="font-heading font-bold text-2xl mb-4 text-right">{category.name}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-xl" />
          ))}
        </div>
      </section>
    );
  }

  if (!products?.length) return null;

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-heading font-bold text-2xl text-right">{category.name}</h2>
        <Link to={`/category/${category.slug}`} className="text-sm text-primary font-medium hover:underline">
          عرض الكل
        </Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-2">
        {products.slice(0, 7).map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
};

export default CategorySection;
