import type { AhrefsResult, Parsed, SourceIssue } from './types'

const BASE = 'https://api.ahrefs.com/v3'
const TIMEOUT_MS = 15_000
const DEFAULT_RETRY_MS = 2_000
const MAX_RETRY_MS = 30_000
const WINDOW_DAYS = 7
const DAY_MS = 86_400_000

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** True when the crawl's UTC day is on or before the snapshot day and no more than 7 days earlier. */
export function pickAhrefsCrawl(crawlDate: string, snapshotDate: string): boolean {
  const crawl = Date.parse(crawlDate)
  const snap = Date.parse(snapshotDate.slice(0, 10))
  if (Number.isNaN(crawl) || Number.isNaN(snap)) return false
  const diffDays = (snap - Math.floor(crawl / DAY_MS) * DAY_MS) / DAY_MS
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

async function attempt(url: string, key: string): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' }, signal: ctrl.signal })
  } catch {
    // Never forward the underlying message: it may echo request headers.
    throw new Error(ctrl.signal.aborted ? 'Ahrefs timeout' : 'Ahrefs request failed')
  } finally {
    clearTimeout(timer)
  }
}

/** GET with a single retry on 429/5xx. Errors carry only the status. */
async function ahrefsGet(path: string, params: Record<string, string>, key: string): Promise<unknown> {
  const url = `${BASE}/${path}?${new URLSearchParams(params).toString()}`
  let res = await attempt(url, key)
  if (res.status === 429 || res.status >= 500) {
    await sleep(res.status === 429 ? retryDelayMs(res.headers.get('Retry-After')) : DEFAULT_RETRY_MS)
    res = await attempt(url, key)
  }
  if (!res.ok) throw new Error(`Ahrefs ${res.status}`)
  try {
    return await res.json()
  } catch {
    throw new Error('Ahrefs invalid JSON response')
  }
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
