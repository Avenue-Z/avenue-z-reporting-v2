/**
 * Per-section Suspense fallback skeletons. Sized to roughly match the
 * real section footprint so the page doesn't reflow as each boundary
 * resolves.
 */

function box(className: string) {
  return <div className={`animate-pulse rounded-lg border border-white/[0.06] bg-bg-surface ${className}`} />
}

function sectionShell() {
  return (
    <div className="space-y-8">
      {box('h-64')}{/* Visibility chart */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        {box('h-32')}
        {box('h-32')}
        {box('h-32')}
      </div>
      {box('h-48')}{/* LLM breakdown */}
      <div className="grid gap-5 lg:grid-cols-[1fr_280px] items-stretch">
        {box('h-80')}
        <div className="flex flex-col gap-5">
          {box('h-40')}
          {box('h-40')}
        </div>
      </div>
    </div>
  )
}

export function PeecSectionSkeleton() {
  return sectionShell()
}

export function ProfoundSectionSkeleton() {
  return (
    <>
      <div className="flex items-center gap-4 pt-4">
        <div className="h-px flex-1 bg-white/[0.06]" />
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-text-muted">
            Answer Engine Optimization
          </p>
          <h2 className="text-3xl font-extrabold uppercase text-white">Profound</h2>
        </div>
        <div className="h-px flex-1 bg-white/[0.06]" />
      </div>
      {sectionShell()}
    </>
  )
}
