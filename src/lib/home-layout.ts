/** Homepage marketing layout — controllable via store_settings.home_layout */

export const HOME_LAYOUT_KEY = "home_layout";

export type HomeSectionId =
  | "hero"
  | "weekend_offers"
  | "categories"
  | "today_offers"
  | "bestsellers"
  | "quick_order"
  | "buy_more_save"
  | "promo_banner"
  | "under_10"
  | "seasonal"
  | "new_arrivals"
  | "for_you"
  | "order_again"
  | "brands"
  | "secondary_banner"
  | "assistant";

export type HomeBannerSlide = {
  id: string;
  title: string;
  titleEn?: string;
  subtitle?: string;
  subtitleEn?: string;
  image?: string;
  ctaLabel?: string;
  ctaLabelEn?: string;
  ctaUrl?: string;
  /** CSS gradient fallback when image is empty */
  accent?: string;
};

export type HomeSectionConfig = {
  id: HomeSectionId;
  enabled: boolean;
  sortOrder: number;
  title: string;
  titleEn: string;
  subtitle?: string;
  subtitleEn?: string;
  maxItems?: number;
  /** Under-X price ceiling (SAR) */
  priceMax?: number;
  /** Match products.extra_label / name for seasonal / buy-more rails */
  labelMatch?: string;
  slides?: HomeBannerSlide[];
};

export type HomeLayoutConfig = {
  sections: HomeSectionConfig[];
};

const heroSlides: HomeBannerSlide[] = [
  {
    id: "hero-1",
    title: "طازج من سنام",
    titleEn: "Fresh from Sanam",
    subtitle: "مقاضي يومك بتوصيل سريع من أقرب فرع",
    subtitleEn: "Daily groceries, delivered fast from your nearest branch",
    ctaLabel: "تسوق الآن",
    ctaLabelEn: "Shop now",
    ctaUrl: "/categories",
    image: "/banners/hero-1-fresh.png",
    accent: "linear-gradient(135deg, #14352C 0%, #1f4f42 45%, #2d6b58 100%)",
  },
  {
    id: "hero-2",
    title: "عروض نهاية الأسبوع",
    titleEn: "Weekend deals",
    subtitle: "وفّر أكثر على أساسيات البيت",
    subtitleEn: "Save more on household essentials",
    ctaLabel: "اكتشف العروض",
    ctaLabelEn: "See offers",
    ctaUrl: "/categories",
    image: "/banners/hero-2-weekend.png",
    accent: "linear-gradient(135deg, #0f2a22 0%, #14352C 40%, #B4E87A 160%)",
  },
  {
    id: "hero-3",
    title: "اطلبها بسرعة",
    titleEn: "Quick reorder",
    subtitle: "منتجات يومية بإضافة سريعة للسلة",
    subtitleEn: "Everyday items — add to cart in one tap",
    ctaLabel: "ابدأ الطلب",
    ctaLabelEn: "Start order",
    ctaUrl: "/categories",
    image: "/banners/hero-3-quick.png",
    accent: "linear-gradient(120deg, #1a4036 0%, #14352C 55%, #3d7a5c 100%)",
  },
  {
    id: "hero-4",
    title: "مخبوزات وألبان طازجة",
    titleEn: "Fresh bakery & dairy",
    subtitle: "بداية يومك بمنتجات طازجة كل صباح",
    subtitleEn: "Start your day with fresh morning picks",
    ctaLabel: "تسوّق الطازج",
    ctaLabelEn: "Shop fresh",
    ctaUrl: "/categories",
    image: "/banners/hero-4-dairy.png",
    accent: "linear-gradient(135deg, #14352C 0%, #2a5548 100%)",
  },
  {
    id: "hero-5",
    title: "انتعاش صحي كل يوم",
    titleEn: "Fresh healthy every day",
    subtitle: "عصائر وفواكه مختارة لصحة أفضل",
    subtitleEn: "Juices and fruits picked for better living",
    ctaLabel: "اكتشف الصحة",
    ctaLabelEn: "Explore healthy",
    ctaUrl: "/categories",
    image: "/banners/hero-5-healthy.png",
    accent: "linear-gradient(135deg, #0f2a22 0%, #1f4f42 50%, #B4E87A 140%)",
  },
];

const promoSlides: HomeBannerSlide[] = [
  {
    id: "promo-1",
    title: "اشترِ أكثر ووفّر",
    titleEn: "Buy more, save more",
    subtitle: "باقات وعروض كميات ترفع قيمة سلتك بذكاء",
    subtitleEn: "Bundles that grow your basket value",
    ctaLabel: "تصفح الباقات",
    ctaLabelEn: "Browse packs",
    ctaUrl: "/categories",
    image: "/banners/promo-save.png",
    accent: "linear-gradient(105deg, #B4E87A 0%, #8fd45a 40%, #14352C 120%)",
  },
];

const secondarySlides: HomeBannerSlide[] = [
  {
    id: "sec-1",
    title: "توصيل لباب بيتك",
    titleEn: "Delivered to your door",
    subtitle: "فرعين · خدمة سريعة · جودة سنام",
    subtitleEn: "Two branches · Fast service · Sanam quality",
    ctaLabel: "تابع طلبك",
    ctaLabelEn: "Track order",
    ctaUrl: "/profile",
    image: "/banners/secondary-delivery.png",
    accent: "linear-gradient(135deg, #14352C 0%, #0c221c 100%)",
  },
];

export const DEFAULT_HOME_SECTIONS: HomeSectionConfig[] = [
  {
    id: "hero",
    enabled: true,
    sortOrder: 1,
    title: "البنر الرئيسي",
    titleEn: "Hero banner",
    slides: heroSlides,
  },
  {
    id: "weekend_offers",
    enabled: true,
    sortOrder: 2,
    title: "عروض نهاية الأسبوع",
    titleEn: "Weekend offers",
    subtitle: "عروض محدودة بزمن — اغتنمها قبل انتهاء العطلة",
    subtitleEn: "Time-limited weekend deals",
    maxItems: 12,
    labelMatch: "نهاية|أسبوعي|weekend",
  },
  {
    id: "categories",
    enabled: true,
    sortOrder: 3,
    title: "التصنيفات الرئيسية",
    titleEn: "Main categories",
    subtitle: "اختصارات مباشرة لأهم الأقسام",
    subtitleEn: "Shortcuts to top departments",
    maxItems: 12,
  },
  {
    id: "today_offers",
    enabled: true,
    sortOrder: 4,
    title: "عروض اليوم",
    titleEn: "Today's offers",
    subtitle: "حملات يومية متجددة",
    subtitleEn: "Fresh daily campaigns",
    maxItems: 12,
  },
  {
    id: "bestsellers",
    enabled: true,
    sortOrder: 5,
    title: "الأكثر مبيعاً",
    titleEn: "Best sellers",
    subtitle: "الأعلى طلباً لدعم ثقة الشراء",
    subtitleEn: "Top picks customers love",
    maxItems: 12,
  },
  {
    id: "quick_order",
    enabled: true,
    sortOrder: 6,
    title: "اطلبها بسرعة",
    titleEn: "Order quickly",
    subtitle: "أساسيات يومية بإضافة فورية",
    subtitleEn: "Everyday essentials — one tap",
    maxItems: 12,
  },
  {
    id: "buy_more_save",
    enabled: true,
    sortOrder: 7,
    title: "اشترِ أكثر ووفّر",
    titleEn: "Buy more & save",
    subtitle: "عروض كميات وباقات ترفع متوسط السلة",
    subtitleEn: "Quantity deals that grow your basket",
    maxItems: 12,
    labelMatch: "وفر|اشتر|كمية|باقة|وفر",
  },
  {
    id: "promo_banner",
    enabled: true,
    sortOrder: 8,
    title: "بنر ترويجي",
    titleEn: "Promo banner",
    slides: promoSlides,
  },
  {
    id: "under_10",
    enabled: true,
    sortOrder: 9,
    title: "تحت 10 ريال",
    titleEn: "Under 10 SAR",
    subtitle: "إضافات ذكية بميزانية خفيفة",
    subtitleEn: "Smart add-ons under 10 SAR",
    maxItems: 12,
    priceMax: 10,
  },
  {
    id: "seasonal",
    enabled: true,
    sortOrder: 10,
    title: "قسم موسمي",
    titleEn: "Seasonal picks",
    subtitle: "حملات المناسبات — قابلة للتغيير من الإدارة",
    subtitleEn: "Seasonal campaigns — editable anytime",
    maxItems: 12,
    labelMatch: "موسم|رمضان|العيد|صيفي|شتوي|مناسب",
  },
  {
    id: "new_arrivals",
    enabled: true,
    sortOrder: 11,
    title: "وصل حديثاً",
    titleEn: "New arrivals",
    subtitle: "أحدث المنتجات في المتجر",
    subtitleEn: "Just landed in store",
    maxItems: 12,
  },
  {
    id: "for_you",
    enabled: true,
    sortOrder: 12,
    title: "مختارة لك",
    titleEn: "Picked for you",
    subtitle: "اقتراحات تناسب ذوقك وسلوكك",
    subtitleEn: "Suggestions based on your taste",
    maxItems: 12,
  },
  {
    id: "order_again",
    enabled: true,
    sortOrder: 13,
    title: "اطلبها مرة ثانية",
    titleEn: "Order again",
    subtitle: "أعد شراء ما طلبته سابقاً بسهولة",
    subtitleEn: "Reorder what you loved",
    maxItems: 12,
  },
  {
    id: "brands",
    enabled: true,
    sortOrder: 14,
    title: "ماركات مختارة",
    titleEn: "Featured brands",
    subtitle: "علامات تجارية متوفرة داخل سنام",
    subtitleEn: "Brands available at Sanam",
    maxItems: 10,
  },
  {
    id: "secondary_banner",
    enabled: true,
    sortOrder: 15,
    title: "بنر ثانوي",
    titleEn: "Secondary banner",
    slides: secondarySlides,
  },
  {
    id: "assistant",
    enabled: true,
    sortOrder: 16,
    title: "مساعد سنام",
    titleEn: "Sanam assistant",
  },
];

export function mergeHomeLayout(raw: unknown): HomeLayoutConfig {
  const defaults = DEFAULT_HOME_SECTIONS;
  if (!raw || typeof raw !== "object") {
    return { sections: defaults.map((s) => ({ ...s, slides: s.slides?.map((x) => ({ ...x })) })) };
  }

  const incoming = (raw as HomeLayoutConfig).sections;
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return { sections: defaults.map((s) => ({ ...s, slides: s.slides?.map((x) => ({ ...x })) })) };
  }

  const byId = new Map(incoming.map((s) => [s.id, s]));
  const merged: HomeSectionConfig[] = defaults.map((def) => {
    const override = byId.get(def.id);
    if (!override) return { ...def, slides: def.slides?.map((x) => ({ ...x })) };
    return {
      ...def,
      ...override,
      id: def.id,
      title: override.title || def.title,
      titleEn: override.titleEn || def.titleEn,
      slides:
        override.slides && override.slides.length > 0
          ? override.slides
          : def.slides?.map((x) => ({ ...x })),
    };
  });

  // Preserve any unknown future ids from admin
  for (const s of incoming) {
    if (!merged.some((m) => m.id === s.id)) merged.push(s);
  }

  return {
    sections: [...merged].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
  };
}

export function discountPercent(price: number, original: number | null | undefined): number {
  if (!original || original <= price) return 0;
  return Math.round(((original - price) / original) * 100);
}

export function labelMatches(text: string | null | undefined, pattern?: string): boolean {
  if (!pattern || !text) return false;
  try {
    return new RegExp(pattern, "i").test(text);
  } catch {
    return text.toLowerCase().includes(pattern.toLowerCase());
  }
}
