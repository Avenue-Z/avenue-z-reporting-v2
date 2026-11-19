import { smQuery, parseSmRows, DS_IDS } from '@/lib/supermetrics/client'
import { getClientBySlug } from '@/lib/db/queries'
import { parseDateRange, deriveCompareRange } from '@/lib/ga4/client'
import { bqEnabled, logBqFallback } from '@/lib/bq/backend'
import { readMetaMarts } from '@/lib/bq/meta'
import { BqUnavailable } from '@/lib/bq/errors'

export async function metaQuery(
  slug: string,
  fields: string[],
  dateRange: string,
  opts: { filters?: string; settings?: Record<string, unknown>; maxRows?: number } = {},
): Promise<Record<string, string>[]> {
  const client = await getClientBySlug(slug)
  const accountId = client?.metaConfig?.metaAdAccountId
  const envVar = client?.smApiKeyEnvVar
  if (!accountId || !envVar) throw new Error(`meta_config / sm_api_key_env_var missing for ${slug}`)
  const { startDate, endDate } = parseDateRange(dateRange)
  // On BigQuery there is no live fallback (C2, as Google Ads in C3): a miss throws and the part shows its
  // error card. The page clips its range to what the marts hold first (metaWindow).
  if (bqEnabled('meta', slug)) {
    try {
      if (opts.filters || opts.settings) throw new BqUnavailable('unsupported', 'Supermetrics filters or settings have no mart equivalent')
      return await readMetaMarts(accountId, fields, startDate, endDate, opts.maxRows)
    } catch (err) {
      logBqFallback('meta', slug, err, 'none')
      throw err
    }
  }
  const apiKey = process.env[envVar]
  if (!apiKey) throw new Error(`Missing env var ${envVar}`)
  const result = await smQuery({
    apiKey,
    dsId: DS_IDS.META,
    dsAccounts: accountId,
    fields,
    dateRange: `${startDate},${endDate}`,
    filters: opts.filters,
    settings: opts.settings,
    maxRows: opts.maxRows,
  })
  return parseSmRows(result)
}

export function resolveCompareIso(dateRange: string, compareRange: string | null): string | null {
  const r = deriveCompareRange(dateRange, compareRange)
  return r ? `${r.startDate},${r.endDate}` : null
}
