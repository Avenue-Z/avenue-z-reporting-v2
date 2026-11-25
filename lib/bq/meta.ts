import { cached } from '@/lib/cache'
import { bqRows, martRef } from './client'
import { BqUnavailable } from './errors'
import { assertCovers } from './freshness'
import { ISO_DATE, toSmRows } from './googleads'
import { REACH_STATE_KEY, type ReachState, type ReachValue, accountReach, adReach } from './reach'

const CREATIVE = 'mart_fbads_creative_performance'
/** Serves the totals, creative rows and daily trend. metaWindow also checks the geo mart: another connector job. */
export const META_FRESHNESS_TABLE = CREATIVE
export const META_GEO_TABLE = 'mart_fbads_geo_performance'

/**
 * First day each account's marts are known to answer exactly. Live Supermetrics has no Renaissance
 * Meta rows 2024-01-01..2026-04-30 (checked 2026-11-18) and the connector holds every day from
 * 2026-05-01, so the marts match it back to 2024-01-01. An account not listed is never served.
 */
const META_HISTORY_FROM_BY_ACCOUNT: Record<string, string> = { '1480350426850960': '2024-01-01' }

/** The client row stores `act_<id>`; the marts store `<id>`, so an unstripped id reads as zeros. */
export const metaAccount = (id: string): string => id.replace(/^act_/, '')

export function metaHistoryFrom(accountId: string): string | null {
  return Object.hasOwn(META_HISTORY_FROM_BY_ACCOUNT, accountId) ? META_HISTORY_FROM_BY_ACCOUNT[accountId] : null
}

/** Supermetrics FA field id → mart expression. Only these ever reach SQL. */
const DIMS: Record<string, string> = {
  Date: 'cast(event_date as string)',
  ad_name: "coalesce(ad_name, '')",
  adcampaign_name: "coalesce(campaign_name, '')",
  adset_name: "coalesce(ad_group_name, '')",
  adstatus: "coalesce(ad_status, '')",
  Region: "coalesce(region, '')",
}
const AD_DIMS = ['ad_name', 'adcampaign_name', 'adset_name', 'adstatus']
const SUMS = ['cost', 'impressions', 'inline_link_clicks', 'landing_page_views', 'action_post_engagement']
/** Golden compare: round4 of the ratio of sums, null on a zero denominator as live. CTR and CPC use all clicks. */
const RATIOS: Record<string, [string, string, number]> = {
  CTR: ['clicks', 'impressions', 1],
  CPC: ['cost', 'clicks', 1],
  CPM: ['cost', 'impressions', 1000],
  cost_per_landing_page_view: ['cost', 'landing_page_views', 1],
}
/** Reach is not additive: only the reach marts answer it, for a window they hold a row for. */
const REACH_COL: Record<string, keyof ReachValue> = { reach: 'reach', Frequency: 'frequency' }
/** Supermetrics drops a grouped row only when every one of these is 0 (golden note). */
const SIX = ['cost', 'impressions', 'clicks', 'inline_link_clicks', 'landing_page_views', 'action_post_engagement']

const has = (m: Record<string, unknown>, f: string) => Object.hasOwn(m, f)
const isReach = (f: string) => has(REACH_COL, f)

export type MetaKind = 'totals' | 'daily' | 'creative' | 'geo'

export function planMetaQuery(fields: string[]): { table: string; kind: MetaKind } {
  const no = (why: string) => new BqUnavailable('unsupported', `Meta ${why}`)
  const bad = fields.filter((f) => !has(DIMS, f) && !SUMS.includes(f) && !has(RATIOS, f) && !isReach(f))
  if (bad.length) throw no(`fields not served by the marts: ${bad.join(', ')}`)
  const dims = fields.filter((f) => has(DIMS, f))
  const reach = fields.some(isReach)
  if (dims.includes('Region')) {
    if (dims.length > 1 || reach) throw no('Region is served alone, without reach or other dimensions')
    return { table: META_GEO_TABLE, kind: 'geo' }
  }
  if (dims.some((f) => AD_DIMS.includes(f))) {
    if (dims.includes('Date')) throw no('creative rows by day are not served')
    return { table: CREATIVE, kind: 'creative' }
  }
  if (dims.includes('Date')) {
    if (reach) throw no('reach by day is not served')
    return { table: CREATIVE, kind: 'daily' }
  }
  return { table: CREATIVE, kind: 'totals' }
}

/** Sums and rates only; reach and frequency come from lib/bq/reach. */
export function buildMetaSql(fields: string[], kind: MetaKind, maxRows?: number): string {
  const select = fields.filter((f) => !isReach(f)).map((f) => {
    if (has(DIMS, f)) return `${DIMS[f]} as \`${f}\``
    if (SUMS.includes(f)) return `sum(t.${f}) as \`${f}\``
    const [num, den, scale] = RATIOS[f]
    return `round(safe_divide(sum(t.${num}) * ${scale}, sum(t.${den})), 4) as \`${f}\``
  })
  // A creative row takes its ad's reach only when it groups exactly one ad.
  if (kind === 'creative' && fields.some(isReach)) select.push('count(distinct t.AD_ID) as _n_ads', 'any_value(cast(t.AD_ID as string)) as _ad_id')
  const dims = fields.filter((f) => has(DIMS, f))
  const limit = maxRows != null && Number.isInteger(maxRows) && maxRows > 0 ? maxRows : null
  return [
    `select ${select.join(', ')}`,
    `from ${martRef(kind === 'geo' ? META_GEO_TABLE : CREATIVE)} t`,
    'where cast(t.ACCOUNT_ID as string) = @account',
    '  and t.event_date between date(@start) and date(@end)',
    dims.length ? `group by ${dims.map((f) => DIMS[f]).join(', ')}` : '',
    // Qualified: BigQuery aliases are case-insensitive, so a bare `cost` binds to the `cost` alias.
    dims.length ? `having ${SIX.map((c) => `sum(t.${c}) != 0`).join(' or ')}` : '',
    limit ? `order by sum(t.cost) desc\nlimit ${limit}` : '',
  ].filter(Boolean).join('\n')
}

const AD_HELPERS = ['_n_ads', '_ad_id']

/** The sums only. A creative read asking for reach keeps the helper columns, so its ad reach can be joined after the cache. */
async function readImpl(account: string, fields: string[], startDate: string, endDate: string, maxRows: number | null): Promise<Record<string, string>[]> {
  const { kind } = planMetaQuery(fields)
  const rows = await bqRows(buildMetaSql(fields, kind, maxRows ?? undefined), { account, start: startDate, end: endDate })
  const keys = fields.filter((f) => !isReach(f))
  return toSmRows(rows, kind === 'creative' && fields.some(isReach) ? [...keys, ...AD_HELPERS] : keys)
}
// v2: reach left this cache (C4), so a delayed or failed reach is never kept beside the sums for an hour.
const readCached = cached('bigquery', 'readMetaMarts', readImpl, {
  ttlSeconds: 3600,
  version: 'v2',
  extractTags: ([account, , startDate, endDate]) => ({ client: account, dateRange: `${startDate},${endDate}` }),
})

/** Rows keyed exactly as metaQuery's Supermetrics rows. Throws BqUnavailable when the marts cannot answer exactly. */
export async function readMetaMarts(accountId: string, fields: string[], startDate: string, endDate: string, maxRows?: number): Promise<Record<string, string>[]> {
  const { table, kind } = planMetaQuery(fields) // unsupported fields fail before any BigQuery call
  // The floor and freshness checks compare dates as text, which only orders YYYY-MM-DD correctly.
  if (!ISO_DATE.test(startDate) || !ISO_DATE.test(endDate)) {
    throw new BqUnavailable('unsupported', `range ${startDate},${endDate} is not YYYY-MM-DD`)
  }
  const account = metaAccount(accountId)
  const from = metaHistoryFrom(account)
  if (!from) throw new BqUnavailable('unsupported', `Meta account ${account} has no verified mart history`)
  if (startDate < from) {
    throw new BqUnavailable('unsupported', `range starts ${startDate}, before Meta account ${account}'s history floor ${from}`)
  }
  await assertCovers(table, endDate)
  const reachFields = fields.filter(isReach)
  const sums = readCached(account, fields, startDate, endDate, maxRows ?? null)
  if (!reachFields.length) return sums
  // No reach leaves its keys absent, never 0: the transforms read why from REACH_STATE_KEY.
  const withReach = (row: Record<string, string>, hit: ReachValue | ReachState | undefined) => {
    if (typeof hit === 'string') row[REACH_STATE_KEY] = hit
    else if (hit) for (const f of reachFields) row[f] = hit[REACH_COL[f]]
    return row
  }
  // The reach lookups never throw: a stale or failed reach leaves the sums served (rule 5).
  if (kind !== 'creative') {
    const [rows, reach] = await Promise.all([sums, accountReach('meta', account, startDate, endDate)])
    return rows.map((row) => withReach({ ...row }, reach))
  }
  const [rows, byAd] = await Promise.all([sums, adReach(account, startDate, endDate)])
  // A creative row takes its ad's reach only when it groups exactly one ad.
  return rows.map(({ _n_ads, _ad_id, ...row }) =>
    withReach(row, typeof byAd === 'string' ? byAd : Number(_n_ads) === 1 ? byAd.get(_ad_id) : undefined))
}
