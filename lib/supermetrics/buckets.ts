import type { Granularity } from '@/lib/dashboard/types'

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

/** Monday (ISO) of the given ISO-week of year. Year + week → date. */
function isoWeekMonday(year: number, week: number): Date {
  // ISO 8601: week 1 contains Jan 4th. Jan 4th's Monday is the start of week 1.
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const jan4Day = jan4.getUTCDay() || 7   // Mon=1..Sun=7
  const week1Monday = new Date(jan4.getTime() - (jan4Day - 1) * 86400000)
  return new Date(week1Monday.getTime() + (week - 1) * 7 * 86400000)
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Parse SM's display-format bucket labels into ISO YYYY-MM-DD of the
 *  period start. Throws when unparseable (caller maps to invalid-metric). */
export function normalizeSmBucket(raw: string, granularity: Granularity): string {
  if (raw === '') throw new Error(`normalizeSmBucket: empty input for ${granularity}`)

  if (granularity === 'day') {
    // Accept "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM:SS"
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(raw)
    if (!m) throw new Error(`normalizeSmBucket: cannot parse day '${raw}'`)
    return m[1]
  }

  if (granularity === 'week') {
    // "Week 26, 2026"
    let m = /^Week\s+(\d{1,2}),\s*(\d{4})$/i.exec(raw)
    if (m) return iso(isoWeekMonday(Number(m[2]), Number(m[1])))
    // "2026-W26"
    m = /^(\d{4})-W(\d{1,2})$/i.exec(raw)
    if (m) return iso(isoWeekMonday(Number(m[1]), Number(m[2])))
    throw new Error(`normalizeSmBucket: cannot parse week '${raw}'`)
  }

  // month
  // "Jan 2026"
  let m = /^([A-Za-z]{3})\s+(\d{4})$/.exec(raw)
  if (m) {
    const mo = MONTHS[m[1].toLowerCase()]
    if (!mo) throw new Error(`normalizeSmBucket: unknown month '${m[1]}'`)
    return iso(new Date(Date.UTC(Number(m[2]), mo - 1, 1)))
  }
  // "2026-01"
  m = /^(\d{4})-(\d{2})$/.exec(raw)
  if (m) return iso(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)))
  throw new Error(`normalizeSmBucket: cannot parse month '${raw}'`)
}
