/**
 * Small, strict CSV reader (RFC 4180): quoted fields, escaped quotes (""),
 * line breaks inside quotes, CRLF/LF, UTF-8 BOM. The delimiter (comma,
 * semicolon or tab) is detected from the first non-empty line.
 * Cells are returned as text; typing happens in the import layer.
 */
export function parseCsv(text: string): string[][] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const delimiter = detectDelimiter(input);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === "") {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      if (ch === "\r" && input[i + 1] === "\n") i++;
    } else {
      field += ch;
    }
  }
  if (inQuotes) throw new Error("The CSV file has an unclosed quote, so it may be damaged or truncated.");
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  const counts = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length - 1] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}
