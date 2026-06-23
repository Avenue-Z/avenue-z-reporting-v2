/**
 * Format a Supermetrics ISO "year|week" value (e.g. "2026|09") as the week's
 * Monday date, e.g. "Feb 23" — matching the AEO charts' weekly bucket labels
 * (see lib/aeo/bucket.ts bucketLabel). Pure + client-safe (no imports).
 */
export function weekLabel(yearWeek: string): string {
  const [y, w] = yearWeek.split('|').map(Number)
  if (!y || !w) return yearWeek
  // ISO week 1 contains Jan 4; its Monday is the anchor for the year.
  const jan4 = new Date(Date.UTC(y, 0, 4))
  const monday = new Date(jan4)
  monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1) + (w - 1) * 7)
  return `${monday.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })} ${monday.getUTCDate()}`
}
