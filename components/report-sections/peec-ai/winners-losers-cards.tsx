// components/report-sections/peec-ai/winners-losers-cards.tsx
import { InfoTooltip } from '@/components/ui/info-tooltip'
import type { PromptDelta } from '@/lib/peec/client'

// FB-006: Two side-by-side cards on the AEO Overview tab.
// Left  = Biggest Winners (prompts where the brand's rank improved).
// Right = Biggest Losers  (prompts where the brand's rank dropped).
// Sits between the Model Breakdown table and the Brand Leaderboard. The cards
// are equal width, equal height, and scroll inside so the page footprint stays
// bounded regardless of list length.

const TOOLTIP =
  'Change in your brand\'s average rank position for each prompt over the selected date range vs. the previous period of equal length. Positive means you moved up.'

function PromptDeltaCard({
  title,
  emphasis,
  rest,
  rows,
  positive,
}: {
  title: string
  emphasis: string
  rest: string
  rows: PromptDelta[]
  positive: boolean
}) {
  return (
    <div className="flex flex-col rounded-lg border border-white/[0.06] bg-bg-surface p-5 h-full">
      <div className="mb-1 flex items-start gap-1.5">
        <h3 className="text-lg font-bold text-white">{title}</h3>
      </div>
      <p className="mb-4 text-sm text-text-muted">
        Prompts where we <span className="font-bold text-white">{emphasis}</span> {rest}
      </p>

      <div className="flex flex-1 flex-col overflow-hidden rounded-md border border-white/[0.06]">
        <div className="grid grid-cols-[1fr_72px_72px] gap-3 border-b border-white/[0.06] bg-white/[0.02] px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-text-muted">
          <span>Prompt</span>
          <span className="text-right">Rank</span>
          <span className="flex items-center justify-end gap-1">
            Delta
            <InfoTooltip text={TOOLTIP} />
          </span>
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          {rows.length === 0 ? (
            <div className="px-4 py-6 text-xs text-text-muted">
              Not enough data for this period yet.
            </div>
          ) : (
            rows.map((r, i) => (
              <div
                key={`${i}-${r.text}`}
                className="grid grid-cols-[1fr_72px_72px] gap-3 border-b border-white/[0.04] px-4 py-2.5 text-sm last:border-b-0 hover:bg-white/[0.02]"
              >
                <span className="truncate text-white" title={r.text}>{r.text}</span>
                <span className="text-right tabular-nums text-white">#{r.rank}</span>
                <span
                  className="text-right tabular-nums font-semibold"
                  style={{ color: positive ? '#60FF80' : '#FF6B6B' }}
                >
                  {r.delta}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export function WinnersLosersCards({
  winners,
  losers,
}: {
  winners: PromptDelta[]
  losers:  PromptDelta[]
}) {
  // Hide entirely when neither side has data. Avoids two empty cards taking
  // page real estate for clients without a prior-period baseline (e.g. brand
  // new Peec projects, every Profound client today).
  if (winners.length === 0 && losers.length === 0) return null

  return (
    <div className="grid gap-5 lg:grid-cols-2 items-stretch">
      <PromptDeltaCard
        title="The Biggest Winners"
        emphasis="gained"
        rest="rank to our competitors"
        rows={winners}
        positive={true}
      />
      <PromptDeltaCard
        title="The Biggest Losers"
        emphasis="lost"
        rest="rank to our competitors"
        rows={losers}
        positive={false}
      />
    </div>
  )
}
