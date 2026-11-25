import type { AhrefsResult, Parsed, SourceIssue } from './types'

const BASE = 'https://api.ahrefs.com/v3'
const TIMEOUT_MS = 15_000
const DEFAULT_RETRY_MS = 2_000
const MAX_RETRY_MS = 5_000
const TOTAL_BUDGET_MS = 35_000
const MAX_BODY_BYTES = 5 * 1024 * 1024
const WINDOW_DAYS = 7
const DAY_MS = 86_400_000

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

const CRAWL_RE = /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:\d{2})$/
const SNAPSHOT_RE = /^\d{4}-\d{2}-\d{2}$/

/** True when the crawl's UTC day is on or before the snapshot day and no more than 7 days earlier. */
export function pickAhrefsCrawl(crawlDate: string, snapshotDate: string): boolean {
  if (!CRAWL_RE.test(crawlDate) || !SNAPSHOT_RE.test(snapshotDate)) return false
  const crawl = Date.parse(crawlDate)
  const snap = Date.parse(snapshotDate)
  if (Number.isNaN(crawl) || Number.isNaN(snap)) return false
  const diffDays = Math.floor(snap / DAY_MS) - Math.floor(crawl / DAY_MS)
  return diffDays >= 0 && diffDays <= WINDOW_DAYS
}

export function parseAhrefsProjects(json: unknown, snapshotDate: string): Parsed<{ crawlDate: string; healthScore: number }> {
  const reason = `No completed Ahrefs crawl within 7 days before ${snapshotDate}`
  const scores = isRecord(json) ? json.healthscores : undefined
  const first = Array.isArray(scores) ? scores[0] : undefined
  if (!isRecord(first)) return { ok: false, reason }
  const { status, date, health_score } = first
  if (status !== 'Completed' || typeof date !== 'string' || typeof health_score !== 'number') return { ok: false, reason }
  if (!pickAhrefsCrawl(date, snapshotDate)) return { ok: false, reason }
  return { ok: true, value: { crawlDate: date, healthScore: health_score } }
}

export function parseAhrefsIssues(json: unknown): SourceIssue[] {
  const rows = isRecord(json) ? json.issues : undefined
  if (!Array.isArray(rows)) return []
  const out: SourceIssue[] = []
  for (const row of rows) {
    if (!isRecord(row)) continue
    const { name, importance, crawled, is_indexable } = row
    if (typeof name !== 'string' || typeof importance !== 'string') continue
    if (typeof crawled !== 'number' || !(crawled > 0)) continue
    out.push({
      source: 'ahrefs',
      nativeName: is_indexable === false ? `${name} (not indexable)` : name,
      nativeSeverity: importance,
      urlCount: crawled,
    })
  }
  return out
}

function retryDelayMs(header: string | null): number {
  if (!header) return DEFAULT_RETRY_MS
  const secs = Number(header)
  const ms = Number.isFinite(secs) ? secs * 1000 : Date.parse(header) - Date.now()
  if (!Number.isFinite(ms)) return DEFAULT_RETRY_MS
  return Math.min(Math.max(ms, 0), MAX_RETRY_MS)
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

type Attempt = { status: number; retryAfter: string | null; data?: unknown }

async function readBody(res: Response, race: <T>(p: Promise<T>) => Promise<T>): Promise<string> {
  const declared = Number(res.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    void res.body?.cancel().catch(() => undefined)
    throw new Error('Ahrefs response too large')
  }
  if (!res.body) return race(res.text())
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await race(reader.read())
    if (done) break
    total += value.byteLength
    if (total > MAX_BODY_BYTES) {
      void reader.cancel().catch(() => undefined)
      throw new Error('Ahrefs response too large')
    }
    chunks.push(value)
  }
  const dec = new TextDecoder()
  return chunks.map((c) => dec.decode(c, { stream: true })).join('') + dec.decode()
}

/** One request; a single deadline covers headers, body read and JSON.parse. */
async function attempt(url: string, key: string, timeoutMs: number): Promise<Attempt> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  const aborted = new Promise<never>((_, rej) =>
    ctrl.signal.addEventListener('abort', () => rej(new Error('Ahrefs timeout'))),
  )
  aborted.catch(() => undefined)
  const race = <T,>(p: Promise<T>): Promise<T> => Promise.race([p, aborted])
  try {
    let res: Response
    try {
      res = await race(
        fetch(url, { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' }, signal: ctrl.signal }),
      )
    } catch (e) {
      // Never forward the underlying message: it may echo request headers.
      throw new Error(ctrl.signal.aborted ? 'Ahrefs timeout' : 'Ahrefs request failed')
    }
    if (!res.ok) {
      void res.body?.cancel().catch(() => undefined)
      return { status: res.status, retryAfter: res.headers.get('Retry-After') }
    }
    const text = await readBody(res, race).catch((e: unknown) => {
      if (e instanceof Error && e.message.startsWith('Ahrefs ')) throw e
      throw new Error(ctrl.signal.aborted ? 'Ahrefs timeout' : 'Ahrefs request failed')
    })
    try {
      return { status: res.status, retryAfter: null, data: JSON.parse(text) }
    } catch {
      throw new Error('Ahrefs invalid JSON response')
    }
  } finally {
    clearTimeout(timer)
    ctrl.abort()
  }
}

/** GET with a single retry on 429/5xx inside a total budget. Errors carry only the status. */
async function ahrefsGet(path: string, params: Record<string, string>, key: string): Promise<unknown> {
  const url = `${BASE}/${path}?${new URLSearchParams(params).toString()}`
  const start = Date.now()
  let r = await attempt(url, key, Math.min(TIMEOUT_MS, TOTAL_BUDGET_MS))
  if (r.status === 429 || r.status >= 500) {
    const delay = r.status === 429 ? retryDelayMs(r.retryAfter) : DEFAULT_RETRY_MS
    const remaining = TOTAL_BUDGET_MS - (Date.now() - start) - delay
    if (remaining > 0) {
      await sleep(delay)
      r = await attempt(url, key, Math.min(TIMEOUT_MS, remaining))
    }
  }
  if (r.status < 200 || r.status >= 300) throw new Error(`Ahrefs ${r.status}`)
  return r.data
}

export async function fetchAhrefs(
  projectId: string,
  snapshotDate: string,
): Promise<{ raw: Uint8Array; result: Parsed<AhrefsResult> }> {
  const key = process.env.AHREFS_API_KEY
  if (!key) throw new Error('Missing AHREFS_API_KEY')
  const params = { project_id: projectId, date: `${snapshotDate}T23:59:59` }

  const projects = await ahrefsGet('site-audit/projects', params, key)
  const parsed = parseAhrefsProjects(projects, snapshotDate)
  if (!parsed.ok) return { raw: encode({ projects }), result: parsed }

  const issues = await ahrefsGet('site-audit/issues', params, key)
  return {
    raw: encode({ projects, issues }),
    result: { ok: true, value: { ...parsed.value, issues: parseAhrefsIssues(issues) } },
  }
}

const encode = (v: unknown) => new TextEncoder().encode(JSON.stringify(v))
