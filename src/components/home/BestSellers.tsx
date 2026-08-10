import { useFeaturedProducts } from "@/hooks/useProducts";
import ProductCard from "@/components/product/ProductCard";
import { Skeleton } from "@/components/ui/skeleton";

const BestSellers = () => {
  const { data: products, isLoading } = useFeaturedProducts();

  if (isLoading) {
    return (
      <section className="mb-10">
        <h2 className="font-heading font-bold text-xl mb-4 text-right">الأكثر مبيعاً</h2>
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
      <h2 className="font-heading font-bold text-xl mb-4 text-right">الأكثر مبيعاً</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-2">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
};

export default BestSellers;
