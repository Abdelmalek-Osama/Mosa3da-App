import { describe, expect, it } from "vitest";
import { generateOtp, hashOtp, otpMatches } from "@/server/domain/otp";
import { normalizePhone, patientAuthEmail } from "@/lib/auth/patient-identity";

const PEPPER = "test-pepper-0123456789abcdef";

describe("OTP", () => {
  it("generates 6-digit numeric codes", () => {
    for (let i = 0; i < 200; i++) expect(generateOtp()).toMatch(/^\d{6}$/);
  });

  it("stores only a 64-char hex hash and verifies in constant time", () => {
    const hash = hashOtp("042917", "+201001234567", "patient_registration", PEPPER);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("042917");
    expect(otpMatches("042917", hash, "+201001234567", "patient_registration", PEPPER)).toBe(true);
    expect(otpMatches("042918", hash, "+201001234567", "patient_registration", PEPPER)).toBe(false);
  });

  it("binds the hash to phone, purpose and pepper", () => {
    const hash = hashOtp("111111", "+201001234567", "patient_registration", PEPPER);
    expect(otpMatches("111111", hash, "+201001234568", "patient_registration", PEPPER)).toBe(false);
    expect(otpMatches("111111", hash, "+201001234567", "password_reset", PEPPER)).toBe(false);
    expect(otpMatches("111111", hash, "+201001234567", "patient_registration", "other-pepper-xxxxxxxx")).toBe(false);
  });

  it("rejects malformed input", () => {
    expect(otpMatches("12ab56", "f".repeat(64), "+201001234567", "patient_registration", PEPPER)).toBe(false);
  });
});

describe("patient phone identity", () => {
  it.each([
    ["01001234567", "+201001234567"],
    ["+20 100 123 4567", "+201001234567"],
    ["00201001234567", "+201001234567"],
    ["201001234567", "+201001234567"],
    ["abc", null],
  ])("normalizes %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it("derives a stable internal auth email", () => {
    expect(patientAuthEmail("+201001234567")).toBe("p201001234567@patients.mosa3da.app");
  });
});
