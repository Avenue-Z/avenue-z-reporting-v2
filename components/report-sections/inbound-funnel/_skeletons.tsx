/**
 * Section skeletons for the Overview view of inbound-funnel. Sized
 * roughly to match the rendered sections so the page doesn't reflow
 * as Suspense boundaries resolve.
 */

function box(className: string) {
  return <div className={`animate-pulse rounded-lg border border-white/[0.06] bg-bg-surface ${className}`} />
}

export function KpisSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        {box('h-28')}
        {box('h-28')}
        {box('h-28')}
        {box('h-28')}
      </div>
      {box('h-40')}{/* LeadQualityMix */}
    </div>
  )
}

export function TrendSkeleton() {
  return box('h-72')
}

export function FunnelAndSourceSkeleton() {
  return (
    <div className="space-y-8">
      {box('h-56')}{/* LifecycleFunnel */}
      {box('h-64')}{/* SourceQualityTable */}
    </div>
  )
}
