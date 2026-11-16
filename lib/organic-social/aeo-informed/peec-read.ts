// lib/organic-social/aeo-informed/peec-read.ts
// A read-only Peec client for the AEO Informed Social adapter. It can only GET four listing paths and POST two report paths;
// anything else is refused before a request is made, and it has no method that sends PUT, PATCH or DELETE.
// It never logs and never puts the key, headers or a response body longer than 160 characters into an error.

const BASE_URL = 'https://api.peec.ai/customer/v1'
const GET_PATHS = new Set(['/brands', '/brands/social-channels', '/source-tags', '/classifications/domains'])
const POST_PATHS = new Set(['/reports/urls', '/reports/brands'])
const RETRY_429 = 4
const RETRY_5XX = 2
const RETRY_NET = 2

export class PeecRefusedError extends Error {
  constructor(public method: string, public path: string) {
    super(`Peec reader refused ${method} ${path}: not on the read-only allowlist`)
    this.name = 'PeecRefusedError'
  }
}
export class PeecHttpError extends Error {
  constructor(public status: number, public path: string, detail: string, public label?: string) {
    super(`Peec ${status} ${path}${label ? ` [${label}]` : ''}: ${detail}`)
    this.name = 'PeecHttpError'
  }
}
/** A single chunk filled a whole page, so rows may be missing. Narrow the chunk; never continue with an offset. */
export class PeecPageCapError extends Error {
  constructor(public path: string, public label?: string) {
    super(`Peec ${path}${label ? ` [${label}]` : ''}: a chunk returned a full page of rows, refusing to return a partial set`)
    this.name = 'PeecPageCapError'
  }
}

export type PeecReader = {
  get(path: string, query?: Record<string, string>, label?: string): Promise<unknown>
  post(path: string, body: Record<string, unknown>, label?: string): Promise<unknown>
}

export type RetryInfo = { path: string; label?: string; status: number; attempt: number; reason: string }

export type PeecReaderOptions = {
  apiKey: string
  projectId: string
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  minGapMs?: number
  timeoutMs?: number
  /** Whole-call budget in ms. Checked before every attempt. Default 10 minutes. */
  deadlineMs?: number
  /** Called once per retry (never with the key). Default: one console.warn line. */
  onRetry?: (info: RetryInfo) => void
}

export function createPeecReader(opts: PeecReaderOptions): PeecReader {
  const doFetch = opts.fetchImpl ?? fetch
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const now = opts.now ?? Date.now
  const minGap = opts.minGapMs ?? 450
  const timeoutMs = opts.timeoutMs ?? 90_000
  const deadlineMs = opts.deadlineMs ?? 600_000
  const startedAt = now()
  const onRetry = opts.onRetry ?? ((i: RetryInfo) => console.warn(`[aeo-informed] retry ${i.attempt} on ${i.path}${i.label ? ` [${i.label}]` : ''} after ${i.reason}`))
  let lastStart = -Infinity
  // Request starts go through one gate, so two calls made at the same time still start at least minGap apart.
  let gate: Promise<void> = Promise.resolve()
  const startGate = async (): Promise<void> => {
    const prev = gate
    let release!: () => void
    gate = new Promise<void>((r) => { release = r })
    try {
      await prev
      const wait = minGap - (now() - lastStart)
      if (wait > 0) await sleep(wait)
      lastStart = now()
    } finally {
      release()
    }
  }
  const redact = (text: string) => (opts.apiKey ? text.split(opts.apiKey).join('[key]') : text)

  async function send(method: 'GET' | 'POST', path: string, url: string, label: string | undefined, body?: string): Promise<unknown> {
    let n429 = 0, n5xx = 0, nNet = 0
    for (;;) {
      if (now() - startedAt > deadlineMs) throw new PeecHttpError(0, path, 'deadline for the whole call exceeded', label)
      await startGate()

      const attemptTimeout = Math.max(1, Math.min(timeoutMs, deadlineMs - (now() - startedAt)))
      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(), attemptTimeout)
      let status: number
      let text: string
      let retryAfter: string | null
      try {
        const res = await doFetch(url, {
          method,
          signal: ac.signal,
          cache: 'no-store',
          redirect: 'error',
          headers: method === 'POST' ? { 'X-API-Key': opts.apiKey, 'Content-Type': 'application/json' } : { 'X-API-Key': opts.apiKey },
          ...(body !== undefined ? { body } : {}),
        })
        status = res.status
        retryAfter = res.headers.get('retry-after')
        text = await res.text() // read inside the guarded block: the timeout covers the body, and a retried response is drained
      } catch (e) {
        clearTimeout(timer)
        const err = e as { name?: string; cause?: { code?: string } }
        const timedOut = err?.name === 'AbortError'
        const reason = timedOut ? 'timeout' : 'network error'
        if (nNet++ < RETRY_NET) { onRetry({ path, label, status: 0, attempt: nNet, reason }); await sleep(1000 * nNet); continue }
        throw new PeecHttpError(0, path, timedOut ? `no answer within ${attemptTimeout} ms` : `network error${err?.cause?.code ? ` (${err.cause.code})` : ''}`, label)
      }
      clearTimeout(timer)

      if (status === 429 && n429 < RETRY_429) {
        n429++
        onRetry({ path, label, status: 429, attempt: n429, reason: 'HTTP 429' })
        const ra = Number(retryAfter)
        const wait429 = Number.isFinite(ra) && ra > 0 ? Math.min(ra, 60) * 1000 : 5000 * n429
        if (wait429 > deadlineMs - (now() - startedAt)) throw new PeecHttpError(0, path, 'deadline for the whole call would pass before the retry', label)
        await sleep(wait429)
        continue
      }
      if (status >= 500 && n5xx < RETRY_5XX) { n5xx++; onRetry({ path, label, status, attempt: n5xx, reason: `HTTP ${status}` }); await sleep(1000 * n5xx); continue }

      if (status < 200 || status >= 300) throw new PeecHttpError(status, path, redact(text).slice(0, 160), label)
      try {
        return JSON.parse(text)
      } catch {
        throw new PeecHttpError(status, path, 'response was not JSON', label)
      }
    }
  }

  return {
    get(path, query = {}, label) {
      if (!GET_PATHS.has(path)) return Promise.reject(new PeecRefusedError('GET', path))
      const u = new URL(BASE_URL + path)
      for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v)
      u.searchParams.set('project_id', opts.projectId) // set last: a caller cannot point the key at another project
      return send('GET', path, u.toString(), label)
    },
    post(path, body, label) {
      if (!POST_PATHS.has(path)) return Promise.reject(new PeecRefusedError('POST', path))
      const u = new URL(BASE_URL + path)
      u.searchParams.set('project_id', opts.projectId)
      return send('POST', path, u.toString(), label, JSON.stringify({ ...body, project_id: opts.projectId }))
    },
  }
}
