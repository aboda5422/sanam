import { describe, expect, it } from "vitest";
import { pointInPolygon, isPointInAnyPolygon } from "@/lib/geo";

const MAKKAH = [
  { lat: 21.55, lng: 39.70 },
  { lat: 21.55, lng: 39.95 },
  { lat: 21.30, lng: 39.95 },
  { lat: 21.30, lng: 39.70 },
];

describe("delivery geofence", () => {
  it("covers Makkah center", () => {
    expect(pointInPolygon({ lat: 21.42, lng: 39.82 }, MAKKAH)).toBe(true);
  });

  it("rejects Riyadh when only Makkah zone is active", () => {
    expect(pointInPolygon({ lat: 24.7136, lng: 46.6753 }, MAKKAH)).toBe(false);
  });

  it("rejects Jeddah", () => {
    expect(pointInPolygon({ lat: 21.4858, lng: 39.1925 }, MAKKAH)).toBe(false);
  });

  it("isPointInAnyPolygon works across zones", () => {
    const riyadh = [
      { lat: 24.7, lng: 46.6 },
      { lat: 24.7, lng: 46.8 },
      { lat: 24.8, lng: 46.8 },
      { lat: 24.8, lng: 46.6 },
    ];
    expect(isPointInAnyPolygon({ lat: 24.75, lng: 46.7 }, [MAKKAH, riyadh])).toBe(true);
    expect(isPointInAnyPolygon({ lat: 24.75, lng: 46.7 }, [MAKKAH])).toBe(false);
  });
});
