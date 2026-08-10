import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Search, ShoppingCart, ChevronLeft, User, MapPin, LogOut, Menu, X, Globe } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { categorySections, categories } from "@/data/store-data";
import logoMark from "@/assets/logo-mark.png";
import logoFull from "@/assets/logo-full.png";
import { useLanguage } from "@/contexts/LanguageContext";
import { BRAND } from "@/lib/brand";

const Header = () => {
  const { uniqueItems } = useCart();
  const [scrolled, setScrolled] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [defaultAddress, setDefaultAddress] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { lang, toggleLang, t } = useLanguage();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) loadDefaultAddress(session.user.id);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) loadDefaultAddress(session.user.id);
    });
    return () => subscription.unsubscribe();
  }, []);

  const loadDefaultAddress = async (userId: string) => {
    const { data } = await supabase
      .from("user_addresses")
      .select("label, address")
      .eq("user_id", userId)
      .eq("is_default", true)
      .maybeSingle();
    if (data) {
      setDefaultAddress(data.label === "home" ? "🏠 " + data.address : "💼 " + data.address);
    }
  };

  // Search products from DB
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); setSearchLoading(false); return; }
    setSearchLoading(true);
    const timeout = setTimeout(async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, name_en, price, image")
        .eq("is_active", true)
        .or(`name.ilike.%${searchQuery}%,name_en.ilike.%${searchQuery}%`)
        .limit(8);
      setSearchResults(data || []);
      setSearchLoading(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  // Close search on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    navigate("/");
  };

  const handleDeliveryClick = () => {
    if (user) {
      navigate("/profile?tab=addresses");
    } else {
      navigate("/auth");
    }
  };

  return (
    <header
      className={`sticky top-0 z-50 bg-background transition-shadow duration-200 ${
        scrolled ? "shadow-md" : "shadow-sm"
      }`}
    >
      <div className="container flex items-center justify-between h-[68px] gap-3 lg:gap-6">
        {/* Mobile: Hamburger */}
        {isMobile && (
          <Sheet>
            <SheetTrigger asChild>
              <button className="p-2 hover:bg-muted rounded-lg transition-colors">
                <Menu className="h-6 w-6" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px] p-0 overflow-y-auto">
              <SheetHeader className="p-4 border-b">
                <SheetTitle className="flex items-center gap-2">
                  <img src={logoMark} alt={BRAND.fullNameAr} className="h-8 w-auto" />
                  <span className="font-heading font-bold text-lg">{t(BRAND.nameAr, BRAND.nameEn)}</span>
                </SheetTitle>
              </SheetHeader>
              <div className="p-4 space-y-4">
                {user ? (
                  <div className="flex items-center justify-between p-3 bg-muted rounded-xl">
                    <Link
                      to="/profile"
                      className="flex items-center gap-2 flex-1"
                    >
                      <User className="h-5 w-5 text-primary" />
                      <span className="font-medium text-sm">{user.user_metadata?.full_name || t("حسابي", "My Account")}</span>
                    </Link>
                    <button onClick={handleLogout} className="text-muted-foreground hover:text-destructive">
                      <LogOut className="h-5 w-5" />
                    </button>
                  </div>
                ) : (
                  <Link to="/auth" className="flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-xl px-4 py-3 font-semibold text-sm">
                    <User className="h-5 w-5" />
                    <span>{t("تسجيل الدخول", "Sign In")}</span>
                  </Link>
                )}

                {/* Delivery */}
                <button onClick={handleDeliveryClick} className="flex items-center gap-2 w-full p-3 bg-muted/50 rounded-xl text-sm">
                  <MapPin className="h-5 w-5 text-primary" />
                  <span className="text-muted-foreground">{t("تسليم إلى:", "Deliver to:")}</span>
                  <span className="font-semibold truncate max-w-[140px]">
                    {defaultAddress || t("حدد العنوان", "Set address")}
                  </span>
                </button>

                {/* Categories */}
                <div className="space-y-2">
                  <h3 className="font-heading font-bold text-sm text-muted-foreground px-1">{t("الأقسام", "Sections")}</h3>
                  {categorySections.map((section) => {
                    const sectionCategories = categories.filter(c => c.section === section.id);
                    return (
                      <div key={section.id}>
                        <p className="text-xs font-bold text-primary px-1 mb-1">{section.title}</p>
                        {sectionCategories.slice(0, 4).map((cat) => (
                          <Link
                            key={cat.id}
                            to={`/category/${cat.id}`}
                            className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-muted transition-colors text-sm"
                          >
                            <span className="text-lg">{cat.icon}</span>
                            <span>{lang === "ar" ? cat.name : cat.nameEn}</span>
                          </Link>
                        ))}
                      </div>
                    );
                  })}
                </div>

                {/* Language */}
                <div className="flex items-center gap-4 pt-2 border-t">
                  <button onClick={toggleLang} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                    <Globe className="h-4 w-4" />
                    <span>{lang === "ar" ? "English" : "العربية"}</span>
                  </button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        )}

        {/* Logo: mark on mobile, full lockup on desktop */}
        <Link to="/" className="shrink-0">
          <img
            src={logoMark}
            alt={BRAND.fullNameAr}
            className="h-11 w-auto md:hidden"
          />
          <img
            src={logoFull}
            alt={BRAND.fullNameAr}
            className="hidden md:block h-12 w-auto max-w-[280px] object-contain"
          />
        </Link>

        {/* Delivery address - desktop only */}
        <button
          onClick={handleDeliveryClick}
          className="hidden lg:flex items-center gap-2 text-base bg-transparent hover:opacity-70 transition-opacity whitespace-nowrap"
        >
          <MapPin className="h-5 w-5 text-primary" />
          <span className="text-muted-foreground">{t("تسليم إلى:", "Deliver to:")}</span>
          <span className="font-semibold text-foreground max-w-[200px] truncate">
            {defaultAddress || t("حدد العنوان", "Set address")}
          </span>
        </button>

        {/* Search */}
        <div className="flex-1 max-w-xl mx-2 lg:mx-4 relative" ref={searchRef}>
          <div className="relative">
            <Search className="absolute right-3 lg:right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <input
              placeholder={t("ابحث عن منتج...", "Search products...")}
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true); }}
              onFocus={() => searchQuery && setSearchOpen(true)}
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              style={{ fontSize: "16px" }}
              className="w-full h-11 lg:h-12 rounded-full bg-muted/50 border-0 pr-10 lg:pr-12 pl-4 lg:pl-5 text-base placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
            />
          </div>
          {/* Search results dropdown */}
          {searchOpen && searchQuery.trim() && (
            <div className="fixed inset-x-0 top-[68px] bottom-0 bg-background z-[70] overflow-y-auto md:absolute md:inset-auto md:top-full md:mt-1 md:w-full md:border md:rounded-xl md:shadow-lg md:max-h-80 md:bottom-auto">
              {/* Loading bar */}
              {searchLoading && (
                <div className="h-1 w-full bg-muted overflow-hidden">
                  <div className="h-full w-1/3 bg-primary animate-[loading_1s_ease-in-out_infinite]" style={{ animation: "loading 1.2s ease-in-out infinite" }} />
                </div>
              )}
              {searchLoading && searchResults.length === 0 ? (
                <div className="p-6 space-y-3">
                  {[1,2,3,4].map((i) => (
                    <div key={i} className="flex items-center gap-3 animate-pulse">
                      <div className="w-14 h-14 md:w-10 md:h-10 rounded-lg bg-muted" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 bg-muted rounded w-2/3" />
                        <div className="h-3 bg-muted rounded w-1/4" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : searchResults.length > 0 ? (
                searchResults.map((p) => (
                  <Link
                    key={p.id}
                    to={`/product/${p.id}`}
                    className="flex items-center gap-3 p-4 md:p-3 hover:bg-muted transition-colors border-b md:border-b-0"
                    onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
                  >
                    <img src={p.image || "/placeholder.svg"} alt={p.name} className="w-14 h-14 md:w-10 md:h-10 rounded-lg object-cover" />
                    <div className="flex-1 min-w-0">
                      <p className="text-base md:text-sm font-medium truncate">{lang === "ar" ? p.name : (p.name_en || p.name)}</p>
                      <p className="text-sm md:text-xs text-primary font-bold">{p.price} {t("ر.س", "SAR")}</p>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  {t("لا توجد نتائج", "No results found")}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Cart */}
        <Link
          to="/cart"
          className="flex items-center gap-1 lg:gap-2 bg-primary text-primary-foreground rounded-full px-3 lg:px-6 py-2 lg:py-3 hover:bg-primary/90 transition-colors text-sm lg:text-base font-semibold whitespace-nowrap"
        >
          <ShoppingCart className="h-5 w-5" />
          <span className="hidden sm:inline">{t("عربتي", "Cart")}</span>
          {uniqueItems > 0 && (
            <span className="bg-primary-foreground text-primary text-xs lg:text-sm font-bold w-5 lg:w-6 h-5 lg:h-6 rounded-full flex items-center justify-center">
              {uniqueItems}
            </span>
          )}
          <ChevronLeft className="h-4 w-4 hidden sm:block" />
        </Link>

        {/* Language - desktop */}
        <button
          onClick={toggleLang}
          className="hidden lg:flex items-center gap-2 text-base text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
        >
          <span>{lang === "ar" ? "English" : "العربية"}</span>
          <Globe className="h-5 w-5" />
        </button>

        {/* Auth - desktop */}
        {!isMobile && (
          <>
            {user ? (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => navigate("/profile")}
                  className="flex items-center gap-2 text-base text-foreground hover:text-primary transition-colors cursor-pointer"
                >
                  <User className="h-5 w-5" />
                  <span className="hidden sm:inline">{user.user_metadata?.full_name || t("حسابي", "Account")}</span>
                </button>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1 text-base text-muted-foreground hover:text-destructive transition-colors"
                >
                  <LogOut className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <Link
                to="/auth"
                className="flex items-center gap-2 bg-primary text-primary-foreground rounded-full px-6 py-3 hover:bg-primary/90 transition-colors text-base font-semibold whitespace-nowrap"
              >
                <User className="h-5 w-5" />
                <span>{t("التسجيل", "Sign Up")}</span>
              </Link>
            )}
          </>
        )}
      </div>
    </header>
  );
};

export default Header;
