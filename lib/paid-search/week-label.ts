/**
 * Format a paid-search trend bucket key as a short axis label, e.g. "Feb 23".
 * Handles both granularities produced by pickTimeField:
 *   - daily  "YYYY-MM-DD"      (e.g. "2026-06-15") → that day
 *   - weekly "year|week" ISO   (e.g. "2026|09")    → that ISO week's Monday
 * Pure + client-safe (no imports).
 */
export function bucketLabel(key: string): string {
  const short = (d: Date) =>
    `${d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })} ${d.getUTCDate()}`

  // Daily: "YYYY-MM-DD" (optionally with a time suffix).
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(key)
  if (day) return short(new Date(Date.UTC(+day[1], +day[2] - 1, +day[3])))

  // Weekly: "year|week". ISO week 1 contains Jan 4; its Monday anchors the year.
  const [y, w] = key.split('|').map(Number)
  if (!y || !w) return key
  const jan4 = new Date(Date.UTC(y, 0, 4))
  const monday = new Date(jan4)
  monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1) + (w - 1) * 7)
  return short(monday)
}
