export type LatLng = { lat: number; lng: number };

/** Ray-casting point-in-polygon. Vertices are { lat, lng }. */
export function pointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
  if (!polygon || polygon.length < 3) return false;

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i].lat;
    const xi = polygon[i].lng;
    const yj = polygon[j].lat;
    const xj = polygon[j].lng;

    const intersects =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi || Number.EPSILON) + xi;

    if (intersects) inside = !inside;
  }
  return inside;
}

export function isPointInAnyPolygon(point: LatLng, polygons: LatLng[][]): boolean {
  return polygons.some((poly) => pointInPolygon(point, poly));
}

export function normalizePolygon(raw: unknown): LatLng[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => {
      const lat = Number((p as any)?.lat);
      const lng = Number((p as any)?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng };
    })
    .filter((p): p is LatLng => p !== null);
}

/** Great-circle distance in kilometers. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}
