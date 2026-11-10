import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import AnnouncementBar from "@/components/layout/AnnouncementBar";
import HomeSections from "@/components/home/HomeSections";
import SeoHead from "@/components/seo/SeoHead";
import { useLanguage } from "@/contexts/LanguageContext";
import { BRAND } from "@/lib/brand";
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_TITLE,
  organizationJsonLd,
} from "@/lib/seo";

const Index = () => {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SeoHead
        title={DEFAULT_TITLE}
        description={DEFAULT_DESCRIPTION}
        path="/"
        jsonLd={organizationJsonLd()}
      />
      <AnnouncementBar />
      <Header />
      <main className="flex-1 container py-6">
        <h1 className="font-heading font-bold text-2xl md:text-3xl text-start mb-6">
          {t(BRAND.fullNameAr, BRAND.fullNameEn)}
        </h1>
        <HomeSections />
      </main>
      {/* Desktop footer only — mobile uses bottom nav; avoids heavy footer logo as LCP */}
      <div className="hidden md:block">
        <Footer />
      </div>
    </div>
  );
};

export default Index;
