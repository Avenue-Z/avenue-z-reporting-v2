'use client'

// components/report-sections/peec-ai/sentiment-insights.tsx
// FB-010: AEO PR Influence — Sentiment Insights card. Sits between the PR
// Placement Matchback table and the Top Editorial Domains table per Tina's
// "above Top Editorial Domains" placement instruction.
//
// Layout matches Tina's design feedback:
//   - Sentiment KPI pill at the top (Positive 89.4%)
//   - Side-by-side: Positive Themes (left), Negative Themes (right)
//   - Each theme is a click-to-expand accordion that reveals its sources
//
// Data is STATIC and HARDCODED to Avenue Z while this is the sandbox client.
// Other clients see nothing in this slot. Same pattern as FB-006
// Winners/Losers. When this is later wired to live per-client data, drop
// the SANDBOX_CLIENT_SLUG gate.

import { useState } from 'react'
import { Sparkles, ChevronRight } from 'lucide-react'
import { InfoTooltip } from '@/components/ui/info-tooltip'

const SANDBOX_CLIENT_SLUG = 'avenue-z'

type PositiveTheme = { title: string; urls: string[] }
type Weakness = { title: string; explanation: string }

const SENTIMENT_PCT = 89.4
const SENTIMENT_LABEL = 'Positive'

const POSITIVE_THEMES: PositiveTheme[] = [
  {
    title: 'Strong AI Visibility Gains',
    urls: [
      'https://avenuez.com/blog/top-ai-seo-agencies-2025/',
      'https://amclickworks.com/blog/ai-seo-agencies/',
      'https://20northmarketing.com/blog/top-ai-optimization-agencies',
    ],
  },
  {
    title: 'Expert LLM Visibility Optimization',
    urls: [
      'https://nogood.io/blog/best-answer-engine-optimization-agencies/',
      'https://compare.growthmarshal.io/best-aio-agencies-2026/',
    ],
  },
  {
    title: 'Leading AI Search Optimization',
    urls: [
      'https://avenuez.com/blog/top-ai-seo-agencies-2025/',
      'https://adogy.com/the-top-generative-engine-optimization-geo-agencies/',
      'https://m8l.com/blog/top-10-answer-engine-optimization-aeo-agencies',
      'https://icoda.io/ai/best-ai-seo-agency-fintech/',
      'https://avenuez.com/blog/best-ai-search-optimization-marketing-agencies-to-rank-on-chatgpt/',
      'https://gracker.ai/news/top-10-ai-seo-agencies-digital-marketing-firms-for-2026',
    ],
  },
  {
    title: 'Leading Answer & Generative Optimization',
    urls: [
      'https://growthmarketingpro.com/best-geo-marketing-agencies/',
    ],
  },
  {
    title: 'Effective PR & SEO Integration',
    urls: [
      'https://singlegrain.com/search-everywhere-optimization/10-expert-geo-seo-agencies-capturing-local-visibility-in-2025/',
      'https://martech.zone/best-ai-seo-agencies/',
      'https://userp.io/seo/top-ai-seo-agencies/',
      'https://rankz.co/blog/best-agencies-for-ai-search-optimization/',
      'https://firstpagesage.com/seo-blog/the-top-answer-engine-optimization-aeo-companies/',
      'https://greenbananaseo.com/best-ai-seo-agencies-2026-category-winners-scoring-rubric-enterprise-picks/',
      'https://position.digital/blog/top-geo-agencies/',
    ],
  },
  {
    title: 'Strong Visibility Measurement',
    urls: [
      'https://icoda.io/ai/best-ai-seo-agency-fintech/',
    ],
  },
  {
    title: 'Strong Industry Reputation',
    urls: [
      'https://nogood.io/blog/best-answer-engine-optimization-agencies/',
    ],
  },
  {
    title: 'Proven Client Success',
    urls: [
      'https://avenuez.com/blog/top-ai-seo-agencies-2025/',
      'https://clutch.co/profile/avenue-z',
      'https://position.digital/blog/top-geo-agencies/',
    ],
  },
]

const WEAKNESSES: Weakness[] = [
  {
    title: 'Unclear Answer Engine Methodology',
    explanation: 'This seems to be due to lack of content around methodology of attributing ROI to AI search efforts.',
  },
  {
    title: 'Unproven Answer Engine Impact',
    explanation: 'This seems to be due to lack of independent validation of impact.',
  },
]

const HEADLINE_TOOLTIP =
  'Share of AI-cited sources expressing positive sentiment toward the brand. Sentiment is classified across the positive themes and weaknesses below. Avenue Z sandbox: static for now while we validate the layout; wires to live per-client data later.'

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
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

export function SentimentInsights({ clientSlug }: { clientSlug?: string }) {
  // Sandbox: only Avenue Z gets the static content. Other clients render
  // nothing in this slot. Same gate pattern as FB-006 Winners/Losers.
  const [openPos, setOpenPos] = useState<Set<number>>(new Set())
  const [openWeak, setOpenWeak] = useState<Set<number>>(new Set())

  if (clientSlug !== SANDBOX_CLIENT_SLUG) return null

  const togglePos = (i: number) => {
    const next = new Set(openPos)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    setOpenPos(next)
  }
  const toggleWeak = (i: number) => {
    const next = new Set(openWeak)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    setOpenWeak(next)
  }

  return (
    <section className="rounded-xl border border-white/[0.08] bg-bg-surface p-6">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#60FF80]/10">
          <Sparkles className="h-4 w-4 text-[#60FF80]" />
        </span>
        <h3 className="text-sm font-bold uppercase tracking-widest text-text-muted">Sentiment Insights</h3>
        <InfoTooltip text={HEADLINE_TOOLTIP} />
        <span
          className="ml-auto inline-flex items-center gap-2 rounded-full border border-[#60FF80]/30 bg-[#60FF80]/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-[#60FF80]"
          title="Current sentiment headline"
        >
          {SENTIMENT_LABEL}
          <span className="tabular-nums">{SENTIMENT_PCT.toFixed(1)}%</span>
        </span>
      </header>

      <div className="grid gap-5 lg:grid-cols-2 items-stretch">
        {/* Positive Themes */}
        <div className="flex flex-col rounded-lg border border-white/[0.06] bg-bg-surface p-4">
          <h4 className="mb-1 text-base font-bold text-white">Positive Themes</h4>
          <p className="mb-3 text-xs text-text-muted">
            What AI-cited sources say <span className="font-bold text-white">positively</span> about the brand. Click a theme to see the citing sources.
          </p>
          <div className="flex-1 space-y-2 overflow-y-auto pr-1 max-h-[400px]">
            {POSITIVE_THEMES.map((theme, i) => (
              <ThemeAccordion
                key={theme.title}
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
            ))}
          </div>
        </div>

        {/* Negative Themes */}
        <div className="flex flex-col rounded-lg border border-white/[0.06] bg-bg-surface p-4">
          <h4 className="mb-1 text-base font-bold text-white">Negative Themes</h4>
          <p className="mb-3 text-xs text-text-muted">
            What AI-cited sources flag as <span className="font-bold text-white">gaps</span>. Click a theme to see the explanation.
          </p>
          <div className="flex-1 space-y-2 overflow-y-auto pr-1 max-h-[400px]">
            {WEAKNESSES.map((w, i) => (
              <ThemeAccordion
                key={w.title}
                title={w.title}
                expanded={openWeak.has(i)}
                onToggle={() => toggleWeak(i)}
              >
                <p className="text-xs leading-relaxed text-white/80">{w.explanation}</p>
              </ThemeAccordion>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
