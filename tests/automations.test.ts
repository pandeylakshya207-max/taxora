import { test } from "node:test";
import assert from "node:assert/strict";
import { nextRunAfter, planNext, periodMonthsBefore, MAX_ATTEMPTS } from "../src/lib/automations/schedule";
import { complianceCandidates, reviewCandidates, repeatedMissingCandidates } from "../src/lib/automations/logic";
import { resolveAutomationConfig } from "../src/lib/automations/definitions";

test("next run is the next IST hour, independent of server time zone", () => {
  // 02:00 UTC = 07:30 IST; 09:00 IST today = 03:30 UTC.
  assert.equal(nextRunAfter(new Date("2026-10-17T02:00:00Z"), 9).toISOString(), "2026-10-17T03:30:00.000Z");
  // Exactly at the run time -> tomorrow (strictly after).
  assert.equal(nextRunAfter(new Date("2026-10-17T03:30:00Z"), 9).toISOString(), "2026-10-18T03:30:00.000Z");
  // 20:00 UTC = 01:30 IST next day; 00:00 IST = 18:30 UTC.
  assert.equal(nextRunAfter(new Date("2026-10-17T20:00:00Z"), 0).toISOString(), "2026-10-18T18:30:00.000Z");
});

test("failed scheduled runs retry with backoff, then wait for the schedule", () => {
  const now = new Date("2026-10-17T04:00:00Z");
  const ok = planNext(now, 9, { ok: true, consecutiveFailures: 0 });
  assert.equal(ok.retrying, false);
  assert.equal(ok.nextRunAt.toISOString(), "2026-10-18T03:30:00.000Z");
  const first = planNext(now, 9, { ok: false, consecutiveFailures: 1 });
  assert.equal(first.retrying, true);
  assert.equal(first.nextRunAt.getTime() - now.getTime(), 15 * 60_000);
  assert.equal(planNext(now, 9, { ok: false, consecutiveFailures: 2 }).nextRunAt.getTime() - now.getTime(), 30 * 60_000);
  const exhausted = planNext(now, 9, { ok: false, consecutiveFailures: MAX_ATTEMPTS });
  assert.equal(exhausted.retrying, false);
  assert.equal(exhausted.nextRunAt.toISOString(), "2026-10-18T03:30:00.000Z");
});

test("periods count back across year boundaries", () => {
  assert.equal(periodMonthsBefore("2026-02-10", 0), "2026-02");
  assert.equal(periodMonthsBefore("2026-02-10", 3), "2025-11");
  assert.equal(periodMonthsBefore("2026-01-31", 13), "2024-12");
});

test("compliance reminders: due soon and overdue are separate alerts; closed tasks are skipped", () => {
  const tasks = [
    { id: "a", title: "GSTR-3B Acme", dueDate: "2026-10-20", status: "TODO" },
    { id: "b", title: "GSTR-1 Acme", dueDate: "2026-10-10", status: "IN_PROGRESS" },
    { id: "c", title: "Far away", dueDate: "2026-11-30", status: "TODO" },
    { id: "d", title: "Done", dueDate: "2026-10-01", status: "DONE" },
  ];
  const c = complianceCandidates(tasks, "2026-10-17", 3);
  assert.deepEqual(c.map((x) => x.key), ["task:a:2026-10-20:soon", "task:b:2026-10-10:overdue"]);
  assert.match(c[0].title, /due in 3 days/);
  // Rescheduling the task gives it a new key, so it is reminded again.
  assert.notEqual(complianceCandidates([{ ...tasks[0], dueDate: "2026-10-18" }], "2026-10-17", 3)[0].key, c[0].key);
});

test("pending review reminders wait the set days, then repeat weekly", () => {
  const now = new Date("2026-10-17T06:00:00Z");
  const r = (days: number, pending = 4) => ({ id: "r1", label: "Acme · Sep 2026", completedAt: new Date(now.getTime() - days * 86_400_000), pending });
  assert.equal(reviewCandidates([r(2)], now, 3).length, 0);
  assert.equal(reviewCandidates([r(3)], now, 3)[0].key, "recon:r1:w0");
  assert.equal(reviewCandidates([r(9)], now, 3)[0].key, "recon:r1:w0");
  assert.equal(reviewCandidates([r(10)], now, 3)[0].key, "recon:r1:w1");
  assert.equal(reviewCandidates([r(30, 0)], now, 3).length, 0);
});

test("repeated missing: distinct periods per client and supplier, within the lookback", () => {
  const e = (period: string, clientId = "c1", gstin = "27AAAAA0000A1Z5") => ({ clientId, clientName: "Acme", supplierGstin: gstin, supplierName: "Supplier", period });
  const entries = [e("2026-08"), e("2026-08"), e("2026-09"), e("2026-01"), e("2026-09", "c2"), e("2026-07", "c1", "29BBBBB1111B1Z5")];
  const out = repeatedMissingCandidates(entries, "2026-10-17", 2, 6);
  assert.equal(out.length, 1); // Jan is outside 6 months; c2 and the other supplier have only one period
  assert.equal(out[0].key, "supplier:c1:27AAAAA0000A1Z5:2026-09");
  assert.match(out[0].title, /2 periods: 2026-08, 2026-09/);
  assert.match(out[0].title, /^Supplier \(Acme\)/);
  // A wider window brings January in and changes nothing about the key (latest period).
  assert.match(repeatedMissingCandidates(entries, "2026-10-17", 2, 12)[0].title, /3 periods/);
});

test("automation settings fall back to defaults and clamp", () => {
  assert.deepEqual(resolveAutomationConfig("COMPLIANCE_REMINDERS", null), { daysBefore: 3 });
  assert.deepEqual(resolveAutomationConfig("COMPLIANCE_REMINDERS", { daysBefore: 999 }), { daysBefore: 30 });
  assert.deepEqual(resolveAutomationConfig("REPEATED_MISSING", { minPeriods: 1, lookbackMonths: "x" }), { minPeriods: 2, lookbackMonths: 6 });
});
