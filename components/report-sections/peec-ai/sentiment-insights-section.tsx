import { Sparkles } from 'lucide-react'
import { getSentimentInsights } from '@/lib/peec/sentiment-insights'
import { SentimentInsights } from './sentiment-insights'

/**
 * Loading placeholder mirroring the Sentiment Insights card shell so the
 * PR Influence body can paint while this (Glean-backed, slow-cold) section
 * streams in behind its own Suspense boundary — no layout shift.
 */
export function SentimentSkeleton() {
  return (
    <section className="rounded-xl border border-white/[0.08] bg-bg-surface p-6">
      <header className="mb-4 flex items-center gap-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#60FF80]/10">
          <Sparkles className="h-4 w-4 text-[#60FF80]" />
        </span>
        <h3 className="text-sm font-bold uppercase tracking-widest text-text-muted">Sentiment Insights</h3>
        <div className="ml-auto h-6 w-28 animate-pulse rounded-full bg-white/[0.06]" />
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-28 animate-pulse rounded-md border border-white/[0.06] bg-white/[0.02]" />
        <div className="h-28 animate-pulse rounded-md border border-white/[0.06] bg-white/[0.02]" />
      </div>
    </section>
  )
}

/**
 * Server wrapper that fetches the sentiment insights and renders the client
 * card. Rendered inside its own <Suspense> by PR Influence so the slow Glean
 * call streams independently instead of blocking the rest of the tab.
 */
export async function SentimentInsightsSection({
  clientSlug,
  dateRange,
  modelKey,
  citations,
}: {
  clientSlug: string
  dateRange: string
  modelKey: string
  citations: Parameters<typeof getSentimentInsights>[3]['citations']
}) {

  let data: Awaited<ReturnType<typeof getSentimentInsights>> | null = null
  try {
    data = await getSentimentInsights(clientSlug, dateRange, modelKey, { citations })
  } catch (e) {
    console.error('[pr-influence] sentiment insights generation failed:', e)
  }
  return <SentimentInsights data={data} />
}
