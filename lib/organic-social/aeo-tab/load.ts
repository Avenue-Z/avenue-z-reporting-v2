// lib/organic-social/aeo-tab/load.ts
// The AEO Informed Social tab's live read: one adapter call per view, cached, with the caller's deadline (spec
// docs/superpowers/specs/2026-11-12-aeo-informed-social-tab-design.md, section 4). A window of a locked month goes through the lock instead
// (data.ts, plan Task 7); this is every other window. Server only: it reads the Peec key from the environment.
import { after } from 'next/server'
import { cached } from '@/lib/cache'
import { AeoGateError, PeecSelectorError, getAeoInformedSocial, graphOrder, type AeoInformedInput, type AeoInformedResult, type FourthGraph, type GraphId } from '@/lib/organic-social/aeo-informed'
import { graphViews, type AeoRange } from './params'
import type { AeoInformedSetting } from './setting'

/** What the tab shows and stores: the adapter's result without socialsAll, every tagged URL, which the tab does not show and which alone is
 *  4.4 MB for a year (docs/findings/2026-11-12-aeo-tab-result-size.md). */
export type AeoTabResult = Omit<AeoInformedResult, 'socialsAll'>
export type AeoTabLoad = { kind: 'ok'; result: AeoTabResult } | { kind: 'no-chats' } | { kind: 'error'; reason: 'timeout' | 'error' }

export function toTabResult(r: AeoInformedResult): AeoTabResult {
  return { socialsOwn: r.socialsOwn, socialsCompetitor: r.socialsCompetitor, urlGaps: r.urlGaps, graphs: r.graphs, totals: r.totals, meta: r.meta }
}

/** The adapter's own whole-call budget. Longer than any caller waits (page 120 s, export 30 s), so a caller that stops waiting does not cut
 *  off a pull the cache still wants, and under the 300 s the function runs for (docs/findings/2026-11-12-aeo-tab-page-time-limit.md). */
export const PULL_BUDGET_MS = 240_000
/** Next's data cache refuses an item over 2 MB; warn well before. */
const WARN_BYTES = 1.5 * 1024 * 1024

/** Every input that changes the answer, plus the slug and range for the log line (the slug is one-to-one with the project and the range with
 *  the window, so neither splits an entry in practice). Never the key. */
export type PullArgs = { slug: string; range: AeoRange; projectId: string; selector: string; window: { start: string; end: string }; asOf: string; min: number; fourthGraph: FourthGraph }

/** How the tab selects its sources in Peec: Jasmine's "Organic Social" SOURCE TAG, the one she applies (outline P010; spec
 *  2026-11-13). One constant, used by the adapter call below and by the lock key (data.ts aeoLockKey), so the two cannot drift.
 *  Measured 2026-11-13: the tag and the old domain classification selected identical results in every pull and view. */
export const AEO_TAB_SELECTOR_VIA = 'tag' as const

/** Whether a view compares with the previous window: MoM only, the one range that shows a change (params.ts aeoWindow, previousDays).
 *  YTD and All time would pull a previous window as long as themselves and never show it (issue 451). The lock key (data.ts) holds it too,
 *  because in January MoM and YTD are the same window. */
export const comparesPrevious = (range: AeoRange): boolean => range === 'month'

/** The adapter call for one view: both tables over the window, the four graphs weekly from its start, the key from the environment. The
 *  cached pull and the lock capture (data.ts) both use it, so a locked month is asked for exactly as a live one is. */
export function adapterInput(a: PullArgs): AeoInformedInput {
  const graph = graphViews(a.window)
  const graphs = Object.fromEntries(graphOrder(a.fourthGraph).map((id) => [id, graph])) as Partial<Record<GraphId, { from: string; weeks: number }>>
  return {
    apiKey: process.env.PEEC_AI_CUSTOMER_TOKEN ?? '',
    projectId: a.projectId,
    asOf: a.asOf,
    views: { socials: a.window, gaps: a.window, graphs },
    selector: { name: a.selector, via: AEO_TAB_SELECTOR_VIA },
    minCompetitors: a.min,
    fourthGraph: a.fourthGraph,
    deadlineMs: PULL_BUDGET_MS,
    compare: comparesPrevious(a.range),
  }
}

/** Logs a stored result near Next's 2 MB cache item, which both the cache and the lock store's cached read keep. */
export function warnIfLarge(result: AeoTabResult, a: { slug: string; range: AeoRange; min: number }): void {
  const bytes = Buffer.byteLength(JSON.stringify(result), 'utf8')
  if (bytes > WARN_BYTES) console.warn(`[aeo-informed] result near the 2 MB cache limit slug=${a.slug} range=${a.range} min=${a.min} size_kb=${Math.round(bytes / 1024)}`)
}

async function pull(a: PullArgs): Promise<AeoTabResult> {
  const result = toTabResult(await getAeoInformedSocial(adapterInput(a)))
  warnIfLarge(result, a)
  return result
}

// A finished month does not change much (Peec adds a few late citations); the month in progress gains a day every day.
// v2 (spec 2026-11-13): answers cached before the tab filtered on the source tag are never served after it.
const pull6h = cached('peec', 'aeoInformedSocial:6h', pull, { ttlSeconds: 21_600, healthCritical: true, version: 'v2' })
const pull1h = cached('peec', 'aeoInformedSocial:1h', pull, { ttlSeconds: 3_600, healthCritical: true, version: 'v2' })

/** 6h for a window that ended before the current UTC month, 1h otherwise. `today` is the UTC date. */
export function cacheTtlFor(windowEnd: string, today: string): '6h' | '1h' {
  return windowEnd < `${today.slice(0, 7)}-01` ? '6h' : '1h'
}

export class AeoDeadlineError extends Error {
  constructor(ms: number) { super(`the AEO pull took longer than ${ms} ms`); this.name = 'AeoDeadlineError' }
}

/** Hands a pull the caller stopped waiting for to after(), the only work Vercel keeps running once the response has ended (#450; Next's
 *  after.md: Server Components, and waitUntil for the route's max duration). The task never rejects: Next logs a rejected after() task
 *  with the whole error (after-context.js), and an adapter error's message can name the project. Outside a request after() throws; there is
 *  nothing to keep alive then, and the viewer's timeout card must not become a crash. */
function keepAlive(work: Promise<unknown>): void {
  try {
    after(() => work.then(() => undefined, () => undefined))
  } catch {
    // Not in a request (a script or a test): nothing to keep alive.
  }
}

/** The caller's deadline around the (possibly cached) pull. The timer is always cleared; a pull that loses keeps running, kept alive with
 *  after(), so its answer can still land in the cache, and its rejection is handled so it is never unhandled. */
export async function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { keepAlive(work); reject(new AeoDeadlineError(ms)) }, ms) })
  work.catch(() => {})
  try {
    return await Promise.race([work, timeout])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * One view of the tab. A window with no chats (gate rule view.no-chats) is `no-chats`, not a failure. A pull past `deadlineMs` is a timeout;
 * anything else is an error. A failure logs one line with the slug, range, min and the error's name (and a gate error's rule codes), never
 * its message, the project id or the key.
 */
export async function loadAeoTab(a: {
  slug: string; projectId: string; setting: AeoInformedSetting; window: { start: string; end: string }; asOf: string; min: number; range: AeoRange; deadlineMs: number; today: string
}): Promise<AeoTabLoad> {
  const fail = (name: string, reason: 'timeout' | 'error'): AeoTabLoad => {
    console.error(`[aeo-informed] load failed slug=${a.slug} range=${a.range} min=${a.min} error=${name}`)
    return { kind: 'error', reason }
  }
  if (!process.env.PEEC_AI_CUSTOMER_TOKEN) return fail('PeecKeyMissing', 'error')
  const args: PullArgs = { slug: a.slug, range: a.range, projectId: a.projectId, selector: a.setting.selector, window: a.window, asOf: a.asOf, min: a.min, fourthGraph: a.setting.fourthGraph }
  try {
    const run = cacheTtlFor(a.window.end, a.today) === '6h' ? pull6h : pull1h
    return { kind: 'ok', result: await withDeadline(run(args), a.deadlineMs) }
  } catch (e) {
    const f = failureOf(e)
    return f.kind === 'no-chats' ? f : fail(f.name, f.reason)
  }
}

/** How a failed pull reaches the section: a window with no chats (gate rule view.no-chats, which other rules cascade from) is no-chats; a
 *  missed deadline a timeout; anything else an error. `name` is what a log line may say: the error's name, a gate error's rule codes, and a
 *  selector error's kind (missing or duplicate, issue 457), never its message. */
export function failureOf(e: unknown): { kind: 'no-chats' } | { kind: 'error'; reason: 'timeout' | 'error'; name: string } {
  if (e instanceof AeoDeadlineError) return { kind: 'error', reason: 'timeout', name: e.name }
  if (e instanceof AeoGateError) {
    const codes = e.report.errors.map((v) => v.code)
    if (codes.includes('view.no-chats')) return { kind: 'no-chats' }
    return { kind: 'error', reason: 'error', name: `AeoGateError codes=${[...new Set(codes)].join(',')}` }
  }
  if (e instanceof PeecSelectorError) return { kind: 'error', reason: 'error', name: `${e.name} reason=${e.kind}` }
  return { kind: 'error', reason: 'error', name: e instanceof Error ? e.name : 'Error' }
}
