import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import AnnouncementBar from "@/components/layout/AnnouncementBar";
import HomeSections from "@/components/home/HomeSections";

const Index = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AnnouncementBar />
      <Header />
      <main className="flex-1 container py-6">
        <HomeSections />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
