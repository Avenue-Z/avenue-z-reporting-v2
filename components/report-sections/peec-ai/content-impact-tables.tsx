'use client'

import { cn } from '@/lib/utils'
import type { MatchStatus } from '@/lib/content-calendar/types'
import { SortableTable, type SortableColumn } from './sortable-table'
import { PEEC, GA4 } from '@/lib/peec/metric-definitions'

// ─── Shared tooltip constants ─────────────────────────────────────────────────
const TT = {
  sessions:           GA4.session.text,
  users:              'An active user has had a session that meets any of the engaged-session criteria. (GA4.)',
  views:              'A user-initiated event when content loads or refreshes on a website. (GA4.)',
  engagementRate:     GA4.engagementRate.text,
  aiReferredSessions: 'GA4 sessions whose source matches the AI referrer domain list (chat.openai.com, perplexity.ai, gemini.google.com, etc.). (GA4 filtered by Avenue Z internal referrer list.)',
  aiVisibility:       PEEC.retrieved.text,
  aiCitations:        PEEC.citations.text,
  position:           PEEC.position.text,
  promptCoverage:     'Percentage of tracked prompts where this domain appears. (Avenue Z internal.)',
  aiEngines:          'List of AI engines where this URL or domain was cited. (Peec AI source data.)',
  aiBotActivity:      'Server log entries identifying named AI crawler bots (GPTBot, PerplexityBot, ClaudeBot, etc.) visiting this URL. (Avenue Z internal — server log analysis.)',
  matchStatus:        'Whether the published URL was found in GA4 (matched), missing (unmatched), is a redirect, or is unpublished. (Avenue Z internal.)',
  contentAction:      'Was this content created new, optimized from existing, or some other action? (Avenue Z internal — content calendar.)',
  recommendedAction:  "Suggested next action based on the row's data. (Avenue Z internal — heuristic.)",
  postLaunchAILift:   'Change in AI citations after content publication. (Avenue Z internal — Peec data.)',
  calendarField:      'From the content calendar sheet. (Avenue Z internal.)',
}

const MATCH_STATUS_COLORS: Record<MatchStatus, string> = {
  matched:     'bg-[#60FF80]/10 text-[#60FF80]',
  unmatched:   'bg-white/[0.06] text-white/40',
  redirected:  'bg-[#FFFC60]/10 text-[#FFFC60]',
  unpublished: 'bg-[#FF4444]/10 text-[#FF4444]',
  unknown:     'bg-white/[0.06] text-white/30',
}

const ACTION_COLORS: Record<string, string> = {
  new:       'bg-[#60FF80]/10 text-[#60FF80]',
  optimized: 'bg-[#39A0FF]/10 text-[#39A0FF]',
  other:     'bg-white/[0.06] text-white/40',
}

function SubSectionWrapper({
  badge,
  badgeColor,
  title,
  description,
  children,
}: {
  badge: string
  badgeColor: string
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-white/[0.06] bg-bg-surface p-4">
      <div className="flex items-center gap-2">
        <span
          className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold', badgeColor)}
        >
          {badge}
        </span>
        <span className="text-xs font-bold text-white">{title}</span>
      </div>
      {description && <p className="text-[11px] text-text-muted">{description}</p>}
      {children}
    </div>
  )
}

// ─── Shared delta renderer (lifted to module scope for reuse across tables) ────
// Mode 'pp': percentage-point change, shows up/down N.N pp
// Mode 'pct': percentage change, shows up/down N.N%
export function renderDelta(delta: number | null, mode: 'pp' | 'pct'): React.ReactNode {
  if (delta === null) return null
  const positive = delta >= 0
  const arrow = positive ? '↑' : '↓'
  const suffix = mode === 'pp' ? ' pp' : '%'
  const colorClass = positive ? 'text-[#60FF80]' : 'text-[#FF4444]'
  return (
    <span className={cn('block text-[10px] font-semibold tabular-nums', colorClass)}>
      {arrow} {Math.abs(delta).toFixed(1)}{suffix}
    </span>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// 6. Top Competitor / Corporate Domains Cited in AI (Section H.1)
// ═════════════════════════════════════════════════════════════════════════════
export interface CompetitorDomainsCitedRow {
  domain: string
  aiVisibility: number
  aiVisibilityDelta: number | null
  citationShare: number
  citationShareDelta: number | null
  promptCoverage: number | null
  promptCoverageDelta: number | null
}

export function CompetitorDomainsCitedTable({
  rows,
  emptyMessage,
}: {
  rows: CompetitorDomainsCitedRow[]
  emptyMessage: string
}) {
  const maxCitationShare = Math.max(...rows.map((r) => r.citationShare), 1)

  const columns: SortableColumn<CompetitorDomainsCitedRow>[] = [
    {
      key: 'domain', label: 'Domain',
      accessor: (r) => r.domain,
      render: (r) => (
        <span className="block max-w-[150px] truncate font-medium text-white/80" title={r.domain}>{r.domain}</span>
      ),
    },
    {
      key: 'aiVisibility', label: 'Source Visibility', align: 'right',
      tooltip: TT.aiVisibility,
      accessor: (r) => r.aiVisibility,
      render: (r) => (
        <span className="tabular-nums text-white">
          {r.aiVisibility.toFixed(1)}%
        </span>
      ),
    },
    {
      key: 'aiVisibilityDelta', label: 'Δ', align: 'right',
      accessor: (r) => r.aiVisibilityDelta ?? null,
      render: (r) => renderDelta(r.aiVisibilityDelta, 'pp') ?? <span className="text-white/20">--</span>,
    },
    {
      key: 'citationShare', label: 'Citation Share', align: 'right',
      tooltip: "This domain's share of total citations across all competitor domains in the period. (Avenue Z internal, derived from Peec citation_count.)",
      accessor: (r) => r.citationShare,
      render: (r) => {
        const barWidth = (r.citationShare / maxCitationShare) * 100
        return (
          <div className="flex items-center justify-end gap-2">
            <div className="h-3 w-20 overflow-hidden rounded bg-white/[0.04]">
              <div className="h-full rounded bg-[#FF4444]/40" style={{ width: `${barWidth}%` }} />
            </div>
            <span className="tabular-nums text-white/60">{r.citationShare.toFixed(1)}%</span>
          </div>
        )
      },
    },
    {
      key: 'citationShareDelta', label: 'Δ', align: 'right',
      accessor: (r) => r.citationShareDelta ?? null,
      render: (r) => renderDelta(r.citationShareDelta, 'pp') ?? <span className="text-white/20">--</span>,
    },
    {
      key: 'promptCoverage', label: 'Prompt Coverage', align: 'right',
      tooltip: TT.promptCoverage,
      accessor: (r) => r.promptCoverage ?? -1,
      render: (r) => (
        <span className="tabular-nums text-white">
          {r.promptCoverage !== null ? `${r.promptCoverage}%` : '--'}
        </span>
      ),
    },
    {
      key: 'promptCoverageDelta', label: 'Δ', align: 'right',
      accessor: (r) => r.promptCoverageDelta ?? null,
      render: (r) => renderDelta(r.promptCoverageDelta, 'pp') ?? <span className="text-white/20">--</span>,
    },
  ]

  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-xs font-bold text-white/60" data-export-keep-with-next="">Which competitor domains are winning for our target prompts?</h4>
      <SortableTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.domain}
        initialPageSize={10}
        emptyMessage={emptyMessage}
      />
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// 7. Top Competitor / Corporate URLs Where Brand is Absent (Section H.2)
// ═════════════════════════════════════════════════════════════════════════════
export interface CompetitorUrlsBrandAbsentRow {
  domain: string
  articleTitle: string | null  // display text for the Article cell; falls back to url when null
  url: string                  // always present, always hyperlinked
  citationShare: number | null
  citationShareDelta: number | null
  competitorsMentioned: string | null
}

export function CompetitorUrlsBrandAbsentTable({
  rows,
  emptyMessage,
}: {
  rows: CompetitorUrlsBrandAbsentRow[]
  emptyMessage: string
}) {
  const columns: SortableColumn<CompetitorUrlsBrandAbsentRow>[] = [
    {
      key: 'domain', label: 'Domain',
      accessor: (r) => r.domain,
      render: (r) => <span className="font-medium text-white">{r.domain}</span>,
    },
    {
      key: 'article', label: 'Article',
      accessor: (r) => r.articleTitle ?? r.url,
      render: (r) => {
        const text = r.articleTitle ?? r.url
        return (
          <a
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block max-w-[220px] truncate text-white/80 underline-offset-2 hover:underline"
            title={`${text} → ${r.url}`}
          >
            {text}
          </a>
        )
      },
    },
    {
      key: 'citationShare', label: 'Citation Share', align: 'right',
      tooltip: "This URL's share of total citations across all cited URLs in the period. (Avenue Z internal, derived from Peec citation_count.)",
      accessor: (r) => r.citationShare ?? -1,
      render: (r) => (
        <span className="tabular-nums text-white">
          {r.citationShare !== null ? `${r.citationShare.toFixed(1)}%` : '--'}
        </span>
      ),
    },
    {
      key: 'citationShareDelta', label: 'Δ', align: 'right',
      accessor: (r) => r.citationShareDelta ?? null,
      render: (r) => renderDelta(r.citationShareDelta, 'pp') ?? <span className="text-white/20">--</span>,
    },
    {
      key: 'competitorsMentioned', label: 'Competitors Mentioned',
      accessor: (r) => r.competitorsMentioned ?? '',
      render: (r) => r.competitorsMentioned
        ? <span className="text-white/70">{r.competitorsMentioned}</span>
        : <span className="text-white/20">--</span>,
    },
  ]

  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-xs font-bold text-white/60" data-export-keep-with-next="">Where are we absent when competitors are cited or mentioned?</h4>
      <SortableTable
        columns={columns}
        rows={rows}
        rowKey={(r, i) => `${r.domain}-${i}`}
        initialPageSize={10}
        emptyMessage={emptyMessage}
      />
    </div>
  )
}

