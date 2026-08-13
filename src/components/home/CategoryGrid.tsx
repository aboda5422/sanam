import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useCategories } from "@/hooks/useCategories";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";

const CategoryGrid = () => {
  const { data: categories, isLoading } = useCategories();
  const { lang } = useLanguage();

  if (isLoading) {
    return (
      <section className="mt-10">
        <h2 className="font-heading font-bold text-xl sm:text-2xl mb-6">تسوق حسب القسم</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-2xl" />
          ))}
        </div>
      </section>
    );
  }

  if (!categories?.length) return null;

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-heading font-bold text-xl sm:text-2xl">تسوق حسب القسم</h2>
        <Link to="/categories" className="text-sm text-primary font-medium hover:underline">
          عرض الكل
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
        {categories.map((cat, i) => {
          const name = lang === "en" && cat.name_en ? cat.name_en : cat.name;
          const image = cat.image || "/placeholder.png";
          const isPlaceholder =
            image === "/placeholder.png" || image.endsWith("placeholder.png");
          return (
            <motion.div
              key={cat.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Link to={`/category/${cat.slug}`} className="group block">
                <div className="aspect-square rounded-2xl overflow-hidden bg-[#f6f7f9] border border-black/[0.04] hover:shadow-md transition-all duration-300 relative">
                  <p className="absolute top-0 inset-x-0 z-10 px-2 pt-2.5 text-center text-xs sm:text-sm font-bold text-foreground leading-tight line-clamp-2 pointer-events-none">
                    {name}
                  </p>
                  <img
                    src={image}
                    alt={name}
                    className={`w-full h-full pt-8 transition-transform duration-500 group-hover:scale-[1.04] ${
                      isPlaceholder ? "object-contain p-6 pt-10" : "object-cover"
                    }`}
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = "/placeholder.png";
                    }}
                  />
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
};

export default CategoryGrid;
