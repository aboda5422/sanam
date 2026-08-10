import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { useCategories } from "@/hooks/useCategories";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";

const CategoriesPage = () => {
  const { data: categories, isLoading } = useCategories();

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container py-4">
        <h1 className="font-heading font-bold text-xl mb-4">جميع الأقسام</h1>
        {isLoading ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
            {Array.from({ length: 16 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="aspect-square rounded-2xl" />
                <Skeleton className="h-4 w-16 mx-auto mt-1.5" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
            {categories?.map((cat) => (
              <Link key={cat.id} to={`/category/${cat.slug}`} className="group block">
                <div className="aspect-square rounded-2xl overflow-hidden bg-muted/30 hover:shadow-md transition-all">
                  <img src={cat.image || "/placeholder.svg"} alt={cat.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                </div>
                <p className="text-center text-xs font-medium mt-1.5 text-foreground leading-tight">{cat.name}</p>
              </Link>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default CategoriesPage;
