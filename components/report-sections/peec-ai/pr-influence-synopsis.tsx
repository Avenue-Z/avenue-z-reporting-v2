import { Sparkles } from 'lucide-react'
import { getPRInfluenceSynopsis, type PRInfluenceSynopsisContext } from '@/lib/peec/pr-influence-synopsis'

// Executive AI-generated synopsis + recommended actions at the top of the
// AEO PR Influence tab. RSC: fetches the synopsis server-side via Glean
// Chat API, cached per (clientSlug, dateRange) for one hour. Mirrors the
// Overview synopsis shell so the two cards read as a consistent pattern.
// See docs/official-feedback/feedback-log.md FB-009-a.

type Props = {
  clientSlug?: string
  dateRange?: string
  context: PRInfluenceSynopsisContext
}

export async function PRInfluenceSynopsis({ clientSlug, dateRange, context }: Props) {
  let result: Awaited<ReturnType<typeof getPRInfluenceSynopsis>> | null = null
  let errored = false
  try {
    result = await getPRInfluenceSynopsis(clientSlug, dateRange ?? 'last_30_days', context)
  } catch (err) {
    console.error('[pr-influence-synopsis] generation failed:', err)
    errored = true
  }

  return (
    <section className="rounded-xl border border-white/[0.08] bg-bg-surface p-6">
      <header className="mb-4 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#60FF80]/10">
          <Sparkles className="h-4 w-4 text-[#60FF80]" />
        </span>
        <h3 className="text-sm font-bold uppercase tracking-widest text-text-muted">Executive Synopsis</h3>
      </header>

      {errored && (
        <p className="text-sm text-text-muted">Synopsis is temporarily unavailable. Other metrics on this page are unaffected.</p>
      )}

      {!errored && result && (
        <div className="space-y-4">
          <div className="space-y-3 text-sm leading-relaxed text-white/90">
            {result.synopsis.split('\n\n').map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </div>

          {result.actions.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-text-muted">Recommended actions</p>
              <ul className="space-y-1.5 text-sm text-white/90">
                {result.actions.map((action, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-[#60FF80]">›</span>
                    <span>{action}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
