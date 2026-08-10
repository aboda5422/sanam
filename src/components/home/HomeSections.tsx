import { Link } from "react-router-dom";
import { categorySections, categories } from "@/data/store-data";
import { useLanguage } from "@/contexts/LanguageContext";
import { useCategories } from "@/hooks/useCategories";

const HomeSections = () => {
  const { lang } = useLanguage();
  const { data: dbCategories } = useCategories();
  const activeSlugs = new Set((dbCategories || []).map((c) => c.slug));
  const activeNames = new Set((dbCategories || []).map((c) => c.name));

  return (
    <div className="space-y-10">
      {categorySections.map((section) => {
        const sectionCats = categories.filter((c) => {
          if (c.section !== section.id) return false;
          if (!dbCategories) return true; // while loading, show all
          return activeSlugs.has(c.id) || activeNames.has(c.name);
        });
        if (!sectionCats.length) return null;

        return (
          <section key={section.id}>
            <h2 className="font-heading font-bold text-2xl md:text-3xl text-right mb-5">
              {lang === "ar" ? section.title : section.titleEn}
            </h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
              {sectionCats.map((cat) => (
                <Link
                  key={cat.id}
                  to={`/category/${cat.id}`}
                  className="group block"
                >
                  <div className="aspect-square rounded-2xl overflow-hidden bg-muted/30 hover:shadow-lg transition-all duration-300 relative">
                    <img
                      src={cat.image}
                      alt={lang === "ar" ? cat.name : cat.nameEn}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = "/placeholder.svg";
                      }}
                    />
                  </div>
                  <p className="text-center text-xs sm:text-sm font-semibold mt-2 text-foreground leading-tight line-clamp-2">
                    {lang === "ar" ? cat.name : cat.nameEn}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
};

export default HomeSections;
