const Pulse = ({ className }: { className: string }) => (
  <div className={`animate-pulse rounded bg-white/[0.06] ${className}`} />
)

/** Mirrors platform-headlines.tsx — label + a 5-up KpiCard grid, shown twice. */
export function HeadlinesSkeleton() {
  return (
    <div className="space-y-6">
      {[0, 1].map((s) => (
        <section key={s} className="space-y-3">
          <Pulse className="h-4 w-32" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[0, 1, 2, 3, 4].map((c) => (
              <div key={c} className="rounded-lg border border-white/[0.06] bg-bg-surface p-4">
                <Pulse className="mb-3 h-3 w-2/3" />
                <Pulse className="h-6 w-1/2" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

/** Mirrors trends.tsx — title + toggle pills + chart area. */
export function TrendSkeleton() {
  return (
    <section className="space-y-3">
      <Pulse className="h-4 w-40" />
      <div className="flex flex-wrap gap-2">
        {[0, 1, 2, 3].map((p) => (
          <Pulse key={p} className="h-7 w-24 !rounded-full" />
        ))}
      </div>
      <Pulse className="h-64 w-full !rounded-lg" />
    </section>
  )
}

/** The whole Overview body (all three parts) as skeletons — the first-paint Suspense fallback
 *  shown while the composition/template resolves, so paint isn't gated on that DB round-trip. */
export function OverviewSkeleton() {
  return (
    <>
      <HeadlinesSkeleton />
      <TrendSkeleton />
      <TopContentSkeleton />
    </>
  )
}

/** Mirrors top-content.tsx — view toggles + table rows. */
export function TopContentSkeleton() {
  return (
    <section className="space-y-6">
      <div className="flex gap-2">
        {[0, 1].map((p) => (
          <Pulse key={p} className="h-7 w-44 !rounded-full" />
        ))}
      </div>
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((r) => (
          <Pulse key={r} className="h-10 w-full" />
        ))}
      </div>
    </section>
  )
}
