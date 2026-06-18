// components/report-sections/peec-ai/winners-losers-cards.tsx
// FB-006: Two static side-by-side cards on the AEO Overview tab — Biggest
// Winners (prompts where rank improved) and Biggest Losers (prompts where rank
// dropped). Data lifted verbatim from Tina's spec doc and rendered static for
// now. To swap to live computed data later, replace WINNERS/LOSERS with props.

import { InfoTooltip } from '@/components/ui/info-tooltip'

type PromptDelta = { text: string; rank: number; delta: number }

const WINNERS: PromptDelta[] = [
  { text: 'Which agencies specialize in AI-powered SEO?',                     rank: 20, delta:  37 },
  { text: 'Companies that can increase my ChatGPT rankings',                  rank:  9, delta:  27 },
  { text: 'Agencies that specialize in Generative Engine Optimization (GEO)', rank: 19, delta:  20 },
  { text: 'Top AI SEO Marketing Agencies',                                    rank: 14, delta:  15 },
  { text: 'Top SEO agencies specializing in GEO',                             rank: 45, delta:  13 },
  { text: 'Top agencies to help increase brand visibility in LLMs',           rank: 11, delta:  11 },
  { text: 'Who are the top AI search marketing agencies in 2026?',            rank: 15, delta:  10 },
  { text: 'Best AI Search optimization agencies for ChatGPT',                 rank: 14, delta:   8 },
  { text: 'Top AI Search marketing and PR agencies',                          rank:  2, delta:   7 },
  { text: 'Best PR firms for AI Search optimization',                         rank:  2, delta:   5 },
  { text: 'Top AI SEO Agencies',                                              rank: 12, delta:   5 },
  { text: 'Best AI search marketing and PR agencies in 2026',                 rank:  3, delta:   4 },
  { text: 'Top AI SEO agencies of 2026',                                      rank: 17, delta:   4 },
  { text: 'Top AI Search Optimization Agencies',                              rank: 10, delta:   3 },
  { text: 'Best AEO digital marketing agencies for AI Search',                rank:  2, delta:   2 },
  { text: 'Top PR and SEO agencies specializing in AI visibility',            rank:  2, delta:   2 },
  { text: 'Top GEO marketing agencies',                                       rank: 19, delta:   2 },
]

const LOSERS: PromptDelta[] = [
  { text: 'Best AI SEO agencies',                                             rank: 46, delta: -32 },
  { text: 'What AI marketing agencies specialize in AI Search Optimization?', rank: 59, delta: -32 },
  { text: 'Who are the best GEO agencies for AI search optimization?',        rank: 33, delta: -20 },
  { text: 'Best AI Optimization SEO agencies',                                rank: 30, delta: -19 },
  { text: 'Top AI Search Marketing Agencies',                                 rank: 36, delta: -19 },
  { text: 'What agencies can help increase visibility on ChatGPT?',           rank: 39, delta: -11 },
  { text: 'Top LLM SEO optimization agencies',                                rank: 41, delta: -10 },
  { text: 'What companies specialize in Answer Engine Optimization (AEO)?',   rank: 15, delta:  -6 },
  { text: 'Which PR firms specialize in AI optimization?',                    rank: 18, delta:  -6 },
  { text: 'Who are the top AI Search marketing agencies',                     rank: 23, delta:  -6 },
  { text: 'Who are the best AI Optimization agencies in 2026?',               rank:  9, delta:  -5 },
  { text: 'Who are the leading AEO agencies in the United States?',           rank:  8, delta:  -5 },
  { text: 'Top AI Optimization agencies',                                     rank:  9, delta:  -3 },
  { text: 'Who are the top AI SEO marketing agencies?',                       rank: 22, delta:  -3 },
  { text: 'Top generative engine optimization (GEO) agencies',                rank: 31, delta:  -3 },
  { text: 'Top Answer Engine Optimization Agencies',                          rank:  7, delta:  -2 },
  { text: "What's the best agency for AI optimization and PR?",               rank:  3, delta:  -2 },
  { text: 'Who are the top Answer Engine Optimization (AEO) agencies?',       rank:  4, delta:  -1 },
  { text: 'PR firms specializing in AI Optimization',                         rank:  5, delta:  -1 },
  { text: 'Who are the best AI SEO providers for fintech brands?',            rank: 40, delta:  -1 },
]

const TOOLTIP =
  'Change in your brand\'s average rank position for each prompt over the period vs. the previous period of equal length. Positive means you moved up.'

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
      <h3 className="text-lg font-bold text-white">{title}</h3>
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
                {r.delta}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Sandbox: render ONLY for Avenue Z while the content is static / hardcoded.
// Other clients see nothing in this slot. This prevents Avenue Z's prompts
// from leaking onto every other client's portal view. When this component is
// later wired to live per-client data, drop the gate.
const SANDBOX_CLIENT_SLUG = 'avenue-z'

export function WinnersLosersCards({ clientSlug }: { clientSlug?: string }) {
  if (clientSlug !== SANDBOX_CLIENT_SLUG) return null
  return (
    <div className="grid gap-5 lg:grid-cols-2 items-stretch">
      <PromptDeltaCard
        title="The Biggest Winners"
        emphasis="gained"
        rest="rank to our competitors"
        rows={WINNERS}
        positive={true}
      />
      <PromptDeltaCard
        title="The Biggest Losers"
        emphasis="lost"
        rest="rank to our competitors"
        rows={LOSERS}
        positive={false}
      />
    </div>
  )
}
