import { describe, expect, it } from "vitest";
import { splitInclusiveVat } from "@/lib/vat";

describe("splitInclusiveVat", () => {
  it("extracts 15% VAT from a tax-inclusive price", () => {
    const { exclusive, vat, inclusive } = splitInclusiveVat(23.9);
    expect(inclusive).toBe(23.9);
    expect(exclusive + vat).toBeCloseTo(23.9, 2);
    expect(vat).toBeCloseTo(exclusive * 0.15, 2);
  });
});
