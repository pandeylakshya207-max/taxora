/** Tax periods are stored as "YYYY-MM". */

export const PERIOD_PATTERN = /^(20\d{2})-(0[1-9]|1[0-2])$/;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-04" -> "April 2026" */
export function formatPeriod(period: string): string {
  const m = PERIOD_PATTERN.exec(period);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : period;
}
