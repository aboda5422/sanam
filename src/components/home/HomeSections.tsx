import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { useCategories, useCategorySections } from "@/hooks/useCategories";
import { categories as staticCategories } from "@/data/store-data";
import { SmartImage } from "@/components/ui/SmartImage";

const CategoryTile = ({
  to,
  name,
  image,
  captionBelow,
  priority = false,
}: {
  to: string;
  name: string;
  image: string;
  /** English UI: label under the tile so it does not clash with Arabic baked into the art */
  captionBelow?: boolean;
  /** First viewport tiles should load eagerly for LCP */
  priority?: boolean;
}) => {
  const isPlaceholder =
    !image || image.includes("placeholder.");

  return (
    <Link to={to} className="group block">
      <div className="aspect-square rounded-2xl overflow-hidden bg-[#f8f8f9] border border-black/[0.03] hover:shadow-sm transition-all duration-300 relative">
        <SmartImage
          src={image}
          preset="thumb"
          alt={name}
          width={160}
          height={160}
          className={`w-full h-full transition-transform duration-500 group-hover:scale-[1.03] ${
            isPlaceholder
              ? "object-contain p-6"
              : captionBelow
                ? "object-cover object-bottom"
                : "object-cover"
          }`}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={priority ? "high" : "low"}
          onError={(e) => {
            e.currentTarget.classList.add("object-contain", "p-6");
            e.currentTarget.classList.remove("object-cover", "object-bottom");
          }}
        />
      </div>
      {captionBelow ? (
        <p className="mt-1.5 px-0.5 text-center text-[11px] sm:text-xs font-semibold text-foreground leading-tight line-clamp-2">
          {name}
        </p>
      ) : null}
    </Link>
  );
};

const HomeSections = () => {
  const { lang } = useLanguage();
  const { data: dbCategories } = useCategories();
  const { data: categorySections = [] } = useCategorySections();
  const captionBelow = lang === "en";
  const [shownSections, setShownSections] = useState(2);
  const moreRef = useRef<HTMLDivElement>(null);

  // Before branch selection, fall back to static catalog so crawlers still see internal links.
  const displayCategories = useMemo(() => {
    if (dbCategories?.length) {
      return dbCategories.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        nameEn: c.name_en || c.name,
        image: c.image || "/placeholder.webp",
        section: c.section || "",
      }));
    }
    return staticCategories.map((c) => ({
      id: c.id,
      slug: c.id,
      name: c.name,
      nameEn: c.nameEn,
      image: c.image || "/placeholder.webp",
      section: c.section,
    }));
  }, [dbCategories]);

  const populated = useMemo(
    () =>
      categorySections.filter((section) =>
        displayCategories.some((c) => c.section === section.id),
      ),
    [categorySections, displayCategories],
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
      {populated.slice(0, shownSections).map((section, sectionIndex) => {
        const sectionCats = displayCategories.filter((c) => c.section === section.id);

        return (
          <section key={section.id}>
            <h2 className="font-heading font-bold text-2xl md:text-3xl text-start mb-5">
              {lang === "ar" ? section.title : section.titleEn}
            </h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
              {sectionCats.map((cat, catIndex) => (
                <CategoryTile
                  key={cat.id}
                  to={`/category/${cat.slug}`}
                  name={lang === "ar" ? cat.name : cat.nameEn}
                  image={cat.image || section.image || "/placeholder.webp"}
                  captionBelow={captionBelow}
                  priority={sectionIndex === 0 && catIndex < 6}
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
