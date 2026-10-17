/**
 * Catch the most common upload mistake: the GSTR-2B and the purchase register
 * put in each other's boxes. Swapped files reconcile "successfully" with every
 * category reversed, so this is reported as a warning on the upload card.
 */

import { normalizeHeader } from "./import";

/** Column titles only the GST portal's GSTR-2B download uses. */
const PORTAL_HEADERS = new Set([
  "tradelegalname",
  "supplyattractreversecharge",
  "itcavailability",
  "gstr1iffgstr5period",
  "gstr1iffgstr5filingdate",
  "gstinofsupplier",
]);
const PORTAL_SHEETS = /^(b2b|b2ba|b2bcdnr|b2bcdnra|itcavailable|itcnotavailable|isd|impg)$/;

export function looksLikeGstr2b(sheetNames: string[], headers: string[]): boolean {
  const portalSheets = sheetNames.filter((s) => PORTAL_SHEETS.test(s.toLowerCase().replace(/[^a-z0-9]/g, ""))).length;
  const portalHeaders = headers.filter((h) => PORTAL_HEADERS.has(normalizeHeader(h))).length;
  return portalHeaders >= 2 || (portalSheets >= 2 && portalHeaders >= 1);
}

export function sourceWarning(source: "PURCHASE_REGISTER" | "GSTR2B", sheetNames: string[], headers: string[]): string | null {
  const is2b = looksLikeGstr2b(sheetNames, headers);
  if (source === "PURCHASE_REGISTER" && is2b) {
    return "This file looks like a GSTR-2B download from the GST portal, but it was uploaded as the purchase register. If the files are swapped, use “Replace file” on both cards before running.";
  }
  if (source === "GSTR2B" && !is2b) {
    return "This file does not look like a GSTR-2B download from the GST portal (no portal columns such as “Trade/Legal name” or “ITC Availability”). If it is the purchase register, swap the files with “Replace file” before running.";
  }
  return null;
}
