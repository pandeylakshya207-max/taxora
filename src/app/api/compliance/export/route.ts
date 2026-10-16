import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { auditData } from "@/lib/audit";
import { todayIst } from "@/lib/compliance/dates";
import { buildTaskWorkbook } from "@/lib/compliance/export";

/** GET /api/compliance/export[?client=&period=&show=all] — the same filters as the compliance page. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !session.user.emailVerified) return new Response("Sign in to export.", { status: 401 });
  const url = new URL(request.url);
  const clientId = url.searchParams.get("client") || undefined;
  const periodRaw = url.searchParams.get("period");
  const period = periodRaw && /^\d{4}-(0[1-9]|1[0-2])$/.test(periodRaw) ? periodRaw : undefined;
  const showAll = url.searchParams.get("show") === "all";

  try {
    const tasks = await db.complianceTask.findMany({
      where: {
        firmId: session.firm.id,
        ...(clientId && { clientId }),
        ...(period && { period }),
        ...(!showAll && { status: { in: ["TODO", "IN_PROGRESS"] } }),
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      take: 5000,
    });
    const clientIds = [...new Set(tasks.map((t) => t.clientId).filter((x): x is string => !!x))];
    const clients = await db.client.findMany({ where: { id: { in: clientIds }, firmId: session.firm.id }, select: { id: true, name: true } });
    const names = new Map(clients.map((c) => [c.id, c.name]));

    const filterParts = [clientId && `client: ${names.get(clientId) ?? "selected"}`, period && `period ${period}`, !showAll && "open tasks only"].filter(Boolean);
    const bytes = await buildTaskWorkbook(
      tasks.map((t) => ({ ...t, client: t.clientId ? names.get(t.clientId) ?? "" : "" })),
      { workspace: session.firm.name, generatedBy: session.user.name, today: todayIst(), filter: filterParts.join(", ") || null },
    );
    await db.auditLog.create({
      data: auditData({ firmId: session.firm.id, actorId: session.user.id, action: "export.generated", entityType: "ComplianceTask", details: { format: "xlsx", tasks: tasks.length } }),
    });
    return new Response(new Blob([bytes as BlobPart]), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Taxora_compliance_tasks_${todayIst()}.xlsx"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[compliance.export] failed", error);
    return new Response("The export could not be generated. Please try again.", { status: 500 });
  }
}
