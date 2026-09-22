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

/** The shape every reader needs (headlines.ts:41, followers.ts:41, trends.ts:40, the outline
 *  getters), so an incomplete 200 is never locked. */
export function completeReportsData(p: ReportsDataParams, res: unknown): boolean {
  const data = (res as { data?: unknown } | null)?.data as Record<string, unknown> | undefined
  if (!data || typeof data !== 'object') return false
  if (p.reportType === 'GRAPH') {
    const m = data.metrics as Record<string, unknown> | undefined
    return !!m && p.metrics.every((k) => m[k] != null)
  }
  const brand = data[String(p.brandId)] as { metrics?: Record<string, unknown> } | undefined
  if (!brand) return false
  // Compared as a string on purpose: PR 255 adds this report type to the union in
  // lib/dash-social/types.ts, which this branch must not edit. A media answer carries its numbers
  // per media type, not under the brand's metrics, so the brand entry is the whole check.
  if (String(p.reportType) === 'MULTI_METRIC_MEDIA_TYPE') return true
  return !!brand.metrics && p.metrics.every((k) => k in brand.metrics!)
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
  if ('value' in a && 'context' in a && 'value' in p) return { ...a, context: p.value }
  return Object.fromEntries(Object.entries(a).map(([k, v]) => [k, k in p ? withLockedBaseline(v, p[k]) : v]))
}

export function lockingClient(inner: DashReader, opts: Opts, deps = { read: readLock, write: writeLock }): DashReader {
  const tag = (end: string, key: string) => `slug=${opts.slug} period_end=${end} key=${key.slice(0, 12)}`
  async function locked<T>(method: string, params: object, complete: (res: unknown) => boolean, live: () => Promise<T>): Promise<T> {
    const p = params as Record<string, unknown>
    const end = requestPeriodEnd(p)
    if (!end || !opts.settled || end > opts.settled) return live()
    const key = requestKey(method, p)
    let answer: unknown
    const hit = await deps.read(opts.clientId, key) // throws on failure: fail closed
    if (hit) {
      answer = hit.response
    } else {
      const res = await live()
      if (!complete(res)) {
        console.warn(`[organic-social] lock skipped (incomplete answer) ${tag(end, key)}`)
        return res
      }
      answer = await deps.write(opts.clientId, key, end, res) // throws on failure: fail closed
      if (opts.late(end)) console.warn(`[organic-social] late lock ${tag(end, key)}`)
    }
    const prior = priorParams(p)
    if (prior) {
      const before = await deps.read(opts.clientId, requestKey(method, prior))
      if (before) answer = withLockedBaseline(answer, before.response)
    }
    return answer as T
  }
  const reader: DashReader = {
    getReportsData<M = unknown>(p: ReportsDataParams): Promise<ReportsDataResponse<M>> {
      return locked('getReportsData', p, (r) => completeReportsData(p, r), () => inner.getReportsData<M>(p))
    },
    getContent(p: Parameters<DashReader['getContent']>[0]): Promise<ContentResponse> {
      return locked('getContent', p, completeContent, () => inner.getContent(p))
    },
    getMedia(p: Parameters<DashReader['getMedia']>[0]) {
      return inner.getMedia(p)
    },
  }
  return reader
}
