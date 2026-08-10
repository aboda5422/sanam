import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";

interface AnnouncementData {
  id: string;
  title: string;
  content: string | null;
  bg_color: string;
}

const bgColorMap: Record<string, string> = {
  primary: "bg-primary text-primary-foreground",
  destructive: "bg-destructive text-destructive-foreground",
  warning: "bg-orange-500 text-white",
  info: "bg-blue-500 text-white",
  dark: "bg-foreground text-background",
};

const statusBarCssColorMap: Record<string, string> = {
  primary: "hsl(var(--primary))",
  destructive: "hsl(var(--destructive))",
  warning: "rgb(249 115 22)",
  info: "rgb(59 130 246)",
  dark: "hsl(var(--foreground))",
};

const AnnouncementBar = () => {
  const [visible, setVisible] = useState(true);
  const [announcements, setAnnouncements] = useState<AnnouncementData[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const { t } = useLanguage();

  useEffect(() => {
    const fetch = async () => {
      const { data } = await (supabase as any)
        .from("announcements")
        .select("id, title, content, bg_color")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (data?.length) setAnnouncements(data);
    };
    fetch();
  }, []);

  // Reset the status-bar band color when the announcement is hidden/unmounted
  useEffect(() => {
    return () => {
      if (typeof document !== "undefined") {
        document.documentElement.style.removeProperty("--status-bar-bg");
      }
    };
  }, []);

  useEffect(() => {
    if ((!visible || !announcements.length) && typeof document !== "undefined") {
      document.documentElement.style.removeProperty("--status-bar-bg");
    }
  }, [visible, announcements.length]);

  // Auto-rotate announcements
  useEffect(() => {
    if (announcements.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex(i => (i + 1) % announcements.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [announcements.length]);

  if (!visible || !announcements.length) return null;

  const current = announcements[currentIndex];
  const bgClass = bgColorMap[current.bg_color] || bgColorMap.primary;
  const statusBarColor =
    statusBarCssColorMap[current.bg_color] || statusBarCssColorMap.primary;

  return (
    <div
      className={`${bgClass} text-sm py-2 relative transition-colors duration-300`}
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.5rem)" }}
      ref={(el) => {
        // Paint the iOS status-bar band the same color as the announcement
        if (typeof document !== "undefined") {
          document.documentElement.style.setProperty(
            "--status-bar-bg",
            statusBarColor
          );
        }
      }}
    >
      <div className="container flex items-center justify-center gap-2">
        <span className="font-semibold">{current.title}</span>
        {current.content && <span className="hidden sm:inline opacity-90">{current.content}</span>}
        {announcements.length > 1 && (
          <div className="hidden md:flex items-center gap-1 mr-3">
            {announcements.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentIndex(i)}
                className={`w-1.5 h-1.5 rounded-full transition-all ${i === currentIndex ? "bg-current scale-125" : "bg-current/40"}`}
              />
            ))}
          </div>
        )}
      </div>
      <button
        onClick={() => setVisible(false)}
        className="absolute left-3 top-1/2 -translate-y-1/2 hover:opacity-70 transition-opacity"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

export default AnnouncementBar;
