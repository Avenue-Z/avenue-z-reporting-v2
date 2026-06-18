import { Sparkles } from 'lucide-react'
import { getOverviewSynopsis } from '@/lib/peec/synopsis'
import type { PeecOverview } from '@/lib/peec/client'
import type { ProfoundOverview } from '@/lib/profound/client'
import type { AeoProvider } from './provider-tabs'

// Executive AI-generated synopsis + recommended actions at the top of the
// AEO Overview tab. RSC: fetches the synopsis server-side via Vertex Gemini,
// cached per (clientSlug, dateRange, provider) for one hour.
// See docs/official-feedback/feedback-log.md FB-002c.

type Props = {
  clientSlug?: string
  dateRange?: string
  provider: AeoProvider
  data: PeecOverview | ProfoundOverview
  aiSessions: number | null
}

export async function OverviewSynopsis({ clientSlug, dateRange, provider, data, aiSessions }: Props) {
  let result: Awaited<ReturnType<typeof getOverviewSynopsis>> | null = null
  let errored = false
  try {
    result = await getOverviewSynopsis(clientSlug, dateRange ?? 'last_30_days', provider, data, aiSessions)
  } catch (err) {
    console.error('[overview-synopsis] generation failed:', err)
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
