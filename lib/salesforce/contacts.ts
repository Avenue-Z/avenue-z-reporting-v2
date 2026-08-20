import { salesforceQuery, resolveCompareIso } from './base'
import { toNumber } from './num'
import { cached } from '@/lib/cache'
import { byClient } from '@/lib/perf'
import type { WeeklyContacts, WeekBucket } from './types'

const WEEK_FIELDS = ['yearWeekIso_created', 'contact_count']
// Weekly series are small (a year to date is at most 53 buckets); this is ample
// headroom, same reasoning as the stage/owner caps in pipeline.ts.
const WEEK_MAX_ROWS = 100

/** The API returns 'YYYY|WW'. Normalize to 'YYYY-Www' so it sorts and reads as ISO. */
function normalizeWeek(key: string): string {
  const [year, week] = String(key).split('|')
  return `${year}-W${String(week ?? '').padStart(2, '0')}`
}

/** A normalized week key looks like '2026-W33'. ISO weeks run 01 to 53, never 00,
 * so a missing or malformed yearWeekIso_created (which normalizes to '-W00' or
 * '2026-W00') is rejected rather than admitted as a real week. */
const WEEK_KEY_RE = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/

/** Rows into normalized, chronologically sorted buckets. Shared by the transform and
 * the fetcher, so both agree on which bucket is "latest" (see getSalesforceWeeklyContacts).
 * A malformed key is dropped rather than kept: '-W00' sorts first so it can never
 * become the current week, but with exactly two buckets it would become
 * previousWeek and produce a nonsense weekOverWeek. */
function toWeekBuckets(rows: Record<string, string>[]): WeekBucket[] {
  const buckets: WeekBucket[] = []
  for (const r of rows) {
    const raw = String(r.yearWeekIso_created ?? '')
    const week = normalizeWeek(raw)
    if (!WEEK_KEY_RE.test(week)) {
      console.warn(`[salesforce] dropping malformed week key:`, raw)
      continue
    }
    buckets.push({ week, contacts: toNumber(r.contact_count, 'contact_count') })
  }
  return buckets.sort((a, b) => a.week.localeCompare(b.week))
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
  // previousWeek is the previous PRESENT bucket (the second-to-last after empty
  // weeks are already absent from the API response), not necessarily the
  // immediately preceding calendar week. If a week had zero contacts, it never
  // appears as a row, so weekOverWeek can end up comparing two non-adjacent
  // weeks. This is a consequence of the API omitting empty periods, by design.
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
// Exported (not module-private) so contacts.test.ts can call it directly: the
// public getSalesforceWeeklyContacts below is wrapped in cached(), which
// invokes Next's unstable_cache and throws outside a real request context,
// which every vitest run is. Testing the impl directly is the intended use of
// the ...Impl pattern (see lib/hubspot/client.ts), not a workaround: it is the
// plain, uncached orchestration this wraps.
export async function getSalesforceWeeklyContactsImpl(slug: string): Promise<WeeklyContacts> {
  // Under year_to_date the latest bucket is usually an in-progress, partial
  // week (whatever days have elapsed so far), compared against previousWeek,
  // a complete prior week. weekOverWeek and priorYearWeek are therefore a
  // partial-vs-complete comparison, not partial-vs-partial. By design: the
  // API has no notion of "week so far" to fetch instead.
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
  //
  // Known artifact: matching by ISO week number does not mean matching an equal
  // number of days. The compare window ends on the same calendar date a year
  // earlier, which almost never falls on the same weekday, so the two windows
  // that share a week number are not the same length. Worked example: today
  // 2026-08-16 is a Sunday, so the current 2026-W33 bucket covers a full 7 days,
  // but 2025-08-16 (a year earlier) is a Saturday, so 2025-W33 is clipped to 6
  // days by the window boundary. The prior-year figure is understated by roughly
  // a seventh right now. The drift ranges 0 to 6 days and reverses direction
  // between years depending on where the anniversary date falls in its week, so
  // there is no fixed correction to apply here: this is why the figure can look
  // low even when nothing is actually down.
  let priorYearWeek: number | undefined
  const latestWeek = toWeekBuckets(rows).at(-1)?.week
  if (cmpRows && latestWeek) {
    const wantWeek = latestWeek.split('-W')[1]
    const hit = toWeekBuckets(cmpRows).find((b) => b.week.split('-W')[1] === wantWeek)
    if (hit) priorYearWeek = hit.contacts
  }
  return transformWeeklyContacts(rows, priorYearWeek)
}

// Cached the same way the HubSpot fetchers this block replaces are (1-hour TTL,
// see lib/hubspot/client.ts): two Supermetrics queries per render, either of
// which can take the async schedule/poll path, is too much live-render latency
// for a client-facing page. Wrapping also routes this fetch through recordFetch
// (inside cached()), so a Salesforce outage becomes visible on the health probe
// the same way a HubSpot outage already is.
export const getSalesforceWeeklyContacts = cached(
  'salesforce', 'getSalesforceWeeklyContacts', getSalesforceWeeklyContactsImpl, { extractTags: byClient },
)
