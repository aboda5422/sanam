import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { useCategories, useCategorySections } from "@/hooks/useCategories";

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
          width={160}
          height={160}
          className={`w-full h-full transition-transform duration-500 group-hover:scale-[1.03] ${
            isPlaceholder ? "object-contain p-6" : "object-cover"
          }`}
          loading="lazy"
          decoding="async"
          fetchPriority="low"
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
  const forceCaptionOverlay = lang === "en";
  const [shownSections, setShownSections] = useState(2);
  const moreRef = useRef<HTMLDivElement>(null);

  const populated = useMemo(
    () =>
      categorySections.filter((section) =>
        (dbCategories || []).some((c) => c.section === section.id),
      ),
    [categorySections, dbCategories],
  );

  useEffect(() => {
    const el = moreRef.current;
    if (!el || shownSections >= populated.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShownSections((n) => Math.min(n + 2, populated.length));
        }
      },
      { rootMargin: "300px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shownSections, populated.length]);

  return (
    <div className="space-y-10">
      {populated.slice(0, shownSections).map((section) => {
        const sectionCats = (dbCategories || []).filter((c) => c.section === section.id);

        return (
          <section key={section.id}>
            <h2 className="font-heading font-bold text-2xl md:text-3xl text-right mb-5">
              {lang === "ar" ? section.title : section.titleEn}
            </h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
              {sectionCats.map((cat) => (
                <CategoryTile
                  key={cat.id}
                  to={`/category/${cat.slug}`}
                  name={lang === "ar" ? cat.name : cat.name_en || cat.name}
                  image={cat.image || section.image || "/placeholder.png"}
                  forceCaptionOverlay={forceCaptionOverlay}
                />
              ))}
            </div>
          </section>
        );
      })}
      {shownSections < populated.length ? <div ref={moreRef} className="h-4" aria-hidden /> : null}
    </div>
  );
};

export default HomeSections;
