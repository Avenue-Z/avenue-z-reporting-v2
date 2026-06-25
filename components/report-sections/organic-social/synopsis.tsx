import { Sparkles } from 'lucide-react'
import { getOrganicSocialSynopsis } from '@/lib/organic-social/synopsis'
import { getPlatformHeadlines } from '@/lib/organic-social/headlines'
import { getEngagementTrend } from '@/lib/organic-social/trends'
import { getTopContent } from '@/lib/organic-social/top-content'
import type { PlatformHeadline, TrendSeries, PlatformTopContent } from '@/lib/organic-social/types'

// Executive AI-generated synopsis + recommended actions at the top of the
// Organic Social section. RSC: fetches its three inputs (shared via React
// cache() with the display sections) then the Glean synopsis. Streams behind
// its own Suspense boundary so it never blocks the display sections.

type Props = {
  clientSlug: string
  dateRange?: string
  compareRange?: string | null
}

export async function OrganicSocialSynopsis({ clientSlug, dateRange = 'last_30_days', compareRange = null }: Props) {
  const effectiveCompare = compareRange ?? 'previous_period'

  let headlines: PlatformHeadline[]
  let trend: TrendSeries
  let top: PlatformTopContent[]
  try {
    ;[headlines, trend, top] = await Promise.all([
      getPlatformHeadlines(clientSlug, dateRange, effectiveCompare),
      getEngagementTrend(clientSlug, dateRange),
      getTopContent(clientSlug, dateRange),
    ])
  } catch {
    // Input fetch failed — hide the synopsis (mirrors the old data-present guard).
    // The individual display sections render their own error fallbacks.
    return null
  }

  let result: Awaited<ReturnType<typeof getOrganicSocialSynopsis>> | null = null
  let errored = false
  try {
    result = await getOrganicSocialSynopsis(clientSlug, dateRange, headlines, trend, top)
  } catch (err) {
    console.error('[organic-social-synopsis] generation failed:', err)
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
