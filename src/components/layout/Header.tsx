import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { ShoppingCart, User, MapPin, LogOut, Menu, Globe } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { categorySections, categories } from "@/data/store-data";
import logoMark from "@/assets/logo-mark.png";
import logoFullLight from "@/assets/logo-full-light.png";
import logoMarkHires from "@/assets/logo-mark-hires.png";
import { useLanguage } from "@/contexts/LanguageContext";
import { BRAND } from "@/lib/brand";
import { useBranch } from "@/contexts/BranchContext";

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
  const { selectedBranch, openPicker } = useBranch();

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
              <SheetHeader className="p-4 pr-12 border-b">
                <SheetTitle className="!mt-0 text-center">
                  <img
                    src={logoFullLight}
                    alt={BRAND.fullNameAr}
                    className="h-11 w-auto max-w-full object-contain mx-auto"
                  />
                </SheetTitle>
              </SheetHeader>
              <div className="p-4 space-y-4">
                {user ? (
                  <div className="p-3 bg-muted rounded-xl space-y-2">
                    <Link
                      to="/profile"
                      className="flex items-center gap-2"
                    >
                      <User className="h-5 w-5 text-primary" />
                      <span className="font-medium text-sm">{user.user_metadata?.full_name || t("حسابي", "My Account")}</span>
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-2 w-full pt-2 border-t border-border/60 text-sm text-destructive"
                    >
                      <LogOut className="h-4 w-4" />
                      <span>{t("تسجيل الخروج", "Sign out")}</span>
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

        {/* Logo: mark (short) on mobile, full lockup (light) on desktop */}
        <Link to="/" className="shrink-0">
          <img
            src={logoMark}
            alt={BRAND.fullNameAr}
            className="h-11 w-auto md:hidden"
          />
          <img
            src={logoFullLight}
            alt={BRAND.fullNameAr}
            className="hidden md:block h-12 w-auto max-w-[280px] object-contain"
          />
        </Link>

        {/* Selected branch */}
        <button
          type="button"
          onClick={openPicker}
          className="hidden sm:flex items-center gap-1.5 text-sm bg-primary/10 hover:bg-primary/15 text-primary rounded-full px-3 py-1.5 transition-colors max-w-[180px]"
        >
          <MapPin className="h-4 w-4 shrink-0" />
          <span className="font-semibold truncate">
            {selectedBranch?.name || t("اختر الفرع", "Choose branch")}
          </span>
        </button>

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
            <img
              src={logoMarkHires}
              alt=""
              aria-hidden="true"
              className="absolute right-3 lg:right-4 top-1/2 -translate-y-1/2 h-6 w-6 lg:h-7 lg:w-7 object-contain pointer-events-none"
            />
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
                    <img src={p.image || "/placeholder.png"} alt={p.name} className="w-14 h-14 md:w-10 md:h-10 rounded-lg object-cover" />
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

        {/* Cart — icon only */}
        <Link
          to="/cart"
          aria-label={t("عربتي", "Cart")}
          className="relative flex items-center justify-center bg-primary/10 hover:bg-primary/15 text-primary rounded-full p-2.5 transition-colors"
        >
          <ShoppingCart className="h-5 w-5" />
          {uniqueItems > 0 && (
            <span className="absolute -top-1 -left-1 bg-primary text-primary-foreground text-[10px] font-bold min-w-5 h-5 px-1 rounded-full flex items-center justify-center">
              {uniqueItems}
            </span>
          )}
        </Link>

        {/* Language — icon only (desktop) */}
        <button
          type="button"
          onClick={toggleLang}
          aria-label={lang === "ar" ? "English" : "العربية"}
          title={lang === "ar" ? "English" : "العربية"}
          className="hidden lg:flex items-center justify-center bg-primary/10 hover:bg-primary/15 text-primary rounded-full p-2.5 transition-colors"
        >
          <Globe className="h-5 w-5" />
        </button>

        {/* Auth - desktop */}
        {!isMobile && (
          <>
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-2 bg-primary/10 hover:bg-primary/15 text-primary rounded-full px-3 py-2 transition-colors cursor-pointer text-sm font-semibold outline-none"
                  >
                    <User className="h-5 w-5" />
                    <span className="hidden sm:inline max-w-[120px] truncate">
                      {user.user_metadata?.full_name || t("حسابي", "Account")}
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onClick={() => navigate("/profile")}
                  >
                    <User className="h-4 w-4 ml-2" />
                    {t("حسابي", "My Account")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="cursor-pointer text-destructive focus:text-destructive"
                    onClick={handleLogout}
                  >
                    <LogOut className="h-4 w-4 ml-2" />
                    {t("تسجيل الخروج", "Sign out")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link
                to="/auth"
                className="flex items-center gap-2 bg-primary/10 hover:bg-primary/15 text-primary rounded-full px-3 py-2 transition-colors text-sm font-semibold whitespace-nowrap"
                aria-label={t("دخول / تسجيل", "Login / Sign Up")}
              >
                <User className="h-5 w-5" />
                <span className="hidden lg:inline">{t("دخول / تسجيل", "Login / Sign Up")}</span>
              </Link>
            )}
          </>
        )}
      </div>
    </header>
  );
};

export default Header;
