import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { auditData } from "@/lib/audit";
import { notify } from "@/lib/notify";
import type { SessionContext } from "@/lib/auth/session";
import { buildRecords, checkMapping, detectHeader, detectMapping, type ImportResult, type Mapping } from "./import";
import { FileReadError, pickSheet, readSheets } from "./read-file";

export type Source = "PURCHASE_REGISTER" | "GSTR2B";
export const SOURCE_LABEL: Record<Source, string> = {
  PURCHASE_REGISTER: "Purchase register",
  GSTR2B: "GSTR-2B",
};

/** Row-level issues kept per file. Counts in `stats` are always complete. */
const MAX_STORED_ISSUES = 500;
const INSERT_BATCH = 1000;

export type ImportStats = {
  dataRows: number;
  valid: number;
  withErrors: number;
  blank: number;
  duplicateKeys: number;
  errorCount: number;
  warningCount: number;
  sheetNames: string[];
  mappingProblems: { field: string | null; message: string }[];
};

export type ImportOutcome = { ok: true } | { ok: false; error: string };

type ImportInput = {
  session: SessionContext;
  reconciliationId: string;
  source: Source;
  fileName: string;
  bytes: Uint8Array;
  mappingOverride?: Mapping;
  sheetName?: string | null;
};

/**
 * Parse a file and store it with its rows and report, replacing any earlier
 * file for the same source in this reconciliation. All-or-nothing.
 */
export async function storeImport(input: ImportInput): Promise<ImportOutcome> {
  const { session, reconciliationId, source, fileName, bytes } = input;

  const recon = await db.reconciliation.findFirst({
    where: { id: reconciliationId, firmId: session.firm.id },
    select: { id: true, status: true, clientId: true },
  });
  if (!recon) return { ok: false, error: "Reconciliation not found." };
  if (recon.status === "COMPLETED") {
    return { ok: false, error: "This reconciliation has already been run. Start a new one to use different files." };
  }

  let sheets;
  try {
    sheets = await readSheets(fileName, bytes);
  } catch (error) {
    const message = error instanceof FileReadError ? error.message : "The file could not be read.";
    if (!(error instanceof FileReadError)) console.error("[import] unexpected read failure", error);
    await notifyImportFailed(session, reconciliationId, fileName, message);
    return { ok: false, error: message };
  }

  const sheet = pickSheet(sheets, input.sheetName);
  const header = detectHeader(sheet.rows);
  if (!header) {
    return {
      ok: false,
      error: `No header row was found in sheet "${sheet.name}". The file needs column titles such as GSTIN, Invoice number, Invoice date and Taxable value.`,
    };
  }

  const mapping = input.mappingOverride ?? detectMapping(header.headers);
  const mappingProblems = checkMapping(mapping);
  // With mapping problems nothing is imported until the user corrects the columns.
  const result: ImportResult = mappingProblems.length
    ? { records: [], errors: [], warnings: [], stats: { dataRows: 0, valid: 0, withErrors: 0, blank: 0, duplicateKeys: 0 } }
    : buildRecords(sheet.rows, header.dataStartIndex, mapping, "");

  const sha256 = createHash("sha256").update(bytes).digest("hex");

  // Same file already used for this client and source in another run: warn, don't block.
  const previous = await db.importFile.findFirst({
    where: {
      firmId: session.firm.id,
      sha256,
      source,
      reconciliationId: { not: reconciliationId },
      reconciliation: { clientId: recon.clientId },
    },
    select: { reconciliation: { select: { period: true } } },
  });
  const warnings = [...result.warnings];
  if (previous) {
    warnings.unshift({
      row: 0,
      field: null,
      message: `This exact file was already uploaded for this client in the ${previous.reconciliation.period} reconciliation. Check that you picked the right period's file.`,
      value: "",
    });
  }

  const stats: ImportStats = {
    ...result.stats,
    errorCount: result.errors.length,
    warningCount: warnings.length,
    sheetNames: sheets.map((s) => s.name),
    mappingProblems: mappingProblems.map((p) => ({ field: p.field ?? null, message: p.message })),
  };

  try {
    await db.$transaction(
      async (tx) => {
        // Replacing a file removes its old rows too (cascade), inside this transaction.
        await tx.importFile.deleteMany({ where: { reconciliationId, source } });
        const file = await tx.importFile.create({
          data: {
            firmId: session.firm.id,
            reconciliationId,
            source,
            fileName: fileName.slice(0, 255),
            fileSize: bytes.byteLength,
            sha256,
            content: new Uint8Array(bytes),
            sheetName: sheet.name,
            headerRowIndex: header.headerRowIndex,
            dataStartIndex: header.dataStartIndex,
            headers: header.headers,
            mapping,
            stats,
            errors: result.errors.slice(0, MAX_STORED_ISSUES),
            warnings: warnings.slice(0, MAX_STORED_ISSUES),
            uploadedById: session.user.id,
          },
          select: { id: true },
        });

        for (let i = 0; i < result.records.length; i += INSERT_BATCH) {
          await tx.invoiceRow.createMany({
            data: result.records.slice(i, i + INSERT_BATCH).map((r) => ({
              firmId: session.firm.id,
              reconciliationId,
              importFileId: file.id,
              source,
              sourceRow: r.sourceRow,
              gstin: r.gstin,
              supplierName: r.supplierName ?? null,
              invoiceNo: r.invoiceNo,
              invoiceDate: r.invoiceDate,
              docType: r.docType,
              taxable: BigInt(r.taxable),
              igst: BigInt(r.igst),
              cgst: BigInt(r.cgst),
              sgst: BigInt(r.sgst),
              cess: BigInt(r.cess),
              original: r.original,
            })),
          });
        }

        await tx.auditLog.create({
          data: auditData({
            firmId: session.firm.id,
            actorId: session.user.id,
            action: input.mappingOverride ? "import.remapped" : "import.uploaded",
            entityType: "Reconciliation",
            entityId: reconciliationId,
            details: { source, fileName, valid: stats.valid, withErrors: stats.withErrors },
          }),
        });
      },
      // Large files insert many rows; allow more time than ordinary writes.
      { maxWait: 10_000, timeout: 120_000 },
    );
  } catch (error) {
    console.error("[import] store failed", { reconciliationId, source, error });
    await notifyImportFailed(session, reconciliationId, fileName, "The file was read but could not be saved. Nothing was changed.");
    return { ok: false, error: "The file was read but could not be saved. Nothing was changed — please try again." };
  }

  return { ok: true };
}

/** Re-apply a corrected column mapping (or a different sheet) to the stored file. */
export async function remapImport(
  session: SessionContext,
  importFileId: string,
  mapping: Mapping | undefined,
  sheetName: string | null,
): Promise<ImportOutcome & { reconciliationId?: string }> {
  const file = await db.importFile.findFirst({
    where: { id: importFileId, firmId: session.firm.id },
    select: { reconciliationId: true, source: true, fileName: true, content: true, sheetName: true },
  });
  if (!file) return { ok: false, error: "File not found." };

  // Changing the sheet means the old column positions no longer apply: detect again.
  const sheetChanged = sheetName !== null && sheetName !== file.sheetName;
  const outcome = await storeImport({
    session,
    reconciliationId: file.reconciliationId,
    source: file.source,
    fileName: file.fileName,
    bytes: file.content,
    mappingOverride: sheetChanged ? undefined : mapping,
    sheetName: sheetName ?? file.sheetName,
  });
  return { ...outcome, reconciliationId: file.reconciliationId };
}

async function notifyImportFailed(session: SessionContext, reconciliationId: string, fileName: string, reason: string) {
  await notify(db, {
    firmId: session.firm.id,
    kind: "import.failed",
    title: `Import failed · ${fileName.slice(0, 80)}`,
    body: reason,
    href: `/reconciliation/${reconciliationId}`,
    userIds: [session.user.id],
  }).catch((e) => console.error("[notify] import.failed", e));
}
