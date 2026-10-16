/**
 * Drafts a supplier follow-up email from real invoice data. Deterministic
 * template (no AI): the user reviews, edits and sends it themselves.
 */

import { formatPaise, type Paise } from "../recon/money";

export type FollowUpItem = {
  invoiceNo: string;
  invoiceDate: string | null;
  taxable: Paise;
  tax: Paise;
  issue: "MISSING_IN_2B" | "VALUE_DIFF";
  /** For value differences: tax as per GSTR-2B. */
  gstr2bTax?: Paise | null;
};

export type DraftInput = {
  supplierName: string | null;
  supplierGstin: string;
  buyerName: string;
  buyerGstin: string | null;
  periodLabel: string;
  senderName: string;
  items: FollowUpItem[];
};

const fmtDate = (iso: string | null) => (iso ? iso.split("-").reverse().join("-") : "date not recorded");

export function draftSupplierEmail(d: DraftInput): { subject: string; body: string } {
  const missing = d.items.filter((i) => i.issue === "MISSING_IN_2B");
  const diffs = d.items.filter((i) => i.issue === "VALUE_DIFF");
  const subject = `GST: invoices for ${d.buyerName} ${missing.length ? "not reflecting in GSTR-2B" : "with differences in GSTR-2B"} — ${d.periodLabel}`;

  const lines: string[] = [];
  lines.push(`Dear ${d.supplierName ?? "Sir/Madam"},`);
  lines.push("");
  lines.push(
    `While reconciling the purchase records of ${d.buyerName}${d.buyerGstin ? ` (GSTIN ${d.buyerGstin})` : ""} for ${d.periodLabel}, ` +
      `we noticed the following with invoices issued by you (GSTIN ${d.supplierGstin}).`,
  );

  if (missing.length) {
    lines.push("");
    lines.push("These invoices are recorded in our books but do not appear in GSTR-2B:");
    lines.push("");
    missing.forEach((i, n) => {
      lines.push(`${n + 1}. Invoice ${i.invoiceNo} dated ${fmtDate(i.invoiceDate)} — taxable value ₹${formatPaise(i.taxable)}, tax ₹${formatPaise(i.tax)}`);
    });
    lines.push("");
    lines.push("Could you please confirm whether these invoices have been reported in your GSTR-1 / IFF, and if not, when you expect to report them?");
  }

  if (diffs.length) {
    lines.push("");
    lines.push("For these invoices, the tax in GSTR-2B differs from the invoice we hold:");
    lines.push("");
    diffs.forEach((i, n) => {
      lines.push(
        `${n + 1}. Invoice ${i.invoiceNo} dated ${fmtDate(i.invoiceDate)} — tax as per invoice ₹${formatPaise(i.tax)}` +
          (i.gstr2bTax !== null && i.gstr2bTax !== undefined ? `, as per GSTR-2B ₹${formatPaise(i.gstr2bTax)}` : ""),
      );
    });
    lines.push("");
    lines.push("Could you please check these and let us know whether an amendment or credit/debit note will be issued?");
  }

  lines.push("");
  lines.push("Thank you for your help.");
  lines.push("");
  lines.push("Regards,");
  lines.push(d.senderName);
  lines.push(`On behalf of ${d.buyerName}`);

  return { subject, body: lines.join("\n") };
}
