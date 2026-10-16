/**
 * Static product illustration for the marketing page.
 * The figures are clearly labelled as illustrative sample data —
 * they are never presented as a real user's results.
 */

type Status = "exact" | "fuzzy" | "probable" | "missing" | "mismatch";

const STATUS_STYLE: Record<Status, { label: string; className: string }> = {
  exact: { label: "Exact", className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  fuzzy: { label: "Fuzzy", className: "bg-sky-50 text-sky-700 ring-sky-600/20" },
  probable: { label: "Probable", className: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  missing: { label: "Not in 2B", className: "bg-rose-50 text-rose-700 ring-rose-600/20" },
  mismatch: { label: "Value diff", className: "bg-orange-50 text-orange-700 ring-orange-600/20" },
};

const ROWS: { supplier: string; invoice: string; taxable: string; status: Status }[] = [
  { supplier: "Sample Traders", invoice: "INV-1042", taxable: "1,24,500.00", status: "exact" },
  { supplier: "Demo Steel Works", invoice: "DSW/23-24/88", taxable: "86,250.00", status: "fuzzy" },
  { supplier: "Example Logistics", invoice: "EL-5531", taxable: "42,000.00", status: "probable" },
  { supplier: "Placeholder Paper Co.", invoice: "PPC-0917", taxable: "18,900.00", status: "missing" },
  { supplier: "Test Electricals", invoice: "TE-2210", taxable: "57,340.00", status: "mismatch" },
];

export function ProductPreview() {
  return (
    <div className="relative">
      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_24px_60px_-20px_rgba(10,18,40,0.25)]">
        {/* Window bar */}
        <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-2.5">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          </div>
          <span className="rounded-md bg-white px-2 py-0.5 text-[11px] font-medium text-muted ring-1 ring-line">
            Illustrative sample data
          </span>
        </div>

        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted">
                Reconciliation · Sample client
              </p>
              <p className="mt-1 text-sm font-semibold text-ink">
                GSTR-2B vs Purchase register
              </p>
            </div>
            <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
              Needs review
            </span>
          </div>

          <dl className="mt-4 grid grid-cols-4 gap-2">
            {[
              ["Matched", "3"],
              ["Review", "1"],
              ["Not in 2B", "1"],
              ["Value diff", "1"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-line px-3 py-2">
                <dt className="text-[11px] text-muted">{label}</dt>
                <dd className="tabular mt-0.5 text-lg font-semibold text-ink">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-4 overflow-hidden rounded-lg border border-line">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Supplier</th>
                  <th scope="col" className="hidden px-3 py-2 font-medium sm:table-cell">Invoice</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Taxable (₹)</th>
                  <th scope="col" className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {ROWS.map((row) => {
                  const s = STATUS_STYLE[row.status];
                  return (
                    <tr key={row.invoice}>
                      <td className="px-3 py-2 font-medium text-ink">{row.supplier}</td>
                      <td className="hidden px-3 py-2 font-mono text-[11px] text-muted sm:table-cell">
                        {row.invoice}
                      </td>
                      <td className="tabular px-3 py-2 text-right text-ink">{row.taxable}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${s.className}`}
                        >
                          {s.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Explanation callout */}
      <div className="absolute -bottom-6 -left-4 hidden w-72 rounded-xl border border-line bg-white p-4 shadow-lg md:block">
        <p className="text-[11px] font-medium uppercase tracking-wider text-brand-600">
          Why “Fuzzy”?
        </p>
        <ul className="mt-2 space-y-1 text-xs text-slate-600">
          <li>GSTIN identical in both sources</li>
          <li>
            Invoice no. <span className="font-mono">DSW/23-24/88</span> vs{" "}
            <span className="font-mono">DSW-2324-088</span> — 91% similar
          </li>
          <li>Taxable value differs by ₹0.00</li>
        </ul>
      </div>
    </div>
  );
}
