import { z } from "zod";

/** Arabic letters (incl. hamza forms, taa marbuta, alef maqsura) and harakat, plus spaces. */
const ARABIC_NAME = /^[ء-غف-يً-ْٰٱ-ۓ\s]+$/;
const ENGLISH_NAME = /^[A-Za-z][A-Za-z .'-]*$/;

const collapse = (v: string) => v.trim().replace(/\s+/g, " ");

/**
 * Mandatory Arabic full name: at least three parts (first, father's and family
 * name), Arabic letters only. The lobby screen and staff lists rely on it.
 */
export const arabicTripleNameSchema = z
  .string()
  .transform(collapse)
  .pipe(
    z
      .string()
      .min(1, "Enter the full name in Arabic")
      .max(120)
      .regex(ARABIC_NAME, "Write the name in Arabic letters only")
      .refine((v) => v.split(" ").length >= 3, "Enter the full triple name: first, father's and family name"),
  );

/** Optional English name (Latin letters), used for the bilingual lobby layout. */
export const optionalEnglishNameSchema = z
  .string()
  .optional()
  .transform((v) => (v ? collapse(v) : undefined))
  .pipe(z.string().max(120).regex(ENGLISH_NAME, "Write the English name in English letters only").optional());
