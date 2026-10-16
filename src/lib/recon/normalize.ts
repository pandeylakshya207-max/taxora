/**
 * Normalisation used only for COMPARING records. Original values are always
 * kept alongside and shown to the user; nothing here alters source data.
 */

/**
 * Invoice numbers are typed differently by suppliers and buyers:
 *   "DSW/23-24/88"  vs  "dsw-2324-088"  vs  "DSW 23-24/0088"
 * Rules (in order):
 *   1. upper-case, drop whitespace
 *   2. split into letter runs and digit runs, discarding separators (/ - . _ \ #)
 *   3. strip leading zeros from each digit run ("088" -> "88", "000" -> "0")
 *   4. join the runs
 * so all three examples above become "DSW232488".
 */
export function normalizeInvoiceNo(raw: string): string {
  const tokens = raw.toUpperCase().match(/[A-Z]+|[0-9]+/g) ?? [];
  return tokens.map((t) => (/^[0-9]+$/.test(t) ? t.replace(/^0+(?=\d)/, "") : t)).join("");
}

/** Levenshtein edit distance (iterative, two rows). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/** Similarity in [0, 1]: 1 - distance / longer length. */
export function similarity(a: string, b: string): number {
  if (!a.length && !b.length) return 1;
  return 1 - editDistance(a, b) / Math.max(a.length, b.length);
}

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, SEPT: 9, OCT: 10, NOV: 11, DEC: 12,
};

/**
 * Parse an invoice date to ISO "YYYY-MM-DD", or null if it cannot be read
 * unambiguously. Indian convention: day comes before month.
 * Accepts: 05-04-2026, 05/04/2026, 5.4.26, 2026-04-05, 05-Apr-2026, 5 April 2026,
 * Excel serial numbers (e.g. 46117), and JS Date objects.
 */
export function parseInvoiceDate(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : toIso(raw.getUTCFullYear(), raw.getUTCMonth() + 1, raw.getUTCDate());
  }
  if (typeof raw === "number") return fromExcelSerial(raw);

  const s = String(raw).trim();
  if (/^\d{5}(\.\d+)?$/.test(s)) return fromExcelSerial(Number(s));

  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (m) return toIso(+m[1], +m[2], +m[3]);

  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (m) return toIso(expandYear(+m[3]), +m[2], +m[1]);

  m = s.match(/^(\d{1,2})[-/.\s]+([A-Za-z]{3,9})[-/.,\s]+(\d{2}|\d{4})$/);
  if (m) {
    const month = MONTHS[m[2].slice(0, 4).toUpperCase()] ?? MONTHS[m[2].slice(0, 3).toUpperCase()];
    if (month) return toIso(expandYear(+m[3]), month, +m[1]);
  }
  return null;
}

function expandYear(y: number) {
  return y < 100 ? 2000 + y : y;
}

function fromExcelSerial(serial: number): string | null {
  // Excel day 1 = 1900-01-01, with the historical 1900 leap-year bug; 25569 = 1970-01-01.
  if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return null;
  const d = new Date(Math.round((Math.floor(serial) - 25569) * 86400000));
  return toIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

function toIso(y: number, m: number, d: number): string | null {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null; // rejects 31-02-2026 etc.
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Whole days between two ISO dates (absolute). */
export function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000;
}
