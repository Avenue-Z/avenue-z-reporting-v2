'use client'

// components/report-sections/peec-ai/sentiment-insights.tsx
// FB-026: data-driven Sentiment Insights card. Previously this file held
// hardcoded Avenue Z sandbox content (POSITIVE_THEMES / WEAKNESSES const
// arrays + a fixed 89.4% pill, gated to clientSlug==='avenue-z'). Tina v1
// CSV R4 + R5: card and pill must react to date AND model. The sandbox gate
// is LIFTED (precedent: FB-023). The component now takes `data` as a prop
// and renders accordions over the live themes returned by the Glean-backed
// helper at lib/peec/sentiment-insights.ts.

import { useState } from 'react'
import { Sparkles, ChevronRight } from 'lucide-react'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import type { SentimentInsights as SentimentInsightsData } from '@/lib/peec/sentiment-insights'

const HEADLINE_TOOLTIP =
  'Share of analyzed AI-cited URLs classified as positive in tone toward your brand. Themes are grouped from URL titles and metadata by the Glean Chat API.'

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

// FB-061: pill label/tint now require actual negative themes to surface
// "Negative". Before this fix, sentimentPct < 45 always labeled "Negative",
// which contradicted the body when Glean classified URLs as mostly NEUTRAL
// (e.g. 33.3% positive + 0 negative themes = 66.7% neutral, pill said
// "NEGATIVE 33.3%" while body said "No negative themes detected").
// New rule:
//   >= 75% positive                        -> Positive (green)
//   < 45% positive AND negative themes > 0 -> Negative (red)
//   otherwise                              -> Mixed (yellow)
// "Mixed" now covers the 45-74% band AND the <45%-but-no-negative-themes
// (mostly-neutral) case, eliminating the body-vs-pill contradiction.
function pctLabel(p: number, negativeThemeCount: number): string {
  if (p >= 75) return 'Positive'
  if (p < 45 && negativeThemeCount > 0) return 'Negative'
  return 'Mixed'
}

function pctTint(p: number, negativeThemeCount: number): { ring: string; bg: string; text: string } {
  if (p >= 75) return { ring: 'border-[#60FF80]/30', bg: 'bg-[#60FF80]/10', text: 'text-[#60FF80]' }
  if (p < 45 && negativeThemeCount > 0) return { ring: 'border-[#FF4444]/30', bg: 'bg-[#FF4444]/10', text: 'text-[#FF4444]' }
  return { ring: 'border-[#FFD700]/30', bg: 'bg-[#FFD700]/10', text: 'text-[#FFD700]' }
}

function ThemeAccordion({
  title,
  count,
  expanded,
  onToggle,
  children,
}: {
  title: string
  count?: number
  expanded: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="rounded-md border border-white/[0.06] bg-white/[0.02]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.03]"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 shrink-0 text-text-muted transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
        <span className="flex-1 text-sm font-semibold text-white">{title}</span>
        {count !== undefined && (
          <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold tabular-nums text-text-muted">
            {count}
          </span>
        )}
      </button>
      {expanded && <div className="border-t border-white/[0.06] px-3 py-3">{children}</div>}
    </div>
  )
}

export function SentimentInsights({ data }: { data: SentimentInsightsData | null }) {
  const [openPos, setOpenPos]   = useState<Set<number>>(new Set())
  const [openNeg, setOpenNeg]   = useState<Set<number>>(new Set())

  const togglePos = (i: number) => {
    const next = new Set(openPos)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    setOpenPos(next)
  }
  const toggleNeg = (i: number) => {
    const next = new Set(openNeg)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    setOpenNeg(next)
  }

  const noData = !data || data.analyzedUrlCount === 0

  return (
    <section className="rounded-xl border border-white/[0.08] bg-bg-surface p-6">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#60FF80]/10">
          <Sparkles className="h-4 w-4 text-[#60FF80]" />
        </span>
        <h3 className="text-sm font-bold uppercase tracking-widest text-text-muted">Sentiment Insights</h3>
        <InfoTooltip text={HEADLINE_TOOLTIP} />
        {!noData && (() => {
          const negativeCount = data!.negativeThemes.length
          const tint = pctTint(data!.sentimentPct, negativeCount)
          return (
            <span
              className={`ml-auto inline-flex items-center gap-2 rounded-full border ${tint.ring} ${tint.bg} px-3 py-1 text-xs font-bold uppercase tracking-widest ${tint.text}`}
              title="Sentiment headline for the selected date range and model"
            >
              {pctLabel(data!.sentimentPct, negativeCount)}
              <span className="tabular-nums">{data!.sentimentPct.toFixed(1)}%</span>
            </span>
          )
        })()}
      </header>

      {noData && (
        <p className="text-sm text-text-muted">
          Not enough AI-cited URLs in this date range or model selection to classify sentiment. Try a wider date range or all-models view.
        </p>
      )}

      {!noData && (
        <div className="grid gap-5 lg:grid-cols-2 items-stretch">
          {/* Positive Themes */}
          <div className="flex flex-col rounded-lg border border-white/[0.06] bg-bg-surface p-4">
            <h4 className="mb-1 text-base font-bold text-white">Positive Themes</h4>
            <p className="mb-3 text-xs text-text-muted">
              What AI-cited sources say <span className="font-bold text-white">positively</span> about the brand. Click a theme to see the citing sources.
            </p>
            <div className="flex-1 space-y-2 overflow-y-auto pr-1 max-h-[400px]">
              {data!.positiveThemes.length === 0 ? (
                <p className="text-xs text-text-muted">No positive themes detected in this period.</p>
              ) : (
                data!.positiveThemes.map((theme, i) => (
                  <ThemeAccordion
                    key={`${theme.title}-${i}`}
                    title={theme.title}
                    count={theme.urls.length}
                    expanded={openPos.has(i)}
                    onToggle={() => togglePos(i)}
                  >
                    <ul className="space-y-1.5">
                      {theme.urls.map((url) => (
                        <li key={url} className="flex gap-2 text-xs leading-relaxed">
                          <span className="text-[#60FF80]">›</span>
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="break-all text-white/80 underline-offset-2 hover:text-white hover:underline"
                            title={url}
                          >
                            {hostOf(url)}
                            <span className="text-text-muted"> · {url.replace(/^https?:\/\/[^/]+/, '') || '/'}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </ThemeAccordion>
                ))
              )}
            </div>
          </div>

          {/* Negative Themes */}
          <div className="flex flex-col rounded-lg border border-white/[0.06] bg-bg-surface p-4">
            <h4 className="mb-1 text-base font-bold text-white">Negative Themes</h4>
            <p className="mb-3 text-xs text-text-muted">
              What AI-cited sources flag as <span className="font-bold text-white">gaps</span>. Click a theme to see the explanation.
            </p>
            <div className="flex-1 space-y-2 overflow-y-auto pr-1 max-h-[400px]">
              {data!.negativeThemes.length === 0 ? (
                <p className="text-xs text-text-muted">No negative themes detected in this period.</p>
              ) : (
                data!.negativeThemes.map((w, i) => (
                  <ThemeAccordion
                    key={`${w.title}-${i}`}
                    title={w.title}
                    count={w.urls.length}
                    expanded={openNeg.has(i)}
                    onToggle={() => toggleNeg(i)}
                  >
                    <p className="mb-2 text-xs leading-relaxed text-white/80">{w.explanation}</p>
                    {w.urls.length > 0 && (
                      <ul className="space-y-1.5">
                        {w.urls.map((url) => (
                          <li key={url} className="flex gap-2 text-xs leading-relaxed">
                            <span className="text-[#FF4444]">›</span>
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="break-all text-white/80 underline-offset-2 hover:text-white hover:underline"
                              title={url}
                            >
                              {hostOf(url)}
                              <span className="text-text-muted"> · {url.replace(/^https?:\/\/[^/]+/, '') || '/'}</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </ThemeAccordion>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
