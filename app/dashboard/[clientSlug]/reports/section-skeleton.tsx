/**
 * Loading placeholder for a report section — a KPI card grid + a chart block.
 * Shared by the page's in-route Suspense fallback (section switches) and
 * loading.tsx (navigating into the reports route).
 */
export function SectionSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-lg border border-white/[0.06] bg-bg-surface"
          />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-lg border border-white/[0.06] bg-bg-surface" />
    </div>
  )
}
