import { cached } from '@/lib/cache'
import { bqRows, martRef } from './client'
import { BqUnavailable } from './errors'
import { assertCovers } from './freshness'
import { toSmRows } from './googleads'

const CAMPAIGN = 'mart_linkedin_campaign_performance'
const CREATIVE = 'mart_linkedin_creative_performance'
export const LI_FRESHNESS_TABLE = CAMPAIGN

/** Declared GAPs (parity spec): never served from the marts. */
export const LI_LIVE_ONLY: ReadonlySet<string> = new Set(['approximateUniqueImpressions', 'memberRegion'])

/** Supermetrics LIA field id → [output key, expression]. `Date` comes back keyed `date`, as LIA does. */
const DIMS: Record<string, [string, string]> = {
  Date: ['date', 'cast(event_date as string)'],
  creativeDscName: ['creativeDscName', "coalesce(creative_dsc_name, '')"],
  campaignName: ['campaignName', "coalesce(campaign_name, '')"],
  campaignGroupName: ['campaignGroupName', "coalesce(campaign_group_name, '')"],
  creativeStatus: ['creativeStatus', "coalesce(creative_status, '')"],
}
const CREATIVE_DIMS = ['creativeDscName', 'campaignName', 'campaignGroupName', 'creativeStatus']
const SUMS: Record<string, string> = {
  spend: 'cost', impressions: 'impressions', clicks: 'clicks',
  oneClickLeads: 'leads', oneClickLeadFormOpens: 'lead_form_opens', landingPageClicks: 'landing_page_clicks',
}
/** Supermetrics returns LinkedIn's own rates rounded to 4 dp; parity matched round4 of the ratio of sums. */
const RATIOS: Record<string, [string, string, number]> = {
  ctr: ['clicks', 'impressions', 1],
  cpm: ['cost', 'impressions', 1000],
  cpc: ['cost', 'clicks', 1],
  oneClickLeadsCost: ['cost', 'leads', 1],
  leadFormCompletionRate: ['leads', 'lead_form_opens', 1],
}

export interface LiQuery { table: string; fields: string[] }

export const isLinkedInDim = (f: string): boolean => f in DIMS

export function planLiQueries(fields: string[]): LiQuery[] {
  const bad = fields.filter((f) => !(f in DIMS) && !(f in SUMS) && !(f in RATIOS))
  if (bad.length) throw new BqUnavailable('unsupported', `LinkedIn fields not served by the marts: ${bad.join(', ')}`)
  if (fields.some((f) => CREATIVE_DIMS.includes(f))) return [{ table: CREATIVE, fields }]
  if (!fields.includes('landingPageClicks')) return [{ table: CAMPAIGN, fields }]
  if (fields.some(isLinkedInDim)) throw new BqUnavailable('unsupported', 'LinkedIn landingPageClicks by day is not in the campaign mart')
  // Totals: the campaign mart for everything else, the creative mart for landing page clicks.
  return [{ table: CAMPAIGN, fields: fields.filter((f) => f !== 'landingPageClicks') }, { table: CREATIVE, fields: ['landingPageClicks'] }]
}

export function buildLiSql(q: LiQuery, maxRows?: number): string {
  const select = q.fields.map((f) => {
    if (f in DIMS) return `${DIMS[f][1]} as \`${DIMS[f][0]}\``
    if (f in SUMS) return `sum(${SUMS[f]}) as \`${f}\``
    const [num, den, scale] = RATIOS[f]
    return `coalesce(round(safe_divide(sum(${num}) * ${scale}, sum(${den})), 4), 0) as \`${f}\``
  })
  const dims = q.fields.filter(isLinkedInDim)
  const limit = maxRows != null && Number.isInteger(maxRows) && maxRows > 0 ? maxRows : null
  return [
    `select ${select.join(', ')}`,
    `from ${martRef(q.table)}`,
    'where cast(ACCOUNT_ID as string) = @account',
    '  and event_date between date(@start) and date(@end)',
    dims.length ? `group by ${dims.map((f) => DIMS[f][1]).join(', ')}` : '',
    limit ? `order by sum(cost) desc\nlimit ${limit}` : '',
  ].filter(Boolean).join('\n')
}

const outKey = (f: string) => (f in DIMS ? DIMS[f][0] : f)

async function readOneImpl(accountId: string, q: LiQuery, startDate: string, endDate: string, maxRows: number | null): Promise<Record<string, string>[]> {
  const rows = await bqRows(buildLiSql(q, maxRows ?? undefined), { account: accountId, start: startDate, end: endDate })
  return toSmRows(rows, q.fields.map(outKey))
}
const readOne = cached('bigquery', 'readLinkedInMarts', readOneImpl, {
  ttlSeconds: 3600,
  version: 'v1',
  extractTags: ([accountId, , startDate, endDate]) => ({ client: accountId, dateRange: `${startDate},${endDate}` }),
})

/** Rows keyed exactly as linkedinQuery's Supermetrics rows. Throws BqUnavailable when the marts cannot answer exactly. */
export async function readLinkedInMarts(accountId: string, fields: string[], startDate: string, endDate: string, maxRows?: number): Promise<Record<string, string>[]> {
  const plan = planLiQueries(fields)
  await assertCovers(LI_FRESHNESS_TABLE, endDate)
  const results = await Promise.all(plan.map((q) => readOne(accountId, q, startDate, endDate, maxRows ?? null)))
  if (results.length === 1) return results[0]
  return [Object.assign({}, ...results.map((r) => r[0] ?? {}))]
}
