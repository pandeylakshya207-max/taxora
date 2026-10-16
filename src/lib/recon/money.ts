/**
 * Money is handled as integer PAISE (1 rupee = 100 paise) everywhere in the
 * reconciliation engine. Integers are exact, so 0.1 + 0.2 problems cannot occur.
 *
 * Number.MAX_SAFE_INTEGER paise is about ₹90 lakh crore per value, far beyond
 * any single invoice, so plain numbers are safe here.
 */

export type Paise = number;

/**
 * Parse an amount as it appears in Indian spreadsheets:
 *   "1,24,500.00"  "124500"  "₹ 1,24,500.5"  "(500.00)"  "-500"  "Rs. 99.999"
 * Returns null for blank or unparseable values — never silently 0.
 * More than 2 decimal places are rounded half away from zero, explicitly.
 */
export function parseAmount(raw: unknown): Paise | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return null;
    return roundToPaise(raw.toString());
  }
  let s = String(raw).trim();
  if (s === "" || s === "-") return null;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/₹|rs\.?|inr/gi, "").replace(/[,\s]/g, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(s)) return null;

  const paise = roundToPaise(s);
  if (paise === null) return null;
  return negative ? -paise : paise;
}

/** Convert a plain decimal string (or number string, incl. exponent) to paise with half-away-from-zero rounding. */
function roundToPaise(decimal: string): Paise | null {
  let str = decimal;
  if (/e/i.test(str)) {
    const n = Number(str);
    if (!Number.isFinite(n)) return null;
    str = n.toFixed(6);
  }
  const negative = str.startsWith("-");
  if (negative) str = str.slice(1);
  const [intPart, fracRaw = ""] = str.split(".");
  const frac = (fracRaw + "000").slice(0, 3); // 2 kept digits + 1 for rounding
  let paise = Number(intPart || "0") * 100 + Number(frac.slice(0, 2));
  if (Number(frac[2]) >= 5) paise += 1;
  if (!Number.isSafeInteger(paise)) return null;
  return negative ? -paise : paise;
}

/** Format paise as Indian-grouped rupees: 12450050 -> "1,24,500.50" */
export function formatPaise(paise: Paise): string {
  const negative = paise < 0;
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100).toString();
  const fraction = (abs % 100).toString().padStart(2, "0");
  const last3 = rupees.slice(-3);
  const rest = rupees.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  const grouped = rest ? `${rest},${last3}` : last3;
  return `${negative ? "-" : ""}${grouped}.${fraction}`;
}
