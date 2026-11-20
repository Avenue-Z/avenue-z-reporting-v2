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
