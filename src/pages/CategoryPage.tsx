import { useParams, Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef } from "react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ProductCard from "@/components/product/ProductCard";
import { useProducts } from "@/hooks/useProducts";
import { useCategories } from "@/hooks/useCategories";
import { Skeleton } from "@/components/ui/skeleton";
import { categories as staticCategories } from "@/data/store-data";
import { useLanguage } from "@/contexts/LanguageContext";

const CategoryPage = () => {
  const { id } = useParams<{ id: string }>();
  const { data: dbCategories } = useCategories();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { lang, t } = useLanguage();

  // Find category from static data first (since homepage links use static IDs)
  const staticCat = staticCategories.find((c) => c.id === id);

  // Find matching DB category by slug or name
  const dbCategory = dbCategories?.find((c) => 
    c.slug === id || c.id === id || 
    c.name === staticCat?.name || 
    c.slug === staticCat?.id
  );

  // Use DB category ID for product query
  const { data: products, isLoading } = useProducts(dbCategory?.id);

  const categoryName = staticCat 
    ? (lang === "ar" ? staticCat.name : staticCat.nameEn) 
    : dbCategory 
      ? (lang === "ar" ? dbCategory.name : (dbCategory.name_en || dbCategory.name))
      : "";

  const scroll = (dir: "left" | "right") => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: dir === "left" ? -200 : 200, behavior: "smooth" });
    }
  };

  if (!staticCat && !dbCategory && dbCategories) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 container py-12 text-center">
          <h2 className="font-heading text-xl font-bold mb-2">{t("القسم غير موجود", "Category not found")}</h2>
          <p className="text-muted-foreground text-sm">{t("الرجاء اختيار قسم آخر", "Please choose another category")}</p>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <div className="container pt-6 pb-2">
          <h1 className="font-heading font-bold text-2xl text-right">{categoryName}</h1>
          <Link to="/categories" className="text-xs text-muted-foreground hover:text-primary">
            {t("جميع الأقسام", "All Categories")}
          </Link>
        </div>

        {/* Horizontal scrollable category tabs */}
        {dbCategories && dbCategories.length > 0 && (
          <div className="relative border-b mb-4">
            <div className="container">
              <button onClick={() => scroll("right")} className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 bg-background/80 backdrop-blur rounded-full shadow flex items-center justify-center hover:bg-muted">
                <ChevronRight className="h-4 w-4" />
              </button>
              <button onClick={() => scroll("left")} className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 bg-background/80 backdrop-blur rounded-full shadow flex items-center justify-center hover:bg-muted">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div ref={scrollRef} className="flex gap-1 overflow-x-auto scrollbar-hide py-2 px-8" style={{ scrollbarWidth: "none" }}>
                {dbCategories.map((cat) => (
                  <Link
                    key={cat.id}
                    to={`/category/${cat.slug}`}
                    className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition-colors shrink-0 ${
                      cat.id === dbCategory?.id
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {lang === "ar" ? cat.name : (cat.name_en || cat.name)}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Products grid */}
        <div className="container pb-8">
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-2">
              {Array.from({ length: 14 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-xl" />
              ))}
            </div>
          ) : products && products.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-2">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground text-sm">{t("لا توجد منتجات في هذا القسم حالياً", "No products in this category yet")}</p>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default CategoryPage;
