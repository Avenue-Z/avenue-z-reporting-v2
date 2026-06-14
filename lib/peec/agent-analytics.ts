// ─── Peec Agent Analytics Client ─────────────────────────────────────────────
//
// Reads AI bot crawl data from the Peec customer API.
// Uses the CUSTOMER key (skc-) — separate from the brand-visibility pitch key.
//
// ACTUAL API shape (verified live against Avenue Z project):
//
//   GET /customer/v1/agent-analytics/logs?project_id=...&start_date=...&end_date=...
//     Returns { data: RawLog[], totalCount: number }
//     Each log entry: bot_id, timestamp, request_method, request_host,
//       request_path, response_status, user_agent, client_ip, referer
//
//   GET /customer/v1/agent-analytics/visits?project_id=...&start_date=...&end_date=...
//     Returns { data: [{ visits: N }], totalCount: 1 }
//     Only aggregate total — NOT per-bot breakdown.
//
//   GET /customer/v1/agent-analytics/bots (no project filter)
//     Returns a STATIC CATALOG of known AI bots — NOT per-project visit data.
//     Used only to enrich bot display names.
//
// The /logs endpoint is the authoritative source for all per-bot analytics.
// We aggregate logs client-side to produce per-bot stats, top paths, etc.
//
// Env vars:
//   PEEC_AI_CUSTOMER_TOKEN                          — skc- key (shared)
//   PEEC_AI_CUSTOMER_PROJECT_ID_{SLUG_UPPER}        — per-client project ID
//     e.g. PEEC_AI_CUSTOMER_PROJECT_ID_AVENUE_Z=or_043ae735-...
// ─────────────────────────────────────────────────────────────────────────────

import { getClientBySlug } from '@/lib/db/queries'
import { cached } from '@/lib/cache'
import { urlJoinKey } from '@/lib/url'

// ── Config / auth ─────────────────────────────────────────────────────────────

const BASE_URL = 'https://api.peec.ai/customer/v1'

function getCustomerToken(): string {
  const t = process.env.PEEC_AI_CUSTOMER_TOKEN
  if (!t) throw new Error('Missing env var: PEEC_AI_CUSTOMER_TOKEN')
  return t
}

// Project IDs come from the database — not secrets, no per-client env var needed.
async function getProjectId(clientSlug: string): Promise<string> {
  const config = await getClientBySlug(clientSlug)
  if (!config) throw new Error(`Unknown client: ${clientSlug}`)
  if (!config.peecCustomerProjectId) {
    throw new Error(`peecCustomerProjectId not configured for client: ${clientSlug}. Add it to the database.`)
  }
  return config.peecCustomerProjectId
}

// ── Raw API types ─────────────────────────────────────────────────────────────

interface RawLog {
  bot_id:           string
  timestamp:        string    // "2026-05-21 23:26:39.626"
  request_method:   string
  request_host:     string
  request_path:     string
  response_status:  number
  user_agent?:      string
  client_ip?:       string
  referer?:         string
}

interface RawBotCatalog {
  id:        string
  provider?: string
  type?:     string   // "training" | "retrieval" | "search" | ...
}

// ── Per-path-per-bot visit types and pure helpers ─────────────────────────────

export type RawVisitRow = { bot_id: string; request_path: string; time_bucket: string; visits: number }

export type PathBot = {
  botId: string
  provider: string | null
  type: string | null
  visits: number
  lastSeen: string | null
}
export type PathAgg = {
  totalVisits: number
  byType: { training: number; indexing: number; other: number }
  bots: PathBot[]
}

export function bucketBotType(type: string | null): 'training' | 'indexing' | 'other' {
  if (type === 'training') return 'training'
  if (type === 'search' || type === 'userQuery') return 'indexing'
  return 'other'
}

/** Aggregate /agent-analytics/visits rows (grouped by bot_id+request_path+day)
 *  into a per-path map keyed by urlJoinKey(request_path). */
export function aggregateVisitsByPath(
  rows: RawVisitRow[],
  catalog: Map<string, { provider?: string; type?: string }>,
): Record<string, PathAgg> {
  // key -> bot_id -> accumulator
  const paths = new Map<string, Map<string, { visits: number; lastSeen: string }>>()
  for (const r of rows) {
    const key = urlJoinKey(r.request_path)
    if (!key) continue
    const day = r.time_bucket.slice(0, 10)
    if (!paths.has(key)) paths.set(key, new Map())
    const bots = paths.get(key)!
    const cur = bots.get(r.bot_id) ?? { visits: 0, lastSeen: day }
    cur.visits += r.visits
    if (day > cur.lastSeen) cur.lastSeen = day
    bots.set(r.bot_id, cur)
  }
  const out: Record<string, PathAgg> = {}
  for (const [key, bots] of paths) {
    const list: PathBot[] = Array.from(bots.entries())
      .map(([botId, acc]) => ({
        botId,
        provider: catalog.get(botId)?.provider ?? null,
        type: catalog.get(botId)?.type ?? null,
        visits: acc.visits,
        lastSeen: acc.lastSeen || null,
      }))
      .sort((a, b) => b.visits - a.visits)
    const byType = { training: 0, indexing: 0, other: 0 }
    let total = 0
    for (const b of list) { byType[bucketBotType(b.type)] += b.visits; total += b.visits }
    out[key] = { totalVisits: total, byType, bots: list }
  }
  return out
}

// ── Exported types ────────────────────────────────────────────────────────────

export interface AgentBot {
  botId:        string
  botName:      string        // human-readable display name
  provider:     string | null
  botType:      string | null // "training" | "retrieval" | "search"
  totalVisits:  number
  uniquePages:  number
  successRate:  number        // fraction of visits returning 2xx (0–1)
  lastSeen:     string | null
}

export interface BotVisit {
  botId:          string
  path:           string
  visitCount:     number
  responseStatus: number
  lastVisit:      string | null
}

export interface AgentAnalyticsData {
  bots:                  AgentBot[]
  topPaths:              { path: string; visits: number; status: number }[]
  totalBotVisits:        number
  uniquePagesVisited:    number
  errorPageHits:         number    // visits returning 4xx or 5xx
  redirectHits:          number    // visits returning 3xx
  robotsTxtHits:         number    // visits to /robots.txt
  highValuePageBotHits:  number    // visits to non-utility pages
  /** map of bot_id -> total visit count */
  visitsByBot: Record<string, number>
  /** The raw window: start/end dates used for this query */
  window: { startDate: string; endDate: string }
  /** Per-path-per-bot crawl breakdown, keyed by urlJoinKey(request_path). */
  byPath: Record<string, PathAgg>
}

// ── Friendly display names (augmented by /bots catalog at runtime) ───────────

const STATIC_BOT_NAMES: Record<string, string> = {
  'OAI-SearchBot':          'OpenAI SearchBot',
  'GPTBot':                 'GPTBot',
  'Claude-User':            'Claude (User)',
  'ClaudeBot':              'Claude (Crawler)',
  'PerplexityBot':          'PerplexityBot',
  'Googlebot':              'Googlebot',
  'Bingbot':                'Bingbot',
  'CCBot':                  'Common Crawl',
  'Applebot':               'Applebot',
  'DuckDuckBot':            'DuckDuckBot',
  'meta-externalagent':     'Meta AI',
  'Bytespider':             'ByteDance / TikTok',
  'Amazonbot':              'Amazonbot',
  'Ai2Bot':                 'Allen Institute AI',
  'Ai2Bot-Dolma':           'Allen Institute AI (Dolma)',
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function agentGet<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const token = getCustomerToken()
  const url   = new URL(`${BASE_URL}${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  const res = await fetch(url.toString(), {
    headers: { 'X-API-Key': token },
    next:    { revalidate: 3600 },
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Peec ${res.status} ${path}: ${txt.slice(0, 300)}`)
  }

  return res.json() as Promise<T>
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

function last30Days(): { start_date: string; end_date: string } {
  const end   = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 29)
  return { start_date: isoDate(start), end_date: isoDate(end) }
}

// ── Bot catalog (non-blocking — enriches display names) ──────────────────────

let _botCatalog: Map<string, RawBotCatalog> | null = null

async function getBotCatalog(projectId: string): Promise<Map<string, RawBotCatalog>> {
  if (_botCatalog) return _botCatalog
  try {
    // /bots requires project_id — returns top-level array of known bot objects
    const res = await agentGet<{ data?: RawBotCatalog[] } | RawBotCatalog[]>(
      '/agent-analytics/bots',
      { project_id: projectId },
    )
    const arr = Array.isArray(res) ? res : (res.data ?? [])
    _botCatalog = new Map(arr.map((b) => [b.id, b]))
  } catch {
    // Non-fatal — fall back to STATIC_BOT_NAMES display names
    _botCatalog = new Map()
  }
  return _botCatalog
}

function botDisplayName(botId: string, catalog: Map<string, RawBotCatalog>): string {
  return STATIC_BOT_NAMES[botId] ?? catalog.get(botId)?.provider ?? botId
}

async function fetchVisitRows(projectId: string, start: string, end: string): Promise<RawVisitRow[]> {
  const url = new URL(`${BASE_URL}/agent-analytics/visits`)
  url.searchParams.set('project_id', projectId)
  url.searchParams.set('start_date', start)
  url.searchParams.set('end_date', end)
  url.searchParams.append('group_by', 'bot_id')
  url.searchParams.append('group_by', 'request_path')
  url.searchParams.set('time_bucket', 'day')
  url.searchParams.set('limit', '10000')
  const res = await fetch(url.toString(), { headers: { 'X-API-Key': getCustomerToken() }, cache: 'no-store' })
  if (!res.ok) return []   // degrade: byPath stays empty, never throws the whole report
  const json = await res.json() as { data?: RawVisitRow[] } | RawVisitRow[]
  return Array.isArray(json) ? json : (json.data ?? [])
}

// ── Core aggregation ──────────────────────────────────────────────────────────

const LOW_VALUE_PATHS = new Set([
  '/robots.txt', '/sitemap.xml', '/sitemap_index.xml',
  '/sitemap', '/favicon.ico', '/humans.txt',
])

function isLowValue(path: string): boolean {
  return LOW_VALUE_PATHS.has(path) || path.startsWith('/sitemap')
}

// ── Main export ───────────────────────────────────────────────────────────────

async function getAgentAnalyticsImpl(clientSlug: string): Promise<AgentAnalyticsData> {
  const projectId = await getProjectId(clientSlug)
  const { start_date, end_date } = last30Days()

  // Fetch logs, bot catalog, and visit rows in parallel
  const [logsResult, catalog, visitRows] = await Promise.all([
    agentGet<{ data?: RawLog[] } | RawLog[]>(
      '/agent-analytics/logs',
      { project_id: projectId, start_date, end_date, limit: '10000' },
    ),
    getBotCatalog(projectId),
    fetchVisitRows(projectId, start_date, end_date),
  ])

  const logs: RawLog[] = Array.isArray(logsResult)
    ? logsResult
    : (logsResult.data ?? [])

  // ── Aggregate per-bot stats ─────────────────────────────────────────────────
  const botMap: Record<string, {
    visits:       number
    pages:        Set<string>
    ok:           number   // 2xx
    lastSeen:     string
  }> = {}

  // ── Aggregate per-path stats ────────────────────────────────────────────────
  const pathMap: Record<string, { visits: number; status: number }> = {}

  let errorPageHits        = 0
  let redirectHits         = 0
  let robotsTxtHits        = 0
  let highValuePageBotHits = 0

  for (const log of logs) {
    const { bot_id, request_path, response_status, timestamp } = log

    // Per-bot
    if (!botMap[bot_id]) {
      botMap[bot_id] = { visits: 0, pages: new Set(), ok: 0, lastSeen: timestamp }
    }
    botMap[bot_id].visits++
    botMap[bot_id].pages.add(request_path)
    if (response_status >= 200 && response_status < 300) botMap[bot_id].ok++
    if (timestamp > botMap[bot_id].lastSeen) botMap[bot_id].lastSeen = timestamp

    // Per-path (use latest response_status seen for a path)
    if (!pathMap[request_path]) pathMap[request_path] = { visits: 0, status: response_status }
    pathMap[request_path].visits++
    pathMap[request_path].status = response_status

    // Derived counters
    if (response_status >= 400)                          errorPageHits++
    if (response_status >= 300 && response_status < 400) redirectHits++
    if (request_path === '/robots.txt')                  robotsTxtHits++
    if (!isLowValue(request_path))                       highValuePageBotHits++
  }

  // ── Build bots array ────────────────────────────────────────────────────────
  const bots: AgentBot[] = Object.entries(botMap)
    .map(([botId, stats]) => ({
      botId,
      botName:     botDisplayName(botId, catalog),
      provider:    catalog.get(botId)?.provider ?? null,
      botType:     catalog.get(botId)?.type     ?? null,
      totalVisits: stats.visits,
      uniquePages: stats.pages.size,
      successRate: stats.visits > 0 ? stats.ok / stats.visits : 0,
      lastSeen:    stats.lastSeen || null,
    }))
    .sort((a, b) => b.totalVisits - a.totalVisits)

  // ── Top 10 paths ────────────────────────────────────────────────────────────
  const topPaths = Object.entries(pathMap)
    .map(([path, d]) => ({ path, visits: d.visits, status: d.status }))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 10)

  const visitsByBot: Record<string, number> = {}
  for (const b of bots) visitsByBot[b.botId] = b.totalVisits

  const byPath = aggregateVisitsByPath(visitRows, catalog)

  return {
    bots,
    topPaths,
    totalBotVisits:       logs.length,
    uniquePagesVisited:   new Set(logs.map((l) => l.request_path)).size,
    errorPageHits,
    redirectHits,
    robotsTxtHits,
    highValuePageBotHits,
    visitsByBot,
    window: { startDate: start_date, endDate: end_date },
    byPath,
  }
}

// ── Robots.txt status derivation ──────────────────────────────────────────────
//
// Derive AEO robots.txt status from real bot behavior:
//   pass    = bots are visiting AND getting 2xx on content pages
//   warn    = bots are visiting but all/most hits are 3xx redirects
//   fail    = bots are hitting 4xx/5xx
//   pending = no bot visits at all

export const getAgentAnalytics = cached(
  'peec',
  'getAgentAnalytics',
  getAgentAnalyticsImpl,
  {
    // v2: response shape gained `byPath` (per-path-per-bot). Bumping the cache
    // version invalidates pre-change entries that lacked it — without this, a
    // persisted Data Cache object is served to new code that reads byPath.
    version: 'v2',
    extractTags: ([clientSlug]) => ({ client: clientSlug }),
  },
)

export function deriveRobotsTxtStatus(
  data: AgentAnalyticsData,
): 'pass' | 'fail' | 'warn' | 'pending' {
  if (data.totalBotVisits === 0) return 'pending'
  if (data.errorPageHits > data.totalBotVisits * 0.5)    return 'fail'
  if (data.redirectHits  >= data.totalBotVisits * 0.8)   return 'warn'
  if (data.highValuePageBotHits > 0)                     return 'pass'
  return 'warn'
}
