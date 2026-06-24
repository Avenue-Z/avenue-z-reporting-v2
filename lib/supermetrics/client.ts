/**
 * Supermetrics enterprise API client — server-side only.
 * Async submit → poll. Per-client API key passed in by caller (read from the
 * env var named in clients.smApiKeyEnvVar).
 */
import { DS_IDS } from './constants'
import { SmQueryError, SmTimeoutError, type SmQueryParams, type SmResult } from './types'

export { DS_IDS }
export * from './types'

const BASE = 'https://api.supermetrics.com/enterprise/v2'

async function call(url: string, init: RequestInit, fetchImpl: typeof fetch, attempt = 0): Promise<unknown> {
  const res = await fetchImpl(url, init)
  if (res.status === 429) {
    if (attempt >= 3) {
      throw new SmQueryError('Supermetrics rate limit: retries exhausted', 429)
    }
    const retry = Number(res.headers.get('Retry-After') ?? '2')
    await new Promise((r) => setTimeout(r, Math.min(retry, 10) * 1000))
    return call(url, init, fetchImpl, attempt + 1)
  }
  if (!res.ok) throw new SmQueryError(`Supermetrics ${res.status}`, res.status)
  return res.json()
}

/** The Supermetrics v2 response shape (same for the data and status endpoints):
 *  status_code + schedule_id live under `meta`; rows come back inline under
 *  top-level `data` (header row first), as strings or numbers. */
interface SmResponse {
  meta?: { status_code?: string; schedule_id?: string }
  data?: unknown[][]
}

/** Rows are returned ready (SUCCESS), still pending, or failed. */
function readResponse(r: SmResponse): { ready: SmResult } | { ready: null } {
  const status = r.meta?.status_code
  if (status && /FAIL|ERROR/i.test(status)) throw new SmQueryError(`Supermetrics query ${status}`)
  if (status === 'SUCCESS') {
    const data = (r.data ?? []).map((row) => row.map((cell) => String(cell)))
    return { ready: { header: data[0] ?? [], rows: data.slice(1) } }
  }
  return { ready: null }
}

export async function smQuery(
  p: SmQueryParams,
  opts: { pollMs?: number; maxPolls?: number; fetchImpl?: typeof fetch } = {},
): Promise<SmResult> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const pollMs = opts.pollMs ?? 1500
  const maxPolls = opts.maxPolls ?? 40 // ~60s ceiling
  const headers = { Authorization: `Bearer ${p.apiKey}`, 'Content-Type': 'application/json' }

  // Small/cached queries complete synchronously (SUCCESS + inline data); large
  // ones return QUEUED with a schedule_id to poll. Handle both.
  const submit = (await call(`${BASE}/query/data/json`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ds_id: p.dsId,
      ds_accounts: [p.dsAccounts],
      fields: p.fields,
      date_range_type: 'custom',
      start_date: p.dateRange.split(',')[0],
      end_date: p.dateRange.split(',')[1],
      max_rows: p.maxRows ?? 10000,
      ...(p.filters ? { filter: p.filters } : {}),
      ...(p.settings ? { settings: p.settings } : {}),
    }),
  }, fetchImpl)) as SmResponse

  const submitted = readResponse(submit)
  if (submitted.ready) return submitted.ready

  const scheduleId = submit.meta?.schedule_id
  if (!scheduleId) throw new SmQueryError('No schedule_id from submit')

  const statusUrl = `${BASE}/query/status?json=${encodeURIComponent(JSON.stringify({ schedule_id: scheduleId }))}`
  for (let i = 0; i < maxPolls; i++) {
    await new Promise((r) => setTimeout(r, pollMs))
    const out = (await call(statusUrl, { headers }, fetchImpl)) as SmResponse
    const polled = readResponse(out)
    if (polled.ready) return polled.ready
  }
  throw new SmTimeoutError()
}

// fieldIds overrides header display names so callers can use field IDs as keys.
// Supermetrics returns human-readable display names in the header (e.g.
// "Week (Mon-Sun)" for "Weekiso") — passing the original requested fields here
// gives consistent keys regardless of locale or display name changes.
export function parseSmRows(result: SmResult, fieldIds?: string[]): Record<string, string>[] {
  const keys = fieldIds ?? result.header
  return result.rows.map((row) => Object.fromEntries(keys.map((k, i) => [k, row[i] ?? ''])))
}
