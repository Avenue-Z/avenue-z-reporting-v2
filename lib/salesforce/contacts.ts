import { salesforceQuery, resolveCompareIso } from './base'
import type { WeeklyContacts, WeekBucket } from './types'

const WEEK_FIELDS = ['yearWeekIso_created', 'contact_count']
// Weekly series are small (a year to date is at most 53 buckets); this is ample
// headroom, same reasoning as the stage/owner caps in pipeline.ts.
const WEEK_MAX_ROWS = 100

/**
 * Coerces a Supermetrics numeric field to a finite number. Number(x) returns NaN
 * on something like a stringified '1,234.56', and one NaN would poison currentWeek
 * / previousWeek / weekOverWeek. Falls back to 0 instead. Same convention as
 * pipeline.ts's toNumber.
 */
function toNumber(v: unknown): number {
  const n = Number(v ?? 0)
  if (Number.isFinite(n)) return n
  console.warn(`[salesforce] unparseable numeric value, defaulting to 0:`, v)
  return 0
}

/** The API returns 'YYYY|WW'. Normalize to 'YYYY-Www' so it sorts and reads as ISO. */
function normalizeWeek(key: string): string {
  const [year, week] = String(key).split('|')
  return `${year}-W${String(week ?? '').padStart(2, '0')}`
}

/** Rows into normalized, chronologically sorted buckets. Shared by the transform and
 * the fetcher, so both agree on which bucket is "latest" (see getSalesforceWeeklyContacts). */
function toWeekBuckets(rows: Record<string, string>[]): WeekBucket[] {
  return rows
    .map((r) => ({
      week: normalizeWeek(String(r.yearWeekIso_created ?? '')),
      contacts: toNumber(r.contact_count),
    }))
    .sort((a, b) => a.week.localeCompare(b.week))
}

/**
 * Pure transform: pipe-keyed weekly rows into sorted ISO buckets plus the
 * current/previous/week-over-week figures. priorYearWeek is passed in rather
 * than looked up here, since finding the matching prior-year bucket needs the
 * compare fetch's rows, which this function does not receive.
 */
export function transformWeeklyContacts(
  rows: Record<string, string>[],
  priorYearWeek: number | undefined,
): WeeklyContacts {
  const weeks = toWeekBuckets(rows)
  const currentWeek = weeks.at(-1)?.contacts ?? 0
  const previousWeek = weeks.at(-2)?.contacts ?? 0
  const weekOverWeek = previousWeek > 0 ? ((currentWeek - previousWeek) / previousWeek) * 100 : undefined
  return { weeks, currentWeek, previousWeek, priorYearWeek, weekOverWeek }
}

/**
 * Weekly buckets year to date, plus the same window last year for the
 * prior-year comparison. The compare query failing degrades to no prior-year
 * figure rather than failing the block. The Contacts report type filters on
 * contact created date, so these are genuinely new contacts per week.
 */
export async function getSalesforceWeeklyContacts(slug: string): Promise<WeeklyContacts> {
  const dateRange = 'year_to_date'
  const cmpIso = resolveCompareIso(dateRange, 'previous_year')
  const [rows, cmpRows] = await Promise.all([
    salesforceQuery(slug, WEEK_FIELDS, dateRange, { maxRows: WEEK_MAX_ROWS }),
    cmpIso
      ? salesforceQuery(slug, WEEK_FIELDS, cmpIso, { maxRows: WEEK_MAX_ROWS }).catch((e) => {
          console.error(`[salesforce] contacts compare fetch failed for ${slug}:`, e)
          return null
        })
      : Promise.resolve(null),
  ])
  // Prior-year week: the bucket in the compare set with the same ISO week number as
  // our latest week. Matched by week number, not array position (the compare set's
  // row order is not guaranteed to line up with the current set's), and against the
  // chronologically latest bucket, not just the last row the API happened to return
  // (the API does not guarantee row order, only that the shape is one row per week).
  let priorYearWeek: number | undefined
  const latestWeek = toWeekBuckets(rows).at(-1)?.week
  if (cmpRows && latestWeek) {
    const wantWeek = latestWeek.split('-W')[1]
    const hit = toWeekBuckets(cmpRows).find((b) => b.week.split('-W')[1] === wantWeek)
    if (hit) priorYearWeek = hit.contacts
  }
  return transformWeeklyContacts(rows, priorYearWeek)
}
