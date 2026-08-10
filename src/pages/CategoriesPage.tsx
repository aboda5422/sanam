import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import HomeSections from "@/components/home/HomeSections";
import { useLanguage } from "@/contexts/LanguageContext";

const CategoriesPage = () => {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container py-4">
        <h1 className="font-heading font-bold text-xl mb-6">
          {t("جميع الأقسام", "All Categories")}
        </h1>
        <HomeSections />
      </main>
      <Footer />
    </div>
  );
};

export default CategoriesPage;
