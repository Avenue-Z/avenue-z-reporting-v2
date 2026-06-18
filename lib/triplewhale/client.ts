// lib/triplewhale/client.ts
const BASE_URL = 'https://api.triplewhale.com/api/v2'
const DEFAULT_MAX_RETRIES = 3

/** Non-retryable / rejected TripleWhale query. */
export class TwQueryError extends Error {}
/** Rate limited after retries exhausted. */
export class TwRateLimitError extends Error {
  readonly retryAfter: number
  constructor(retryAfter: number) {
    super(`TripleWhale rate limit; retry after ${retryAfter}s`)
    this.retryAfter = retryAfter
  }
}

export interface TwSqlArgs {
  apiKey: string
  shopId: string
  query: string
  startDate: string
  endDate: string
  currency?: string
}
export interface TwSqlOpts {
  fetchImpl?: typeof fetch
  maxRetries?: number
  /** Override all retry waits (tests pass 0); default honors Retry-After / backoff. */
  retryDelayMs?: number
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function twSql(args: TwSqlArgs, opts: TwSqlOpts = {}): Promise<Record<string, unknown>[]> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES
  const body = JSON.stringify({
    shopId: args.shopId,
    query: args.query,
    period: { startDate: args.startDate, endDate: args.endDate },
    ...(args.currency ? { currency: args.currency } : {}),
  })

  for (let attempt = 0; ; attempt++) {
    const res = await fetchImpl(`${BASE_URL}/orcabase/api/sql`, {
      method: 'POST',
      headers: { 'x-api-key': args.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body,
    })

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('Retry-After') ?? 10)
      if (attempt >= maxRetries) throw new TwRateLimitError(retryAfter)
      await sleep(opts.retryDelayMs ?? Math.min(retryAfter, 10) * 1000)
      continue
    }
    if (res.status >= 500) {
      if (attempt >= maxRetries) throw new TwQueryError(`TripleWhale ${res.status}`)
      await sleep(opts.retryDelayMs ?? 2 ** attempt * 1000)
      continue
    }
    if (!res.ok) throw new TwQueryError(`TripleWhale ${res.status}`)

    const json = (await res.json()) as unknown
    if (Array.isArray(json)) return json as Record<string, unknown>[]
    if (json && typeof json === 'object') {
      const o = json as { success?: boolean; message?: string; data?: unknown }
      if (o.success === false) throw new TwQueryError(`TripleWhale SQL rejected: ${o.message ?? 'unknown error'}`)
      return (Array.isArray(o.data) ? o.data : []) as Record<string, unknown>[]
    }
    throw new TwQueryError('Unexpected TripleWhale response shape')
  }
}

/** Extract the single aggregate `value` from a result; null when absent/non-numeric. */
export function twValue(rows: Record<string, unknown>[]): number | null {
  if (rows.length === 0) return null
  const v = rows[0]?.value
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
