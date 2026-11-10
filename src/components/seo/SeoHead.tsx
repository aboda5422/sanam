import { useEffect } from "react";
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_OG_IMAGE,
  DEFAULT_TITLE,
  absoluteUrl,
} from "@/lib/seo";

type SeoHeadProps = {
  title?: string;
  description?: string;
  path?: string;
  image?: string | null;
  type?: "website" | "product" | "article";
  noIndex?: boolean;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
};

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  const selector = `meta[${attr}="${key}"]`;
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

function upsertJsonLd(payload: Record<string, unknown> | Record<string, unknown>[]) {
  const id = "sanam-jsonld";
  let el = document.getElementById(id) as HTMLScriptElement | null;
  if (!el) {
    el = document.createElement("script");
    el.type = "application/ld+json";
    el.id = id;
    document.head.appendChild(el);
  }
  el.text = JSON.stringify(payload);
}

/**
 * Client-side document head updater for SPA routes.
 * Googlebot executes JS; social crawlers still rely on index.html defaults / prerender.
 */
const SeoHead = ({
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  path = "/",
  image,
  type = "website",
  noIndex = false,
  jsonLd,
}: SeoHeadProps) => {
  const jsonLdKey = jsonLd ? JSON.stringify(jsonLd) : "";

  useEffect(() => {
    const canonical = absoluteUrl(path);
    const ogImage =
      image && /^https?:\/\//i.test(image) ? image : image?.startsWith("/") ? absoluteUrl(image) : DEFAULT_OG_IMAGE;

    document.title = title;
    upsertMeta("name", "description", description);
    upsertMeta("name", "robots", noIndex ? "noindex,nofollow" : "index,follow");
    upsertLink("canonical", canonical);

    upsertMeta("property", "og:type", type === "product" ? "product" : "website");
    upsertMeta("property", "og:site_name", "سنام سوبر ماركت");
    upsertMeta("property", "og:locale", "ar_SA");
    upsertMeta("property", "og:title", title);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:url", canonical);
    upsertMeta("property", "og:image", ogImage);

    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", title);
    upsertMeta("name", "twitter:description", description);
    upsertMeta("name", "twitter:image", ogImage);

    if (jsonLdKey) {
      try {
        upsertJsonLd(JSON.parse(jsonLdKey));
      } catch {
        /* ignore malformed */
      }
    }

    return () => {
      // Keep last page tags; next route overwrites. Remove JSON-LD when leaving.
      const el = document.getElementById("sanam-jsonld");
      if (el) el.remove();
    };
  }, [title, description, path, image, type, noIndex, jsonLdKey]);

  return null;
};

export default SeoHead;
