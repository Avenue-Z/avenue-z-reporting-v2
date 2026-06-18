// lib/dashboard/adapters/supermetrics.ts
import { smQuery, parseSmRows } from '@/lib/supermetrics/client'
import type { LeafValue, SupermetricsBinding } from '../types'
import { DisconnectedError, NoDataError } from '../errors'

/** Sum a numeric metric field across rows; blank/missing cells count as 0. */
export function sumMetric(rows: Record<string, string>[], field: string): number {
  return rows.reduce((s, r) => s + Number(r[field] || 0), 0)
}

/** Accounts present in `returned` but not allowed by `expected`. Empty when no expectation. */
export function accountDrift(returned: string[], expected?: string[]): string[] {
  if (!expected) return []
  const allowed = new Set(expected)
  return returned.filter((a) => !allowed.has(a))
}

/** Per-client key var wins; otherwise fall back to the global SUPERMETRICS_API_KEY. */
export function resolveSmApiKey(
  smApiKeyEnvVar: string | null | undefined,
  env: NodeJS.ProcessEnv,
): string | undefined {
  const perClient = smApiKeyEnvVar ? env[smApiKeyEnvVar] : undefined
  return perClient ?? env.SUPERMETRICS_API_KEY
}

async function sumForRange(
  apiKey: string,
  b: SupermetricsBinding,
  isoRange: string, // "YYYY-MM-DD,YYYY-MM-DD"
): Promise<number> {
  const result = await smQuery({
    apiKey,
    dsId: b.dsId,
    dsAccounts: b.account, // scope the query to the bound account(s)
    fields: [b.metricField],
    dateRange: isoRange,
    filters: b.filters,
  })
  const rows = parseSmRows(result)
  if (rows.length === 0) throw new NoDataError(`no rows for ${b.metricField} in ${isoRange}`)
  return sumMetric(rows, b.metricField)
}

export async function resolveSupermetricsLeaf(
  b: SupermetricsBinding,
  ctx: { slug: string },
  dateRange: string,
  compareRange: string | null,
): Promise<LeafValue> {
  // Lazy imports — these transitively load lib/db/client (throws at import without
  // DATABASE_URL). Dynamic-importing here keeps the module env-free to import,
  // mirroring lib/paid-search/kpis.ts.
  const { getClientBySlug } = await import('@/lib/db/queries')
  const { parseDateRange } = await import('@/lib/ga4/client')
  const { resolveCompareIso } = await import('@/lib/paid-search/base')

  const client = await getClientBySlug(ctx.slug)
  const apiKey = resolveSmApiKey(client?.smApiKeyEnvVar, process.env)
  if (!apiKey) throw new DisconnectedError(`Supermetrics not connected for ${ctx.slug}`)

  const { startDate, endDate } = parseDateRange(dateRange)
  const value = await sumForRange(apiKey, b, `${startDate},${endDate}`)

  const compareIso = resolveCompareIso(dateRange, compareRange)
  const prevValue = compareIso ? await sumForRange(apiKey, b, compareIso) : undefined

  return { value, prevValue }
}
