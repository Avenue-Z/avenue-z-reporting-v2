import { Sparkles } from 'lucide-react'

/**
 * Loading placeholder for the AI-generated Executive Synopsis cards
 * (Overview + PR Influence). Mirrors the real synopsis card shell so the
 * surrounding page can paint immediately while the (slow, Glean-backed)
 * synopsis streams in behind its own Suspense boundary — no layout shift.
 */
export function SynopsisSkeleton() {
  return (
    <section className="rounded-xl border border-white/[0.08] bg-bg-surface p-6">
      <header className="mb-4 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#60FF80]/10">
          <Sparkles className="h-4 w-4 text-[#60FF80]" />
        </span>
        <h3 className="text-sm font-bold uppercase tracking-widest text-text-muted">Executive Synopsis</h3>
      </header>
      <div className="space-y-3">
        <div className="h-4 w-full animate-pulse rounded bg-white/[0.06]" />
        <div className="h-4 w-[94%] animate-pulse rounded bg-white/[0.06]" />
        <div className="h-4 w-[88%] animate-pulse rounded bg-white/[0.06]" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-white/[0.06]" />
      </div>
    </section>
  )
}
