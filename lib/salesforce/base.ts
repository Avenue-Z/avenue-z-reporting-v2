import { smQuery, parseSmRows, DS_IDS } from '@/lib/supermetrics/client'
import { getClientBySlug } from '@/lib/db/queries'
import { parseDateRange, deriveCompareRange } from '@/lib/ga4/client'

/**
 * Salesforce via Supermetrics. Returns records, not aggregates: a query with a
 * dimension yields one row per distinct dimension value, and truncation at
 * maxRows is not detectable from the response (no total, no paging token).
 * Callers set maxRows comfortably above expected cardinality and treat
 * rows.length === maxRows as a warning.
 *
 * Field values arrive as JS numbers and booleans in practice even though
 * parseSmRows types them as strings, but that is an unguaranteed API detail,
 * not a promise Supermetrics makes. Coerce a boolean-shaped field with
 * toBool() (lib/salesforce/num.ts), never with a bare === true check: a
 * stringified 'True'/'False' would silently pass through a bare check as
 * "not strictly true" and overstate open pipeline.
 */
export async function salesforceQuery(
  slug: string,
  fields: string[],
  dateRange: string,
  opts: { filters?: string; settings?: Record<string, unknown>; maxRows?: number } = {},
): Promise<Record<string, string>[]> {
  const client = await getClientBySlug(slug)
  const accountId = client?.salesforceConfig?.salesforceAccountId
  const envVar = client?.smApiKeyEnvVar
  if (!accountId || !envVar) throw new Error(`salesforce_config / sm_api_key_env_var missing for ${slug}`)
  const apiKey = process.env[envVar]
  if (!apiKey) throw new Error(`Missing env var ${envVar}`)
  const { startDate, endDate } = parseDateRange(dateRange)
  const result = await smQuery({
    apiKey,
    dsId: DS_IDS.SALESFORCE,
    dsAccounts: accountId,
    fields,
    dateRange: `${startDate},${endDate}`,
    filters: opts.filters,
    settings: opts.settings,
    maxRows: opts.maxRows ?? 500,
  })
  return parseSmRows(result)
}

export function resolveCompareIso(dateRange: string, compareRange: string | null): string | null {
  const r = deriveCompareRange(dateRange, compareRange)
  return r ? `${r.startDate},${r.endDate}` : null
}
