import { Link } from "react-router-dom";
import { categories } from "@/data/store-data";
import { useLanguage } from "@/contexts/LanguageContext";
import { useCategories, useCategorySections } from "@/hooks/useCategories";

/** Sanam-only categories that live in Supabase but not in the Ninja static catalog. */
const EXTRA_BY_SECTION: Record<string, string[]> = {
  daily: ["cheese-pickles-weighed"],
  pantry: ["roastery-weighed"],
  home: ["plastics-section", "charcoal-gas", "cooking-tools", "summer-resort-goods"],
};

const CategoryTile = ({
  to,
  name,
  image,
  forceCaptionOverlay,
}: {
  to: string;
  name: string;
  image: string;
  /** When true (English UI), cover baked-in Arabic title on the tile image */
  forceCaptionOverlay?: boolean;
}) => {
  const isPlaceholder =
    !image || image === "/placeholder.png" || image.endsWith("placeholder.png");

  return (
    <Link to={to} className="group block">
      <div className="aspect-square rounded-2xl overflow-hidden bg-[#f8f8f9] border border-black/[0.03] hover:shadow-sm transition-all duration-300 relative">
        {forceCaptionOverlay ? (
          <p className="absolute top-0 inset-x-0 z-10 px-1.5 pt-2 pb-1.5 text-center text-[11px] sm:text-xs font-bold text-foreground leading-tight line-clamp-2 bg-gradient-to-b from-[#f8f8f9] via-[#f8f8f9]/95 to-transparent pointer-events-none">
            {name}
          </p>
        ) : null}
        <img
          src={image}
          alt={name}
          className={`w-full h-full transition-transform duration-500 group-hover:scale-[1.03] ${
            isPlaceholder ? "object-contain p-6" : "object-cover"
          }`}
          loading="lazy"
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = "/placeholder.png";
            e.currentTarget.classList.add("object-contain", "p-6");
            e.currentTarget.classList.remove("object-cover");
          }}
        />
      </div>
    </Link>
  );
};

const HomeSections = () => {
  const { lang } = useLanguage();
  const { data: dbCategories } = useCategories();
  const { data: categorySections = [] } = useCategorySections();
  const dbBySlug = new Map((dbCategories || []).map((c) => [c.slug, c]));
  const forceCaptionOverlay = lang === "en";

  return (
    <div className="space-y-10">
      {categorySections.map((section) => {
        const sectionCats = categories.filter((c) => c.section === section.id);
        const extraSlugs = EXTRA_BY_SECTION[section.id] || [];
        const extras = extraSlugs
          .map((slug) => dbBySlug.get(slug))
          .filter(Boolean)
          .map((c) => ({
            id: c!.slug,
            name: c!.name,
            nameEn: c!.name_en || c!.name,
            image: c!.image || "/placeholder.png",
          }));

        if (!sectionCats.length && !extras.length) return null;

        return (
          <section key={section.id}>
            <h2 className="font-heading font-bold text-2xl md:text-3xl text-right mb-5">
              {lang === "ar" ? section.title : section.titleEn}
            </h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
              {sectionCats.map((cat) => {
                const db = dbBySlug.get(cat.id);
                const image = db?.image || cat.image || "/placeholder.png";
                return (
                  <CategoryTile
                    key={cat.id}
                    to={`/category/${cat.id}`}
                    name={lang === "ar" ? cat.name : cat.nameEn}
                    image={image}
                    forceCaptionOverlay={forceCaptionOverlay}
                  />
                );
              })}
              {extras.map((cat) => (
                <CategoryTile
                  key={cat.id}
                  to={`/category/${cat.id}`}
                  name={lang === "ar" ? cat.name : cat.nameEn}
                  image={cat.image}
                  forceCaptionOverlay={forceCaptionOverlay}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
};

export default HomeSections;
