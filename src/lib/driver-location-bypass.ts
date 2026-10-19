/**
 * Temporary QA bypass: treat driver GPS as the main branch until this moment.
 * After expiry the precise-location gate returns automatically.
 */
export const DRIVER_LOCATION_BYPASS_UNTIL_MS = Date.parse("2026-09-27T04:55:00+03:00");

/** سنام — المركز الرئيسي (جازان - العارضه) */
export const MAIN_CENTER_COORDS = { lat: 17.029944, lng: 43.049109 } as const;

export function isDriverLocationBypassed(now = Date.now()): boolean {
  return now < DRIVER_LOCATION_BYPASS_UNTIL_MS;
}
