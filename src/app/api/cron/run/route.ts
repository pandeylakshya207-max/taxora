import { createHash, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { executeAutomation } from "@/lib/automations/run";
import { STALE_RUN_MS } from "@/lib/automations/schedule";

/**
 * Scheduler endpoint. Call it every 15–60 minutes from an external scheduler
 * (Vercel Cron, Windows Task Scheduler, cron) with
 *   Authorization: Bearer <CRON_SECRET>
 * It runs every enabled automation that is due. Nothing runs in the browser.
 */

const PER_TICK = 25;

const digest = (s: string) => createHash("sha256").update(s).digest();

function authorised(request: Request): boolean | null {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return null;
  const header = request.headers.get("authorization") ?? "";
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}

async function handle(request: Request) {
  const auth = authorised(request);
  if (auth === null) {
    return Response.json({ error: "Scheduler not configured: set CRON_SECRET (at least 16 characters) on the server." }, { status: 503 });
  }
  if (!auth) return Response.json({ error: "Unauthorised." }, { status: 401 });

  const now = new Date();
  // Runs left RUNNING by a crash or timeout are closed honestly, not left hanging.
  const interrupted = await db.automationRun.updateMany({
    where: { status: "RUNNING", startedAt: { lt: new Date(now.getTime() - STALE_RUN_MS) } },
    data: { status: "FAILED", finishedAt: now, error: "Interrupted before finishing (server restart or timeout)." },
  });
  const tick = await db.cronTick.create({ data: {} });

  const due = await db.automation.findMany({
    where: { enabled: true, nextRunAt: { lte: now } },
    orderBy: { nextRunAt: "asc" },
    take: PER_TICK,
    select: { id: true, nextRunAt: true, consecutiveFailures: true },
  });

  let processed = 0;
  let failed = 0;
  for (const a of due) {
    // Claim it: only one scheduler call can move nextRunAt from this exact value.
    const claimed = await db.automation.updateMany({
      where: { id: a.id, enabled: true, nextRunAt: a.nextRunAt },
      data: { nextRunAt: new Date(now.getTime() + STALE_RUN_MS) },
    });
    if (claimed.count !== 1) continue;
    const out = await executeAutomation(a.id, a.consecutiveFailures > 0 ? "RETRY" : "SCHEDULE");
    processed++;
    if (!out.ok) failed++;
  }

  await db.cronTick.update({ where: { id: tick.id }, data: { finishedAt: new Date(), processed, failed } });
  return Response.json({ processed, failed, interrupted: interrupted.count, remaining: due.length === PER_TICK ? "more may be due; they run on the next call" : 0 });
}

export const GET = handle;
export const POST = handle;
