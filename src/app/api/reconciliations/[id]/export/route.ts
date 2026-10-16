import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { auditData } from "@/lib/audit";
import { loadReportData } from "@/lib/reports/load";
import { buildReportWorkbook } from "@/lib/reports/excel";
import { buildReportPdf } from "@/lib/reports/pdf";

/**
 * GET /api/reconciliations/:id/export?format=xlsx|pdf[&cat=FUZZY][&review=pending]
 * Builds the report from the database at request time for exactly this
 * workspace, reconciliation and filter. Nothing is cached or pre-generated.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !session.user.emailVerified) {
    return new Response("Sign in to download reports.", { status: 401 });
  }
  const { id } = await params;
  const url = new URL(request.url);
  const format = url.searchParams.get("format");
  if (format !== "xlsx" && format !== "pdf") return new Response("Unknown format.", { status: 400 });

  const filter = {
    category: url.searchParams.get("cat") ?? undefined,
    pendingOnly: url.searchParams.get("review") === "pending",
  };

  try {
    const data = await loadReportData(session, id, filter);
    if (!data) return new Response("Report not found.", { status: 404 });

    const bytes = format === "xlsx" ? await buildReportWorkbook(data) : await buildReportPdf(data);

    await db.auditLog.create({
      data: auditData({
        firmId: session.firm.id,
        actorId: session.user.id,
        action: "export.generated",
        entityType: "Reconciliation",
        entityId: id,
        details: { format, filter: data.filterLabel, lines: data.lines.length },
      }),
    });

    const safe = (s: string) => s.replace(/[^A-Za-z0-9-]+/g, "_").replace(/^_|_$/g, "").slice(0, 60) || "client";
    const fileName = `Taxora_${safe(data.client.name)}_${data.period}_reconciliation${data.filterLabel ? "_filtered" : ""}.${format}`;
    return new Response(new Blob([bytes as BlobPart]), {
      status: 200,
      headers: {
        "Content-Type": format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[export] failed", { id, format, error });
    return new Response("The report could not be generated. Please try again.", { status: 500 });
  }
}
