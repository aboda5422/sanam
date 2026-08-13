/** Build a shareable Google Maps link from coordinates. */
export function mapsLinkFromCoords(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/**
 * Extract lat/lng from a maps URL or a plain "lat,lng" string.
 * Supports Google Maps (q=, @lat,lng, !3d/!4d), Apple Maps (ll=), OSM (mlat/mlon).
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

  // /@21.452,39.857,17z
  const at = url.pathname.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (at) {
    const lat = Number(at[1]);
    const lng = Number(at[2]);
    if (isValidCoord(lat, lng)) return { lat, lng };
  }

  // !3d21.452!4d39.857 (place pin)
  const d3 = raw.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (d3) {
    const lat = Number(d3[1]);
    const lng = Number(d3[2]);
    if (isValidCoord(lat, lng)) return { lat, lng };
  }

  return null;
}

function isValidCoord(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}
