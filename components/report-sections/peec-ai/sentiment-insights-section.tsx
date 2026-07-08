import { Sparkles } from 'lucide-react'
import { getProfoundSentiment } from '@/lib/profound/sentiment'
import type { AEOModel } from '@/lib/peec/models'
import { SentimentInsights } from './sentiment-insights'

/**
 * Loading placeholder mirroring the Sentiment Insights card shell so the
 * PR Influence body can paint while this section streams in behind its own
 * Suspense boundary (paging all answers for per-theme sources is the slow
 * part) -- no layout shift.
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
 * Server wrapper that fetches Profound sentiment and renders the client card.
 * Rendered inside its own <Suspense> by PR Influence so the answers fetch
 * streams independently. Gated to Profound-configured clients by the caller
 * (PR Influence renders this only for Avenue Z); Profound is a single-account
 * feed, so it must never render for a client without a Profound account.
 */
export async function SentimentInsightsSection({
  dateRange,
  models,
}: {
  dateRange: string
  models: AEOModel[] | null
}) {
  let data: Awaited<ReturnType<typeof getProfoundSentiment>> | null = null
  try {
    data = await getProfoundSentiment(dateRange, null, models)
  } catch (e) {
    console.error('[pr-influence] Profound sentiment fetch failed:', e)
  }
  return <SentimentInsights data={data} />
}
