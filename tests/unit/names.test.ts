import { describe, expect, it } from "vitest";
import { arabicTripleNameSchema, optionalEnglishNameSchema } from "@/lib/names";

describe("Arabic triple name", () => {
  it("accepts three or more Arabic parts and collapses spaces", () => {
    expect(arabicTripleNameSchema.parse("  سارة   أحمد حسن ")).toBe("سارة أحمد حسن");
    expect(arabicTripleNameSchema.parse("آية محمد عبد الله لطفي")).toBe("آية محمد عبد الله لطفي");
  });

  it("rejects fewer than three parts", () => {
    expect(arabicTripleNameSchema.safeParse("سارة عبدالله").success).toBe(false);
  });

  it("rejects Latin letters, digits and empty input", () => {
    expect(arabicTripleNameSchema.safeParse("Aya Mohamed Lotfy").success).toBe(false);
    expect(arabicTripleNameSchema.safeParse("سارة أحمد Hassan").success).toBe(false);
    expect(arabicTripleNameSchema.safeParse("سارة أحمد 123").success).toBe(false);
    expect(arabicTripleNameSchema.safeParse("").success).toBe(false);
  });
});

describe("English name", () => {
  it("is optional", () => {
    expect(optionalEnglishNameSchema.parse(undefined)).toBeUndefined();
    expect(optionalEnglishNameSchema.parse("")).toBeUndefined();
  });

  it("accepts Latin names and rejects Arabic", () => {
    expect(optionalEnglishNameSchema.parse(" Aya  Mohamed Lotfy ")).toBe("Aya Mohamed Lotfy");
    expect(optionalEnglishNameSchema.safeParse("آية").success).toBe(false);
  });
});
