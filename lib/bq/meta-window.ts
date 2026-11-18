import { resolveDateRange } from '@/lib/date-range'
import { getClientBySlug } from '@/lib/db/queries'
import { bqEnabled, logBqFallback } from './backend'
import { BqUnavailable } from './errors'
import { martFreshThrough } from './freshness'
import { ISO_DATE } from './googleads'
import type { AdsNotice, AdsWindow } from './googleads-window'
import { META_FRESHNESS_TABLE, metaAccount, metaHistoryFrom } from './meta'

function daysBefore(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

/**
 * The part of `dateRange` the Meta marts can answer exactly (C2), as googleAdsWindow does for Google Ads.
 * The history floor is per account; a client with no Meta account, or one whose history nobody verified,
 * is unavailable rather than served as zeros. Switched off, the range is untouched and nothing is read.
 */
export async function metaWindow(slug: string, dateRange: string): Promise<AdsWindow> {
  if (!bqEnabled('meta', slug)) return { dateRange, notice: null }
  let through: string, from: string, startDate: string, endDate: string
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
    const accountId = (await getClientBySlug(slug))?.metaConfig?.metaAdAccountId
    if (!accountId) throw new BqUnavailable('unsupported', `no Meta ad account configured for ${slug}`)
    const account = metaAccount(accountId)
    const floor = metaHistoryFrom(account)
    if (!floor) throw new BqUnavailable('unsupported', `Meta account ${account} has no verified mart history`)
    from = floor
    const newest: unknown = await martFreshThrough(META_FRESHNESS_TABLE)
    if (typeof newest !== 'string' || !ISO_DATE.test(newest)) {
      throw new BqUnavailable('stale', `${META_FRESHNESS_TABLE} has no readable newest day (${JSON.stringify(newest)})`)
    }
    through = newest
  } catch (err) {
    logBqFallback('meta', slug, err, 'none')
    return { dateRange: null, notice: { kind: 'unavailable' } }
  }
  // Same clock as the presets: `last_1_days` ends yesterday. The nightly lands at 08:00 UTC, so until
  // 10:00 UTC a mart through the day before yesterday is normal; after it, or anything older, is a missed run.
  const yesterday = resolveDateRange('last_1_days').endDate
  if (through < daysBefore(yesterday, 1) || (through < yesterday && new Date().getUTCHours() >= 10)) {
    logBqFallback('meta', slug, new BqUnavailable('stale', `${META_FRESHNESS_TABLE} holds data through ${through}`), 'none')
  }

  const start = startDate < from ? from : startDate
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
