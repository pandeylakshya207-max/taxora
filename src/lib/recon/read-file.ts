import "server-only";
import ExcelJS from "exceljs";
import { parseCsv } from "./csv";
import { detectHeader, detectMapping, FIELDS, type Cell, type Row } from "./import";

/**
 * Reads an uploaded spreadsheet into rows of cells, entirely in memory
 * (nothing is written to disk or unzipped to the file system).
 */

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

export type Sheet = { name: string; rows: Row[] };

export class FileReadError extends Error {}

export function fileKind(fileName: string, bytes: Uint8Array): "xlsx" | "csv" {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".xls")) {
    throw new FileReadError("Old .xls files are not supported. Open the file in Excel and save it as .xlsx or .csv.");
  }
  if (lower.endsWith(".xlsx")) {
    // .xlsx is a zip archive: it must start with "PK".
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new FileReadError("This .xlsx file is damaged or is not really an Excel file.");
    return "xlsx";
  }
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) return "csv";
  throw new FileReadError("Upload an Excel (.xlsx) or CSV (.csv) file.");
}

function cellValue(value: ExcelJS.CellValue): Cell {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    if ("result" in value) return cellValue(value.result as ExcelJS.CellValue); // formula
    if ("richText" in value) return value.richText.map((t) => t.text).join("");
    if ("text" in value) return String(value.text); // hyperlink
    if ("error" in value) return null;
    return String(value);
  }
  return value as Cell;
}

export async function readSheets(fileName: string, bytes: Uint8Array): Promise<Sheet[]> {
  if (bytes.byteLength === 0) throw new FileReadError("The file is empty.");
  if (bytes.byteLength > MAX_FILE_BYTES) throw new FileReadError("The file is larger than 10 MB. Split it by period and upload again.");

  if (fileKind(fileName, bytes) === "csv") {
    const text = new TextDecoder("utf-8").decode(bytes);
    try {
      return [{ name: "CSV", rows: parseCsv(text) }];
    } catch (error) {
      throw new FileReadError(error instanceof Error ? error.message : "The CSV file could not be read.");
    }
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    throw new FileReadError("This Excel file could not be opened. It may be damaged or password-protected.");
  }

  const sheets: Sheet[] = [];
  workbook.eachSheet((ws) => {
    const rows: Row[] = [];
    ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      rows[rowNumber - 1] = values.map((v) => cellValue(v as ExcelJS.CellValue));
    });
    // Fill gaps left by fully empty rows so row numbers stay true to Excel.
    for (let i = 0; i < rows.length; i++) rows[i] ??= [];
    sheets.push({ name: ws.name, rows });
  });
  if (!sheets.length) throw new FileReadError("The workbook has no sheets.");
  return sheets;
}

/**
 * Choose the sheet that looks most like an invoice table. GSTR-2B workbooks have
 * many sheets (Read me, ITC Available, B2B, B2B-CDNR...), so the user can also
 * pick a sheet by name.
 */
export function pickSheet(sheets: Sheet[], preferred?: string | null): Sheet {
  if (preferred) {
    const found = sheets.find((s) => s.name === preferred);
    if (found) return found;
  }
  let best = sheets[0];
  let bestScore = -1;
  for (const sheet of sheets) {
    const h = detectHeader(sheet.rows);
    // Most recognised columns wins; more rows breaks ties.
    const mapped = h ? FIELDS.filter((f) => detectMapping(h.headers)[f] !== null).length : -1;
    const score = mapped + sheet.rows.length / 1e7;
    if (score > bestScore) {
      best = sheet;
      bestScore = score;
    }
  }
  return best;
}
