import ExcelJS from "exceljs";
import { describeDue, urgencyOf } from "./dates";

export type TaskRow = {
  title: string;
  client: string;
  period: string | null;
  dueDate: string;
  status: string;
  dueDateSource: "RULE" | "MANUAL";
  sourceNote: string | null;
  notes: string | null;
};

const STATUS = { TODO: "To do", IN_PROGRESS: "In progress", DONE: "Done", NOT_APPLICABLE: "Not applicable" } as Record<string, string>;
const URGENCY = { OVERDUE: "Overdue", DUE_SOON: "Due within 7 days", UPCOMING: "Upcoming", CLOSED: "Closed" } as Record<string, string>;

/** Compliance task report. Pure: rows in, .xlsx bytes out. User text is written as text, never as formulas. */
export async function buildTaskWorkbook(rows: TaskRow[], meta: { workspace: string; generatedBy: string; today: string; filter: string | null }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Taxora";
  const ws = wb.addWorksheet("Compliance tasks", { views: [{ state: "frozen", ySplit: 4 }] });
  ws.getCell("A1").value = `Taxora — compliance tasks · ${meta.workspace}`;
  ws.getCell("A1").font = { bold: true, size: 14, color: { argb: "FF0A1228" } };
  ws.getCell("A2").value = `As of ${meta.today.split("-").reverse().join("-")} (IST) · exported by ${meta.generatedBy}${meta.filter ? ` · filter: ${meta.filter}` : ""}`;
  ws.getCell("A2").font = { color: { argb: "FF64748B" } };

  const header = ["Task", "Client", "Period", "Due date", "Timing", "Status", "Due date from", "Source", "Review notes"];
  const widths = [40, 28, 10, 12, 20, 14, 16, 40, 40];
  const head = ws.getRow(4);
  header.forEach((h, i) => {
    head.getCell(i + 1).value = h;
    ws.getColumn(i + 1).width = widths[i];
  });
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0A1228" } };

  rows.forEach((r, i) => {
    const row = ws.getRow(5 + i);
    const u = urgencyOf(r, meta.today);
    row.values = [
      r.title,
      r.client,
      r.period ?? "",
      new Date(`${r.dueDate}T00:00:00Z`),
      u === "CLOSED" ? URGENCY.CLOSED : `${URGENCY[u]} (${describeDue(r.dueDate, meta.today)})`,
      STATUS[r.status] ?? r.status,
      r.dueDateSource === "RULE" ? "Workspace rule" : "Entered manually",
      r.sourceNote ?? "",
      r.notes ?? "",
    ];
    row.getCell(4).numFmt = "dd-mm-yyyy";
    if (u === "OVERDUE") row.getCell(5).font = { color: { argb: "FFBE123C" }, bold: true };
  });
  if (rows.length) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + rows.length, column: header.length } };
  else ws.getCell("A5").value = "No tasks match this filter.";

  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer as unknown as ArrayBuffer);
}
