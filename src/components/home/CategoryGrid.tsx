import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useCategories } from "@/hooks/useCategories";
import { Skeleton } from "@/components/ui/skeleton";

const CategoryGrid = () => {
  const { data: categories, isLoading } = useCategories();

  if (isLoading) {
    return (
      <section className="mt-10">
        <h2 className="font-heading font-bold text-xl sm:text-2xl mb-6">تسوق حسب القسم</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[4/3] rounded-xl" />
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
        {categories.map((cat, i) => (
          <motion.div
            key={cat.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <Link
              to={`/category/${cat.slug}`}
              className="group block rounded-xl overflow-hidden bg-card border hover:shadow-lg transition-all duration-300"
            >
              <div className="aspect-[4/3] overflow-hidden">
                <img
                  src={cat.image || "/placeholder.svg"}
                  alt={cat.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                  onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/placeholder.svg"; }}
                />
              </div>
              <div className="p-3 text-center">
                <h3 className="font-heading font-semibold text-sm">{cat.name}</h3>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
};

export default CategoryGrid;
