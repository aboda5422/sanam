/** Display-size helpers for storefront images. */

export type ImageSizePreset = "thumb" | "card" | "banner" | "detail";

const PRESET_WIDTH: Record<ImageSizePreset, number> = {
  thumb: 160,
  card: 320,
  banner: 400,
  detail: 800,
};

/**
 * Return a display URL capped to the needed pixel width when the host supports it.
 * Supabase Image Transformation is not enabled on this project (render endpoint 403),
 * so public object URLs are left unchanged to avoid a failed request per image.
 */
export function optimizeImageUrl(
  url: string | null | undefined,
  preset: ImageSizePreset = "card",
): string {
  if (!url) return "/placeholder.webp";
  if (url.startsWith("/") || url.startsWith("data:") || url.startsWith("blob:")) return url;

  const width = PRESET_WIDTH[preset];

  try {
    const u = new URL(url);
    // Common CDN already supporting width query (e.g. legacy catalog hosts)
    if (u.hostname.includes("ananinja") || u.searchParams.has("w")) {
      u.searchParams.set("w", String(width));
      if (!u.searchParams.has("q")) u.searchParams.set("q", "75");
      return u.toString();
    }
  } catch {
    return url;
  }

  return url;
}
