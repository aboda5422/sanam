/** Build a shareable Google Maps link from coordinates. */
export function mapsLinkFromCoords(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export function isShortMapsLink(input: string): boolean {
  try {
    const host = new URL(input.trim()).hostname.toLowerCase();
    return (
      host === "maps.app.goo.gl" ||
      host === "goo.gl" ||
      host === "g.co" ||
      host.endsWith(".app.goo.gl")
    );
  } catch {
    return false;
  }
}

/**
 * Extract lat/lng from a maps URL or a plain "lat,lng" string.
 * Supports Google Maps (q=, @lat,lng, !3d/!4d), Apple Maps (ll=), OSM (mlat/mlon).
 * Prefer place pin (!3d/!4d) over map-center (@) when both exist.
 */
export function parseMapsCoords(input: string): { lat: number; lng: number } | null {
  const raw = input.trim();
  if (!raw) return null;

  const plain = raw.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (plain) {
    const lat = Number(plain[1]);
    const lng = Number(plain[2]);
    if (isValidCoord(lat, lng)) return { lat, lng };
  }

  // !3d21.452!4d39.857 (place pin) — most accurate for shared place links
  const d3 = raw.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (d3) {
    const lat = Number(d3[1]);
    const lng = Number(d3[2]);
    if (isValidCoord(lat, lng)) return { lat, lng };
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const q =
    url.searchParams.get("q") ||
    url.searchParams.get("query") ||
    url.searchParams.get("ll") ||
    url.searchParams.get("destination");
  if (q) {
    const m = q.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
    if (m) {
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (isValidCoord(lat, lng)) return { lat, lng };
    }
  }

  const mlat = url.searchParams.get("mlat");
  const mlon = url.searchParams.get("mlon");
  if (mlat && mlon) {
    const lat = Number(mlat);
    const lng = Number(mlon);
    if (isValidCoord(lat, lng)) return { lat, lng };
  }

  // /@21.452,39.857,17z (viewport center — fallback)
  const at = `${url.pathname}${url.search}${url.hash}`.match(
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
  );
  if (at) {
    const lat = Number(at[1]);
    const lng = Number(at[2]);
    if (isValidCoord(lat, lng)) return { lat, lng };
  }

  return null;
}

/**
 * Resolve short Google Maps links (maps.app.goo.gl) via edge function, then parse.
 * Falls back to sync parse for full URLs / lat,lng.
 */
export async function resolveMapsCoords(
  input: string,
  resolveShort?: (url: string) => Promise<string | null>,
): Promise<{ lat: number; lng: number } | null> {
  const direct = parseMapsCoords(input);
  if (direct) return direct;
  if (!isShortMapsLink(input) || !resolveShort) return null;
  const expanded = await resolveShort(input.trim());
  if (!expanded) return null;
  return parseMapsCoords(expanded);
}

function isValidCoord(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}
