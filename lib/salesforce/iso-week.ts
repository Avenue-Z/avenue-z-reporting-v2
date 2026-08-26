const DAY_MS = 86_400_000

/**
 * The Monday (UTC) that starts the given ISO week key ('2026-W33').
 *
 * Shared rather than duplicated: the transform groups contacts into these keys
 * and the Contact Creation axis turns them back into dates to label itself. Two
 * copies of this arithmetic would be free to drift, and a drift here moves every
 * bar's label by a week without anything failing.
 */
export function isoWeekStart(week: string): Date {
  const [y, w] = week.split('-W').map(Number)
  // Jan 4 is always in ISO week 1, so its Monday anchors the year.
  const jan4 = new Date(Date.UTC(y, 0, 4))
  const dow = jan4.getUTCDay() || 7
  return new Date(jan4.getTime() - (dow - 1) * DAY_MS + (w - 1) * 7 * DAY_MS)
}
