import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCategories } from "@/hooks/useCategories";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";

const HeroSlider = () => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { data: categories, isLoading } = useCategories();

  const bannerItems = (categories || []).filter(c => c.image).slice(0, 8);

  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "left" ? -300 : 300, behavior: "smooth" });
  };

  if (isLoading) {
    return (
      <section className="mb-6">
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="shrink-0 w-[200px] h-[200px] rounded-2xl" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="mb-6">
      <div className="relative group">
        <div ref={scrollRef} className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
          {bannerItems.map((item) => (
            <div
              key={item.id}
              onClick={() => navigate(`/category/${item.slug}`)}
              className="shrink-0 w-[200px] h-[200px] rounded-2xl overflow-hidden cursor-pointer hover:shadow-md transition-shadow relative"
            >
              <img src={item.image || "/placeholder.svg"} alt={item.name} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = "/placeholder.svg"; }} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
              <div className="absolute bottom-0 inset-x-0 p-3 text-white">
                <h3 className="font-heading font-bold text-xs">{item.name}</h3>
                <p className="text-[10px] opacity-90 mt-0.5">{item.name_en}</p>
              </div>
            </div>
          ))}
        </div>
        <button onClick={() => scroll("right")} className="absolute right-1 top-1/2 -translate-y-1/2 bg-white/90 shadow rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <ChevronRight className="h-4 w-4" />
        </button>
        <button onClick={() => scroll("left")} className="absolute left-1 top-1/2 -translate-y-1/2 bg-white/90 shadow rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
};

export default HeroSlider;
