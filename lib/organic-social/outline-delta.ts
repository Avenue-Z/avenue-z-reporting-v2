import type { TotalMetric } from '@/lib/dash-social/types'

/** Prior-period percent change for the outline tiles, measured against the size of the prior
 *  value, so the arrow always shows the direction of change. The shared delta()
 *  (headline-build.ts) divides by the signed prior: when last period was negative (Net New
 *  Followers can be) its sign flips, so -2 to +4 reads as a red "down 300%". That one is left as
 *  it is because Renaissance's tiles read it. No prior, or a prior of 0, is no comparison,
 *  exactly as delta(). */
export function outlineDelta(m: TotalMetric | undefined): number | undefined {
  if (!m) return undefined
  const cur = m.value ?? 0
  const prev = m.context
  if (prev == null || prev === 0) return undefined
  return ((cur - prev) / Math.abs(prev)) * 100
}
