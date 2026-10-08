// Peec Customer API client for the AEO Outbound Snapshot. Ported from AIVx (aivx-reports@ff18697
// lib/peec-client.ts:17-139 and agent/peec_api_export.py:106-198) with the retry numbers tightened
// to fit the 270s generation deadline (spec §7a). The key never reaches a message.
const BASE = 'https://api.peec.ai/customer/v1'
const MAX_ATTEMPTS = 3
const RETRY_MAX_SECONDS = 20
const CALL_TIMEOUT_MS = 45_000
export const MAX_ENDPOINT_ROWS = 250_000

export class PeecError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PeecError'
  }
}

export interface PeecClientOptions {
  fetch?: typeof globalThis.fetch
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  /** Epoch ms after which no call may start and no retry may wait. */
  deadline?: number
  /** Row cap per endpoint; tests lower it. */
  maxRows?: number
}
type Params = Record<string, string | number>

export function retryDelayMs(header: string | null): number {
  const raw = Number.parseInt(header ?? '', 10)
  const seconds = Number.isFinite(raw) ? raw : RETRY_MAX_SECONDS
  return Math.min(Math.max(seconds, 0), RETRY_MAX_SECONDS) * 1000
}

/** The API returns {data: [...]} or a bare array. */
export function rowsOf<T>(payload: unknown): T[] {
  const d = (payload as { data?: unknown } | null)?.data ?? payload
  return Array.isArray(d) ? (d as T[]) : []
}

export class PeecClient {
  private readonly fetchImpl: typeof globalThis.fetch
  private readonly sleep: (ms: number) => Promise<void>
  private readonly now: () => number
  private readonly deadline: number
  private readonly maxRows: number

  constructor(private readonly key: string, opts: PeecClientOptions = {}) {
    if (!key) throw new PeecError('PEEC_AI_CUSTOMER_TOKEN is not set')
    // Bound so a browser-style fetch never throws "Illegal invocation" when called as a method.
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis)
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
    this.now = opts.now ?? Date.now
    this.deadline = opts.deadline ?? Number.POSITIVE_INFINITY
    this.maxRows = opts.maxRows ?? MAX_ENDPOINT_ROWS
  }

  /** split/join so every occurrence goes (aivx lib/peec-client.ts:91-93). */
  private scrub(text: string): string {
    return (text ?? '').split(this.key).join('<redacted>')
  }

  async call(method: 'GET' | 'POST', path: string, opts: { params?: Params; body?: unknown } = {}): Promise<unknown> {
    const url = new URL(BASE + path)
    for (const [k, v] of Object.entries(opts.params ?? {})) url.searchParams.set(k, String(v))
    for (let attempt = 1; ; attempt++) {
      const left = this.deadline - this.now()
      if (left <= 0) throw new PeecError(`[PEEC API] ${path}: deadline reached`)
      const timeoutMs = Math.min(CALL_TIMEOUT_MS, left)
      const controller = new AbortController()
      const timeoutErr = () => new PeecError(`[PEEC API] ${path}: timed out after ${timeoutMs}ms`)
      // Rejects when the timeout fires. Racing every await against it means a stalled body fails
      // even if the fetch implementation ignores the signal.
      const aborted = new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => reject(timeoutErr()), { once: true })
      })
      const guard = <T>(p: Promise<T>): Promise<T> => Promise.race([p, aborted])
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      let retryWait: number | null = null
      let value: unknown
      try {
        let res: Response
        try {
          res = await guard(this.fetchImpl(url.toString(), {
            method,
            headers: { 'x-api-key': this.key, 'Content-Type': 'application/json' },
            body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
            signal: controller.signal,
            cache: 'no-store',
          }))
        } catch (e) {
          if (e instanceof PeecError) throw e
          const err = e as Error
          if (err?.name === 'AbortError') throw timeoutErr()
          throw new PeecError(`[PEEC API] ${path}: request failed (${this.scrub(err?.message ?? String(e)).slice(0, 200)})`)
        }
        if (res.status === 429) {
          if (attempt >= MAX_ATTEMPTS) throw new PeecError(`[PEEC API] ${path}: rate limited after ${MAX_ATTEMPTS} attempts`)
          const wait = retryDelayMs(res.headers.get('X-RateLimit-Reset'))
          if (wait >= this.deadline - this.now()) throw new PeecError(`[PEEC API] ${path}: rate limited, and waiting would pass the deadline`)
          retryWait = wait
        } else if (res.status >= 400) {
          const body = await guard(res.text()).catch((e: unknown) => {
            if (e instanceof PeecError) throw e
            if (controller.signal.aborted) throw timeoutErr()
            return ''
          })
          throw new PeecError(`[PEEC API] ${path}: HTTP ${res.status} (${this.scrub(body).slice(0, 200)})`)
        } else {
          value = await guard(res.json()).catch((e: unknown) => {
            if (e instanceof PeecError) throw e
            if (controller.signal.aborted) throw timeoutErr()
            throw new PeecError(`[PEEC API] ${path}: response was not JSON`)
          })
        }
      } finally {
        clearTimeout(timer)
      }
      if (retryWait !== null) {
        await this.sleep(retryWait)
        continue
      }
      return value
    }
  }

  /** Every row of a list (GET) or report (POST): limit/offset, stop on the first EMPTY page, abort when a
   *  later page repeats a natural key, abort past MAX_ENDPOINT_ROWS (aivx peec_api_export.py:106-198). */
  async all<T>(method: 'GET' | 'POST', path: string, base: Record<string, unknown>, naturalKey: (row: T) => string, limit: number): Promise<T[]> {
    const rows: T[] = []
    const seen = new Set<string>()
    for (;;) {
      const payload = method === 'GET'
        ? await this.call('GET', path, { params: { ...(base as Params), limit, offset: rows.length } })
        : await this.call('POST', path, { body: { ...base, limit, offset: rows.length } })
      const page = rowsOf<T>(payload)
      if (page.length === 0) return rows
      const keys = page.map(naturalKey)
      const repeated = keys.find((k) => seen.has(k))
      if (repeated !== undefined) {
        throw new PeecError(`[PEEC API] ${path}: the page at offset ${rows.length} repeats a row an earlier page returned (${repeated}), so rows may be missing`)
      }
      keys.forEach((k) => seen.add(k))
      rows.push(...page)
      if (rows.length > this.maxRows) throw new PeecError(`[PEEC API] ${path}: more than ${this.maxRows} rows, stopping`)
    }
  }
}

export function peecFromEnv(opts: PeecClientOptions = {}): PeecClient {
  return new PeecClient(process.env.PEEC_AI_CUSTOMER_TOKEN ?? '', opts)
}
