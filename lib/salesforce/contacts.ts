import { salesforceQuery, resolveCompareIso } from './base'
import { isoWeekStart } from './iso-week'
import { toNumber } from './num'
import { cached } from '@/lib/cache'
import { byClient } from '@/lib/perf'
import type { WeeklyContacts, WeekBucket } from './types'

const WEEK_FIELDS = ['yearWeekIso_created', 'contact_count']
// Weekly series are small (a year to date is at most 53 buckets); this is ample
// headroom, same reasoning as the stage/owner caps in pipeline.ts.
const WEEK_MAX_ROWS = 100
// Pinned explicitly rather than left on the connector default. The window basis
// for this source is the data_fetched_by setting, not a report-type selection
// (this source has none), so a future change to Supermetrics' default would
// silently reinterpret every bucket as last-modified instead of created.
const CONTACT_SETTINGS = { data_fetched_by: 'fetched_by_created' }

/** The API returns 'YYYY|WW'. Normalize to 'YYYY-Www' so it sorts and reads as ISO. */
function normalizeWeek(key: string): string {
  const [year, week] = String(key).split('|')
  return `${year}-W${String(week ?? '').padStart(2, '0')}`
}

/** A normalized week key looks like '2026-W33'. ISO weeks run 01 to 53, never 00,
 * so a missing or malformed yearWeekIso_created (which normalizes to '-W00' or
 * '2026-W00') is rejected rather than admitted as a real week. */
const WEEK_KEY_RE = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/

/** '2026-W07' to 202607, so weeks compare numerically by year then week. String
 * comparison happens to agree for zero-padded keys, but only by coincidence of
 * the format; comparing the numbers says what is actually meant. */
function weekOrdinal(week: string): number {
  const [y, w] = week.split('-W')
  return Number(y) * 100 + Number(w)
}

const DAY_MS = 86_400_000

/** The ISO week key containing the given instant. UTC throughout, matching the
 * rest of this module's date handling (see resolveCompareIso in base.ts). */
function isoWeekKey(d: Date): string {
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dow = day.getUTCDay() || 7
  // Shift to the Thursday of this week: the ISO year is whichever year owns it.
  const thu = new Date(day.getTime() + (4 - dow) * DAY_MS)
  const jan1 = new Date(Date.UTC(thu.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((thu.getTime() - jan1.getTime()) / DAY_MS + 1) / 7)
  return `${thu.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/** Days of the current ISO week that have started, 1 (Monday) through 7 (Sunday). */
function daysElapsedInIsoWeek(now: Date): number {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  return day.getUTCDay() || 7
}

/**
 * Rows into normalized buckets, merged by week and sorted numerically.
 *
 * Merging matters because the same week can arrive more than once (the connector
 * splits on dimensions we do not request back); pushing both would leave two
 * buckets claiming the same week and displace the real prior week out of the
 * comparison. A malformed key is dropped rather than kept, since '-W00' would
 * otherwise sort first and could become a comparison operand.
 */
function toWeekBuckets(rows: Record<string, string>[]): WeekBucket[] {
  const byWeek = new Map<string, number>()
  for (const r of rows) {
    const raw = String(r.yearWeekIso_created ?? '')
    const week = normalizeWeek(raw)
    if (!WEEK_KEY_RE.test(week)) {
      console.warn(`[salesforce] dropping malformed week key:`, raw)
      continue
    }
    byWeek.set(week, (byWeek.get(week) ?? 0) + toNumber(r.contact_count, 'contact_count'))
  }
  return [...byWeek.entries()]
    .map(([week, contacts]) => ({ week, contacts }))
    .sort((a, b) => weekOrdinal(a.week) - weekOrdinal(b.week))
}

/**
 * Fills weeks the API omitted with explicit zeros, from the first observed week
 * through the current one. The API returns no row at all for a week with no
 * contacts, so without this the "previous" week can be any distance back in the
 * calendar while still being presented as week over week. For this metric an
 * absent week genuinely means zero contacts created, so a zero is the truth,
 * not a guess.
 */
function gapFill(buckets: WeekBucket[], throughWeek: string): WeekBucket[] {
  if (buckets.length === 0) return []
  const have = new Map(buckets.map((b) => [b.week, b.contacts]))
  const end = weekOrdinal(throughWeek) >= weekOrdinal(buckets[buckets.length - 1].week)
    ? throughWeek
    : buckets[buckets.length - 1].week
  const out: WeekBucket[] = []
  let cursor = isoWeekStart(buckets[0].week)
  const last = isoWeekStart(end)
  while (cursor.getTime() <= last.getTime()) {
    const week = isoWeekKey(cursor)
    out.push({ week, contacts: have.get(week) ?? 0 })
    cursor = new Date(cursor.getTime() + 7 * DAY_MS)
  }
  // Rebuilding the calendar means a key that passed WEEK_KEY_RE but is not a
  // real ISO week (W53 in a 52-week year) has no slot to land in. Dropping it is
  // right, doing so silently is not: it is contacts disappearing from a total.
  const emitted = new Set(out.map((b) => b.week))
  for (const week of have.keys()) {
    if (!emitted.has(week)) {
      console.warn(`[salesforce] week key is not a real ISO week, dropped from the series:`, week)
    }
  }
  return out
}

/**
 * Pure transform: pipe-keyed weekly rows into sorted, gap-filled ISO buckets
 * plus the current/previous/comparison figures.
 *
 * The comparison rule is the load-bearing part. The latest bucket is the ISO
 * week in progress, covering only the days elapsed so far, so comparing it
 * against a complete week is structurally invalid: rendered on a Monday it
 * reads as an ~85 percent collapse that is really just a week that has barely
 * started. Rather than publishing that and hoping the UI suppresses it, the
 * comparison is taken between the two most recent COMPLETE weeks, and the
 * partial week is reported separately with the flag and day count a caller
 * needs to label it ("18 contacts, 3 days in"). Same structural-invalidity rule
 * the open-pipeline tiles use when they withhold a year-over-year delta.
 *
 * cmpRows is the prior-year window's rows, matched by ISO week number against
 * the last COMPLETE week (not the partial one), so both sides of that
 * comparison are full weeks too.
 *
 * `now` is injectable so the tests are time-independent.
 */
export function transformWeeklyContacts(
  rows: Record<string, string>[],
  cmpRows: Record<string, string>[] | null,
  now: Date = new Date(),
  // Defaulted rather than required so the contacts path, which has no campaign
  // scoping to report, is not made to pass a constant false at every call site.
  campaignUnmatched = false,
): WeeklyContacts {
  const currentKey = isoWeekKey(now)
  const weeks = gapFill(toWeekBuckets(rows), currentKey)
  const currentWeek = weeks.find((b) => b.week === currentKey)?.contacts ?? 0
  const completed = weeks.filter((b) => weekOrdinal(b.week) < weekOrdinal(currentKey))
  const previousWeek = completed.at(-1)?.contacts ?? 0
  const beforeThat = completed.at(-2)?.contacts
  const completedWeekOverWeek =
    beforeThat != null && beforeThat > 0 ? ((previousWeek - beforeThat) / beforeThat) * 100 : undefined

  // Prior year: the bucket carrying the same ISO week number as our last
  // COMPLETE week. Matching the partial week instead would compare a few days
  // against a full week, and would also land on the compare window's own ragged
  // edge (the window ends on the same calendar date a year earlier, which is
  // almost never the same weekday, so its final bucket is clipped short).
  const lastCompleteKey = completed.at(-1)?.week
  let priorYearWeek: number | undefined
  if (cmpRows && lastCompleteKey) {
    const want = lastCompleteKey.split('-W')[1]
    priorYearWeek = toWeekBuckets(cmpRows).find((b) => b.week.split('-W')[1] === want)?.contacts
  }

  return {
    weeks,
    currentWeek,
    currentWeekPartial: true,
    daysElapsedInCurrentWeek: daysElapsedInIsoWeek(now),
    previousWeek,
    priorYearWeek,
    completedWeekOverWeek,
    campaignUnmatched,
  }
}

/**
 * Weekly buckets year to date, plus the same window last year for the
 * prior-year comparison. The compare query failing degrades to no prior-year
 * figure rather than failing the block. The window basis is pinned to contact
 * created date via CONTACT_SETTINGS, so these are genuinely new contacts per week.
 */
// Exported (not module-private) so contacts.test.ts can call it directly: the
// public getSalesforceWeeklyContacts below is wrapped in cached(), which
// invokes Next's unstable_cache and throws outside a real request context,
// which every vitest run is. Testing the impl directly is the intended use of
// the ...Impl pattern (see lib/hubspot/client.ts), not a workaround: it is the
// plain, uncached orchestration this wraps.
export async function getSalesforceWeeklyContactsImpl(slug: string, now: Date = new Date()): Promise<WeeklyContacts> {
  const dateRange = 'year_to_date'
  const cmpIso = resolveCompareIso(dateRange, 'previous_year')
  const [rows, cmpRows] = await Promise.all([
    salesforceQuery(slug, WEEK_FIELDS, dateRange, { settings: CONTACT_SETTINGS, maxRows: WEEK_MAX_ROWS }),
    cmpIso
      ? salesforceQuery(slug, WEEK_FIELDS, cmpIso, { settings: CONTACT_SETTINGS, maxRows: WEEK_MAX_ROWS }).catch((e) => {
          console.error(`[salesforce] contacts compare fetch failed for ${slug}:`, e)
          return null
        })
      : Promise.resolve(null),
  ])
  // The transform owns the prior-year matching now, so each row set is bucketed
  // exactly once per fetch. Bucketing here as well (to find the latest week)
  // emitted every malformed-key warn twice, which made the log count a
  // misleading measure of how bad the data actually is.
  return transformWeeklyContacts(rows, cmpRows, now)
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
