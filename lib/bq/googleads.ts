import { cached } from '@/lib/cache'
import { bqRows, martRef } from './client'
import { BqUnavailable } from './errors'
import { assertCovers } from './freshness'

/** Rebuilt by the same nightly as every other Google Ads mart; its newest day gates them all. */
export const AW_FRESHNESS_TABLE = 'mart_googleads_campaign_performance'

/**
 * Default first day prod's Google Ads marts match raw. Before it, prod keeps the pre-2026-09-17-backfill
 * history (with 5 accounts the backfill dropped, and without rows it added), so a range reaching
 * earlier is refused (C3: no live fallback). Warehouse: docs/notes/2026-10-13-dashboard-cutover-log.md.
 */
export const AW_HISTORY_FROM = '2026-04-01'

/**
 * Accounts verified exact against Supermetrics from an earlier day than AW_HISTORY_FROM, keyed by Google
 * Ads account id. Renaissance: its first day of data, 2026-02-27..03-03 loaded into prod and matched on
 * 2026-11-17 (Avenue-Z/data-warehouse#213, docs/notes/2026-11-17-googleads-renaissance-five-day-load.md).
 * An account is added only once its pre-April history is verified: the earliest mart day cannot tell
 * reconciled history from the pre-backfill rows (19 other accounts hold rows back to 2025-02).
 */
const AW_HISTORY_FROM_BY_ACCOUNT: Record<string, string> = { '4136001852': '2026-02-27' }

/** First day the marts answer exactly for this account. */
export function awHistoryFrom(accountId: string): string {
  return Object.hasOwn(AW_HISTORY_FROM_BY_ACCOUNT, accountId) ? AW_HISTORY_FROM_BY_ACCOUNT[accountId] : AW_HISTORY_FROM
}

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Supermetrics AW field id → mart expression. Keys are the exact ids the dashboard requests. */
const DIM_EXPR: Record<string, string> = {
  Date: 'cast(event_date as string)',
  Yearweekiso: "format_date('%G|%V', event_date)",
  Campaignname: "coalesce(campaign_name, '')",
  ConversionTypeName: "coalesce(conversion_type_name, '')",
  Region: "coalesce(region, '')",
  Metroarea: "coalesce(metro_area, '')",
  Keyword: "coalesce(keyword, '')",
  Matchtype: "coalesce(match_type, '')",
}
const METRIC_COL: Record<string, string> = { Cost: 'cost', Clicks: 'clicks', Impressions: 'impressions', Conversions: 'conversions' }

export interface AwMart { table: string; dims: string[]; metrics: string[] }

const TIME = ['Date', 'Yearweekiso']
const MARTS: Record<string, AwMart> = {
  campaign: { table: 'mart_googleads_campaign_performance', dims: [...TIME, 'Campaignname'], metrics: ['Cost', 'Clicks', 'Impressions'] },
  keyword: { table: 'mart_googleads_keyword_performance', dims: [...TIME, 'Keyword', 'Matchtype'], metrics: ['Cost', 'Clicks', 'Impressions'] },
  // Summed over location_type, as the dashboard's geo query is (googleads results note: Indiana 265 vs 227).
  geo: { table: 'mart_googleads_geo_performance', dims: [...TIME, 'Region', 'Metroarea'], metrics: ['Cost', 'Clicks'] },
  conversion: { table: 'mart_googleads_conversion_action', dims: [...TIME, 'Campaignname', 'ConversionTypeName'], metrics: ['Conversions'] },
  keywordConversion: { table: 'mart_googleads_keyword_conversion', dims: [...TIME, 'Keyword', 'Matchtype', 'ConversionTypeName'], metrics: ['Conversions'] },
  geoConversion: { table: 'mart_googleads_geo_conversion', dims: [...TIME, 'Region', 'Metroarea', 'ConversionTypeName'], metrics: ['Conversions'] },
}

export function pickAwMart(fields: string[]): AwMart {
  const has = (f: string) => fields.includes(f)
  const conv = has('ConversionTypeName') || has('Conversions')
  const kw = has('Keyword') || has('Matchtype')
  const geo = has('Region') || has('Metroarea')
  const key = conv ? (kw ? 'keywordConversion' : geo ? 'geoConversion' : 'conversion') : kw ? 'keyword' : geo ? 'geo' : 'campaign'
  const mart = MARTS[key]
  const bad = fields.filter((f) => !mart.dims.includes(f) && !mart.metrics.includes(f))
  if (bad.length) throw new BqUnavailable('unsupported', `Google Ads fields not served by ${mart.table}: ${bad.join(', ')}`)
  return mart
}

export function buildAwSql(fields: string[]): string {
  const mart = pickAwMart(fields)
  const dims = fields.filter((f) => mart.dims.includes(f))
  const select = fields.map((f) => (mart.dims.includes(f) ? `${DIM_EXPR[f]} as \`${f}\`` : `sum(${METRIC_COL[f]}) as \`${f}\``))
  return [
    `select ${select.join(', ')}`,
    `from ${martRef(mart.table)} t`,
    'where cast(ACCOUNT_ID as string) = @account',
    '  and event_date between date(@start) and date(@end)',
    dims.length ? `group by ${dims.map((f) => DIM_EXPR[f]).join(', ')}` : '',
    // Supermetrics returns no row for a conversion type with 0 conversions; the marts keep them.
    // Qualified: BigQuery aliases are case-insensitive, so a bare `conversions` binds to `Conversions`.
    dims.length && fields.includes('Conversions') ? 'having sum(t.conversions) != 0' : '',
  ].filter(Boolean).join('\n')
}

/** Supermetrics hands every cell over as a string; the transforms parse with Number(x || 0). */
export function toSmRows(rows: Record<string, unknown>[], keys: string[]): Record<string, string>[] {
  return rows.map((r) => Object.fromEntries(keys.map((k) => [k, r[k] == null ? '' : String(r[k])])))
}

async function readAwMartImpl(accountId: string, fields: string[], startDate: string, endDate: string): Promise<Record<string, string>[]> {
  const rows = await bqRows(buildAwSql(fields), { account: accountId, start: startDate, end: endDate })
  return toSmRows(rows, fields)
}

const readAwMartCached = cached('bigquery', 'readAwMart', readAwMartImpl, {
  ttlSeconds: 3600,
  version: 'v1',
  extractTags: ([accountId, , startDate, endDate]) => ({ client: accountId, dateRange: `${startDate},${endDate}` }),
})

/** Rows keyed exactly as awQuery's Supermetrics rows. Throws BqUnavailable when the mart cannot answer exactly. */
export async function readAwMart(accountId: string, fields: string[], startDate: string, endDate: string): Promise<Record<string, string>[]> {
  pickAwMart(fields) // unsupported fields fail before any BigQuery call
  // The floor and freshness checks compare dates as text, which only orders YYYY-MM-DD correctly.
  if (!ISO_DATE.test(startDate) || !ISO_DATE.test(endDate)) {
    throw new BqUnavailable('unsupported', `range ${startDate},${endDate} is not YYYY-MM-DD`)
  }
  const floor = awHistoryFrom(accountId)
  if (startDate < floor) {
    throw new BqUnavailable('unsupported', `range starts ${startDate}, before the marts' Google Ads history floor ${floor}`)
  }
  await assertCovers(AW_FRESHNESS_TABLE, endDate)
  return readAwMartCached(accountId, fields, startDate, endDate)
}
