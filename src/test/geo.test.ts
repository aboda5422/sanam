import { describe, expect, it } from "vitest";
import { pointInPolygon, isPointInAnyPolygon } from "@/lib/geo";

const KHAMIS_ABHA = [
  { lat: 18.42, lng: 42.48 },
  { lat: 18.42, lng: 42.88 },
  { lat: 18.28, lng: 42.95 },
  { lat: 18.12, lng: 42.88 },
  { lat: 18.08, lng: 42.55 },
  { lat: 18.12, lng: 42.40 },
  { lat: 18.28, lng: 42.38 },
];

describe("delivery geofence", () => {
  it("covers Khamis Mushait center", () => {
    expect(pointInPolygon({ lat: 18.3, lng: 42.73 }, KHAMIS_ABHA)).toBe(true);
  });

  it("covers Abha center", () => {
    expect(pointInPolygon({ lat: 18.2164, lng: 42.5053 }, KHAMIS_ABHA)).toBe(true);
  });

  it("rejects Riyadh", () => {
    expect(pointInPolygon({ lat: 24.7136, lng: 46.6753 }, KHAMIS_ABHA)).toBe(false);
  });

  it("rejects Jeddah", () => {
    expect(pointInPolygon({ lat: 21.4858, lng: 39.1925 }, KHAMIS_ABHA)).toBe(false);
  });

  it("isPointInAnyPolygon works across zones", () => {
    const tiny = [
      { lat: 24.7, lng: 46.6 },
      { lat: 24.7, lng: 46.8 },
      { lat: 24.8, lng: 46.8 },
      { lat: 24.8, lng: 46.6 },
    ];
    expect(isPointInAnyPolygon({ lat: 24.75, lng: 46.7 }, [KHAMIS_ABHA, tiny])).toBe(true);
    expect(isPointInAnyPolygon({ lat: 24.75, lng: 46.7 }, [KHAMIS_ABHA])).toBe(false);
  });
});
