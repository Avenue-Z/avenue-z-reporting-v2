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
  aiCitations:        PEEC.citations.text,
  position:           PEEC.position.text,
  promptCoverage:     'Percentage of tracked prompts where this domain appears. (Avenue Z internal.)',
  aiEngines:          'List of AI engines where this URL or domain was cited. (Peec AI source data.)',
  aiBotActivity:      'Server log entries identifying named AI crawler bots (GPTBot, PerplexityBot, ClaudeBot, etc.) visiting this URL. (Avenue Z internal — server log analysis.)',
  matchStatus:        'Whether the published URL was found in GA4 (matched), missing (unmatched), is a redirect, or is unpublished. (Avenue Z internal.)',
  contentAction:      'Was this content created new, optimized from existing, or some other action? (Avenue Z internal — content calendar.)',
  recommendedAction:  "Suggested next action based on the row's data. (Avenue Z internal — heuristic.)",
  postLaunchAILift:   'Change in AI citations after content publication. (Avenue Z internal — Peec data.)',
  opportunityPriority:'Composite priority ranking based on competitor mentions and prompt coverage. (Avenue Z internal.)',
  suggestedPRAngle:   'Suggested PR positioning for the brand. (Avenue Z internal.)',
  themeCoverage:      'Themes the domain consistently covers. (Avenue Z internal — manual review.)',
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

// ─── Section wrapper used by every table on this tab ──────────────────────────
function SectionWrapper({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-white/[0.06] bg-bg-surface p-6">
      <div>
        <h3 className="text-sm font-bold text-white">{title}</h3>
        {description && <p className="mt-1 text-xs text-text-muted">{description}</p>}
      </div>
      {children}
    </div>
  )
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
function renderDelta(delta: number | null, mode: 'pp' | 'pct'): React.ReactNode {
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
// 1. Planned Content Performance (Section B)
// ═════════════════════════════════════════════════════════════════════════════
export interface PlannedContentRow {
  topic: string
  url: string | null
  contentType: string
  publishDate: string | null
  updateDate: string | null
  promptCoverage: number | null              // % (0-100)
  promptCoverageDelta: number | null         // pp change vs prior
  citationShare: number | null               // % (0-100)
  citationShareDelta: number | null          // pp change vs prior
  aiReferralTraffic: number | null           // session count
  aiReferralTrafficDelta: number | null      // % change vs prior
  organicSessions: number | null             // session count
  organicSessionsDelta: number | null        // % change vs prior
  engagementRate: number | null              // fraction [0,1]
  engagementRateDelta: number | null         // pp change vs prior
  _key: string
}

export function PlannedContentPerformanceTable({
  rows,
  ga4Connected,
  emptyMessage,
}: {
  rows: PlannedContentRow[]
  ga4Connected: boolean
  emptyMessage: string
}) {
  const columns: SortableColumn<PlannedContentRow>[] = [
    {
      key: 'contentPiece', label: 'Content Piece',
      tooltip: TT.calendarField,
      accessor: (r) => r.topic,
      render: (r) => r.url
        ? <a
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block max-w-[220px] truncate font-medium text-white underline-offset-2 hover:underline"
            title={`${r.topic} → ${r.url}`}
          >
            {r.topic}
          </a>
        : <span className="block max-w-[220px] truncate font-medium text-white" title={r.topic}>{r.topic}</span>,
    },
    {
      key: 'contentType', label: 'Content Type',
      tooltip: TT.calendarField,
      accessor: (r) => r.contentType,
      render: (r) => <span className="text-white/60">{r.contentType}</span>,
    },
    {
      key: 'publishDate', label: 'Publish Date',
      accessor: (r) => r.publishDate ?? '',
      render: (r) => <span className="text-[10px] text-white/40">{r.publishDate ?? '--'}</span>,
    },
    {
      key: 'updateDate', label: 'Last Updated',
      accessor: (r) => r.updateDate ?? '',
      render: (r) => <span className="text-[10px] text-white/40">{r.updateDate ?? '--'}</span>,
    },
    {
      key: 'promptCoverage', label: 'Prompt Coverage', align: 'right',
      tooltip: 'Percentage of tracked prompts citing this specific URL. (Avenue Z internal - derived from Peec per-URL prompt_id dimension.)',
      accessor: (r) => r.promptCoverage ?? -1,
      render: (r) => r.promptCoverage !== null
        ? (
          <div>
            <span className="tabular-nums text-white">{r.promptCoverage.toFixed(0)}%</span>
            {renderDelta(r.promptCoverageDelta, 'pp')}
          </div>
        )
        : <span className="text-white/20">--</span>,
    },
    {
      key: 'citationShare', label: 'Citation Share', align: 'right',
      tooltip: "This URL's share of total AI citations across all tracked URLs in the period. (Peec AI citation_count weighted by URL.)",
      accessor: (r) => r.citationShare ?? -1,
      render: (r) => r.citationShare !== null
        ? (
          <div>
            <span className="tabular-nums text-white">{r.citationShare.toFixed(1)}%</span>
            {renderDelta(r.citationShareDelta, 'pp')}
          </div>
        )
        : <span className="text-white/20">--</span>,
    },
    {
      key: 'aiReferralTraffic', label: 'AI Referral Traffic', align: 'right',
      tooltip: TT.aiReferredSessions,
      accessor: (r) => r.aiReferralTraffic ?? -1,
      render: (r) => r.aiReferralTraffic !== null
        ? (
          <div>
            <span className="tabular-nums text-white">{r.aiReferralTraffic.toLocaleString()}</span>
            {renderDelta(r.aiReferralTrafficDelta, 'pct')}
          </div>
        )
        : <span className="text-white/20">--</span>,
    },
    {
      key: 'organicSessions', label: 'Organic Sessions', align: 'right',
      tooltip: 'GA4 sessions whose default channel group is Organic Search. (GA4 sessionDefaultChannelGroup dimension.)',
      accessor: (r) => r.organicSessions ?? -1,
      render: (r) => r.organicSessions !== null
        ? (
          <div>
            <span className="tabular-nums text-white">{r.organicSessions.toLocaleString()}</span>
            {renderDelta(r.organicSessionsDelta, 'pct')}
          </div>
        )
        : <span className="text-white/20">--</span>,
    },
    {
      key: 'engagementRate', label: 'Engagement Rate', align: 'right',
      tooltip: TT.engagementRate,
      accessor: (r) => r.engagementRate ?? -1,
      render: (r) => r.engagementRate !== null
        ? (
          <div>
            <span className="tabular-nums text-white">{(r.engagementRate * 100).toFixed(1)}%</span>
            {renderDelta(r.engagementRateDelta, 'pp')}
          </div>
        )
        : <span className="text-white/20">--</span>,
    },
  ]

  return (
    <SectionWrapper
      title="Which planned content pieces are actually earning AI-driven engagement?"
      description="See where each URL is represented in AI citations, how often it is being retrieved, and whether that exposure is translating into referral traffic and meaningful on-site behavior."
    >
      <SortableTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r._key}
        initialPageSize={10}
        defaultSortKey="citationShare"
        defaultSortDir="desc"
        emptyMessage={emptyMessage}
      />
      {ga4Connected && (
        <p className="text-[10px] text-text-muted">
          AI Referral Traffic, Organic Sessions, Engagement Rate: GA4 page-level data. Rows without a match show --.
        </p>
      )}
    </SectionWrapper>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// FB-039: Section F Fullsite Content Performance (URL-row, 6 columns + deltas)
// ─────────────────────────────────────────────────────────────────────────────

export interface FullsiteContentPerformanceRow {
  pageTitle: string
  url: string
  promptCoverage: number | null
  promptCoverageDelta: number | null
  citationShare: number | null
  citationShareDelta: number | null
  aiReferralTraffic: number | null
  aiReferralTrafficDelta: number | null
  organicSessions: number | null
  organicSessionsDelta: number | null
  engagementRate: number | null
  engagementRateDelta: number | null
  _key: string
}

export function FullsiteContentPerformanceTable({
  rows,
  ga4Connected,
  emptyMessage = 'No cited owned-domain pages available from Peec AI',
}: {
  rows: FullsiteContentPerformanceRow[]
  ga4Connected: boolean
  emptyMessage?: string
}) {
  const columns: SortableColumn<FullsiteContentPerformanceRow>[] = [
    {
      key: 'pageTitle', label: 'Page',
      sortable: true,
      accessor: (r) => r.pageTitle.toLowerCase(),
      render: (r) => (
        <a
          href={r.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-white hover:underline"
          title={r.url}
        >
          {r.pageTitle}
        </a>
      ),
    },
    {
      key: 'promptCoverage', label: 'Prompt Coverage', align: 'right',
      sortable: true,
      accessor: (r) => r.promptCoverage ?? -1,
      render: (r) => (
        <div className="flex flex-col items-end">
          <span>{r.promptCoverage !== null ? `${r.promptCoverage.toFixed(1)}%` : '--'}</span>
          {renderDelta(r.promptCoverageDelta, 'pp')}
        </div>
      ),
    },
    {
      key: 'citationShare', label: 'Citation Share', align: 'right',
      sortable: true,
      accessor: (r) => r.citationShare ?? -1,
      render: (r) => (
        <div className="flex flex-col items-end">
          <span>{r.citationShare !== null ? `${r.citationShare.toFixed(1)}%` : '--'}</span>
          {renderDelta(r.citationShareDelta, 'pp')}
        </div>
      ),
    },
    {
      key: 'aiReferralTraffic', label: 'AI Referral Traffic', align: 'right',
      sortable: true,
      accessor: (r) => r.aiReferralTraffic ?? -1,
      render: (r) => (
        <div className="flex flex-col items-end">
          <span>{r.aiReferralTraffic !== null ? r.aiReferralTraffic.toLocaleString() : '--'}</span>
          {renderDelta(r.aiReferralTrafficDelta, 'pct')}
        </div>
      ),
    },
    {
      key: 'organicSessions', label: 'Organic Sessions', align: 'right',
      sortable: true,
      accessor: (r) => r.organicSessions ?? -1,
      render: (r) => (
        <div className="flex flex-col items-end">
          <span>{r.organicSessions !== null ? r.organicSessions.toLocaleString() : '--'}</span>
          {renderDelta(r.organicSessionsDelta, 'pct')}
        </div>
      ),
    },
    {
      key: 'engagementRate', label: 'Engagement Rate', align: 'right',
      sortable: true,
      accessor: (r) => r.engagementRate ?? -1,
      render: (r) => (
        <div className="flex flex-col items-end">
          <span>{r.engagementRate !== null ? `${r.engagementRate.toFixed(1)}%` : '--'}</span>
          {renderDelta(r.engagementRateDelta, 'pp')}
        </div>
      ),
    },
  ]

  return (
    <SectionWrapper
      title="What content across your domain is being cited by AI?"
      description="See every cited page across your site and measure its performance."
    >
      <SortableTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r._key}
        initialPageSize={10}
        defaultSortKey="citationShare"
        defaultSortDir="desc"
        emptyMessage={ga4Connected ? emptyMessage : 'Connect GA4 page-level data to populate'}
      />
    </SectionWrapper>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// 6. Top Competitor / Corporate Domains Cited in AI (Section H.1)
// ═════════════════════════════════════════════════════════════════════════════
export interface CompetitorDomainsCitedRow {
  domain: string
  citationCount: number
  promptCoverage: number | null
  themeCoverage: number | null
}

export function CompetitorDomainsCitedTable({
  rows,
  emptyMessage,
}: {
  rows: CompetitorDomainsCitedRow[]
  emptyMessage: string
}) {
  const maxCitations = Math.max(...rows.map((r) => r.citationCount), 1)

  const columns: SortableColumn<CompetitorDomainsCitedRow>[] = [
    {
      key: 'domain', label: 'Domain',
      accessor: (r) => r.domain,
      render: (r) => (
        <span className="block max-w-[150px] truncate font-medium text-white/80" title={r.domain}>{r.domain}</span>
      ),
    },
    {
      key: 'citationCount', label: 'Citation Count', align: 'right',
      tooltip: TT.aiCitations,
      accessor: (r) => r.citationCount,
      render: (r) => {
        const barWidth = (r.citationCount / maxCitations) * 100
        return (
          <div className="flex items-center justify-end gap-2">
            <div className="h-3 w-20 overflow-hidden rounded bg-white/[0.04]">
              <div className="h-full rounded bg-[#FF4444]/40" style={{ width: `${barWidth}%` }} />
            </div>
            <span className="tabular-nums text-white/60">{r.citationCount.toFixed(1)}%</span>
          </div>
        )
      },
    },
    {
      key: 'promptCoverage', label: 'Prompt Coverage %', align: 'right',
      tooltip: TT.promptCoverage,
      accessor: (r) => r.promptCoverage ?? -1,
      render: (r) => (
        <span className="tabular-nums text-white">
          {r.promptCoverage !== null ? `${r.promptCoverage}%` : '--'}
        </span>
      ),
    },
    {
      key: 'themeCoverage', label: 'Theme Coverage', align: 'right',
      tooltip: TT.themeCoverage,
      accessor: (r) => r.themeCoverage ?? -1,
      render: (r) => (
        <span className="tabular-nums text-white/60">
          {r.themeCoverage != null ? `${r.themeCoverage} theme${r.themeCoverage !== 1 ? 's' : ''}` : '--'}
        </span>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-xs font-bold text-white/60">Which competitor or corporate domains are cited most?</h4>
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
  articleTitle: string | null
  url: string | null
  promptCluster: string | null
  citationCount: number
  competitorsMentioned: string | null
  brandMentioned: string | null  // 'Yes' | 'No' | null
  opportunityPriority: string    // 'High' | 'Medium' | 'Low' | 'Review'
  suggestedPRAngle: string
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
      key: 'articleTitle', label: 'Article Title',
      accessor: (r) => r.articleTitle ?? '',
      render: (r) => r.articleTitle
        ? <span className="block max-w-[180px] truncate text-white/70" title={r.articleTitle}>{r.articleTitle}</span>
        : <span className="text-white/20">--</span>,
    },
    {
      key: 'url', label: 'URL',
      accessor: (r) => r.url ?? '',
      render: (r) => r.url
        ? <span className="block max-w-[180px] truncate font-mono text-[10px] text-white/50" title={r.url}>{r.url}</span>
        : <span className="text-white/20">--</span>,
    },
    {
      key: 'promptCluster', label: 'Prompt Cluster',
      accessor: (r) => r.promptCluster ?? '',
      render: (r) => r.promptCluster
        ? <span className="text-white/60">{r.promptCluster}</span>
        : <span className="text-white/40">--</span>,
    },
    {
      key: 'citationCount', label: 'Citation Count', align: 'right',
      tooltip: TT.aiCitations,
      accessor: (r) => r.citationCount,
      render: (r) => <span className="tabular-nums text-white">{r.citationCount.toFixed(1)}%</span>,
    },
    {
      key: 'competitorsMentioned', label: 'Competitors Mentioned',
      accessor: (r) => r.competitorsMentioned ?? '',
      render: (r) => r.competitorsMentioned
        ? <span className="text-white/70">{r.competitorsMentioned}</span>
        : <span className="text-white/20">--</span>,
    },
    {
      key: 'brandMentioned', label: 'Brand Mentioned',
      accessor: (r) => r.brandMentioned ?? '',
      render: (r) => r.brandMentioned
        ? <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', r.brandMentioned === 'No' ? 'bg-[#FF4444]/10 text-[#FF4444]' : 'bg-[#60FF80]/10 text-[#60FF80]')}>{r.brandMentioned}</span>
        : <span className="text-white/40">--</span>,
    },
    {
      key: 'opportunityPriority', label: 'Opportunity Priority',
      tooltip: TT.opportunityPriority,
      accessor: (r) => r.opportunityPriority,
      render: (r) => (
        <span className="rounded-full bg-[#FFFC60]/10 px-2 py-0.5 text-[10px] font-semibold text-[#FFFC60]">
          {r.opportunityPriority}
        </span>
      ),
    },
    {
      key: 'suggestedPRAngle', label: 'Suggested PR Angle',
      tooltip: TT.suggestedPRAngle,
      accessor: (r) => r.suggestedPRAngle,
      render: (r) => <span className="block max-w-[200px] text-[11px] text-white/50">{r.suggestedPRAngle}</span>,
    },
  ]

  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-xs font-bold text-white/60">Where are competitors cited and we&apos;re absent?</h4>
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

