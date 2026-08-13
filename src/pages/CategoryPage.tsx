import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ProductCard from "@/components/product/ProductCard";
import { useProducts } from "@/hooks/useProducts";
import { useCategories, useCategorySections } from "@/hooks/useCategories";
import { Skeleton } from "@/components/ui/skeleton";
import { categories as staticCategories } from "@/data/store-data";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

/** Sanam-only categories in Supabase but not always in the static Ninja list */
const EXTRA_BY_SECTION: Record<string, string[]> = {
  daily: ["cheese-pickles-weighed"],
  pantry: ["roastery-weighed"],
  home: ["plastics-section", "charcoal-gas", "cooking-tools", "summer-resort-goods"],
};

const CategoryPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: dbCategories } = useCategories();
  const { data: categorySections = [] } = useCategorySections();
  const sectionScrollRef = useRef<HTMLDivElement>(null);
  const subScrollRef = useRef<HTMLDivElement>(null);
  const { lang, t } = useLanguage();

  const staticCat = staticCategories.find((c) => c.id === id);

  const dbCategory = dbCategories?.find(
    (c) =>
      c.slug === id ||
      c.id === id ||
      c.name === staticCat?.name ||
      c.slug === staticCat?.id
  );

  const { data: products, isLoading } = useProducts(dbCategory?.id);

  const categoryName = staticCat
    ? lang === "ar"
      ? staticCat.name
      : staticCat.nameEn
    : dbCategory
      ? lang === "ar"
        ? dbCategory.name
        : dbCategory.name_en || dbCategory.name
      : "";

  const activeSectionId = useMemo(() => {
    if (staticCat?.section) return staticCat.section;
    if (dbCategory?.section) return dbCategory.section;
    if (dbCategory?.slug) {
      const match = staticCategories.find((c) => c.id === dbCategory.slug);
      if (match) return match.section;
    }
    return categorySections[0]?.id ?? "daily";
  }, [staticCat, dbCategory, categorySections]);

  const sectionOptions = useMemo(() => {
    return categorySections.filter((section) => {
      const hasStatic = staticCategories.some((c) => c.section === section.id);
      const extra = EXTRA_BY_SECTION[section.id] || [];
      const hasExtra = extra.some((slug) => dbCategories?.some((c) => c.slug === slug));
      const hasDb = dbCategories?.some((c) => c.section === section.id);
      return hasStatic || hasExtra || hasDb;
    });
  }, [dbCategories, categorySections]);

  const subCategories = useMemo(() => {
    const fromStatic = staticCategories
      .filter((c) => c.section === activeSectionId)
      .map((c) => {
        const db = dbCategories?.find((d) => d.slug === c.id || d.name === c.name);
        return {
          slug: c.id,
          name: c.name,
          nameEn: c.nameEn,
          dbId: db?.id,
        };
      });

    const extras = (EXTRA_BY_SECTION[activeSectionId] || [])
      .map((slug) => dbCategories?.find((c) => c.slug === slug))
      .filter(Boolean)
      .map((c) => ({
        slug: c!.slug,
        name: c!.name,
        nameEn: c!.name_en || c!.name,
        dbId: c!.id,
      }));

    const seen = new Set(fromStatic.map((c) => c.slug));
    for (const extra of extras) {
      if (!seen.has(extra.slug)) fromStatic.push(extra);
    }
    return fromStatic;
  }, [activeSectionId, dbCategories]);

  const activeSubSlug = dbCategory?.slug || staticCat?.id || id || "";

  useEffect(() => {
    const el = sectionScrollRef.current?.querySelector<HTMLElement>("[data-active='true']");
    el?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [activeSectionId]);

  useEffect(() => {
    const el = subScrollRef.current?.querySelector<HTMLElement>("[data-active='true']");
    el?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [activeSubSlug, activeSectionId]);

  const scrollStrip = (ref: RefObject<HTMLDivElement | null>, dir: "left" | "right") => {
    ref.current?.scrollBy({ left: dir === "left" ? -200 : 200, behavior: "smooth" });
  };

  const selectSection = (sectionId: string) => {
    if (sectionId === activeSectionId) return;
    const firstStatic = staticCategories.find((c) => c.section === sectionId);
    const firstExtra = (EXTRA_BY_SECTION[sectionId] || [])
      .map((slug) => dbCategories?.find((c) => c.slug === slug))
      .find(Boolean);
    const targetSlug = firstStatic?.id || firstExtra?.slug;
    if (targetSlug) navigate(`/category/${targetSlug}`);
  };

  if (!staticCat && !dbCategory && dbCategories) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 container py-12 text-center">
          <h2 className="font-heading text-xl font-bold mb-2">
            {t("القسم غير موجود", "Category not found")}
          </h2>
          <p className="text-muted-foreground text-sm">
            {t("الرجاء اختيار قسم آخر", "Please choose another category")}
          </p>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <div className="container pt-6 pb-3">
          <div className="flex items-center justify-between gap-3 mb-1">
            <h1 className="font-heading font-bold text-2xl text-right flex-1">{categoryName}</h1>
            <Link
              to="/categories"
              className="shrink-0 text-xs text-muted-foreground hover:text-primary whitespace-nowrap"
            >
              {t("جميع الأقسام", "All Categories")}
            </Link>
          </div>
        </div>

        {/* Main sections strip */}
        <div className="relative border-b bg-background">
          <div className="container relative">
            <button
              type="button"
              onClick={() => scrollStrip(sectionScrollRef, "right")}
              className="absolute right-1 top-1/2 -translate-y-1/2 z-10 w-7 h-7 bg-background/90 backdrop-blur rounded-full shadow flex items-center justify-center hover:bg-muted md:right-2"
              aria-label={t("تمرير يمين", "Scroll right")}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => scrollStrip(sectionScrollRef, "left")}
              className="absolute left-1 top-1/2 -translate-y-1/2 z-10 w-7 h-7 bg-background/90 backdrop-blur rounded-full shadow flex items-center justify-center hover:bg-muted md:left-2"
              aria-label={t("تمرير يسار", "Scroll left")}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div
              ref={sectionScrollRef}
              data-no-swipe
              className="flex gap-2 overflow-x-auto scrollbar-hide py-2.5 px-8"
              style={{ scrollbarWidth: "none" }}
            >
              {sectionOptions.map((section) => {
                const active = section.id === activeSectionId;
                return (
                  <button
                    key={section.id}
                    type="button"
                    data-active={active ? "true" : undefined}
                    onClick={() => selectSection(section.id)}
                    className={cn(
                      "whitespace-nowrap px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors shrink-0 border",
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted/40 text-muted-foreground border-transparent hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {lang === "ar" ? section.title : section.titleEn}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Subcategories strip */}
        {subCategories.length > 0 && (
          <div className="relative border-b mb-4 bg-muted/20">
            <div className="container relative">
              <button
                type="button"
                onClick={() => scrollStrip(subScrollRef, "right")}
                className="absolute right-1 top-1/2 -translate-y-1/2 z-10 w-7 h-7 bg-background/90 backdrop-blur rounded-full shadow flex items-center justify-center hover:bg-muted md:right-2"
                aria-label={t("تمرير يمين", "Scroll right")}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => scrollStrip(subScrollRef, "left")}
                className="absolute left-1 top-1/2 -translate-y-1/2 z-10 w-7 h-7 bg-background/90 backdrop-blur rounded-full shadow flex items-center justify-center hover:bg-muted md:left-2"
                aria-label={t("تمرير يسار", "Scroll left")}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div
                ref={subScrollRef}
                data-no-swipe
                className="flex gap-1.5 overflow-x-auto scrollbar-hide py-2 px-8"
                style={{ scrollbarWidth: "none" }}
              >
                {subCategories.map((cat) => {
                  const active = cat.slug === activeSubSlug;
                  return (
                    <Link
                      key={cat.slug}
                      to={`/category/${cat.slug}`}
                      data-active={active ? "true" : undefined}
                      className={cn(
                        "whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition-colors shrink-0",
                        active
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      {lang === "ar" ? cat.name : cat.nameEn}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        )}

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
              <p className="text-muted-foreground text-sm">
                {t("لا توجد منتجات في هذا القسم حالياً", "No products in this category yet")}
              </p>
            </div>
          )}
        </div>
      </main>
      <div className="hidden md:block">
        <Footer />
      </div>
    </div>
  );
};

export default CategoryPage;
