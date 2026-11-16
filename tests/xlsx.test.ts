import { describe, expect, it } from "vitest";
import { colName, readXlsx, writeXlsx } from "@/lib/xlsx";

describe("xlsx", () => {
  it("names columns like Excel", () => {
    expect([0, 25, 26, 27, 701, 702].map(colName)).toEqual(["A", "Z", "AA", "AB", "ZZ", "AAA"]);
  });
  it("round-trips text, numbers, Arabic, special characters and several sheets", () => {
    const file = writeXlsx([
      { name: "products", rows: [["sku", "name_ar", "price_mad", "note"], ["ZM-1", "كوب زليج", 149.9, 'A & B <"x">'], ["ZM-2", "", 0, "=SUM(A1)"]] },
      { name: "variants", rows: [["product_sku", "variant_sku"], ["ZM-1", "ZM-1-B"]] },
    ]);
    const sheets = readXlsx(file);
    expect(sheets.map((s) => s.name)).toEqual(["products", "variants"]);
    expect(sheets[0].rows).toEqual([["sku", "name_ar", "price_mad", "note"], ["ZM-1", "كوب زليج", "149.9", 'A & B <"x">'], ["ZM-2", "", "0", "=SUM(A1)"]]);
    expect(sheets[1].rows[1]).toEqual(["ZM-1", "ZM-1-B"]);
  });
});
