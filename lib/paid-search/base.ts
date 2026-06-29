import { smQuery, parseSmRows, DS_IDS } from '@/lib/supermetrics/client'
import { getClientBySlug } from '@/lib/db/queries'
import { parseDateRange, deriveCompareRange } from '@/lib/ga4/client'
import type { PaidSearchConfig, LeadCategory } from '@/lib/db/schema'

export async function awQuery(
  slug: string,
  fields: string[],
  dateRange: string,
  opts: { filters?: string; settings?: Record<string, unknown>; maxRows?: number } = {},
): Promise<Record<string, string>[]> {
  const client = await getClientBySlug(slug)
  const cfg = client?.paidSearchConfig
  const envVar = client?.smApiKeyEnvVar
  if (!cfg || !envVar) throw new Error(`paid_search_config / sm_api_key_env_var missing for ${slug}`)
  const apiKey = process.env[envVar]
  if (!apiKey) throw new Error(`Missing env var ${envVar}`)
  const { startDate, endDate } = parseDateRange(dateRange)
  const result = await smQuery({
    apiKey, dsId: DS_IDS.GOOGLE_ADS, dsAccounts: cfg.googleAdsAccountId,
    fields, dateRange: `${startDate},${endDate}`, filters: opts.filters, settings: opts.settings, maxRows: opts.maxRows,
  })
  return parseSmRows(result)
}

/**
 * Time-bucket field for trend charts. Short ranges bucket by day so a 7- or
 * 14-day view shows one bar per day instead of one or two ISO-week bars; longer
 * ranges keep ISO weeks to stay readable. Returns the Supermetrics AW field id.
 */
export function pickTimeField(dateRange: string): 'Date' | 'Yearweekiso' {
  const { startDate, endDate } = parseDateRange(dateRange)
  const days = Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86_400_000) + 1
  return days <= 31 ? 'Date' : 'Yearweekiso'
}

export function resolveCompareIso(dateRange: string, compareRange: string | null): string | null {
  const r = deriveCompareRange(dateRange, compareRange)
  return r ? `${r.startDate},${r.endDate}` : null
}

export function isLeadAction(name: string, cfg: PaidSearchConfig): boolean {
  return cfg.leadActions.some((a) => a.name === name)
}
export function categoryOf(name: string, cfg: PaidSearchConfig): LeadCategory | null {
  return cfg.leadActions.find((a) => a.name === name)?.category ?? null
}

export { usd, num, pct } from '@/lib/supermetrics/format'
