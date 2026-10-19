import { BRAND } from "@/lib/brand";

export const STORE_INFO_KEY = "store_info";

export type StoreSocialLinks = {
  instagram: string;
  tiktok: string;
  snapchat: string;
  x: string;
};

export type StoreInfo = {
  name: string;
  phone: string;
  email: string;
  address: string;
  cr_number: string;
  vat_number: string;
  company_name: string;
  description: string;
  tagline: string;
  whatsapp: string;
  social: StoreSocialLinks;
};

export const DEFAULT_STORE_INFO: StoreInfo = {
  name: BRAND.fullNameAr,
  phone: BRAND.phoneDisplay,
  email: BRAND.email,
  address: BRAND.locationsAr,
  cr_number: BRAND.crNumber,
  vat_number: "",
  company_name: BRAND.legalNameAr,
  description: BRAND.descriptionAr,
  tagline: BRAND.taglineAr,
  whatsapp: BRAND.whatsapp,
  social: {
    instagram: BRAND.social.instagram,
    tiktok: BRAND.social.tiktok,
    snapchat: BRAND.social.snapchat,
    x: BRAND.social.x,
  },
};

/** Digits only for wa.me — accepts 05xxxxxxxx / 5xxxxxxxx / 9665xxxxxxxx */
export function toWhatsAppDigits(input: string, fallbackPhone = ""): string {
  const raw = String(input || "").replace(/\D/g, "");
  const fallback = String(fallbackPhone || "").replace(/\D/g, "");
  const pick = raw && !/^0+$/.test(raw) ? raw : fallback && !/^0+$/.test(fallback) ? fallback : "";
  if (!pick) return DEFAULT_STORE_INFO.whatsapp;
  if (pick.startsWith("966")) return pick;
  if (pick.startsWith("0") && pick.length >= 9) return `966${pick.slice(1)}`;
  if (pick.length === 9 && pick.startsWith("5")) return `966${pick}`;
  return pick;
}

export function mergeStoreInfo(raw: unknown): StoreInfo {
  const v = (raw && typeof raw === "object" ? raw : {}) as Partial<StoreInfo> & {
    social?: Partial<StoreSocialLinks>;
  };
  return {
    name: String(v.name ?? DEFAULT_STORE_INFO.name),
    phone: String(v.phone ?? DEFAULT_STORE_INFO.phone),
    email: String(v.email ?? DEFAULT_STORE_INFO.email),
    address: String(v.address ?? DEFAULT_STORE_INFO.address),
    cr_number: String(v.cr_number ?? DEFAULT_STORE_INFO.cr_number),
    vat_number: String(v.vat_number ?? DEFAULT_STORE_INFO.vat_number),
    company_name: String(v.company_name ?? DEFAULT_STORE_INFO.company_name),
    description: String(v.description ?? DEFAULT_STORE_INFO.description),
    tagline: String(v.tagline ?? DEFAULT_STORE_INFO.tagline),
    whatsapp: String(v.whatsapp ?? DEFAULT_STORE_INFO.whatsapp),
    social: {
      instagram: String(v.social?.instagram ?? DEFAULT_STORE_INFO.social.instagram),
      tiktok: String(v.social?.tiktok ?? DEFAULT_STORE_INFO.social.tiktok),
      snapchat: String(v.social?.snapchat ?? DEFAULT_STORE_INFO.social.snapchat),
      x: String(v.social?.x ?? DEFAULT_STORE_INFO.social.x),
    },
  };
}
