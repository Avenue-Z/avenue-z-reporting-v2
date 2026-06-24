import { cn } from '@/lib/utils'
import { computeDelta } from '@/lib/metrics'
import type { ResolveResult } from '@/lib/dashboard/types'

function deltaSuffix(compareRange: string | null): string {
  if (compareRange === 'previous_year') return 'vs prior year'
  if (compareRange && compareRange.startsWith('custom:')) return 'vs comparison'
  return 'vs prior period'
}

function Unavailable() {
  return <p className="text-xs text-text-muted">comparison unavailable</p>
}

/** Streams the comparison delta. Awaits the SAME current-value promise as
 *  BlockValue (so the current range is never re-pulled) plus the comparison
 *  promise, then computes the delta here. */
export async function BlockDelta({
  valuePromise,
  prevPromise,
  compareRange,
}: {
  valuePromise: Promise<ResolveResult>
  prevPromise: Promise<ResolveResult> | null
  compareRange: string | null
}) {
  if (!prevPromise) return null
  const [cur, prev] = await Promise.all([valuePromise, prevPromise])
  if (!cur.ok || !prev.ok) return <Unavailable />
  const delta = computeDelta(cur.value, prev.value)
  if (delta === undefined) return <Unavailable />
  return (
    <p
      className={cn(
        'text-sm font-bold',
        delta > 0 ? 'text-brand-green' : delta < 0 ? 'text-[#FF4444]' : 'text-text-muted',
      )}
    >
      {delta > 0 ? '↑' : delta < 0 ? '↓' : '—'} {Math.abs(delta).toFixed(1)}% {deltaSuffix(compareRange)}
    </p>
  )
}
