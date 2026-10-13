import { cached } from '@/lib/cache'
import { bqRows, martRef } from './client'
import { BqUnavailable } from './errors'
import { assertCovers } from './freshness'

/** Rebuilt by the same nightly as every other Google Ads mart; its newest day gates them all. */
export const AW_FRESHNESS_TABLE = 'mart_googleads_campaign_performance'

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
    `from ${martRef(mart.table)}`,
    'where cast(ACCOUNT_ID as string) = @account',
    '  and event_date between date(@start) and date(@end)',
    dims.length ? `group by ${dims.map((f) => DIM_EXPR[f]).join(', ')}` : '',
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
  await assertCovers(AW_FRESHNESS_TABLE, endDate)
  return readAwMartCached(accountId, fields, startDate, endDate)
}
