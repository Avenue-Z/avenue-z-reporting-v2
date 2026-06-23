// components/report-sections/peec-ai/winners-losers-cards.tsx
// FB-023: Two side-by-side cards on the AEO Overview tab — Biggest Winners
// (prompts where rank improved vs. the prior period) and Biggest Losers (prompts
// where rank dropped). Data is computed in lib/peec/winners-losers.ts from the
// per-period prompt-level fetch in lib/peec/client.ts. Sandbox gate lifted —
// every client sees their own real winners/losers.
//
// Lineage: supersedes FB-006 (static Avenue Z arrays + clientSlug-gated render).
// Tina v1 CSV E11: "This seems like static copy and should be pulling actual
// data. It doesn't change when a new date range or model is selected and is an
// exact copy of the example text I provided."

import { InfoTooltip } from '@/components/ui/info-tooltip'
import type { PromptDelta } from '@/lib/peec/winners-losers'

const DELTA_TOOLTIP =
  'Change in your brand\'s average rank position for each prompt over the period vs. the previous period of equal length. Positive means you moved up.'

function PromptDeltaCard({
  title,
  emphasis,
  rest,
  rows,
  positive,
  emptyMessage,
}: {
  title: string
  emphasis: string
  rest: string
  rows: PromptDelta[]
  positive: boolean
  emptyMessage: string
}) {
  return (
    <div className="flex flex-col rounded-lg border border-white/[0.06] bg-bg-surface p-5 h-full">
      <h3 className="text-lg font-bold text-white">{title}</h3>
      <p className="mb-4 text-sm text-text-muted">
        Prompts where we <span className="font-bold text-white">{emphasis}</span> {rest}
      </p>

      {rows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-white/[0.06] px-4 py-12 text-center">
          <p className="max-w-xs text-xs text-text-muted">{emptyMessage}</p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden rounded-md border border-white/[0.06]">
          <div className="grid grid-cols-[1fr_72px_72px] gap-3 border-b border-white/[0.06] bg-white/[0.02] px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-text-muted">
            <span>Prompt</span>
            <span className="text-right">Rank</span>
            <span className="flex items-center justify-end gap-1">
              Delta
              <InfoTooltip text={DELTA_TOOLTIP} />
            </span>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {rows.map((r, i) => (
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
                  {r.delta > 0 ? `+${r.delta}` : r.delta}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function WinnersLosersCards({
  clientSlug: _clientSlug,
  winners,
  losers,
}: {
  clientSlug?: string
  winners: PromptDelta[]
  losers: PromptDelta[]
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-2 items-stretch">
      <PromptDeltaCard
        title="The Biggest Winners"
        emphasis="gained"
        rest="rank to our competitors"
        rows={winners}
        positive={true}
        emptyMessage="Not enough prompt-rank history yet for this date range or model selection. Try a wider date range or all-models view."
      />
      <PromptDeltaCard
        title="The Biggest Losers"
        emphasis="lost"
        rest="rank to our competitors"
        rows={losers}
        positive={false}
        emptyMessage="Not enough prompt-rank history yet for this date range or model selection. Try a wider date range or all-models view."
      />
    </div>
  )
}
