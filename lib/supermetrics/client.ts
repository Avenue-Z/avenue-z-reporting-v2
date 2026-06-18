/**
 * Supermetrics enterprise API client — server-side only.
 *
 * The /query/data/json endpoint responds synchronously for normal queries:
 *   { meta: { schedule_id, status_code: 'SUCCESS' }, data: [[header...], ...rows] }
 * For very large/queued queries it can return a schedule_id without data; we
 * then poll the same endpoint by schedule_id until the data array appears.
 *
 * Per-client API key is passed in by the caller (read from the env var named in
 * clients.smApiKeyEnvVar).
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

export async function smQuery(
  p: SmQueryParams,
  opts: { pollMs?: number; maxPolls?: number; fetchImpl?: typeof fetch } = {},
): Promise<SmResult> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const pollMs = opts.pollMs ?? 1500
  const maxPolls = opts.maxPolls ?? 40 // ~60s ceiling
  const headers = { Authorization: `Bearer ${p.apiKey}`, 'Content-Type': 'application/json' }

  type SmField = { field_id: string; data_column: number }
  type SmResponse = {
    meta?: { schedule_id?: string; status_code?: string; query?: { fields?: SmField[] } }
    data?: string[][]
  }

  // The data[0] header row uses human display names ("Campaign name"); we key
  // rows by canonical field_id (from meta.query.fields) so callers can read
  // r.Campaignname / r.Weekiso / r.ConversionTypeName regardless of display name.
  const fieldHeader = (r: SmResponse): string[] | null => {
    const f = r.meta?.query?.fields
    if (!f?.length) return null
    return f.slice().sort((a, b) => a.data_column - b.data_column).map((x) => x.field_id)
  }

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

  if (submit.meta?.status_code && submit.meta.status_code !== 'SUCCESS') {
    throw new SmQueryError(`Supermetrics status ${submit.meta.status_code}`)
  }
  // Synchronous result: the data array is present in the submit response.
  if (Array.isArray(submit.data)) {
    return { header: fieldHeader(submit) ?? submit.data[0] ?? [], rows: submit.data.slice(1) }
  }

  // Async fallback: a schedule_id was returned without data — poll by id until ready.
  const scheduleId = submit.meta?.schedule_id
  if (!scheduleId) throw new SmQueryError('Supermetrics response had neither data nor schedule_id')

  for (let i = 0; i < maxPolls; i++) {
    await new Promise((r) => setTimeout(r, pollMs))
    const out = (await call(`${BASE}/query/data/json/${scheduleId}`, { headers }, fetchImpl)) as SmResponse
    if (out.meta?.status_code === 'FAILURE') throw new SmQueryError('Supermetrics query failed')
    if (Array.isArray(out.data)) {
      return { header: fieldHeader(out) ?? out.data[0] ?? [], rows: out.data.slice(1) }
    }
  }
  throw new SmTimeoutError()
}

export function parseSmRows(result: SmResult): Record<string, string>[] {
  return result.rows.map((row) => Object.fromEntries(result.header.map((h, i) => [h, row[i]])))
}
