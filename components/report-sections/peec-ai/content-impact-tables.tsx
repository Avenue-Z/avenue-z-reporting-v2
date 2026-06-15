'use client'

import { Globe2, Sparkles } from 'lucide-react'
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
  opportunityNote:    'Why this row represents an opportunity. (Avenue Z internal.)',
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

// ═════════════════════════════════════════════════════════════════════════════
// 1. Planned Content Performance (Section B)
// ═════════════════════════════════════════════════════════════════════════════
export interface PlannedContentRow {
  topic: string
  url: string | null
  contentType: string
  status: string
  contentAction: string
  publishDate: string | null
  updateDate: string | null
  sessions: number | null
  users: number | null
  views: number | null
  engagementRate: number | null
  aiCitations: number | null
  aiBotActivity: number | null
  aiReferredSessions: number | null
  matchStatus: MatchStatus
  recommendedAction: string
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
      key: 'topic', label: 'Topic',
      tooltip: TT.calendarField,
      accessor: (r) => r.topic,
      render: (r) => <span className="block max-w-[160px] truncate font-medium text-white" title={r.topic}>{r.topic}</span>,
    },
    {
      key: 'url', label: 'URL',
      tooltip: TT.calendarField,
      accessor: (r) => r.url ?? '',
      render: (r) => r.url
        ? <span className="block max-w-[180px] truncate font-mono text-[10px] text-white/50" title={r.url}>{r.url}</span>
        : <span className="text-white/20">--</span>,
    },
    {
      key: 'contentType', label: 'Content Type',
      tooltip: TT.calendarField,
      accessor: (r) => r.contentType,
      render: (r) => <span className="text-white/60">{r.contentType}</span>,
    },
    {
      key: 'status', label: 'Status',
      tooltip: TT.calendarField,
      accessor: (r) => r.status,
      render: (r) => <span className="text-white/60">{r.status}</span>,
    },
    {
      key: 'contentAction', label: 'Content Action',
      tooltip: TT.contentAction,
      accessor: (r) => r.contentAction,
      render: (r) => (
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize', ACTION_COLORS[r.contentAction])}>
          {r.contentAction}
        </span>
      ),
    },
    {
      key: 'publishDate', label: 'Publish Date',
      accessor: (r) => r.publishDate ?? '',
      render: (r) => <span className="text-[10px] text-white/40">{r.publishDate ?? '--'}</span>,
    },
    {
      key: 'updateDate', label: 'Update Date',
      accessor: (r) => r.updateDate ?? '',
      render: (r) => <span className="text-[10px] text-white/40">{r.updateDate ?? '--'}</span>,
    },
    {
      key: 'sessions', label: 'Sessions', align: 'right',
      tooltip: TT.sessions,
      accessor: (r) => r.sessions ?? -1,
      render: (r) => r.sessions !== null
        ? <span className="tabular-nums text-white">{r.sessions.toLocaleString()}</span>
        : <span className="text-white/20">--</span>,
    },
    {
      key: 'users', label: 'Users', align: 'right',
      tooltip: TT.users,
      accessor: (r) => r.users ?? -1,
      render: (r) => r.users !== null
        ? <span className="tabular-nums text-white/70">{r.users.toLocaleString()}</span>
        : <span className="text-white/20">--</span>,
    },
    {
      key: 'views', label: 'Views', align: 'right',
      tooltip: TT.views,
      accessor: (r) => r.views ?? -1,
      render: (r) => r.views !== null
        ? <span className="tabular-nums text-white/70">{r.views.toLocaleString()}</span>
        : <span className="text-white/20">--</span>,
    },
    {
      key: 'engagementRate', label: 'Engagement Rate', align: 'right',
      tooltip: TT.engagementRate,
      accessor: (r) => r.engagementRate ?? -1,
      render: (r) => r.engagementRate !== null
        ? <span className="tabular-nums text-white/70">{(r.engagementRate * 100).toFixed(1)}%</span>
        : <span className="text-white/20">--</span>,
    },
    {
      key: 'aiCitations', label: 'AI Citations', align: 'right',
      tooltip: TT.aiCitations,
      accessor: (r) => r.aiCitations ?? -1,
      render: (r) => r.aiCitations !== null
        ? <span className="tabular-nums text-white">{r.aiCitations}</span>
        : <span className="text-white/20">--</span>,
    },
    {
      key: 'aiBotActivity', label: 'AI Bot Activity', align: 'right',
      tooltip: TT.aiBotActivity,
      accessor: (r) => r.aiBotActivity ?? -1,
      render: (r) => (r.aiBotActivity ?? 0) > 0
        ? <span className="tabular-nums text-[#60FDFF]">{r.aiBotActivity}</span>
        : <span className="text-white/20">0</span>,
    },
    {
      key: 'aiReferredSessions', label: 'AI-Referred Sessions', align: 'right',
      tooltip: TT.aiReferredSessions,
      accessor: (r) => r.aiReferredSessions ?? -1,
      render: (r) => r.aiReferredSessions !== null
        ? <span className="tabular-nums text-white">{r.aiReferredSessions.toLocaleString()}</span>
        : <span className="text-white/20">--</span>,
    },
    {
      key: 'matchStatus', label: 'Match Status',
      tooltip: TT.matchStatus,
      accessor: (r) => r.matchStatus,
      render: (r) => (
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize', MATCH_STATUS_COLORS[r.matchStatus])}>
          {r.matchStatus}
        </span>
      ),
    },
    {
      key: 'recommendedAction', label: 'Recommended Action',
      tooltip: TT.recommendedAction,
      accessor: (r) => r.recommendedAction,
      render: (r) => <span className="block max-w-[200px] text-[11px] text-white/50">{r.recommendedAction}</span>,
    },
  ]

  return (
    <SectionWrapper
      title="How is each planned content piece performing?"
      description="Each content-calendar URL tracked against AI citations and bot activity. Connect GA4 for sessions, users, views, and engagement rate."
    >
      <SortableTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r._key}
        initialPageSize={50}
        emptyMessage={emptyMessage}
      />
      {ga4Connected && (
        <p className="text-[10px] text-text-muted">
          Sessions, Users, Views, and Engagement Rate: GA4 page-level data. Rows without a match show --.
        </p>
      )}
      <div className="flex flex-col gap-1.5 rounded-lg border border-white/[0.04] bg-white/[0.02] p-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Match Status Definitions</p>
        <div className="flex flex-wrap gap-3">
          {(Object.entries(MATCH_STATUS_COLORS) as [MatchStatus, string][]).map(([status, cls]) => (
            <span key={status} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${cls}`}>{status}</span>
          ))}
        </div>
        <p className="text-[10px] text-text-muted">
          Content Action: <span className="text-white/40">New</span> = net-new publish,{' '}
          <span className="text-white/40">Optimized</span> = existing page refreshed or rewritten,{' '}
          <span className="text-white/40">Other</span> = unclassified
        </p>
      </div>
    </SectionWrapper>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. Owned Content Cited in AI (Section F)
// ═════════════════════════════════════════════════════════════════════════════
export interface OwnedContentCitedRow {
  urlOrDomain: string
  topic: string | null
  promptCluster: string | null
  aiCitationCount: number       // citationRate %
  aiEnginesCiting: string | null
  avgCitations: number | null
  aiReferredSessions: number | null
  postLaunchAILift: number      // retrievedDelta
  recommendedAction: string
}

export function OwnedContentCitedTable({
  rows,
  emptyMessage,
}: {
  rows: OwnedContentCitedRow[]
  emptyMessage: string
}) {
  const columns: SortableColumn<OwnedContentCitedRow>[] = [
    {
      key: 'urlOrDomain', label: 'URL / Domain',
      accessor: (r) => r.urlOrDomain,
      render: (r) => <span className="font-medium text-white">{r.urlOrDomain}</span>,
    },
    {
      key: 'topic', label: 'Topic',
      tooltip: TT.calendarField,
      accessor: (r) => r.topic ?? '',
      render: (r) => r.topic
        ? <span className="text-white/70">{r.topic}</span>
        : <span className="text-white/40">--</span>,
    },
    {
      key: 'promptCluster', label: 'Prompt Cluster',
      accessor: (r) => r.promptCluster ?? '',
      render: (r) => r.promptCluster
        ? <span className="text-white/70">{r.promptCluster}</span>
        : <span className="text-white/40">--</span>,
    },
    {
      key: 'aiCitationCount', label: 'AI Citation Count', align: 'right',
      tooltip: TT.aiCitations,
      accessor: (r) => r.aiCitationCount,
      render: (r) => <span className="tabular-nums text-white">{r.aiCitationCount.toFixed(1)}%</span>,
    },
    {
      key: 'aiEnginesCiting', label: 'AI Engines Citing',
      tooltip: TT.aiEngines,
      accessor: (r) => r.aiEnginesCiting ?? '',
      render: (r) => r.aiEnginesCiting
        ? <span className="text-white/70">{r.aiEnginesCiting}</span>
        : <span className="text-white/40">--</span>,
    },
    {
      key: 'avgCitations', label: 'Avg. Citations', align: 'right',
      tooltip: "Average number of times this domain's URLs are cited per AI answer in which they appear (Peec AI — citation_avg). Higher = cited more often.",
      accessor: (r) => r.avgCitations ?? 0,
      render: (r) => r.avgCitations !== null
        ? <span className="tabular-nums text-white">{r.avgCitations.toFixed(1)}</span>
        : <span className="text-white/40">--</span>,
    },
    {
      key: 'aiReferredSessions', label: 'AI-Referred Sessions', align: 'right',
      tooltip: TT.aiReferredSessions,
      accessor: (r) => r.aiReferredSessions ?? -1,
      render: (r) => r.aiReferredSessions !== null
        ? <span className="tabular-nums text-white">{r.aiReferredSessions.toLocaleString()}</span>
        : <span className="text-white/40">--</span>,
    },
    {
      key: 'postLaunchAILift', label: 'Post-Launch AI Lift', align: 'right',
      tooltip: TT.postLaunchAILift,
      accessor: (r) => r.postLaunchAILift,
      render: (r) => r.postLaunchAILift !== 0 ? (
        <span className={cn('text-xs font-semibold tabular-nums', r.postLaunchAILift > 0 ? 'text-[#60FF80]' : 'text-[#FF4444]')}>
          {r.postLaunchAILift > 0 ? '+' : ''}{r.postLaunchAILift.toFixed(1)}%
        </span>
      ) : <span className="text-white/40">--</span>,
    },
    {
      key: 'recommendedAction', label: 'Recommended Action',
      tooltip: TT.recommendedAction,
      accessor: (r) => r.recommendedAction,
      render: (r) => <span className="text-[11px] text-white/50">{r.recommendedAction}</span>,
    },
  ]

  return (
    <SectionWrapper
      title="Which of our owned pages do AI engines cite?"
      description="Your owned domains and URLs that appear in AI-generated responses. Ranked by citation frequency."
    >
      <SortableTable
        columns={columns}
        rows={rows}
        rowKey={(r, i) => `${r.urlOrDomain}-${i}`}
        initialPageSize={25}
        emptyMessage={emptyMessage}
      />
    </SectionWrapper>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. Traffic but No AI Citations (Section G.1)
// ═════════════════════════════════════════════════════════════════════════════
export interface TrafficNoCitationsRow {
  url: string
  topic: string
  sessions: number
  aiCitations: number
  opportunityNote: string
}

export function TrafficNoCitationsTable({
  rows,
  emptyMessage,
}: {
  rows: TrafficNoCitationsRow[]
  emptyMessage: string
}) {
  const columns: SortableColumn<TrafficNoCitationsRow>[] = [
    {
      key: 'url', label: 'URL',
      accessor: (r) => r.url,
      render: (r) => <span className="font-mono text-[10px] text-white/70">{r.url}</span>,
    },
    {
      key: 'topic', label: 'Topic',
      tooltip: TT.calendarField,
      accessor: (r) => r.topic,
      render: (r) => <span className="text-white/70">{r.topic}</span>,
    },
    {
      key: 'sessions', label: 'Sessions', align: 'right',
      tooltip: TT.sessions,
      accessor: (r) => r.sessions,
      render: (r) => <span className="tabular-nums text-white">{r.sessions.toLocaleString()}</span>,
    },
    {
      key: 'aiCitations', label: 'AI Citations', align: 'right',
      tooltip: TT.aiCitations,
      accessor: (r) => r.aiCitations,
      render: (r) => (
        <span className="rounded-full bg-[#FF4444]/10 px-2 py-0.5 text-[10px] font-semibold text-[#FF4444]">
          {r.aiCitations} citations
        </span>
      ),
    },
    {
      key: 'opportunityNote', label: 'Opportunity Note',
      tooltip: TT.opportunityNote,
      accessor: (r) => r.opportunityNote,
      render: (r) => <span className="text-[11px] text-white/60">{r.opportunityNote}</span>,
    },
  ]

  return (
    <SubSectionWrapper
      badge="1"
      badgeColor="bg-[#39A0FF]/10 text-[#39A0FF]"
      title="Which pages get traffic but no AI citations?"
      description="High-traffic owned pages not cited by any AI tool. Priority AEO optimization candidates."
    >
      <SortableTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.url}
        emptyMessage={emptyMessage}
      />
    </SubSectionWrapper>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. AI Citations but Little Human Traffic (Section G.2)
// ═════════════════════════════════════════════════════════════════════════════
export interface CitationsLittleTrafficRow {
  url: string
  topic: string
  aiCitations: number
  sessions: number
  opportunityNote: string
}

export function CitationsLittleTrafficTable({
  rows,
  emptyMessage,
}: {
  rows: CitationsLittleTrafficRow[]
  emptyMessage: string
}) {
  const columns: SortableColumn<CitationsLittleTrafficRow>[] = [
    {
      key: 'url', label: 'URL',
      accessor: (r) => r.url,
      render: (r) => <span className="font-mono text-[10px] text-white/70">{r.url}</span>,
    },
    {
      key: 'topic', label: 'Topic',
      tooltip: TT.calendarField,
      accessor: (r) => r.topic,
      render: (r) => <span className="text-white/70">{r.topic}</span>,
    },
    {
      key: 'aiCitations', label: 'AI Citations', align: 'right',
      tooltip: TT.aiCitations,
      accessor: (r) => r.aiCitations,
      render: (r) => <span className="tabular-nums text-white">{r.aiCitations}</span>,
    },
    {
      key: 'sessions', label: 'Sessions', align: 'right',
      tooltip: TT.sessions,
      accessor: (r) => r.sessions,
      render: (r) => <span className="tabular-nums text-white">{r.sessions.toLocaleString()}</span>,
    },
    {
      key: 'opportunityNote', label: 'Opportunity Note',
      tooltip: TT.opportunityNote,
      accessor: (r) => r.opportunityNote,
      render: (r) => <span className="text-[11px] text-white/60">{r.opportunityNote}</span>,
    },
  ]

  return (
    <SubSectionWrapper
      badge="2"
      badgeColor="bg-[#60FF80]/10 text-[#60FF80]"
      title="Which pages get AI citations but little human traffic?"
      description="Pages AI tools cite frequently but with low GA4 sessions. Indicates CTA or UX conversion gap."
    >
      <SortableTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.url}
        emptyMessage={emptyMessage}
      />
    </SubSectionWrapper>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// 5. AI Bot Attention but No Citations or Human Visits (Section G.3)
// ═════════════════════════════════════════════════════════════════════════════
export interface BotAttentionNoCitationsRow {
  urlPath: string
  topic: string
  aiBotVisits: number
  aiCitations: number | null
  aiReferredSessions: number | null
  opportunityNote: string
}

export function BotAttentionNoCitationsTable({
  rows,
  emptyMessage,
}: {
  rows: BotAttentionNoCitationsRow[]
  emptyMessage: string
}) {
  const columns: SortableColumn<BotAttentionNoCitationsRow>[] = [
    {
      key: 'urlPath', label: 'URL Path',
      accessor: (r) => r.urlPath,
      render: (r) => <span className="font-mono text-[10px] text-white/60">{r.urlPath}</span>,
    },
    {
      key: 'topic', label: 'Topic (Calendar)',
      tooltip: TT.calendarField,
      accessor: (r) => r.topic,
      render: (r) => <span className="text-white/50">{r.topic}</span>,
    },
    {
      key: 'aiBotVisits', label: 'AI Bot Visits', align: 'right',
      tooltip: TT.aiBotActivity,
      accessor: (r) => r.aiBotVisits,
      render: (r) => <span className="tabular-nums text-white">{r.aiBotVisits}</span>,
    },
    {
      key: 'aiCitations', label: 'AI Citations', align: 'right',
      tooltip: TT.aiCitations,
      accessor: (r) => r.aiCitations ?? -1,
      render: (r) => r.aiCitations !== null
        ? <span className="tabular-nums text-white">{r.aiCitations}</span>
        : <span className="text-white/40">--</span>,
    },
    {
      key: 'aiReferredSessions', label: 'AI-Referred Sessions', align: 'right',
      tooltip: TT.aiReferredSessions,
      accessor: (r) => r.aiReferredSessions ?? -1,
      render: (r) => r.aiReferredSessions !== null
        ? <span className="tabular-nums text-white/70">{r.aiReferredSessions}</span>
        : <span className="text-white/20">--</span>,
    },
    {
      key: 'opportunityNote', label: 'Opportunity Note',
      tooltip: TT.opportunityNote,
      accessor: (r) => r.opportunityNote,
      render: (r) => <span className="text-[11px] text-white/50">{r.opportunityNote}</span>,
    },
  ]

  return (
    <SubSectionWrapper
      badge="3"
      badgeColor="bg-[#FFFC60]/10 text-[#FFFC60]"
      title="Which pages have AI bot attention but no citations or human visits?"
      description="Pages AI crawlers visit but don't cite. Signals content quality or format issues preventing LLM extraction."
    >
      <SortableTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.urlPath}
        initialPageSize={10}
        emptyMessage={emptyMessage}
      />
    </SubSectionWrapper>
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

// ═════════════════════════════════════════════════════════════════════════════
// 8. Repeated Competitor Pages Across Themes (Section H.3)
// ═════════════════════════════════════════════════════════════════════════════
export interface RepeatedCompetitorPagesRow {
  url: string
  competitor: string
  clusters: string[]
  citations: number
  avgPos: number
}

export function RepeatedCompetitorPagesTable({
  rows,
  emptyMessage,
}: {
  rows: RepeatedCompetitorPagesRow[]
  emptyMessage: string
}) {
  const columns: SortableColumn<RepeatedCompetitorPagesRow>[] = [
    {
      key: 'url', label: 'Competitor URL',
      accessor: (r) => r.url,
      render: (r) => (
        <span className="block max-w-[220px] truncate font-mono text-[10px] text-white/70" title={r.url}>
          {r.url}
        </span>
      ),
    },
    {
      key: 'competitor', label: 'Competitor',
      accessor: (r) => r.competitor,
      render: (r) => <span className="font-medium text-white/80">{r.competitor}</span>,
    },
    {
      key: 'clusters', label: 'Prompt Clusters Cited In',
      tooltip: 'Prompt clusters where this competitor URL appears as a cited source. (Avenue Z internal — grouping of Peec AI tracked prompts.)',
      accessor: (r) => r.clusters.join(', '),
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.clusters.map((c) => (
            <span key={c} className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-white/60">{c}</span>
          ))}
        </div>
      ),
    },
    {
      key: 'citations', label: 'Total Citations', align: 'right',
      tooltip: TT.aiCitations,
      accessor: (r) => r.citations,
      render: (r) => <span className="tabular-nums text-white">{r.citations}</span>,
    },
    {
      key: 'avgPos', label: 'Avg Position', align: 'right',
      tooltip: TT.position,
      accessor: (r) => r.avgPos,
      render: (r) => <span className="tabular-nums text-white">#{r.avgPos.toFixed(1)}</span>,
    },
  ]

  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-xs font-bold text-white/60">Which competitor pages repeat across our target themes?</h4>
      <p className="text-xs text-text-muted">
        Specific competitor pages cited across multiple prompt clusters. These are the pages your content needs to outperform.
      </p>
      <SortableTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.url}
        initialPageSize={10}
        emptyMessage={emptyMessage}
      />
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// 9. AI Systems Interacting with Our Content (Section I)
// ═════════════════════════════════════════════════════════════════════════════
export interface AISystemsInteractingRow {
  botId: string
  botName: string
  botType: string | null
  totalVisits: number
  uniquePages: number
  successRate: number | null
  lastSeen: string | null
}

export function AISystemsInteractingTable({
  rows,
  totalBotVisits,
  emptyMessage,
}: {
  rows: AISystemsInteractingRow[]
  totalBotVisits: number
  emptyMessage: string
}) {
  const columns: SortableColumn<AISystemsInteractingRow>[] = [
    {
      key: 'botName', label: 'AI Platform / Bot',
      accessor: (r) => r.botName,
      render: (r) => <span className="font-medium text-white">{r.botName}</span>,
    },
    {
      key: 'botType', label: 'Bot Type',
      tooltip: 'Classification of the AI bot: Training (data harvest for model training), Retrieval (real-time fetch for in-product answers), Search (indexing for AI-augmented search), or Agent (autonomous browsing). (Peec AI agent analytics catalog.)',
      accessor: (r) => r.botType ?? '',
      render: (r) => {
        const typeLabel = r.botType === 'training' ? 'Training'
          : r.botType === 'retrieval' ? 'Retrieval'
          : r.botType === 'search' ? 'Search'
          : 'Agent'
        return (
          <span className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-semibold',
            r.botType === 'training'  ? 'bg-[#FFFC60]/10 text-[#FFFC60]' :
            r.botType === 'retrieval' ? 'bg-[#60FDFF]/10 text-[#60FDFF]' :
            r.botType === 'search'    ? 'bg-[#60FF80]/10 text-[#60FF80]' :
            'bg-white/[0.06] text-white/40',
          )}>
            {typeLabel}
          </span>
        )
      },
    },
    {
      key: 'totalVisits', label: 'Total Visits (30d)', align: 'right',
      tooltip: TT.aiBotActivity,
      accessor: (r) => r.totalVisits,
      render: (r) => <span className="tabular-nums text-white">{r.totalVisits.toLocaleString()}</span>,
    },
    {
      key: 'uniquePages', label: 'Unique Pages', align: 'right',
      tooltip: 'Distinct URL paths this bot visited in the lookback window. (Avenue Z internal — derived from Peec agent analytics logs.)',
      accessor: (r) => r.uniquePages,
      render: (r) => <span className="tabular-nums text-white/60">{r.uniquePages}</span>,
    },
    {
      key: 'successRate', label: '2xx Success Rate', align: 'right',
      tooltip: 'Share of bot requests returning a 2xx HTTP status. Low values indicate the bot is hitting redirects, 404s, or 5xx errors. (Avenue Z internal — derived from server log status codes.)',
      accessor: (r) => r.successRate ?? -1,
      render: (r) => r.successRate !== null ? (
        <span className={cn(
          'font-semibold tabular-nums',
          r.successRate >= 0.8 ? 'text-[#60FF80]' : r.successRate >= 0.4 ? 'text-[#FFFC60]' : 'text-[#FF4444]',
        )}>
          {Math.round(r.successRate * 100)}%
        </span>
      ) : <span className="text-white/20">--</span>,
    },
    {
      key: 'lastSeen', label: 'Last Seen',
      tooltip: 'Timestamp of the most recent log entry for this bot. (Avenue Z internal — server log timestamps.)',
      accessor: (r) => r.lastSeen ?? '',
      render: (r) => <span className="font-mono text-[10px] text-white/30">{r.lastSeen ?? '--'}</span>,
    },
  ]

  const hasData = rows.length > 0

  return (
    <SectionWrapper
      title="Which AI systems are interacting with our content?"
      description="Which AI crawlers are actively indexing owned content, their visit frequency, and which pages they target most."
    >
      {hasData ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {rows.slice(0, 6).map((bot) => (
              <div key={bot.botId} className="flex flex-col gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="flex items-center gap-1.5">
                  <Globe2 className="h-3.5 w-3.5 text-text-muted" />
                  <span className="text-[11px] font-bold text-white/70">{bot.botName}</span>
                </div>
                <span className="text-lg font-bold text-white">{bot.totalVisits.toLocaleString()}</span>
                <span className="text-[10px] text-text-muted">visits / 30d</span>
                <span className="text-[10px] text-text-muted">{bot.uniquePages} pages crawled</span>
                {bot.successRate !== null && (
                  <div className="mt-1 flex items-center gap-1">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className={cn('h-full rounded-full',
                          bot.successRate >= 0.8 ? 'bg-[#60FF80]'
                            : bot.successRate >= 0.4 ? 'bg-[#FFFC60]'
                            : 'bg-[#FF4444]',
                        )}
                        style={{ width: `${Math.round(bot.successRate * 100)}%` }}
                      />
                    </div>
                    <span className="text-[9px] text-white/30">{Math.round(bot.successRate * 100)}% 2xx</span>
                  </div>
                )}
              </div>
            ))}
          </div>
          <SortableTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.botId}
            initialPageSize={25}
            emptyMessage={emptyMessage}
          />
          <p className="text-[10px] text-text-muted">
            {totalBotVisits.toLocaleString()} total AI bot visits in the last 30 days across {rows.length} platforms.
          </p>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {['GPTBot', 'ClaudeBot', 'PerplexityBot', 'GoogleBot-AI', 'CCBot', 'Applebot'].map((bot) => (
            <div key={bot} className="flex flex-col gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="flex items-center gap-1.5">
                <Globe2 className="h-3.5 w-3.5 text-text-muted" />
                <span className="text-[11px] font-bold text-white/50">{bot}</span>
              </div>
              <span className="text-sm font-bold text-white/20">--</span>
              <span className="text-[10px] text-text-muted">visits, pending</span>
            </div>
          ))}
        </div>
      )}
    </SectionWrapper>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// 10. Content Team Recommended Actions (Section J)
// ═════════════════════════════════════════════════════════════════════════════
export interface ContentTeamRecommendationsRow {
  urlOrTopic: string
  issueOpportunity: string
  evidenceType: string
  suggestedAction: string
  reason: string
  priority: 'High' | 'Medium' | 'Low'
  owner: string
}

const PRIORITY_COLORS: Record<string, string> = {
  High:   'bg-[#FF4444]/10 text-[#FF4444]',
  Medium: 'bg-[#FFFC60]/10 text-[#FFFC60]',
  Low:    'bg-[#60FF80]/10 text-[#60FF80]',
}

export function ContentTeamRecommendationsTable({
  rows,
  emptyMessage,
}: {
  rows: ContentTeamRecommendationsRow[]
  emptyMessage: string
}) {
  const columns: SortableColumn<ContentTeamRecommendationsRow>[] = [
    {
      key: 'urlOrTopic', label: 'URL / Topic',
      accessor: (r) => r.urlOrTopic,
      render: (r) => <span className="font-medium text-white">{r.urlOrTopic}</span>,
    },
    {
      key: 'issueOpportunity', label: 'Issue / Opportunity',
      tooltip: 'What signal triggered this recommendation. (Avenue Z internal — derived from connected data sources.)',
      accessor: (r) => r.issueOpportunity,
      render: (r) => <span className="text-white/60">{r.issueOpportunity}</span>,
    },
    {
      key: 'evidenceType', label: 'Evidence Type',
      tooltip: 'Which data source surfaced this recommendation (Peec AI, AI Bot logs, Content Calendar, GA4, etc.). (Avenue Z internal.)',
      accessor: (r) => r.evidenceType,
      render: (r) => <span className="text-white/50">{r.evidenceType}</span>,
    },
    {
      key: 'suggestedAction', label: 'Suggested Action',
      tooltip: TT.recommendedAction,
      accessor: (r) => r.suggestedAction,
      render: (r) => <span className="text-white/60">{r.suggestedAction}</span>,
    },
    {
      key: 'reason', label: 'Reason',
      tooltip: 'Why this action is expected to improve AI visibility or human performance. (Avenue Z internal — heuristic.)',
      accessor: (r) => r.reason,
      render: (r) => <span className="text-white/50">{r.reason}</span>,
    },
    {
      key: 'priority', label: 'Priority',
      tooltip: 'High / Medium / Low ranking for the recommended action. (Avenue Z internal — heuristic.)',
      accessor: (r) => r.priority === 'High' ? 0 : r.priority === 'Medium' ? 1 : 2,
      render: (r) => (
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', PRIORITY_COLORS[r.priority] ?? 'bg-white/[0.06] text-white/40')}>
          {r.priority}
        </span>
      ),
    },
    {
      key: 'owner', label: 'Owner',
      tooltip: 'Suggested team responsible for execution. (Avenue Z internal.)',
      accessor: (r) => r.owner,
      render: (r) => (
        <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-white/40">{r.owner}</span>
      ),
    },
  ]

  return (
    <div className="rounded-xl border border-[#60FDFF]/20 bg-[#60FDFF]/[0.03] p-6">
      <div className="mb-4 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-[#60FDFF]" />
        <span className="text-sm font-bold text-white">What should the content team do next?</span>
      </div>
      <SortableTable
        columns={columns}
        rows={rows}
        rowKey={(r, i) => `${r.urlOrTopic}-${i}`}
        initialPageSize={25}
        emptyMessage={emptyMessage}
      />
      <p className="mt-4 text-[10px] text-text-muted">
        Opportunity Score = 30% human performance potential + 25% AI citation gap + 20% competitor pressure + 15% AI bot attention + 10% content freshness
      </p>
    </div>
  )
}
