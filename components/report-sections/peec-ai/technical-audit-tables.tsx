'use client'

import { TrendingUp, TrendingDown, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SFIssueDelta, SFDeltaStatus, SFData } from '@/lib/screaming-frog/types'
import type { AgentBot, AgentAnalyticsData } from '@/lib/peec/agent-analytics'
import type { UrlCitation } from '@/lib/peec/url-citations'
import { urlJoinKey } from '@/lib/url'
import { SortableTable, type SortableColumn } from './sortable-table'
import type { FixListRow } from '@/lib/peec/fix-list'
import { PEEC, SITEBULB, SCREAMING_FROG } from '@/lib/peec/metric-definitions'
import { InfoTooltip } from '@/components/ui/info-tooltip'

// ── Shared style constants ────────────────────────────────────────────────────

type Priority = 'Critical' | 'High' | 'Medium' | 'Low'

const PRIORITY_STYLE: Record<Priority, string> = {
  Critical: 'bg-[#FF4444]/20 text-[#FF4444]',
  High:     'bg-[#FF4444]/10 text-[#FF4444]',
  Medium:   'bg-[#FFFC60]/10 text-[#FFFC60]',
  Low:      'bg-white/[0.06] text-white/40',
}

const DELTA_STATUS_STYLE: Record<SFDeltaStatus, string> = {
  New:        'bg-[#FF4444]/10 text-[#FF4444]',
  Persistent: 'bg-[#FFFC60]/10 text-[#FFFC60]',
  Improved:   'bg-[#60FF80]/10 text-[#60FF80]',
  Resolved:   'bg-[#60FF80]/10 text-[#60FF80]',
  Unchanged:  'bg-white/[0.06] text-white/40',
}

// ── Avenue Z internal tooltip strings ─────────────────────────────────────────
// Centralized so heading/section tooltips and column tooltips stay in sync.

const AVZ_BOT_PLATFORM       = 'Identified AI crawler bot detected in server logs. (Avenue Z internal — log analysis.)'
const AVZ_BOT_TYPE           = 'Bot classification: Indexing (search/citation), Training (model training), Agent (active user agents like ChatGPT browsing). (Avenue Z internal.)'
const AVZ_TOTAL_VISITS_30D   = 'Total server-log requests from this bot over the last 30 days. (Avenue Z internal.)'
const AVZ_UNIQUE_PAGES       = 'Distinct URL paths visited by this bot. (Avenue Z internal.)'
const AVZ_2XX_RATE           = 'Percentage of requests from this bot that returned a 2xx success status. (Avenue Z internal.)'
const AVZ_LAST_SEEN          = 'Most recent server-log entry for this bot. (Avenue Z internal.)'
const AVZ_AI_INDEX_VISITS    = 'Server-log visits classified by bot type. (Avenue Z internal.)'
const AVZ_HUMAN_FROM_AI      = 'GA4 sessions whose referrer matches an AI engine domain. (GA4 + Avenue Z referrer list.)'
const AVZ_PRIORITY_FLAG      = 'Flagged when a page has both AI activity and a high-severity Sitebulb hint. (Avenue Z internal.)'
const AVZ_REQUEST_COUNT      = 'Total requests from this bot to this URL. (Avenue Z internal.)'
const AVZ_REDIRECTED         = 'Whether the request was redirected (3xx). (Server log.)'
const AVZ_LOW_VALUE_ENDPOINT = 'Endpoint heuristically classified as low-value crawl. (Avenue Z internal.)'
const AVZ_STRATEGIC_PAGE     = 'Whether the URL matches the strategic-page list. (Avenue Z internal.)'
const AVZ_RECOMMENDED_ACTION = 'Suggested remediation. (Avenue Z internal — heuristic.)'
const AVZ_AI_ACTIVITY_PRESENT = 'Whether this URL has any logged AI bot activity. (Avenue Z internal.)'
const AVZ_WHY_IT_MATTERS     = 'Why this issue affects AI visibility. (Avenue Z internal.)'
const AVZ_OWNER              = 'Recommended owner team: SEO, Dev, Content, or PR. (Avenue Z internal.)'
const AVZ_PAGE_TYPE          = 'Page classification: Article, Product, Homepage, etc. (Avenue Z internal — URL pattern heuristic.)'
const AVZ_PREV_CURRENT_DELTA = 'Issue count from the prior crawl / current crawl / delta. (Sitebulb.)'
const SITEBULB_EXAMPLE_URL   = 'URL impacted by the issue. (Sitebulb.)'

// ── Shared section card wrapper ───────────────────────────────────────────────

function SectionCard({
  title,
  description,
  tooltip,
  children,
}: {
  title: string
  description: string
  tooltip?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-white/[0.06] bg-bg-surface p-6">
      <div>
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-bold text-white">{title}</h3>
          {tooltip && (
            <InfoTooltip text={tooltip} />
          )}
        </div>
        <p className="mt-1 text-xs text-text-muted">{description}</p>
      </div>
      {children}
    </div>
  )
}

function DeltaCell({ delta }: { delta: number }) {
  if (delta === 0) return <span className="text-white/30 tabular-nums">0</span>
  if (delta > 0) return (
    <span className="inline-flex items-center gap-0.5 tabular-nums text-[#FF4444]">
      <TrendingUp className="h-3 w-3" />+{delta}
    </span>
  )
  return (
    <span className="inline-flex items-center gap-0.5 tabular-nums text-[#60FF80]">
      <TrendingDown className="h-3 w-3" />{delta}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. What Changed Since Last Crawl
// ─────────────────────────────────────────────────────────────────────────────

export interface WhatChangedTableProps {
  delta: SFIssueDelta[]
  hasPrev: boolean
}

export function WhatChangedTable({ delta, hasPrev }: WhatChangedTableProps) {
  const sorted = [...delta].sort((a, b) => {
    const order: Record<SFDeltaStatus, number> = { New: 0, Persistent: 1, Improved: 2, Resolved: 3, Unchanged: 4 }
    return order[a.status] - order[b.status]
  })

  const columns: SortableColumn<SFIssueDelta>[] = [
    {
      key: 'checkName',
      label: 'Issue Type',
      tooltip: SITEBULB.hint.text,
      accessor: (r) => r.checkName,
      render: (r) => <span className="font-medium text-white">{r.checkName}</span>,
    },
    {
      key: 'severity',
      label: 'Priority',
      tooltip: SITEBULB.severityLevels.text,
      accessor: (r) => r.severity,
      render: (r) => (
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', PRIORITY_STYLE[r.severity as Priority])}>
          {r.severity}
        </span>
      ),
    },
    {
      key: 'prevCount',
      label: 'Prev',
      align: 'right',
      tooltip: AVZ_PREV_CURRENT_DELTA,
      accessor: (r) => r.prevCount,
      render: (r) => <span className="tabular-nums text-white/60">{r.prevCount}</span>,
    },
    {
      key: 'currentCount',
      label: 'Current',
      align: 'right',
      tooltip: AVZ_PREV_CURRENT_DELTA,
      accessor: (r) => r.currentCount,
      render: (r) => <span className="tabular-nums text-white">{r.currentCount}</span>,
    },
    {
      key: 'delta',
      label: 'Delta',
      align: 'right',
      tooltip: AVZ_PREV_CURRENT_DELTA,
      accessor: (r) => r.delta,
      render: (r) => <DeltaCell delta={r.delta} />,
    },
    {
      key: 'status',
      label: 'Status',
      tooltip: SITEBULB.hintStatus.text,
      accessor: (r) => r.status,
      render: (r) => (
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', DELTA_STATUS_STYLE[r.status])}>
          {r.status}
        </span>
      ),
    },
    {
      key: 'exampleUrl',
      label: 'Example URL',
      tooltip: SITEBULB_EXAMPLE_URL,
      accessor: (r) => r.exampleUrl ?? '',
      render: (r) =>
        r.exampleUrl ? (
          <span className="block max-w-[200px] truncate font-mono text-[10px] text-white/40" title={r.exampleUrl}>
            {r.exampleUrl.replace(/^https?:\/\/[^/]+/, '')}
          </span>
        ) : (
          <span className="text-white/20">—</span>
        ),
    },
    {
      key: 'recommendedAction',
      label: 'Recommended Action',
      tooltip: AVZ_RECOMMENDED_ACTION,
      accessor: (r) => r.recommendedAction,
      render: (r) => <span className="text-white/50">{r.recommendedAction}</span>,
    },
    {
      key: 'owner',
      label: 'Owner',
      tooltip: AVZ_OWNER,
      accessor: (r) => r.owner,
      render: (r) => (
        <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-white/40">{r.owner}</span>
      ),
    },
  ]

  return (
    <SectionCard
      title="What changed since the last crawl?"
      description="Issue delta between the most recent crawl and the prior crawl. New issues need immediate attention; resolved issues confirm fixes deployed."
      tooltip={SITEBULB.hintStatus.text}
    >
      {!hasPrev || sorted.length === 0 ? (
        <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-white/[0.08]">
          <p className="text-xs text-text-muted">
            {!hasPrev
              ? 'Upload a prior crawl CSV to enable delta comparison'
              : 'No issue changes detected between crawls'}
          </p>
        </div>
      ) : (
        <SortableTable
          columns={columns}
          rows={sorted}
          rowKey={(r) => r.checkId}
          emptyMessage="No issue changes detected between crawls."
        />
      )}
      <div className="flex flex-wrap gap-3">
        {[
          { label: 'New',        color: 'bg-[#FF4444]/10 text-[#FF4444]' },
          { label: 'Persistent', color: 'bg-[#FFFC60]/10 text-[#FFFC60]' },
          { label: 'Improved',   color: 'bg-[#60FF80]/10 text-[#60FF80]' },
          { label: 'Resolved',   color: 'bg-[#60FF80]/10 text-[#60FF80]' },
        ].map(({ label, color }) => (
          <span key={label} className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', color)}>{label}</span>
        ))}
      </div>
    </SectionCard>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. AI Platform and Bot Activity
// ─────────────────────────────────────────────────────────────────────────────

export interface BotActivityTableProps {
  bots: AgentBot[]
  summary?: React.ReactNode
}

function botTypeLabel(botType: string | null): string {
  if (botType === 'training')  return 'Training'
  if (botType === 'retrieval') return 'Retrieval'
  if (botType === 'search')    return 'Search'
  return 'Agent'
}

export function BotActivityTable({ bots, summary }: BotActivityTableProps) {
  const columns: SortableColumn<AgentBot>[] = [
    {
      key: 'botName',
      label: 'AI Platform / Bot',
      tooltip: AVZ_BOT_PLATFORM,
      accessor: (b) => b.botName,
      render: (b) => <span className="font-medium text-white">{b.botName}</span>,
    },
    {
      key: 'botType',
      label: 'Bot Type',
      tooltip: AVZ_BOT_TYPE,
      accessor: (b) => botTypeLabel(b.botType),
      render: (b) => {
        const t = b.botType ?? 'unknown'
        return (
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-semibold',
              t === 'training'  ? 'bg-[#FFFC60]/10 text-[#FFFC60]' :
              t === 'retrieval' ? 'bg-[#60FDFF]/10 text-[#60FDFF]' :
              t === 'search'    ? 'bg-[#60FF80]/10 text-[#60FF80]' :
              'bg-white/[0.06] text-white/40',
            )}
          >
            {botTypeLabel(b.botType)}
          </span>
        )
      },
    },
    {
      key: 'totalVisits',
      label: 'Total Visits (30d)',
      align: 'right',
      tooltip: AVZ_TOTAL_VISITS_30D,
      accessor: (b) => b.totalVisits,
      render: (b) => <span className="tabular-nums text-white">{b.totalVisits.toLocaleString()}</span>,
    },
    {
      key: 'uniquePages',
      label: 'Unique Pages',
      align: 'right',
      tooltip: AVZ_UNIQUE_PAGES,
      accessor: (b) => b.uniquePages,
      render: (b) => <span className="tabular-nums text-white/60">{b.uniquePages}</span>,
    },
    {
      key: 'successRate',
      label: '2xx Success Rate',
      align: 'right',
      tooltip: AVZ_2XX_RATE,
      accessor: (b) => b.successRate ?? -1,
      render: (b) =>
        b.successRate !== null ? (
          <span
            className={cn(
              'text-xs font-semibold tabular-nums',
              b.successRate >= 0.8 ? 'text-[#60FF80]' : b.successRate >= 0.4 ? 'text-[#FFFC60]' : 'text-[#FF4444]',
            )}
          >
            {Math.round(b.successRate * 100)}%
          </span>
        ) : (
          <span className="text-white/20">--</span>
        ),
    },
    {
      key: 'lastSeen',
      label: 'Last Seen',
      tooltip: AVZ_LAST_SEEN,
      accessor: (b) => b.lastSeen ?? '',
      render: (b) => <span className="font-mono text-[10px] text-white/30">{b.lastSeen ?? '--'}</span>,
    },
  ]

  return (
    <SectionCard
      title="Which AI platforms and bots are visiting the site?"
      description="Which AI crawlers are actively visiting the site, at what frequency, and whether they are successfully accessing content or hitting blocks."
      tooltip={AVZ_BOT_PLATFORM}
    >
      {summary && <div>{summary}</div>}
      <SortableTable
        columns={columns}
        rows={bots}
        rowKey={(b) => b.botId}
        emptyMessage="No AI bot visits detected in the last 30 days."
      />
    </SectionCard>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Pages with AI Activity and Technical Issues
// ─────────────────────────────────────────────────────────────────────────────

interface PageOverlapRow {
  path: string
  type: 'Infrastructure' | 'Content'
  aiCitations: number | null
  aiIndexingVisits: number | null
  aiTrainingVisits: number | null
  aiAgentVisits: number
  humanFromAI: number | null
  technicalIssues: number
  highestSeverity: string | null
  changeSinceLastCrawl: string | null
  priorityFlag: 'High' | 'Medium' | 'Low' | null
}

export interface PageOverlapTableProps {
  agentData: AgentAnalyticsData
  sfData: SFData
  clientDomain: string
  urlCitations?: UrlCitation[]
  demoMode?: boolean
}

const LOW_VALUE_PATTERNS = ['/robots.txt', '/sitemap', '/wp-json/', '/oembed', '/.well-known/', '/feed/', '/xmlrpc', '/wp-admin']
function pageType(path: string): 'Infrastructure' | 'Content' {
  return LOW_VALUE_PATTERNS.some((p) => path.toLowerCase().includes(p)) ? 'Infrastructure' : 'Content'
}

export function PageOverlapTable({ agentData, sfData, clientDomain, urlCitations = [], demoMode = false }: PageOverlapTableProps) {
  const severityRank: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 }
  const issuesByUrl = new Map<string, { count: number; highestSeverity: string }>()

  for (const issue of sfData.current.issueSummaries) {
    if (issue.exampleUrl) {
      const existing = issuesByUrl.get(issue.exampleUrl)
      const rank = severityRank[issue.severity] ?? 0
      const existingRank = severityRank[existing?.highestSeverity ?? ''] ?? 0
      issuesByUrl.set(issue.exampleUrl, {
        count: (existing?.count ?? 0) + 1,
        highestSeverity: rank > existingRank ? issue.severity : (existing?.highestSeverity ?? issue.severity),
      })
    }
  }

  const domain = clientDomain || 'example.com'

  const demoCites    = [12, 8, 5, 0, 18, 3, 14, 0, 9, 22, 4, 11, 6, 0, 16]
  const demoIndex    = [187, 142, 98, 56, 234, 43, 168, 31, 121, 289, 52, 147, 76, 24, 192]
  const demoTraining = [89, 64, 47, 23, 112, 19, 81, 14, 58, 137, 27, 71, 36, 11, 92]
  const demoHumans   = [42, 28, 19, 8, 51, 6, 36, 4, 24, 67, 12, 31, 17, 3, 38]
  const demoDeltas   = ['+3 new', 'unchanged', '−1 resolved', 'unchanged', '+2 new', 'unchanged', '+1 new', 'unchanged', '−2 resolved', '+4 new', 'unchanged', '+1 new', 'unchanged', 'unchanged', '−1 resolved']

  const citeByKey = new Map(urlCitations.map((c) => [c.urlKey, c]))

  const rows: PageOverlapRow[] = agentData.topPaths.slice(0, 15).map((p, idx) => {
    const fullUrl = `https://${domain}${p.path}`
    const issueData = issuesByUrl.get(fullUrl) ?? issuesByUrl.get(p.path) ?? null
    const type = pageType(p.path)
    const priorityFlag: 'High' | 'Medium' | 'Low' | null =
      issueData && p.visits > 10 ? 'High' :
      issueData ? 'Medium' :
      p.visits > 20 ? 'Low' :
      null

    return {
      path: p.path,
      type,
      aiCitations:      demoMode ? demoCites[idx % demoCites.length]
                                 : (citeByKey.get(urlJoinKey(fullUrl) ?? '')?.citationCount ?? null),
      aiIndexingVisits: demoMode ? demoIndex[idx % demoIndex.length]
                                 : (agentData.byPath?.[urlJoinKey(p.path) ?? '']?.byType.indexing ?? null),
      aiTrainingVisits: demoMode ? demoTraining[idx % demoTraining.length]
                                 : (agentData.byPath?.[urlJoinKey(p.path) ?? '']?.byType.training ?? null),
      aiAgentVisits:    p.visits,
      humanFromAI:      demoMode ? demoHumans[idx % demoHumans.length]     : null,
      technicalIssues:  issueData?.count ?? 0,
      highestSeverity:  issueData?.highestSeverity ?? null,
      changeSinceLastCrawl: demoMode ? demoDeltas[idx % demoDeltas.length] : null,
      priorityFlag,
    }
  })

  const columns: SortableColumn<PageOverlapRow>[] = [
    {
      key: 'path',
      label: 'URL Path',
      tooltip: SITEBULB_EXAMPLE_URL,
      accessor: (r) => r.path,
      render: (r) => (
        <span className="block max-w-[140px] truncate font-mono text-[10px] text-white/60" title={r.path}>{r.path}</span>
      ),
    },
    {
      key: 'type',
      label: 'Page Type',
      tooltip: AVZ_PAGE_TYPE,
      accessor: (r) => r.type,
      render: (r) => (
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold',
          r.type === 'Infrastructure' ? 'bg-[#FFFC60]/10 text-[#FFFC60]' : 'bg-[#60FF80]/10 text-[#60FF80]',
        )}>
          {r.type}
        </span>
      ),
    },
    {
      key: 'aiCitations',
      label: 'AI Citations',
      align: 'right',
      tooltip: PEEC.citations.text,
      accessor: (r) => r.aiCitations ?? -1,
      render: (r) => r.aiCitations !== null
        ? <span className="tabular-nums text-white">{r.aiCitations}</span>
        : <span className="tabular-nums text-white/20">--</span>,
    },
    {
      key: 'aiIndexingVisits',
      label: 'AI Indexing Visits',
      align: 'right',
      tooltip: AVZ_AI_INDEX_VISITS,
      accessor: (r) => r.aiIndexingVisits ?? -1,
      render: (r) => r.aiIndexingVisits !== null
        ? <span className="tabular-nums text-white/70">{r.aiIndexingVisits}</span>
        : <span className="tabular-nums text-white/20">--</span>,
    },
    {
      key: 'aiTrainingVisits',
      label: 'AI Training Visits',
      align: 'right',
      tooltip: AVZ_AI_INDEX_VISITS,
      accessor: (r) => r.aiTrainingVisits ?? -1,
      render: (r) => r.aiTrainingVisits !== null
        ? <span className="tabular-nums text-white/70">{r.aiTrainingVisits}</span>
        : <span className="tabular-nums text-white/20">--</span>,
    },
    {
      key: 'aiAgentVisits',
      label: 'AI Agent Visits',
      align: 'right',
      tooltip: AVZ_AI_INDEX_VISITS,
      accessor: (r) => r.aiAgentVisits,
      render: (r) => <span className="tabular-nums text-white">{r.aiAgentVisits}</span>,
    },
    {
      key: 'humanFromAI',
      label: 'Human Visits from AI',
      align: 'right',
      tooltip: AVZ_HUMAN_FROM_AI,
      accessor: (r) => r.humanFromAI ?? -1,
      render: (r) => r.humanFromAI !== null
        ? <span className="tabular-nums text-white/70">{r.humanFromAI}</span>
        : <span className="tabular-nums text-white/20">--</span>,
    },
    {
      key: 'technicalIssues',
      label: 'Technical Issues',
      align: 'right',
      tooltip: SITEBULB.hint.text,
      accessor: (r) => r.technicalIssues,
      render: (r) => <span className="tabular-nums text-white">{r.technicalIssues}</span>,
    },
    {
      key: 'highestSeverity',
      label: 'Highest Severity',
      tooltip: SITEBULB.severityLevels.text,
      accessor: (r) => r.highestSeverity ?? '',
      render: (r) => r.highestSeverity ? (
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', PRIORITY_STYLE[r.highestSeverity as Priority] ?? 'bg-white/[0.06] text-white/40')}>
          {r.highestSeverity}
        </span>
      ) : <span className="text-white/20">--</span>,
    },
    {
      key: 'changeSinceLastCrawl',
      label: 'Change Since Last Crawl',
      tooltip: SITEBULB.hintStatus.text,
      accessor: (r) => r.changeSinceLastCrawl ?? '',
      render: (r) => r.changeSinceLastCrawl ? (
        <span className={cn('text-[10px] font-semibold',
          r.changeSinceLastCrawl.startsWith('+') ? 'text-[#FF4444]' :
          r.changeSinceLastCrawl.startsWith('−') ? 'text-[#60FF80]' :
          'text-white/40',
        )}>{r.changeSinceLastCrawl}</span>
      ) : <span className="text-white/20">--</span>,
    },
    {
      key: 'priorityFlag',
      label: 'Priority Flag',
      tooltip: AVZ_PRIORITY_FLAG,
      accessor: (r) => r.priorityFlag ?? '',
      render: (r) => r.priorityFlag ? (
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold',
          r.priorityFlag === 'High'   ? 'bg-[#FF4444]/10 text-[#FF4444]' :
          r.priorityFlag === 'Medium' ? 'bg-[#FFFC60]/10 text-[#FFFC60]' :
          'bg-white/[0.06] text-white/40',
        )}>
          {r.priorityFlag}
        </span>
      ) : <span className="text-white/20">--</span>,
    },
  ]

  return (
    <SectionCard
      title="Where do AI activity and technical issues overlap?"
      description="Pages where AI bots are actively crawling AND where technical issues exist. Issues on AI-targeted pages have the highest priority — they directly impede LLM retrieval."
      tooltip={AVZ_PRIORITY_FLAG}
    >
      <SortableTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.path}
        initialPageSize={15}
        emptyMessage="No AI bot visit data available."
      />
    </SectionCard>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. AI Log Anomalies and Crawl Waste
// ─────────────────────────────────────────────────────────────────────────────

interface LogAnomalyRow {
  path: string
  platform: string | null
  botType: string | null
  status: number
  visits: number
  redirected: boolean
  lowValue: boolean
  strategic: boolean
  lastSeen: string | null
  action: string
}

export interface LogAnomaliesTableProps {
  agentData: AgentAnalyticsData
  demoMode?: boolean
}

export function LogAnomaliesTable({ agentData, demoMode = false }: LogAnomaliesTableProps) {
  const demoPlatforms = ['OpenAI', 'OpenAI', 'Anthropic', 'Perplexity', 'Google', 'Anthropic', 'OpenAI', 'Perplexity', 'Google', 'Anthropic', 'OpenAI', 'Perplexity']
  const demoBotTypes  = ['search', 'training', 'training', 'retrieval', 'training', 'retrieval', 'search', 'retrieval', 'training', 'training', 'search', 'retrieval']
  const demoLastSeen  = ['2026-06-02T10:34Z', '2026-06-02T08:51Z', '2026-06-02T03:18Z', '2026-06-01T22:07Z', '2026-06-01T19:42Z', '2026-06-01T14:23Z', '2026-06-01T11:18Z', '2026-06-01T06:51Z', '2026-05-31T20:04Z', '2026-05-31T15:27Z', '2026-05-31T09:43Z', '2026-05-30T23:18Z']

  const rows: LogAnomalyRow[] = agentData.topPaths.map((p, idx) => {
    const isLowValue = LOW_VALUE_PATTERNS.some((lv) => p.path.toLowerCase().includes(lv))
    const isRedirected = p.status >= 300 && p.status < 400
    const isStrategic = !isLowValue && p.status < 300
    const action = p.status >= 400
      ? 'Fix or redirect — bots wasting budget on error pages'
      : isRedirected && isLowValue ? 'Consolidate redirects; verify bot access rules'
      : isRedirected ? 'Consolidate redirect chain to direct URL'
      : isLowValue ? 'Verify robots.txt — limit unnecessary bot access'
      : 'Monitor — strategic page with healthy bot activity'

    const pathAgg = agentData.byPath?.[urlJoinKey(p.path) ?? '']
    const topBot = pathAgg?.bots[0] ?? null   // bots sorted by visits desc
    const lastSeenReal = pathAgg
      ? pathAgg.bots.reduce<string | null>((max, b) => (b.lastSeen && (!max || b.lastSeen > max) ? b.lastSeen : max), null)
      : null

    return {
      path: p.path,
      platform: demoMode ? demoPlatforms[idx % demoPlatforms.length] : (topBot?.provider ?? null),
      botType:  demoMode ? demoBotTypes[idx % demoBotTypes.length]   : (topBot?.type ?? null),
      status:   p.status,
      visits:   p.visits,
      redirected: isRedirected,
      lowValue:   isLowValue,
      strategic:  isStrategic,
      lastSeen:   demoMode ? demoLastSeen[idx % demoLastSeen.length] : lastSeenReal,
      action,
    }
  })

  const columns: SortableColumn<LogAnomalyRow>[] = [
    {
      key: 'platform',
      label: 'AI Platform',
      tooltip: AVZ_BOT_PLATFORM,
      accessor: (r) => r.platform ?? '',
      render: (r) => r.platform
        ? <span className="text-white/70">{r.platform}</span>
        : <span className="text-white/20">--</span>,
    },
    {
      key: 'botType',
      label: 'Bot Type',
      tooltip: AVZ_BOT_TYPE,
      accessor: (r) => r.botType ?? '',
      render: (r) => r.botType ? (
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize',
          r.botType === 'training'  ? 'bg-[#FFFC60]/10 text-[#FFFC60]' :
          r.botType === 'retrieval' ? 'bg-[#60FDFF]/10 text-[#60FDFF]' :
          'bg-[#60FF80]/10 text-[#60FF80]',
        )}>{r.botType}</span>
      ) : <span className="text-white/20">--</span>,
    },
    {
      key: 'path',
      label: 'URL / Path',
      tooltip: SITEBULB_EXAMPLE_URL,
      accessor: (r) => r.path,
      render: (r) => (
        <span className="block max-w-[140px] truncate font-mono text-[10px] text-white/60" title={r.path}>{r.path}</span>
      ),
    },
    {
      key: 'status',
      label: 'HTTP Status',
      align: 'right',
      tooltip: SCREAMING_FROG.httpStatus.text,
      accessor: (r) => r.status,
      render: (r) => (
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold',
          r.status >= 400 ? 'bg-[#FF4444]/10 text-[#FF4444]' :
          r.status >= 300 ? 'bg-[#FFFC60]/10 text-[#FFFC60]' :
          'bg-[#60FF80]/10 text-[#60FF80]',
        )}>
          {r.status}
        </span>
      ),
    },
    {
      key: 'visits',
      label: 'Request Count',
      align: 'right',
      tooltip: AVZ_REQUEST_COUNT,
      accessor: (r) => r.visits,
      render: (r) => <span className="tabular-nums text-white">{r.visits}</span>,
    },
    {
      key: 'redirected',
      label: 'Redirected',
      tooltip: AVZ_REDIRECTED,
      accessor: (r) => (r.redirected ? 'Yes' : 'No'),
      render: (r) => (
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold',
          r.redirected ? 'bg-[#FFFC60]/10 text-[#FFFC60]' : 'bg-white/[0.06] text-white/40',
        )}>
          {r.redirected ? 'Yes' : 'No'}
        </span>
      ),
    },
    {
      key: 'lowValue',
      label: 'Low-Value Endpoint',
      tooltip: AVZ_LOW_VALUE_ENDPOINT,
      accessor: (r) => (r.lowValue ? 'Yes' : 'No'),
      render: (r) => (
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold',
          r.lowValue ? 'bg-[#FF4444]/10 text-[#FF4444]' : 'bg-white/[0.06] text-white/40',
        )}>
          {r.lowValue ? 'Yes' : 'No'}
        </span>
      ),
    },
    {
      key: 'strategic',
      label: 'Strategic Page',
      tooltip: AVZ_STRATEGIC_PAGE,
      accessor: (r) => (r.strategic ? 'Yes' : 'No'),
      render: (r) => (
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold',
          r.strategic ? 'bg-[#60FF80]/10 text-[#60FF80]' : 'bg-white/[0.06] text-white/40',
        )}>
          {r.strategic ? 'Yes' : 'No'}
        </span>
      ),
    },
    {
      key: 'lastSeen',
      label: 'Last Seen',
      tooltip: AVZ_LAST_SEEN,
      accessor: (r) => r.lastSeen ?? '',
      render: (r) => r.lastSeen
        ? <span className="font-mono text-[10px] text-white/30">{r.lastSeen}</span>
        : <span className="text-white/20">--</span>,
    },
    {
      key: 'action',
      label: 'Recommended Action',
      tooltip: AVZ_RECOMMENDED_ACTION,
      accessor: (r) => r.action,
      render: (r) => <span className="text-[11px] text-white/50">{r.action}</span>,
    },
  ]

  return (
    <SectionCard
      title="Where are AI crawlers wasting requests?"
      description="Unusual AI bot behavior: hits on error pages, redirect chains, and crawl budget distribution between high-value and low-value pages."
      tooltip={AVZ_LOW_VALUE_ENDPOINT}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Error Page Hits',        value: agentData.errorPageHits,         color: '#FF4444' },
          { label: 'Redirect Hits',          value: agentData.redirectHits,          color: '#FFFC60' },
          { label: 'Robots.txt Hits',        value: agentData.robotsTxtHits,         color: '#39A0FF' },
          { label: 'High-Value Page Visits', value: agentData.highValuePageBotHits,  color: '#60FF80' },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex flex-col gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <span className="text-[10px] font-semibold text-text-muted">{label}</span>
            <span className="text-lg font-bold tabular-nums" style={{ color }}>{value.toLocaleString()}</span>
          </div>
        ))}
      </div>
      <SortableTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.path}
        emptyMessage="No AI bot path data available."
      />
      {!demoMode && (
        <p className="text-[10px] text-text-muted">AI Platform and Bot Type per path require per-path bot breakdown (currently aggregated across bots). Last Seen requires extended log retention from Peec.</p>
      )}
    </SectionCard>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. What SEO / Dev Should Fix Next
// ─────────────────────────────────────────────────────────────────────────────

export interface FixListTableProps {
  rows: FixListRow[]
  hasDelta: boolean
  errorPageHits: number | null
}

export function FixListTable({ rows, hasDelta, errorPageHits }: FixListTableProps) {
  const columns: SortableColumn<FixListRow>[] = [
    {
      key: 'checkName',
      label: 'Issue / Opportunity',
      tooltip: SITEBULB.hint.text,
      accessor: (r) => r.checkName,
      render: (r) => <span className="font-semibold text-white/80">{r.checkName}</span>,
    },
    {
      key: 'exampleUrl',
      label: 'Affected URL',
      tooltip: SITEBULB_EXAMPLE_URL,
      accessor: (r) => r.exampleUrl ?? '',
      render: (r) => r.exampleUrl ? (
        <span className="block max-w-[130px] truncate font-mono text-[10px] text-white/40" title={r.exampleUrl}>
          {r.exampleUrl.replace(/^https?:\/\/[^/]+/, '')}
        </span>
      ) : <span className="text-white/20">--</span>,
    },
    {
      key: 'whyItMatters',
      label: 'Why It Matters',
      tooltip: AVZ_WHY_IT_MATTERS,
      accessor: (r) => r.whyItMatters,
      render: (r) => <span className="block max-w-[160px] text-[11px] text-white/50">{r.whyItMatters}</span>,
    },
    {
      key: 'aiActive',
      label: 'AI Activity Present',
      tooltip: AVZ_AI_ACTIVITY_PRESENT,
      accessor: (r) => (r.aiActive ? 'Yes' : 'No'),
      render: (r) => (
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold',
          r.aiActive ? 'bg-[#60FDFF]/10 text-[#60FDFF]' : 'bg-white/[0.06] text-white/40',
        )}>
          {r.aiActive ? 'Yes' : 'No'}
        </span>
      ),
    },
    {
      key: 'severity',
      label: 'Severity',
      tooltip: SITEBULB.severityLevels.text,
      accessor: (r) => r.severity,
      render: (r) => (
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', PRIORITY_STYLE[r.severity as Priority] ?? 'bg-white/[0.06] text-white/40')}>
          {r.severity}
        </span>
      ),
    },
    {
      key: 'recommendedAction',
      label: 'Suggested Action',
      tooltip: AVZ_RECOMMENDED_ACTION,
      accessor: (r) => r.recommendedAction,
      render: (r) => <span className="block max-w-[160px] text-[11px] text-white/50">{r.recommendedAction}</span>,
    },
    {
      key: 'owner',
      label: 'Suggested Owner',
      tooltip: AVZ_OWNER,
      accessor: (r) => r.owner,
      render: (r) => (
        <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-white/40">{r.owner}</span>
      ),
    },
    {
      key: 'priorityLabel',
      label: 'Priority',
      tooltip: SITEBULB.severityLevels.text,
      accessor: (r) => r.priorityScore,
      render: (r) => {
        const priorityColor = r.priorityLabel === 'Critical' || r.priorityLabel === 'High'
          ? 'bg-[#FF4444]/10 text-[#FF4444]'
          : r.priorityLabel === 'Medium' ? 'bg-[#FFFC60]/10 text-[#FFFC60]'
          : 'bg-white/[0.06] text-white/40'
        return (
          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', priorityColor)}>
            {r.priorityLabel}
          </span>
        )
      },
    },
  ]

  return (
    <div className="rounded-xl border border-[#60FDFF]/20 bg-[#60FDFF]/[0.03] p-6">
      <div className="mb-4 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-[#60FDFF]" />
        <span className="text-sm font-bold text-white">What should SEO and dev fix next?</span>
        <InfoTooltip text={AVZ_RECOMMENDED_ACTION} />
        {!hasDelta && (
          <span className="ml-2 text-[10px] text-white/30">Showing top current issues — upload a prior crawl CSV for delta-based prioritization</span>
        )}
      </div>
      <SortableTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.checkId}
        initialPageSize={10}
        emptyMessage="No active issues to prioritize."
      />
      {errorPageHits !== null && errorPageHits > 0 && (
        <div className="mt-4 rounded-lg border border-[#FF4444]/20 bg-[#FF4444]/[0.04] p-3">
          <p className="text-[11px] font-semibold text-[#FF4444]">
            AI Bot Alert: {errorPageHits} bot visit{errorPageHits !== 1 ? 's' : ''} hit error pages in the last 30 days. Fix or redirect immediately.
          </p>
        </div>
      )}
    </div>
  )
}

// buildFixListRows + FixListRow type live in @/lib/peec/fix-list (non-'use-client')
