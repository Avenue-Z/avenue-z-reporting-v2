import { resolveDateRange } from '@/lib/date-range'
import { getClientBySlug } from '@/lib/db/queries'
import { bqEnabled, logBqFallback } from './backend'
import { BqUnavailable } from './errors'
import { martFreshThrough } from './freshness'
import { AW_FRESHNESS_TABLE, ISO_DATE, awHistoryFrom } from './googleads'

/**
 * Why the Google Ads numbers on screen are not the whole range asked for.
 * `clipped`: the range was cut to what the warehouse holds — `from` is the history floor when the start
 * moved, `through` the newest day when the end moved, `empty` when nothing of the range is left.
 * `unavailable`: BigQuery could not say what it holds, so nothing is shown.
 */
export type AdsNotice =
  | { kind: 'clipped'; from: string | null; through: string | null; empty: boolean }
  | { kind: 'unavailable' }

/** `dateRange` is what every Google Ads fetcher on the page is given; null means fetch nothing. */
export interface AdsWindow { dateRange: string | null; notice: AdsNotice | null }

function daysBefore(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

/**
 * The part of `dateRange` the Google Ads marts can answer exactly (C3). With the source on BigQuery
 * there is no live fallback: a range ending after the newest day ends on that day, a range starting
 * before the client's account floor (awHistoryFrom) starts on it, and the notice says so. Switched off,
 * the range is untouched, and the database is not asked.
 * The clipped range is a `custom:` string, so the page's prior period is derived from what is shown.
 */
export async function googleAdsWindow(slug: string, dateRange: string): Promise<AdsWindow> {
  if (!bqEnabled('googleads', slug)) return { dateRange, notice: null }
  let through: string, startDate: string, endDate: string, floor: string
  try {
    // A malformed `custom:` range from the URL is a refusal (`unsupported`), never a crash or an `error`.
    try {
      ;({ startDate, endDate } = resolveDateRange(dateRange))
    } catch {
      startDate = endDate = ''
    }
    if (!ISO_DATE.test(startDate) || !ISO_DATE.test(endDate)) {
      throw new BqUnavailable('unsupported', `range ${JSON.stringify(dateRange)} is not YYYY-MM-DD`)
    }
    const newest: unknown = await martFreshThrough(AW_FRESHNESS_TABLE)
    if (typeof newest !== 'string' || !ISO_DATE.test(newest)) {
      throw new BqUnavailable('stale', `${AW_FRESHNESS_TABLE} has no readable newest day (${JSON.stringify(newest)})`)
    }
    through = newest
    // A lookup failure is unavailable like any other: never an unclipped range.
    const accountId = (await getClientBySlug(slug))?.paidSearchConfig?.googleAdsAccountId
    if (!accountId) throw new BqUnavailable('unsupported', `${slug} has no Google Ads account id`)
    floor = awHistoryFrom(accountId)
  } catch (err) {
    logBqFallback('googleads', slug, err, 'none')
    return { dateRange: null, notice: { kind: 'unavailable' } }
  }
  // Same clock as the presets: `last_1_days` ends yesterday. The nightly lands at 08:00 UTC, so until
  // 10:00 UTC a mart through the day before yesterday is normal; after it, or anything older, is a missed run.
  const yesterday = resolveDateRange('last_1_days').endDate
  if (through < daysBefore(yesterday, 1) || (through < yesterday && new Date().getUTCHours() >= 10)) {
    logBqFallback('googleads', slug, new BqUnavailable('stale', `${AW_FRESHNESS_TABLE} holds data through ${through}`), 'none')
  }

  const start = startDate < floor ? floor : startDate
  const end = endDate > through ? through : endDate
  if (start === startDate && end === endDate) return { dateRange, notice: null }
  const notice: AdsNotice = {
    kind: 'clipped',
    from: start === startDate ? null : start,
    through: end === endDate ? null : end,
    empty: start > end,
  }
  return { dateRange: notice.empty ? null : `custom:${start},${end}`, notice }
}
