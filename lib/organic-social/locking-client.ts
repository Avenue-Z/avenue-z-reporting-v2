// Lock every number (D27, D28): the one place every Organic Social number passes through. For a
// client on locked months, a read whose dates are all locked days is answered from
// dash_response_locks; the first such read stores Dash's complete, successful answer. Fail closed:
// a lock-table failure is an error, never a quiet fallback to live numbers.
import type { DashSocialClient } from '@/lib/dash-social/client'
import type { ContentResponse, ReportsDataParams, ReportsDataResponse } from '@/lib/dash-social/types'
import { priorParams, requestKey, requestPeriodEnd } from './lock-day'
import { readLock, writeLock } from './response-lock-store'

export type DashReader = Pick<DashSocialClient, 'getReportsData' | 'getContent' | 'getMedia'>
type Opts = { clientId: string; slug: string; settled: string | null; late: (periodEnd: string) => boolean }
/** `capture` is the reader the FIRST read of a locked month goes through: a second client whose
 *  fetches cannot be served from Next's data cache. It has no default on purpose. Dash calls carry
 *  `next: { revalidate: 3600 }`, and on a dynamic request Next serves an expired entry stale while
 *  it revalidates behind it, so a capture through the ordinary client can store an answer Dash gave
 *  days earlier and lock it forever, which is exactly what locking on the 5th (D27) exists to
 *  prevent. Defaulting this to `inner` would reinstate that silently, so every caller names it. */
type Deps = { read: typeof readLock; write: typeof writeLock; capture: DashReader }

/** Account-level metrics: Dash reports them every day for a connected account, whether or not
 *  anything was posted. Probed 2026-09-24 in the tiles' request shape, with and without
 *  prior-period dates, on every channel tab of the October clients, including many days with no
 *  posts: none of these was ever null, value or prior, on a channel that requests it, while every
 *  post-level metric was null on the no-post days. So a null here is a transient blank from
 *  Dash, not a quiet month, and locking it would show a wrong number for good (it happened on
 *  staging: a follower tile locked as 0). */
const ACCOUNT_METRICS: readonly string[] = ['TOTAL_FOLLOWERS', 'NET_NEW_FOLLOWERS', 'PROFILE_VIEWS', 'PAGE_VIEWS_ALL_POSTS']

/** The shape every reader needs (headlines.ts:41, followers.ts:41, trends.ts:40, the outline
 *  getters), so an incomplete 200 is never locked. */
export function completeReportsData(p: ReportsDataParams, res: unknown): boolean {
  const data = (res as { data?: unknown } | null)?.data as Record<string, unknown> | undefined
  if (!data || typeof data !== 'object') return false
  if (p.reportType === 'GRAPH') {
    const m = data.metrics as Record<string, unknown> | undefined
    // ALL_CHANNELS is the key both graph getters read (followers.ts:41, trends.ts:41). A metric
    // present but shaped any other way draws an empty chart, so it is not a lockable answer.
    return !!m && p.metrics.every((k) => {
      const entry = m[k]
      return !!entry && typeof entry === 'object' && 'ALL_CHANNELS' in entry
    })
  }
  const brand = data[String(p.brandId)] as { metrics?: Record<string, unknown> } | undefined
  if (!brand) return false
  // Compared as a string on purpose: PR 255 adds this report type to the union in
  // lib/dash-social/types.ts, which this branch must not edit. A media answer carries its numbers
  // per media type, not under the brand's metrics, so the brand entry is the whole check.
  if (String(p.reportType) === 'MULTI_METRIC_MEDIA_TYPE') return true
  if (!brand.metrics || !p.metrics.every((k) => k in brand.metrics!)) return false
  // A requested account-level metric without a value is a transient blank (see ACCOUNT_METRICS).
  return p.metrics.every((k) => !ACCOUNT_METRICS.includes(k)
    || (brand.metrics![k] as { value?: unknown } | null | undefined)?.value != null)
}
export function completeContent(res: unknown): boolean {
  return Array.isArray((res as { data?: { content?: unknown } } | null)?.data?.content)
}

/** Pure. Wherever the answer has `value` and `context`, the context becomes the prior answer's
 *  `value` at the same path, so a month's comparison uses the prior month's locked number. */
export function withLockedBaseline(answer: unknown, prior: unknown): unknown {
  if (!answer || typeof answer !== 'object' || Array.isArray(answer) || !prior || typeof prior !== 'object') return answer
  const a = answer as Record<string, unknown>
  const p = prior as Record<string, unknown>
  // context_change is Dash's percentage against ITS context, which we just replaced: keep the
  // shape, drop the stale number. Nothing reads it (delta() recomputes from value and context).
  if ('value' in a && 'context' in a && 'value' in p) {
    return { ...a, context: p.value, ...('context_change' in a ? { context_change: null } : {}) }
  }
  return Object.fromEntries(Object.entries(a).map(([k, v]) => [k, k in p ? withLockedBaseline(v, p[k]) : v]))
}

export function lockingClient(inner: DashReader, opts: Opts, deps: Deps): DashReader {
  const tag = (end: string, key: string) => `slug=${opts.slug} period_end=${end} key=${key.slice(0, 12)}`
  async function locked<T>(method: string, params: object, complete: (res: unknown) => boolean, live: () => Promise<T>, capture: () => Promise<T>): Promise<T> {
    const p = params as Record<string, unknown>
    const end = requestPeriodEnd(p)
    if (!end || !opts.settled || end > opts.settled) return live()
    const key = requestKey(method, p)
    let answer: unknown
    // Fail closed, and say so: a lock store outage must never quietly serve live numbers, and on
    // Overview the per-channel error policy swallows the throw, so the log line is the only signal.
    const store = async <R>(what: string, run: () => Promise<R>): Promise<R> => {
      try { return await run() } catch (e) { console.error(`[organic-social] lock store ${what} failed ${tag(end, key)}`); throw e }
    }
    const hit = await store('read', () => deps.read(opts.clientId, key))
    if (hit) {
      answer = hit.response
    } else {
      // Not `live()`: the answer about to be stored permanently must come from Dash now, not from
      // whatever the data cache still holds. And unlike the reads around it, a failure here is
      // otherwise silent, because the sweep that drives most captures is a cron whose pages return
      // 200 even when a part errors, so nothing would report that a month went uncaptured.
      let res: T
      try {
        res = await capture()
      } catch (e) {
        console.error(`[organic-social] lock capture failed ${tag(end, key)}`)
        throw e
      }
      if (!complete(res)) {
        console.warn(`[organic-social] lock skipped (incomplete answer) ${tag(end, key)}`)
        return res
      }
      answer = await store('write', () => deps.write(opts.clientId, key, end, res))
      if (opts.late(end)) console.warn(`[organic-social] late lock ${tag(end, key)}`)
    }
    const prior = priorParams(p)
    if (prior) {
      const before = await store('read', () => deps.read(opts.clientId, requestKey(method, prior)))
      if (before) answer = withLockedBaseline(answer, before.response)
    }
    return answer as T
  }
  const reader: DashReader = {
    getReportsData<M = unknown>(p: ReportsDataParams): Promise<ReportsDataResponse<M>> {
      return locked('getReportsData', p, (r) => completeReportsData(p, r),
        () => inner.getReportsData<M>(p), () => deps.capture.getReportsData<M>(p))
    },
    getContent(p: Parameters<DashReader['getContent']>[0]): Promise<ContentResponse> {
      return locked('getContent', p, completeContent, () => inner.getContent(p), () => deps.capture.getContent(p))
    },
    getMedia(p: Parameters<DashReader['getMedia']>[0]) {
      return inner.getMedia(p)
    },
  }
  return reader
}
