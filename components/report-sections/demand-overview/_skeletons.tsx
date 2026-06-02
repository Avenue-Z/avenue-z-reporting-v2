/**
 * Per-section Suspense fallback skeletons.
 *
 * Sized to roughly match each rendered section's footprint so the
 * page doesn't reflow as each Suspense boundary resolves.
 */

function box(className: string) {
  return <div className={`animate-pulse rounded-lg border border-white/[0.06] bg-bg-surface ${className}`} />
}

export function DemandJourneySkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
      {box('h-56')}
      {box('h-56')}
      {box('h-56')}
      {box('h-56')}
    </div>
  )
}

export function ContentFunnelSkeleton() {
  return box('h-72')
}

export function ContentMatrixSkeleton() {
  return box('h-96')
}

export function CitationBreakdownSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {box('h-64')}
      {box('h-64')}
    </div>
  )
}
