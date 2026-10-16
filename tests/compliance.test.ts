import { test } from "node:test";
import assert from "node:assert/strict";
import { describeDue, dueDateFor, isIsoDate, todayIst, urgencyOf } from "../src/lib/compliance/dates";

test("due dates follow the user's rule, roll into the next year, and clamp month ends", () => {
  assert.equal(dueDateFor("2026-04", { monthOffset: 1, dayOfMonth: 20 }), "2026-05-20");
  assert.equal(dueDateFor("2026-12", { monthOffset: 1, dayOfMonth: 11 }), "2027-01-11");
  assert.equal(dueDateFor("2026-05", { monthOffset: 1, dayOfMonth: 31 }), "2026-06-30");
  assert.equal(dueDateFor("2027-01", { monthOffset: 1, dayOfMonth: 30 }), "2027-02-28");
  assert.equal(dueDateFor("2028-01", { monthOffset: 1, dayOfMonth: 30 }), "2028-02-29"); // leap year
  assert.equal(dueDateFor("2026-03", { monthOffset: 0, dayOfMonth: 31 }), "2026-03-31");
  assert.throws(() => dueDateFor("2026-13", { monthOffset: 1, dayOfMonth: 1 }));
  assert.throws(() => dueDateFor("2026-04", { monthOffset: 1, dayOfMonth: 32 }));
});

test("today is computed in IST, not server time", () => {
  // 20:00 UTC on 16 Oct is already 01:30 on 17 Oct in India.
  assert.equal(todayIst(new Date("2026-10-16T20:00:00Z")), "2026-10-17");
  assert.equal(todayIst(new Date("2026-10-16T18:00:00Z")), "2026-10-16");
});

test("urgency buckets", () => {
  const today = "2026-05-15";
  assert.equal(urgencyOf({ dueDate: "2026-05-14", status: "TODO" }, today), "OVERDUE");
  assert.equal(urgencyOf({ dueDate: "2026-05-15", status: "IN_PROGRESS" }, today), "DUE_SOON");
  assert.equal(urgencyOf({ dueDate: "2026-05-22", status: "TODO" }, today), "DUE_SOON");
  assert.equal(urgencyOf({ dueDate: "2026-05-23", status: "TODO" }, today), "UPCOMING");
  assert.equal(urgencyOf({ dueDate: "2026-05-01", status: "DONE" }, today), "CLOSED");
  assert.equal(urgencyOf({ dueDate: "2026-05-01", status: "NOT_APPLICABLE" }, today), "CLOSED");
});

test("describeDue and date validation", () => {
  assert.equal(describeDue("2026-05-15", "2026-05-15"), "Due today");
  assert.equal(describeDue("2026-05-20", "2026-05-15"), "Due in 5 days");
  assert.equal(describeDue("2026-05-12", "2026-05-15"), "3 days overdue");
  assert.ok(isIsoDate("2028-02-29"));
  assert.ok(!isIsoDate("2026-02-29"));
  assert.ok(!isIsoDate("29-02-2028"));
});
