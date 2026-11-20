'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { ContentPerformanceRow } from '@/lib/peec/content-performance-rows'
import type { AzBadge } from '@/lib/content-calendar/pages'
import { SortableTable, type SortableColumn } from './sortable-table'
import { renderDelta } from './content-impact-tables'
import { GA4 } from '@/lib/peec/metric-definitions'

type Scope = 'az' | 'all'

const BADGE_LABEL: Record<AzBadge, string> = {
  new: 'New',
  optimized: 'Optimized',
  'new-optimized': 'New · Optimized',
  other: 'Avenue Z',
}
const BADGE_COLOR: Record<AzBadge, string> = {
  new: 'bg-[#60FF80]/10 text-[#60FF80]',
  optimized: 'bg-[#39A0FF]/10 text-[#39A0FF]',
  'new-optimized': 'bg-[#60FDFF]/10 text-[#60FDFF]',
  other: 'bg-white/[0.06] text-white/40',
}

const TT = {
  page: 'Calendar topic, else the Peec page title, else the path. The slug links to the live page. (Avenue Z internal — content calendar + Peec AI.)',
  badge: 'Whether the content calendar lists this page as new, optimized, or both. Blank when the page is not in the calendar. (Avenue Z internal — content calendar.)',
  published: 'Earliest Publish Date among the page\'s New (or unclassified) calendar rows. A page appears in Avenue Z content only when a calendar row\'s Status is exactly "Published". "--" for a page only ever optimized. (Avenue Z internal — content calendar.)',
  lastOptimized: 'Latest Publish Date among the page\'s Optimized calendar rows. "--" when never optimized. (Avenue Z internal — content calendar.)',
  promptCoverage: 'Percentage of tracked prompts citing this specific URL. (Avenue Z internal - derived from Peec per-URL prompt_id dimension.)',
  citationShare: "This URL's share of all AI citations across every site in the last 30 days. (Peec AI citation_count weighted by URL.)",
  aiReferred: 'GA4 sessions whose source matches the AI referrer domain list (chat.openai.com, perplexity.ai, gemini.google.com, etc.). (GA4 filtered by Avenue Z internal referrer list.)',
  organic: 'GA4 sessions whose default channel group is Organic Search. (GA4 sessionDefaultChannelGroup dimension.)',
  engagementRate: GA4.engagementRate.text,
}

const dash = <span className="text-white/20">--</span>
const date = (v: string | null) => <span className="text-[10px] text-white/40">{v ?? '--'}</span>
const num = (v: number | null, fmt: (n: number) => string) =>
  v == null ? dash : <span className="tabular-nums text-white">{fmt(v)}</span>

function metricCols(
  key: keyof ContentPerformanceRow,
  deltaKey: keyof ContentPerformanceRow,
  label: string,
  tooltip: string,
  fmt: (n: number) => string,
  mode: 'pp' | 'pct',
): SortableColumn<ContentPerformanceRow>[] {
  return [
    {
      key, label, tooltip, align: 'right',
      accessor: (r) => r[key] as number | null,
      render: (r) => num(r[key] as number | null, fmt),
    },
    {
      key: deltaKey, label: 'Δ', align: 'right',
      accessor: (r) => r[deltaKey] as number | null,
      render: (r) => renderDelta(r[deltaKey] as number | null, mode) ?? dash,
    },
  ]
}

const COLUMNS: SortableColumn<ContentPerformanceRow>[] = [
  {
    key: 'title', label: 'Page', tooltip: TT.page,
    accessor: (r) => r.title.toLowerCase(),
    render: (r) => (
      <div className="max-w-[260px]">
        <span className="block truncate font-medium text-white" title={r.title}>{r.title}</span>
        <a
          href={r.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate text-[10px] text-white/40 underline-offset-2 hover:text-white/70 hover:underline"
          title={r.url}
        >
          {r.slug}
        </a>
      </div>
    ),
  },
  {
    key: 'badge', label: 'Avenue Z', tooltip: TT.badge,
    accessor: (r) => (r.badge ? BADGE_LABEL[r.badge] : ''),
    render: (r) => r.badge
      ? <span className={cn('inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold', BADGE_COLOR[r.badge])}>{BADGE_LABEL[r.badge]}</span>
      : null,
  },
  { key: 'publishDate', label: 'Published', tooltip: TT.published, accessor: (r) => r.publishDate, render: (r) => date(r.publishDate) },
  { key: 'lastOptimizedDate', label: 'Last optimized', tooltip: TT.lastOptimized, accessor: (r) => r.lastOptimizedDate, render: (r) => date(r.lastOptimizedDate) },
  ...metricCols('promptCoverage', 'promptCoverageDelta', 'Prompt coverage', TT.promptCoverage, (n) => `${n.toFixed(1)}%`, 'pp'),
  ...metricCols('citationShare', 'citationShareDelta', 'Citation share', TT.citationShare, (n) => `${n.toFixed(1)}%`, 'pp'),
  ...metricCols('aiReferred', 'aiReferredDelta', 'AI-referred sessions', TT.aiReferred, (n) => n.toLocaleString(), 'pct'),
  ...metricCols('organic', 'organicDelta', 'Organic sessions', TT.organic, (n) => n.toLocaleString(), 'pct'),
  ...metricCols('engagementRate', 'engagementRateDelta', 'Engagement rate', TT.engagementRate, (n) => `${(n * 100).toFixed(1)}%`, 'pp'),
]

export function ContentPerformanceTable({
  rows,
  ga4Connected,
  calendarConnected,
}: {
  rows: ContentPerformanceRow[]
  ga4Connected: boolean
  calendarConnected: boolean
}) {
  const [scope, setScope] = useState<Scope>('az')
  const visible = rows.filter((r) => r.scopes.includes(scope))

  const emptyMessage = scope === 'az'
    ? (calendarConnected
        ? 'No published content yet. A calendar row appears here once its Status is set to Published.'
        : 'Connect content calendar (Google Sheet) to populate')
    : 'No cited owned-domain pages available from Peec AI'

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-white/[0.06] bg-bg-surface p-6">
      <div data-export-keep-with-next="">
        <h3 className="text-sm font-bold text-white">Content performance</h3>
        <p className="mt-1 text-xs text-text-muted">
          See where each page is represented in AI citations, how often it is being retrieved, and whether that exposure is translating into referral traffic and meaningful on-site behavior.
        </p>
      </div>
      <div role="group" aria-label="Content scope" className="inline-flex w-fit gap-1 rounded-lg border border-white/[0.06] p-0.5">
        {([['az', 'Avenue Z content'], ['all', 'All cited pages']] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={scope === value}
            onClick={() => setScope(value)}
            className={cn(
              'rounded-md px-3 py-1 text-xs font-semibold transition-colors',
              scope === value ? 'bg-white/10 text-white' : 'text-text-muted hover:text-white',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <SortableTable
        columns={COLUMNS}
        rows={visible}
        rowKey={(r) => r.key}
        initialPageSize={10}
        defaultSortKey="citationShare"
        defaultSortDir="desc"
        emptyMessage={emptyMessage}
      />
      {!ga4Connected && (
        <p className="text-[10px] text-text-muted">Connect GA4 page-level data to populate session and engagement columns.</p>
      )}
    </div>
  )
}
