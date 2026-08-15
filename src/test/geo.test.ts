import { describe, expect, it } from "vitest";
import { pointInPolygon, isPointInAnyPolygon } from "@/lib/geo";
import {
  inferCityFromNationalAddress,
  isValidNationalAddress,
  normalizeNationalAddress,
} from "@/lib/branch";

describe("national short address", () => {
  it("accepts SPL-style short codes", () => {
    expect(isValidNationalAddress("ANCAW32154")).toBe(true);
    expect(isValidNationalAddress("RRRD2929")).toBe(true);
    expect(isValidNationalAddress("abcd1234")).toBe(true);
  });

  it("rejects empty or malformed values", () => {
    expect(isValidNationalAddress("")).toBe(false);
    expect(isValidNationalAddress("1234")).toBe(false);
    expect(isValidNationalAddress("HOME")).toBe(false);
  });

  it("normalizes spacing and case", () => {
    expect(normalizeNationalAddress("  ancaw 32154 ")).toBe("ANCAW32154");
  });

  it("infers Makkah from MEKD prefix", () => {
    const city = inferCityFromNationalAddress("MEKD2885");
    expect(city?.name).toBe("مكة المكرمة");
    expect(city?.lat).toBeCloseTo(21.3891, 3);
  });
});

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
