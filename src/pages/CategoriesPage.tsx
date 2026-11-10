import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import HomeSections from "@/components/home/HomeSections";
import SeoHead from "@/components/seo/SeoHead";
import { useLanguage } from "@/contexts/LanguageContext";
import { categoryTitle, truncateMeta } from "@/lib/seo";

const CategoriesPage = () => {
  const { t } = useLanguage();
  const title = t("جميع الأقسام", "All Categories");

  return (
    <div className="min-h-screen flex flex-col">
      <SeoHead
        title={categoryTitle(title)}
        description={truncateMeta("تصفح جميع أقسام سنام سوبر ماركت — احتياجات يومية، مقاضي، مشروبات، منزل والمزيد.")}
        path="/categories"
      />
      <Header />
      <main className="flex-1 container py-4">
        <h1 className="font-heading font-bold text-xl mb-6">
          {title}
        </h1>
        <HomeSections />
      </main>
      {/* Site footer: desktop only — keep mobile bottom nav (categories/cart) */}
      <div className="hidden md:block">
        <Footer />
      </div>
    </div>
  );
};

export default CategoriesPage;
