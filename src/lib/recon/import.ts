/**
 * Import layer: turns spreadsheet rows (already read from Excel/CSV into arrays
 * of cells) into validated InvoiceRecords, with a full report of what was found.
 *
 * Nothing is dropped silently. Every row ends up as exactly one of:
 *   - a valid record,
 *   - a row with errors (listed with row number, column and reason), or
 *   - a blank row (counted).
 * Original cell values are kept on each record for the audit trail.
 */

import { validateGstin } from "../gstin";
import type { DocType, InvoiceRecord } from "./engine";
import { parseAmount, type Paise } from "./money";
import { parseInvoiceDate } from "./normalize";

export type Cell = string | number | boolean | Date | null | undefined;
export type Row = Cell[];

export const FIELDS = [
  "gstin",
  "supplierName",
  "invoiceNo",
  "invoiceDate",
  "docType",
  "taxable",
  "igst",
  "cgst",
  "sgst",
  "cess",
  "total",
] as const;
export type Field = (typeof FIELDS)[number];

export const FIELD_LABELS: Record<Field, string> = {
  gstin: "Supplier GSTIN",
  supplierName: "Supplier name",
  invoiceNo: "Invoice number",
  invoiceDate: "Invoice date",
  docType: "Document type",
  taxable: "Taxable value",
  igst: "IGST",
  cgst: "CGST",
  sgst: "SGST / UTGST",
  cess: "Cess",
  total: "Invoice value",
};

export const REQUIRED_FIELDS: Field[] = ["gstin", "invoiceNo", "invoiceDate", "taxable"];

/**
 * Header aliases, compared after normalising (lower-case, letters and digits only,
 * trailing currency words removed). Covers GSTR-2B portal downloads and common
 * Tally / Busy / Excel purchase-register layouts. Extend here, never in the UI.
 */
const ALIASES: Record<Field, string[]> = {
  gstin: ["gstin", "gstinofsupplier", "suppliergstin", "gstinuin", "gstinuinofsupplier", "partygstin", "vendorgstin", "gstno", "gstnumber", "ctin", "sellergstin"],
  supplierName: ["suppliername", "tradelegalname", "tradename", "legalname", "partyname", "vendorname", "sellername", "nameofsupplier", "particulars"],
  invoiceNo: ["invoicenumber", "invoiceno", "invno", "invnumber", "billno", "billnumber", "documentnumber", "documentno", "docno", "vouchernumber", "voucherno", "supplierinvoiceno", "notenumber", "noteno", "refno"],
  invoiceDate: ["invoicedate", "invdate", "billdate", "documentdate", "docdate", "notedate", "voucherdate", "date"],
  docType: ["documenttype", "doctype", "notetype", "invoicetype", "type", "vouchertype"],
  taxable: ["taxablevalue", "taxableamount", "taxable", "assessablevalue", "taxablevalueofsupply"],
  igst: ["integratedtax", "igst", "igstamount", "integratedtaxamount", "igstamt"],
  cgst: ["centraltax", "cgst", "cgstamount", "centraltaxamount", "cgstamt"],
  sgst: ["stateuttax", "statetax", "sgst", "sgstamount", "utgst", "sgstutgst", "statetaxamount", "sgstamt"],
  cess: ["cess", "cessamount", "cessamt", "compensationcess"],
  total: ["invoicevalue", "totalinvoicevalue", "totalvalue", "invoiceamount", "grandtotal", "total", "billamount", "notevalue"],
};

export function normalizeHeader(cell: Cell): string {
  // Remove currency markers as separate tokens only, so words that merely end
  // in "rs" (Particulars, Suppliers) are left intact.
  return String(cell ?? "")
    .toLowerCase()
    .replace(/₹/g, " ")
    .replace(/\(\s*(in\s+)?(rs\.?|inr)\s*\)/g, " ")
    .replace(/(^|[^a-z])(in\s+)?(rs\.?|inr)\s*$/, "$1")
    .replace(/[^a-z0-9]/g, "");
}

const ALIAS_LOOKUP = new Map<string, Field>();
for (const field of FIELDS) for (const alias of ALIASES[field]) ALIAS_LOOKUP.set(alias, field);

export type Mapping = Record<Field, number | null>;

export function emptyMapping(): Mapping {
  return Object.fromEntries(FIELDS.map((f) => [f, null])) as Mapping;
}

/** Map header cells to fields. Each column is used at most once; first match wins. */
export function detectMapping(headers: string[]): Mapping {
  const mapping = emptyMapping();
  headers.forEach((header, col) => {
    const field = ALIAS_LOOKUP.get(normalizeHeader(header));
    if (field && mapping[field] === null) mapping[field] = col;
  });
  return mapping;
}

/**
 * Find the header row. Portal downloads have title rows on top and two-row
 * headers ("Invoice details" over "Invoice number | Invoice Date | ..."), so for
 * each candidate row we also try merging it with the row below (the lower,
 * more specific label wins). The candidate recognising the most fields wins.
 */
export function detectHeader(rows: Row[], scanRows = 20): { headerRowIndex: number; dataStartIndex: number; headers: string[] } | null {
  let best: { score: number; headerRowIndex: number; dataStartIndex: number; headers: string[] } | null = null;
  const limit = Math.min(rows.length, scanRows);
  const width = Math.max(0, ...rows.slice(0, limit + 1).map((r) => r.length));

  for (let i = 0; i < limit; i++) {
    const single = Array.from({ length: width }, (_, c) => String(rows[i]?.[c] ?? "").trim());
    const merged =
      i + 1 < rows.length
        ? Array.from({ length: width }, (_, c) => {
            const lower = String(rows[i + 1]?.[c] ?? "").trim();
            return lower || single[c];
          })
        : null;

    for (const [headers, dataStart] of [[single, i + 1], ...(merged ? [[merged, i + 2] as const] : [])] as const) {
      const m = detectMapping([...headers]);
      const score = FIELDS.filter((f) => m[f] !== null).length + REQUIRED_FIELDS.filter((f) => m[f] !== null).length;
      if (score > (best?.score ?? 2)) best = { score, headerRowIndex: i, dataStartIndex: dataStart, headers: [...headers] };
    }
  }
  return best ? { headerRowIndex: best.headerRowIndex, dataStartIndex: best.dataStartIndex, headers: best.headers } : null;
}

export type MappingProblem = { field?: Field; message: string };

/** Problems that block the import entirely until the mapping is corrected. */
export function checkMapping(mapping: Mapping): MappingProblem[] {
  const problems: MappingProblem[] = [];
  for (const f of REQUIRED_FIELDS) {
    if (mapping[f] === null) problems.push({ field: f, message: `No column found for ${FIELD_LABELS[f]}.` });
  }
  if (mapping.igst === null && mapping.cgst === null && mapping.sgst === null) {
    problems.push({ message: "No tax column found (IGST, CGST or SGST). At least one is needed." });
  }
  const used = new Map<number, Field>();
  for (const f of FIELDS) {
    const col = mapping[f];
    if (col === null) continue;
    const other = used.get(col);
    if (other) problems.push({ field: f, message: `${FIELD_LABELS[f]} and ${FIELD_LABELS[other]} use the same column.` });
    else used.set(col, f);
  }
  return problems;
}

export type ImportedRecord = InvoiceRecord & {
  /** 1-based row number as the user sees it in Excel */
  sourceRow: number;
  /** original cell text for every mapped field, for audit and display */
  original: Partial<Record<Field, string>>;
};

export type RowIssue = { row: number; field: Field | null; message: string; value: string };

export type ImportResult = {
  records: ImportedRecord[];
  errors: RowIssue[];
  warnings: RowIssue[];
  stats: { dataRows: number; valid: number; withErrors: number; blank: number; duplicateKeys: number };
};

export const MAX_ROWS = 50_000;

function cellText(cell: Cell): string {
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  return cell === null || cell === undefined ? "" : String(cell).trim();
}

function parseDocType(raw: string): DocType | null {
  const s = raw.toLowerCase().trim();
  // Notes are checked first so "Credit note against invoice" is not read as an invoice.
  if (/credit|^c$|^cn$|^cdn/.test(s)) return "CREDIT_NOTE";
  if (/debit|^d$|^dn$/.test(s)) return "DEBIT_NOTE";
  if (!s || /invoice|regular|b2b|tax|sez|deemed|purchase|^r$|^inv$/.test(s)) return "INVOICE";
  return null;
}

/**
 * Build records from data rows using a (detected or user-corrected) mapping.
 * `idPrefix` keeps ids unique across the two sources.
 */
export function buildRecords(
  rows: Row[],
  dataStartIndex: number,
  mapping: Mapping,
  idPrefix: string,
): ImportResult {
  const records: ImportedRecord[] = [];
  const errors: RowIssue[] = [];
  const warnings: RowIssue[] = [];
  let blank = 0;
  let withErrors = 0;
  let negativeWithoutDocType = 0;
  const keys = new Map<string, number>();

  const dataRows = rows.slice(dataStartIndex);
  if (dataRows.length > MAX_ROWS) {
    errors.push({ row: 0, field: null, message: `File has ${dataRows.length.toLocaleString("en-IN")} rows; the limit is ${MAX_ROWS.toLocaleString("en-IN")}. Split the file by period.`, value: "" });
    return { records, errors, warnings, stats: { dataRows: dataRows.length, valid: 0, withErrors: 0, blank: 0, duplicateKeys: 0 } };
  }

  dataRows.forEach((row, i) => {
    const sheetRow = dataStartIndex + i + 1;
    const get = (f: Field) => (mapping[f] === null ? "" : cellText(row[mapping[f]!]));
    const raw = (f: Field) => (mapping[f] === null ? undefined : row[mapping[f]!]);

    if (row.every((c) => cellText(c) === "")) {
      blank++;
      return;
    }

    const rowErrors: RowIssue[] = [];
    const fail = (field: Field, message: string) => rowErrors.push({ row: sheetRow, field, message, value: get(field) });

    // Portal and Tally exports often end with a "Total" line: report it, don't import it.
    if (!get("gstin") && !get("invoiceNo") && /total/i.test(row.map(cellText).join(" "))) {
      warnings.push({ row: sheetRow, field: null, message: "Looks like a totals row; not imported.", value: row.map(cellText).filter(Boolean).join(" | ").slice(0, 80) });
      return;
    }

    const g = validateGstin(get("gstin"));
    if (!get("gstin")) fail("gstin", "Supplier GSTIN is missing.");
    else if (!g.valid) fail("gstin", g.reason);

    const invoiceNo = get("invoiceNo");
    if (!invoiceNo) fail("invoiceNo", "Invoice number is missing.");

    const invoiceDate = parseInvoiceDate(raw("invoiceDate"));
    if (!get("invoiceDate")) fail("invoiceDate", "Invoice date is missing.");
    else if (!invoiceDate) fail("invoiceDate", "Invoice date could not be read. Use DD-MM-YYYY.");

    const taxable = parseAmount(raw("taxable"));
    if (taxable === null) fail("taxable", get("taxable") ? "Taxable value is not a number." : "Taxable value is missing.");

    // A blank tax cell in a mapped tax column means no tax of that kind (normal in exports).
    const tax = (f: "igst" | "cgst" | "sgst" | "cess"): Paise => {
      if (mapping[f] === null || get(f) === "") return 0;
      const v = parseAmount(raw(f));
      if (v === null) {
        fail(f, `${FIELD_LABELS[f]} is not a number.`);
        return 0;
      }
      return v;
    };
    const igst = tax("igst");
    const cgst = tax("cgst");
    const sgst = tax("sgst");
    const cess = tax("cess");

    let docType: DocType = "INVOICE";
    if (mapping.docType !== null) {
      const parsed = parseDocType(get("docType"));
      if (parsed) docType = parsed;
      else fail("docType", `Document type "${get("docType")}" is not recognised (expected invoice, credit note or debit note).`);
    }

    if (rowErrors.length) {
      withErrors++;
      errors.push(...rowErrors);
      return;
    }

    if (mapping.docType === null && taxable! < 0) negativeWithoutDocType++;

    if (mapping.total !== null && get("total") !== "") {
      const stated = parseAmount(raw("total"));
      const computed = taxable! + igst + cgst + sgst + cess;
      if (stated !== null && Math.abs(stated - computed) > 100) {
        warnings.push({
          row: sheetRow,
          field: "total",
          message: `Invoice value ${(stated / 100).toFixed(2)} differs from taxable + tax ${(computed / 100).toFixed(2)}. The computed value is used for matching.`,
          value: get("total"),
        });
      }
    }

    const original: Partial<Record<Field, string>> = {};
    for (const f of FIELDS) if (mapping[f] !== null) original[f] = get(f);

    const record: ImportedRecord = {
      id: `${idPrefix}${sheetRow}`,
      gstin: (g as { gstin: string }).gstin,
      supplierName: get("supplierName") || null,
      invoiceNo,
      invoiceDate,
      docType,
      taxable: taxable!,
      igst,
      cgst,
      sgst,
      cess,
      sourceRow: sheetRow,
      original,
    };
    records.push(record);
    const key = `${record.gstin}|${docType}|${invoiceNo.toUpperCase().replace(/[^A-Z0-9]/g, "")}`;
    keys.set(key, (keys.get(key) ?? 0) + 1);
  });

  if (negativeWithoutDocType) {
    warnings.push({
      row: 0,
      field: "docType",
      message: `${negativeWithoutDocType} row(s) have negative values but no document-type column, so they are treated as invoices. Map a document-type column if they are credit notes.`,
      value: "",
    });
  }
  const duplicateKeys = [...keys.values()].filter((n) => n > 1).length;
  if (duplicateKeys) {
    warnings.push({
      row: 0,
      field: "invoiceNo",
      message: `${duplicateKeys} invoice number(s) appear more than once for the same supplier. Repeats will be set aside for review.`,
      value: "",
    });
  }

  return {
    records,
    errors,
    warnings,
    stats: { dataRows: dataRows.length, valid: records.length, withErrors, blank, duplicateKeys },
  };
}
