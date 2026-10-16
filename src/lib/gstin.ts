/**
 * GSTIN validation.
 *
 * Format (15 chars): 2-digit state code + 10-char PAN + entity number (1-9, A-Z)
 * + literal "Z" (default) + check character.
 *
 * The check character is computed with the base-36 checksum used by the GST
 * system: each of the first 14 characters is mapped to 0-35, multiplied by an
 * alternating factor (1, 2, 1, 2, ...), the quotient and remainder of
 * product / 36 are summed, and the check value is (36 - sum % 36) % 36.
 *
 * A valid checksum means the GSTIN is well-formed. It does NOT mean the
 * registration is active — that can only be confirmed with the GST portal.
 */

const CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function normalizeGstin(input: string): string {
  return input.replace(/\s+/g, "").toUpperCase();
}

export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const value = CHARSET.indexOf(first14[i]);
    if (value < 0) throw new Error(`Invalid GSTIN character: ${first14[i]}`);
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARSET[(36 - (sum % 36)) % 36];
}

export type GstinCheck =
  | { valid: true; gstin: string; stateCode: string; pan: string }
  | { valid: false; reason: string };

export function validateGstin(raw: string): GstinCheck {
  const gstin = normalizeGstin(raw);
  if (gstin.length !== 15) {
    return { valid: false, reason: "GSTIN must be exactly 15 characters." };
  }
  if (!GSTIN_PATTERN.test(gstin)) {
    return { valid: false, reason: "GSTIN format is not valid." };
  }
  const state = Number(gstin.slice(0, 2));
  if (state < 1 || state > 38) {
    // 01-38 covers current state/UT codes; 97 (other territory) and 99 (centre
    // jurisdiction) are special-purpose and accepted below.
    if (state !== 97 && state !== 99) {
      return { valid: false, reason: "GSTIN state code is not valid." };
    }
  }
  if (gstinCheckChar(gstin.slice(0, 14)) !== gstin[14]) {
    return { valid: false, reason: "GSTIN check digit does not match — check for a typo." };
  }
  return { valid: true, gstin, stateCode: gstin.slice(0, 2), pan: gstin.slice(2, 12) };
}
