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

export async function smQuery(
  p: SmQueryParams,
  opts: { pollMs?: number; maxPolls?: number; fetchImpl?: typeof fetch } = {},
): Promise<SmResult> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const pollMs = opts.pollMs ?? 1500
  const maxPolls = opts.maxPolls ?? 40 // ~60s ceiling
  const headers = { Authorization: `Bearer ${p.apiKey}`, 'Content-Type': 'application/json' }

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
  }, fetchImpl)) as { data?: { schedule_id?: string } }

  const scheduleId = submit.data?.schedule_id
  if (!scheduleId) throw new SmQueryError('No schedule_id from submit')

  for (let i = 0; i < maxPolls; i++) {
    const out = (await call(`${BASE}/query/data/json/${scheduleId}`, { headers }, fetchImpl)) as {
      data?: { status?: string; data?: string[][] }
    }
    const status = out.data?.status
    if (status === 'completed') {
      const rows = out.data?.data ?? []
      return { header: rows[0] ?? [], rows: rows.slice(1) }
    }
    if (status === 'failed') throw new SmQueryError('Supermetrics query failed')
    await new Promise((r) => setTimeout(r, pollMs))
  }
  throw new SmTimeoutError()
}

export function parseSmRows(result: SmResult): Record<string, string>[] {
  return result.rows.map((row) => Object.fromEntries(result.header.map((h, i) => [h, row[i]])))
}
