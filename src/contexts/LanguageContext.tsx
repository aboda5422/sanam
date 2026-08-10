import { createContext, useContext, useState, ReactNode, useCallback } from "react";

type Lang = "ar" | "en";

interface LanguageContextType {
  lang: Lang;
  toggleLang: () => void;
  t: (ar: string, en: string) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: "ar",
  toggleLang: () => {},
  t: (ar) => ar,
});

export const useLanguage = () => useContext(LanguageContext);

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [lang, setLang] = useState<Lang>(() => {
    const saved = localStorage.getItem("app-lang");
    return (saved === "en" ? "en" : "ar") as Lang;
  });

  const toggleLang = useCallback(() => {
    setLang((prev) => {
      const next = prev === "ar" ? "en" : "ar";
      localStorage.setItem("app-lang", next);
      document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
      document.documentElement.lang = next;
      return next;
    });
  }, []);

  const t = useCallback((ar: string, en: string) => (lang === "ar" ? ar : en), [lang]);

  return (
    <LanguageContext.Provider value={{ lang, toggleLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
};
