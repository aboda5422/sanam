import { BRAND } from "@/lib/brand";

/** Public storefront origin used in canonical / OG / sitemap. */
export const STORE_ORIGIN = "https://store.sanam.sa";

export const DEFAULT_OG_IMAGE = `${STORE_ORIGIN}/sanam-logo.webp`;

export const DEFAULT_TITLE = `${BRAND.fullNameAr} | ${BRAND.fullNameEn}`;

export const DEFAULT_DESCRIPTION =
  "سنام ... حيث الجودة تلتقي بالثقة! تشكيلة واسعة من المنتجات الطازجة والضرورية بأسعار تنافسية في مكة المكرمة والرياض.";

export function absoluteUrl(path = "/"): string {
  if (!path || path === "/") return `${STORE_ORIGIN}/`;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${STORE_ORIGIN}${normalized}`;
}

export function truncateMeta(text: string, max = 160): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1).trimEnd()}…`;
}

export function productTitle(name: string): string {
  return `${name} | ${BRAND.fullNameAr}`;
}

export function categoryTitle(name: string): string {
  return `${name} | ${BRAND.fullNameAr}`;
}

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: BRAND.fullNameAr,
    alternateName: BRAND.fullNameEn,
    url: STORE_ORIGIN,
    logo: DEFAULT_OG_IMAGE,
    telephone: BRAND.phoneTel,
    sameAs: Object.values(BRAND.social),
    address: {
      "@type": "PostalAddress",
      addressCountry: "SA",
      addressLocality: BRAND.locationsAr,
    },
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function productJsonLd(opts: {
  name: string;
  description?: string | null;
  image?: string | null;
  price: number;
  currency?: string;
  path: string;
  brand?: string | null;
  sku?: string | null;
  availability?: "InStock" | "OutOfStock";
}) {
  const image = opts.image && /^https?:\/\//i.test(opts.image) ? opts.image : DEFAULT_OG_IMAGE;
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: opts.name,
    description: truncateMeta(opts.description || opts.name, 300),
    image: [image],
    sku: opts.sku || undefined,
    brand: {
      "@type": "Brand",
      name: opts.brand || BRAND.fullNameAr,
    },
    offers: {
      "@type": "Offer",
      url: absoluteUrl(opts.path),
      priceCurrency: opts.currency || "SAR",
      price: Number(opts.price).toFixed(2),
      availability: `https://schema.org/${opts.availability || "InStock"}`,
      seller: {
        "@type": "Organization",
        name: BRAND.fullNameAr,
      },
    },
  };
}

export function collectionPageJsonLd(opts: {
  name: string;
  description?: string;
  path: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: opts.name,
    description: opts.description || DEFAULT_DESCRIPTION,
    url: absoluteUrl(opts.path),
    isPartOf: {
      "@type": "WebSite",
      name: BRAND.fullNameAr,
      url: STORE_ORIGIN,
    },
  };
}
