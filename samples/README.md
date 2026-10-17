# Taxora test samples (synthetic — not real returns or businesses)

Recipient (client) GSTIN: 08ABCDE1234F1Z0. Use with a client of that GSTIN.

| Period  | Purchase register (books)       | GSTR-2B                |
|---------|---------------------------------|------------------------|
| 2026-08 | purchase-register-2026-08.csv   | gstr2b-2026-08.xlsx    |
| 2026-07 | purchase-register-2026-07.csv   | gstr2b-2026-07.xlsx    |

Expected for August 2026 (default matching rules):
- Import: 13 book records, 1 row rejected (TS/1 — GSTIN check digit wrong), totals row skipped; 11 GSTR-2B records.
- EXACT 6 (incl. SGE/88 vs SGE-0088 after normalising, SGE/90 within ₹1 rounding)
- FUZZY 2 (MP-2026-0460 booked CGST+SGST but IGST in 2B; KC/2026/1450 vs 1460 with amount difference)
- PROBABLE 1 (BTS-INV-7781 vs 7781/BTS/26, dates 3 days apart)
- GSTIN_MISMATCH 1 (TT/556 — same PAN, different entity number)
- MISSING_IN_2B 2 (Haryana Hardware HH/2026/310, HH/2026/322)
- MISSING_IN_PR 1 (SGE/95)
- DUPLICATE 1 (RST/103 entered twice in the books)

Expected for July 2026: EXACT 4, MISSING_IN_2B 1 (Haryana Hardware HH/2026/287) —
so Haryana Hardware is missing in two periods (vendor page and the repeated-missing automation).
