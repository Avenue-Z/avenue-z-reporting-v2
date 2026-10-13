import { smQuery, parseSmRows, DS_IDS } from '@/lib/supermetrics/client'
import { getClientBySlug } from '@/lib/db/queries'
import { parseDateRange, deriveCompareRange } from '@/lib/ga4/client'
import { useBq, logBqFallback } from '@/lib/bq/backend'
import { LI_LIVE_ONLY, isLinkedInDim, readLinkedInMarts } from '@/lib/bq/linkedin'
import { BqUnavailable } from '@/lib/bq/errors'

type LiOpts = { filters?: string; settings?: Record<string, unknown>; maxRows?: number }

async function liveLinkedInQuery(accountId: string, envVar: string, fields: string[], dateRange: string, opts: LiOpts): Promise<Record<string, string>[]> {
  const apiKey = process.env[envVar]
  if (!apiKey) throw new Error(`Missing env var ${envVar}`)
  const { startDate, endDate } = parseDateRange(dateRange)
  const result = await smQuery({
    apiKey,
    dsId: DS_IDS.LINKEDIN,
    dsAccounts: accountId,
    fields,
    dateRange: `${startDate},${endDate}`,
    filters: opts.filters,
    settings: opts.settings,
    maxRows: opts.maxRows,
  })
  return parseSmRows(result)
}

export async function linkedinQuery(
  slug: string,
  fields: string[],
  dateRange: string,
  opts: LiOpts = {},
): Promise<Record<string, string>[]> {
  const client = await getClientBySlug(slug)
  const accountId = client?.linkedinConfig?.linkedinAdAccountId
  const envVar = client?.smApiKeyEnvVar
  if (!accountId || !envVar) throw new Error(`linkedin_config / sm_api_key_env_var missing for ${slug}`)
  if (useBq('linkedin', slug) && !opts.filters && !opts.settings && !fields.includes('memberRegion')) {
    const liveOnly = fields.filter((f) => LI_LIVE_ONLY.has(f))
    const martFields = fields.filter((f) => !LI_LIVE_ONLY.has(f))
    try {
      if (liveOnly.length && fields.some(isLinkedInDim)) throw new BqUnavailable('unsupported', 'live-only fields with dimensions')
      const { startDate, endDate } = parseDateRange(dateRange)
      const [rows, live] = await Promise.all([
        readLinkedInMarts(accountId, martFields, startDate, endDate, opts.maxRows),
        liveOnly.length ? liveLinkedInQuery(accountId, envVar, liveOnly, dateRange, {}) : Promise.resolve(null),
      ])
      return live ? [{ ...(rows[0] ?? {}), ...(live[0] ?? {}) }] : rows
    } catch (err) {
      logBqFallback('linkedin', slug, err)
    }
  }
  return liveLinkedInQuery(accountId, envVar, fields, dateRange, opts)
}

export function resolveCompareIso(dateRange: string, compareRange: string | null): string | null {
  const r = deriveCompareRange(dateRange, compareRange)
  return r ? `${r.startDate},${r.endDate}` : null
}
