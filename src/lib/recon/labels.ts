/** Display labels and colours for engine output. Safe to import in client components. */

export const CATEGORY_ORDER = [
  "EXACT",
  "FUZZY",
  "PROBABLE",
  "GSTIN_MISMATCH",
  "MISSING_IN_2B",
  "MISSING_IN_PR",
  "DUPLICATE",
] as const;
export type CategoryKey = (typeof CATEGORY_ORDER)[number];

export const CATEGORY_INFO: Record<CategoryKey, { label: string; short: string; help: string; badge: string }> = {
  EXACT: {
    label: "Exact match",
    short: "Exact",
    help: "Same GSTIN, invoice number, date and amounts (within rounding).",
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  },
  FUZZY: {
    label: "Fuzzy match",
    short: "Fuzzy",
    help: "Same GSTIN, invoice numbers ≥ 85% similar, value within 5%.",
    badge: "bg-sky-50 text-sky-700 ring-sky-600/20",
  },
  PROBABLE: {
    label: "Probable match",
    short: "Probable",
    help: "Same GSTIN, value within 2%, dates within 7 days.",
    badge: "bg-amber-50 text-amber-800 ring-amber-600/20",
  },
  GSTIN_MISMATCH: {
    label: "GSTIN mismatch",
    short: "GSTIN diff",
    help: "Same invoice and value, but the supplier GSTIN differs (likely a typo).",
    badge: "bg-violet-50 text-violet-700 ring-violet-600/20",
  },
  MISSING_IN_2B: {
    label: "Missing in GSTR-2B",
    short: "Not in 2B",
    help: "In the purchase register, not found in GSTR-2B.",
    badge: "bg-rose-50 text-rose-700 ring-rose-600/20",
  },
  MISSING_IN_PR: {
    label: "Missing in purchase register",
    short: "Not in books",
    help: "In GSTR-2B, not found in the purchase register.",
    badge: "bg-orange-50 text-orange-700 ring-orange-600/20",
  },
  DUPLICATE: {
    label: "Duplicate entry",
    short: "Duplicate",
    help: "The same invoice appears more than once in one file.",
    badge: "bg-slate-100 text-slate-700 ring-slate-500/20",
  },
};

export const FLAG_LABEL: Record<string, string> = {
  TAXABLE_DIFF: "Taxable value differs",
  TAX_DIFF: "Tax amount differs",
  TAX_TYPE_CONFLICT: "IGST vs CGST/SGST",
  DATE_DIFF: "Date differs",
  INVOICE_NO_DIFF: "Invoice no. differs",
  AMBIGUOUS: "Ambiguous",
};

export const REVIEW_LABEL = {
  PENDING: "Pending review",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
} as const;

export function isCategory(value: string | undefined): value is CategoryKey {
  return !!value && (CATEGORY_ORDER as readonly string[]).includes(value);
}
