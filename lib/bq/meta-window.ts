import { resolveDateRange } from '@/lib/date-range'
import { getClientBySlug } from '@/lib/db/queries'
import { bqEnabled, logBqFallback } from './backend'
import { BqUnavailable } from './errors'
import { martFreshThrough } from './freshness'
import { ISO_DATE } from './googleads'
import type { AdsNotice, AdsWindow } from './googleads-window'
import { META_FRESHNESS_TABLE, META_GEO_TABLE, metaAccount, metaHistoryFrom } from './meta'

function daysBefore(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

/**
 * The part of `dateRange` the Meta marts can answer exactly (C2), as googleAdsWindow does for Google Ads.
 * The history floor is per account; an account whose history nobody verified is unavailable rather than
 * served as zeros. The newest day is the older of the creative and geo marts' (two connector jobs), so
 * every part of the page ends on the same day. Switched off, or for a client that does not run Meta (the
 * Overview asks for every client), the range is untouched and nothing is logged.
 */
export async function metaWindow(slug: string, dateRange: string): Promise<AdsWindow> {
  if (!bqEnabled('meta', slug)) return { dateRange, notice: null }
  let through: string, from: string, startDate: string, endDate: string, behind: string
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
    if (!accountId) return { dateRange, notice: null }
    const account = metaAccount(accountId)
    const floor = metaHistoryFrom(account)
    if (!floor) throw new BqUnavailable('unsupported', `Meta account ${account} has no verified mart history`)
    from = floor
    const tables = [META_FRESHNESS_TABLE, META_GEO_TABLE]
    const newest: unknown[] = await Promise.all(tables.map((t) => martFreshThrough(t)))
    newest.forEach((d, i) => {
      if (typeof d !== 'string' || !ISO_DATE.test(d)) {
        throw new BqUnavailable('stale', `${tables[i]} has no readable newest day (${JSON.stringify(d)})`)
      }
    })
    const i = (newest as string[])[1] < (newest as string[])[0] ? 1 : 0
    through = newest[i] as string
    behind = tables[i]
  } catch (err) {
    logBqFallback('meta', slug, err, 'none')
    return { dateRange: null, notice: { kind: 'unavailable' } }
  }
  // Same clock as the presets: `last_1_days` ends yesterday. The nightly lands at 08:00 UTC, so until
  // 10:00 UTC a mart through the day before yesterday is normal; after it, or anything older, is a missed run.
  const yesterday = resolveDateRange('last_1_days').endDate
  if (through < daysBefore(yesterday, 1) || (through < yesterday && new Date().getUTCHours() >= 10)) {
    logBqFallback('meta', slug, new BqUnavailable('stale', `${behind} holds data through ${through}`), 'none')
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
