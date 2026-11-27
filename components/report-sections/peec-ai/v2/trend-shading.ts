import { bucketKey } from '@/lib/aeo/bucket'
import type { BucketGranularity } from '@/lib/aeo/types'

const DAY_MS = 86_400_000

/**
 * The first and last chart bucket a date window touches, for shading it on the year-to-date trend chart. A bucket counts
 * when any day of the window falls in it, so a window that only partly overlaps the chart (a comparison period last
 * December, say) shades just the buckets it shares. `null` when it shares none, or the window is unreadable.
 */
export function shadeRange(
  bucketKeys: readonly string[],
  g: BucketGranularity,
  w: { start: string; end: string },
): { from: number; to: number } | null {
  const start = Date.parse(`${w.start}T00:00:00Z`)
  const end = Date.parse(`${w.end}T00:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return null
  const inWindow = new Set<string>()
  for (let t = start; t <= end; t += DAY_MS) inWindow.add(bucketKey(new Date(t), g))
  let from = -1
  let to = -1
  bucketKeys.forEach((key, i) => {
    if (!inWindow.has(key)) return
    if (from < 0) from = i
    to = i
  })
  return from < 0 ? null : { from, to }
}
