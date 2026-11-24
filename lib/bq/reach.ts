import { cached } from '@/lib/cache'
import { resolveDateRange } from '@/lib/date-range'
import type { Kpi } from '@/lib/paid-search/types'
import { logBqFallback } from './backend'
import { bqRows, martRef } from './client'
import { BqUnavailable } from './errors'
import { ISO_DATE } from './googleads'
import type { AdsNotice } from './googleads-window'

/**
 * Reach and frequency from the reach-by-range marts (C4). Reach is not additive, so it is never summed: the
 * connector pulls each of 14 presets nightly as one snapshot per range, and a window is served only when a
 * snapshot row has exactly its dates. The first table is the account one; Meta's second is per ad.
 */
export type ReachPlatform = 'meta' | 'linkedin'
const TABLES: Record<ReachPlatform, string[]> = {
  meta: ['mart_fbads_reach_by_range', 'mart_fbads_ad_reach_by_range'],
  linkedin: ['mart_linkedin_reach_by_range'],
}

/** A BigQuery row that asked for reach carries the reach keys when served, else this key = the state, and no reach keys. */
export const REACH_STATE_KEY = '_reach'
/** `preset-only`: no snapshot for the window (a custom range). `delayed`: the snapshot is stale. `unavailable`: BigQuery failed. */
export type ReachState = 'preset-only' | 'delayed' | 'unavailable'
export interface ReachValue { reach: string; frequency: string }

export const REACH_TOOLTIP: Record<ReachState, string> = {
  'preset-only': 'Reach and frequency are shown for the preset date ranges only.',
  delayed: "Reach and frequency are waiting on today's snapshot.",
  unavailable: "Reach and frequency can't be loaded right now.",
}

/**
 * Same clock as metaWindow: the reach jobs pull on day P and their rolling ranges end P-1, landing by
 * 10:00 UTC. So yesterday's pull is normal until 10:00 UTC, stale after; anything older is always stale.
 */
export function snapshotStale(pulledOn: unknown): boolean {
  if (typeof pulledOn !== 'string' || !ISO_DATE.test(pulledOn)) return true
  const yesterday = resolveDateRange('last_1_days').endDate
  return pulledOn < yesterday || (pulledOn === yesterday && new Date().getUTCHours() >= 10)
}

async function pulledOnImpl(platform: ReachPlatform): Promise<string> {
  const tables = TABLES[platform]
  const newest = await Promise.all(tables.map(async (t) => (await bqRows(`select cast(max(pulled_on) as string) as d from ${martRef(t)}`, {}))[0]?.d))
  newest.forEach((d, i) => {
    if (typeof d !== 'string' || !ISO_DATE.test(d)) throw new BqUnavailable('stale', `${tables[i]} has no readable pull date (${JSON.stringify(d)})`)
  })
  return (newest as string[]).reduce((a, b) => (b < a ? b : a))
}
/** The oldest of the platform's newest pulls: a page is as fresh as its stalest reach table. */
export const reachPulledOn = cached('bigquery', 'reachPulledOn', pulledOnImpl, { ttlSeconds: 3600, version: 'v1' })

const WINDOW = 'cast(ACCOUNT_ID as string) = @account and start_date = date(@start) and end_date = date(@end)'
const str = (v: unknown) => (v == null ? '' : String(v)) // NULL reach is '' as live returns it (rule 6)
interface ReachRow extends ReachValue { adId: string; pulledOn: string | null }

async function rowsImpl(platform: ReachPlatform, byAd: boolean, account: string, start: string, end: string): Promise<ReachRow[]> {
  // Presets sharing dates (this_year, year_to_date) are one pull's equal rows: take one, never sum.
  const sql = byAd
    ? `select cast(AD_ID as string) as ad_id, any_value(reach) as reach, any_value(frequency) as frequency, min(cast(pulled_on as string)) as pulled_on from ${martRef(TABLES.meta[1])}\nwhere ${WINDOW}\ngroup by 1`
    : `select reach, frequency, cast(pulled_on as string) as pulled_on from ${martRef(TABLES[platform][0])}\nwhere ${WINDOW} and CAMPAIGN_ID is null\norder by range_key limit 1`
  const rows = await bqRows(sql, { account, start, end })
  return rows.map((r) => ({ adId: str(r.ad_id), reach: str(r.reach), frequency: str(r.frequency), pulledOn: r.pulled_on == null ? null : String(r.pulled_on) }))
}
// Only the lookup is cached, never a state: a delayed or failed answer is asked again on the next render.
const reachRows = cached('bigquery', 'reachRows', rowsImpl, {
  ttlSeconds: 3600,
  version: 'v1',
  extractTags: ([, , account, start, end]) => ({ client: account, dateRange: `${start},${end}` }),
})

/** Never throws. The log's `slug` carries the account id: the readers do not know the slug. */
async function lookup(platform: ReachPlatform, byAd: boolean, account: string, start: string, end: string): Promise<ReachRow[] | ReachState> {
  try {
    const pulled = await reachPulledOn(platform)
    if (snapshotStale(pulled)) throw new BqUnavailable('stale', `${platform} reach snapshot pulled ${pulled}`)
    const rows = await reachRows(platform, byAd, account, start, end)
    if (!rows.length) return 'preset-only'
    const old = rows.find((r) => snapshotStale(r.pulledOn))
    if (old) throw new BqUnavailable('stale', `${platform} reach row for ${start},${end} pulled ${old.pulledOn}`)
    return rows
  } catch (err) {
    logBqFallback(platform, account, err, 'none')
    return err instanceof BqUnavailable && err.reason === 'stale' ? 'delayed' : 'unavailable'
  }
}

/** The account's reach and frequency for exactly start..end, or why there is none. */
export async function accountReach(platform: ReachPlatform, accountId: string, start: string, end: string): Promise<ReachValue | ReachState> {
  const r = await lookup(platform, false, accountId, start, end)
  return typeof r === 'string' ? r : { reach: r[0].reach, frequency: r[0].frequency }
}

/** Meta's per-ad reach for exactly start..end, keyed by ad id, or why there is none. */
export async function adReach(accountId: string, start: string, end: string): Promise<Map<string, ReachValue> | ReachState> {
  const r = await lookup('meta', true, accountId, start, end)
  return typeof r === 'string' ? r : new Map(r.map((x) => [x.adId, { reach: x.reach, frequency: x.frequency }]))
}

/** A delayed or failed reach is told on the page; a custom range is told by the tile's tooltip alone. */
export function reachNotice(kpis: Kpi[] | undefined): AdsNotice | null {
  const reason = kpis?.find((k) => k.key === 'reach')?.reachState
  return reason ? { kind: 'reach', reason } : null
}
