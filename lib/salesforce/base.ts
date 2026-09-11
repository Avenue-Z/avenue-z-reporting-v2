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
 * No filters parameter on purpose: server-side filtering is avoided for this
 * source because a typo'd filter field returns HTTP 200 with empty data and no
 * error, which is indistinguishable from a legitimate zero result. Filtering
 * happens in the transforms, where a mistake is visible in a test.
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
  opts: { settings?: Record<string, unknown>; maxRows?: number; timeoutMs?: number } = {},
): Promise<Record<string, string>[]> {
  const client = await getClientBySlug(slug)
  const accountId = client?.salesforceConfig?.salesforceAccountId
  const envVar = client?.smApiKeyEnvVar
  // These two throws stay distinct: each names WHICH half is missing, which a
  // boolean cannot. canQuerySalesforce (lib/salesforce/configured.ts) is the
  // caller-side mirror of exactly this conjunction and is pinned to it by
  // configured.test.ts, so the guard and the precondition cannot drift apart.
  // Callers deciding what to TELL the reader want isSalesforceConfigured
  // instead: a missing env var is a deployment problem, not an unconnected CRM.
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
    settings: opts.settings,
    maxRows: opts.maxRows ?? 500,
  }, {
    // Left undefined by default so smQuery's own REQUEST_TIMEOUT_MS stays the
    // single source of the 15s hang guard. Callers that need more pass their
    // own; see SALESFORCE_TIMEOUT_MS in pipeline.ts, which every pipeline query
    // now takes. Note what that constant is NOT: it is no longer a
    // wide-window-only allowance. The 15s budget covers connect + transfer +
    // parse + event-loop wait, so a narrow year-to-date query on a busy
    // function aborts just as readily as an 18-year one.
    timeoutMs: opts.timeoutMs,
  })
  return parseSmRows(result)
}

export function resolveCompareIso(dateRange: string, compareRange: string | null): string | null {
  const r = deriveCompareRange(dateRange, compareRange)
  return r ? `${r.startDate},${r.endDate}` : null
}
