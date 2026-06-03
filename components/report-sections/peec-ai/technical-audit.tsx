import { Settings, CheckCircle, XCircle, AlertCircle, Sparkles, Globe2, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getSFData } from '@/lib/screaming-frog/client'
import { getSitebulbData, buildAEOChecklist } from '@/lib/sitebulb/client'
import { getAgentAnalytics, deriveRobotsTxtStatus } from '@/lib/peec/agent-analytics'
import { getClientBySlug } from '@/lib/db/queries'
import type { SFData, SFIssueDelta, SFDeltaStatus } from '@/lib/screaming-frog/types'
import type { AgentAnalyticsData, AgentBot } from '@/lib/peec/agent-analytics'
import type { AEOChecklist, AEOChecklistItem, AEOStatus } from '@/lib/sitebulb/types'
import { sampleSFData } from '@/lib/demo-data/screaming-frog'
import { sampleAgentAnalytics } from '@/lib/demo-data/agent-analytics'
import { SampleDataBadge } from '@/lib/demo-data/badge'

// ── UI primitives ─────────────────────────────────────────────────────────────

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

const AEO_STATUS_CONFIG: Record<AEOStatus, {
  icon: React.ComponentType<{ className?: string }>
  color: string
  bg: string
  label: string
}> = {
  pass:    { icon: CheckCircle,  color: 'text-[#60FF80]', bg: 'bg-[#60FF80]/10',  label: 'Pass'    },
  fail:    { icon: XCircle,      color: 'text-[#FF4444]', bg: 'bg-[#FF4444]/10',  label: 'Fail'    },
  warn:    { icon: AlertCircle,  color: 'text-[#FFFC60]', bg: 'bg-[#FFFC60]/10',  label: 'Warning' },
  pending: { icon: Settings,     color: 'text-white/20',  bg: 'bg-white/[0.04]',  label: 'Pending' },
}

function SectionCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-white/[0.06] bg-bg-surface p-6">
      <div>
        <h3 className="text-sm font-bold text-white">{title}</h3>
        <p className="mt-1 text-xs text-text-muted">{description}</p>
      </div>
      {children}
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap pb-2.5 pr-4 text-left text-[10px] font-bold uppercase tracking-wider text-text-muted last:pr-0">
      {children}
    </th>
  )
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={cn('py-2.5 pr-4 text-xs last:pr-0', className)}>
      {children}
    </td>
  )
}

function EmptyBody({ cols, message }: { cols: number; message: string }) {
  return (
    <tr>
      <td colSpan={cols} className="py-10 text-center text-xs text-text-muted">{message}</td>
    </tr>
  )
}

function DeltaCell({ delta }: { delta: number }) {
  if (delta === 0) return <span className="text-white/30 tabular-nums">0</span>
  if (delta > 0) return (
    <span className="flex items-center gap-0.5 tabular-nums text-[#FF4444]">
      <TrendingUp className="h-3 w-3" />+{delta}
    </span>
  )
  return (
    <span className="flex items-center gap-0.5 tabular-nums text-[#60FF80]">
      <TrendingDown className="h-3 w-3" />{delta}
    </span>
  )
}

function AuditRow({ item }: { item: AEOChecklistItem }) {
  const cfg  = AEO_STATUS_CONFIG[item.status]
  const Icon = cfg.icon
  const showDelta = item.affectedUrls !== null && item.prevAffectedUrls !== null
  const delta     = showDelta ? item.affectedUrls! - item.prevAffectedUrls! : null

  return (
    <div className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <span className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full', cfg.bg)}>
        <Icon className={cn('h-3 w-3', cfg.color)} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-white/70">{item.label}</span>
          <div className="flex items-center gap-2 shrink-0">
            {item.affectedUrls !== null && item.affectedUrls > 0 && (
              <span className="text-[10px] tabular-nums text-white/30">{item.affectedUrls} URLs</span>
            )}
            {delta !== null && delta !== 0 && (
              <span className={cn('text-[10px] tabular-nums', delta < 0 ? 'text-[#60FF80]' : 'text-[#FF4444]')}>
                {delta > 0 ? `+${delta}` : delta}
              </span>
            )}
            <span className={cn('text-[10px] font-bold uppercase tracking-wider', cfg.color)}>
              {cfg.label}
            </span>
          </div>
        </div>
        <p className="mt-0.5 text-[11px] text-text-muted">{item.description}</p>
        {item.detail && (
          <p className="mt-1 text-[11px] text-white/40">{item.detail}</p>
        )}
      </div>
    </div>
  )
}

// ── Section A: Snapshot KPI cards ─────────────────────────────────────────────

function KpiCard({
  label,
  value,
  hint,
  trend,
}: {
  label: string
  value: string | number
  hint: string
  trend?: { delta: number; label: string }
}) {
  const val = typeof value === 'number' ? value.toLocaleString() : value

  return (
    <div className="flex flex-col gap-1 rounded-xl border border-white/[0.06] bg-bg-surface p-4">
      <span className="text-[11px] font-semibold text-text-muted">{label}</span>
      <span className="text-xl font-bold text-white">{val}</span>
      {trend && (
        <div className="flex items-center gap-1">
          {trend.delta === 0
            ? <Minus className="h-3 w-3 text-white/30" />
            : trend.delta < 0
            ? <TrendingDown className="h-3 w-3 text-[#60FF80]" />
            : <TrendingUp className="h-3 w-3 text-[#FF4444]" />}
          <span className={cn(
            'text-[10px] font-semibold',
            trend.delta === 0 ? 'text-white/30'
              : trend.delta < 0 ? 'text-[#60FF80]'
              : 'text-[#FF4444]',
          )}>
            {trend.delta > 0 ? `+${trend.delta}` : trend.delta} {trend.label}
          </span>
        </div>
      )}
      <span className="text-[10px] text-text-muted">{hint}</span>
    </div>
  )
}

// ── Section B: Delta table ─────────────────────────────────────────────────────

function DeltaTable({ delta, hasPrev }: { delta: SFIssueDelta[]; hasPrev: boolean }) {
  if (!hasPrev || delta.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-white/[0.08]">
        <p className="text-xs text-text-muted">
          {!hasPrev
            ? 'Upload a prior crawl CSV to enable delta comparison'
            : 'No issue changes detected between crawls'}
        </p>
      </div>
    )
  }

  // Show all changes sorted: New first, then Persistent, then Resolved
  const sorted = [...delta].sort((a, b) => {
    const order: Record<SFDeltaStatus, number> = { New: 0, Persistent: 1, Improved: 2, Resolved: 3, Unchanged: 4 }
    return order[a.status] - order[b.status]
  })

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/[0.06]">
            <Th>Issue Type</Th>
            <Th>Priority</Th>
            <Th>Prev</Th>
            <Th>Current</Th>
            <Th>Delta</Th>
            <Th>Status</Th>
            <Th>Example URL</Th>
            <Th>Recommended Action</Th>
            <Th>Owner</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">
          {sorted.map((issue) => (
            <tr key={issue.checkId} className={cn(issue.status === 'Resolved' ? 'opacity-40' : '')}>
              <Td><span className="font-medium text-white">{issue.checkName}</span></Td>
              <Td>
                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', PRIORITY_STYLE[issue.severity as Priority])}>
                  {issue.severity}
                </span>
              </Td>
              <Td><span className="tabular-nums text-white/60">{issue.prevCount}</span></Td>
              <Td><span className="tabular-nums text-white">{issue.currentCount}</span></Td>
              <Td><DeltaCell delta={issue.delta} /></Td>
              <Td>
                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', DELTA_STATUS_STYLE[issue.status])}>
                  {issue.status}
                </span>
              </Td>
              <Td>
                {issue.exampleUrl ? (
                  <span className="max-w-[200px] truncate text-white/40 font-mono text-[10px]" title={issue.exampleUrl}>
                    {issue.exampleUrl.replace(/^https?:\/\/[^/]+/, '')}
                  </span>
                ) : <span className="text-white/20">—</span>}
              </Td>
              <Td><span className="text-white/50">{issue.recommendedAction}</span></Td>
              <Td>
                <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-white/40">
                  {issue.owner}
                </span>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Section C: Issue trend mini-bars ──────────────────────────────────────────

function TrendSection({ sfData }: { sfData: SFData }) {
  const { current, prev } = sfData

  const trendGroups = [
    {
      label: 'Critical Issues',
      current: current.criticalCount,
      prev:    prev?.criticalCount ?? null,
      color:   '#FF4444',
    },
    {
      label: 'High Issues',
      current: current.highCount,
      prev:    prev?.highCount ?? null,
      color:   '#FFFC60',
    },
    {
      label: 'Total Issues',
      current: current.totalIssues,
      prev:    prev?.totalIssues ?? null,
      color:   '#39A0FF',
    },
  ]

  return (
    <div className="grid grid-cols-3 gap-3">
      {trendGroups.map(({ label, current: cur, prev: prv, color }) => {
        const delta = prv !== null ? cur - prv : null
        const maxVal = prv !== null ? Math.max(cur, prv, 1) : Math.max(cur, 1)

        return (
          <div key={label} className="flex flex-col gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
            <span className="text-[11px] font-semibold text-text-muted">{label}</span>
            <div className="flex h-12 items-end gap-1">
              {prv !== null && (
                <div className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t-sm bg-white/[0.06]"
                    style={{ height: `${Math.round((prv / maxVal) * 100)}%` }}
                  />
                  <span className="text-[9px] text-white/20">Prev</span>
                </div>
              )}
              <div className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t-sm"
                  style={{ height: `${Math.round((cur / maxVal) * 100)}%`, backgroundColor: color + '80' }}
                />
                <span className="text-[9px] text-white/20">Now</span>
              </div>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-base font-bold text-white">{cur.toLocaleString()}</span>
              {delta !== null && (
                <span className={cn('text-[10px] font-semibold', delta <= 0 ? 'text-[#60FF80]' : 'text-[#FF4444]')}>
                  {delta > 0 ? `+${delta}` : delta}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Section D: Bot activity ───────────────────────────────────────────────────

function BotCard({ bot }: { bot: AgentBot }) {
  const successPct = bot.successRate !== null ? Math.round(bot.successRate * 100) : null

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="flex items-center gap-1.5">
        <Globe2 className="h-3.5 w-3.5 text-text-muted" />
        <span className="text-[11px] font-bold text-white/70">{bot.botName}</span>
      </div>
      <span className="text-lg font-bold text-white">{bot.totalVisits.toLocaleString()}</span>
      <span className="text-[10px] text-text-muted">visits / 30d</span>
      <span className="text-[10px] text-text-muted">{bot.uniquePages} pages crawled</span>
      {successPct !== null && (
        <div className="mt-1 flex items-center gap-1">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className={cn('h-full rounded-full', successPct >= 80 ? 'bg-[#60FF80]' : successPct >= 40 ? 'bg-[#FFFC60]' : 'bg-[#FF4444]')}
              style={{ width: `${successPct}%` }}
            />
          </div>
          <span className="text-[9px] text-white/30">{successPct}% 2xx</span>
        </div>
      )}
    </div>
  )
}

function BotTable({ bots }: { bots: AgentBot[] }) {
  if (bots.length === 0) {
    return (
      <tr>
        <td colSpan={6} className="py-10 text-center text-xs text-text-muted">
          No AI bot visits detected in the last 30 days
        </td>
      </tr>
    )
  }

  return (
    <>
      {bots.map((bot) => {
        // Categorize bot type for PRD columns
        const botType = bot.botType ?? 'unknown'
        const typeLabel =
          botType === 'training'  ? 'Training' :
          botType === 'retrieval' ? 'Retrieval' :
          botType === 'search'    ? 'Search' :
          'Agent'

        return (
          <tr key={bot.botId} className="divide-y divide-white/[0.04]">
            <Td><span className="font-medium text-white">{bot.botName}</span></Td>
            <Td>
              <span className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                botType === 'training'  ? 'bg-[#FFFC60]/10 text-[#FFFC60]' :
                botType === 'retrieval' ? 'bg-[#60FDFF]/10 text-[#60FDFF]' :
                botType === 'search'    ? 'bg-[#60FF80]/10 text-[#60FF80]' :
                'bg-white/[0.06] text-white/40'
              )}>
                {typeLabel}
              </span>
            </Td>
            <Td><span className="tabular-nums text-white">{bot.totalVisits.toLocaleString()}</span></Td>
            <Td><span className="tabular-nums text-white/60">{bot.uniquePages}</span></Td>
            <Td>
              {bot.successRate !== null ? (
                <span className={cn('text-xs font-semibold tabular-nums',
                  bot.successRate >= 0.8 ? 'text-[#60FF80]' : bot.successRate >= 0.4 ? 'text-[#FFFC60]' : 'text-[#FF4444]'
                )}>
                  {Math.round(bot.successRate * 100)}%
                </span>
              ) : <span className="text-white/20">--</span>}
            </Td>
            <Td><span className="text-white/30 text-[10px] font-mono">{bot.lastSeen ?? '--'}</span></Td>
          </tr>
        )
      })}
    </>
  )
}

// ── Section E: High-value page overlap ────────────────────────────────────────

function PageOverlapTable({ agentData, sfData, clientDomain, demoMode = false }: { agentData: AgentAnalyticsData; sfData: SFData; clientDomain: string; demoMode?: boolean }) {
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

  const LOW_VALUE_PATTERNS = ['/robots.txt', '/sitemap', '/wp-json/', '/oembed', '/.well-known/', '/feed/', '/xmlrpc', '/wp-admin']
  function pageType(path: string): 'Infrastructure' | 'Content' {
    return LOW_VALUE_PATTERNS.some(p => path.toLowerCase().includes(p)) ? 'Infrastructure' : 'Content'
  }

  const domain = clientDomain || 'example.com'
  const rows = agentData.topPaths.map((p) => {
    const fullUrl = `https://${domain}${p.path}`
    const issueData = issuesByUrl.get(fullUrl) ?? issuesByUrl.get(p.path) ?? null
    const type = pageType(p.path)
    const priorityFlag: string | null = issueData && p.visits > 10 ? 'High' : issueData ? 'Medium' : p.visits > 20 ? 'Low' : null
    return { ...p, issueData, type, priorityFlag }
  }).slice(0, 15)

  if (rows.length === 0) {
    return <EmptyBody cols={11} message="No AI bot visit data available" />
  }

  const demoCites    = [12, 8, 5, 0, 18, 3, 14, 0, 9, 22, 4, 11, 6, 0, 16]
  const demoIndex    = [187, 142, 98, 56, 234, 43, 168, 31, 121, 289, 52, 147, 76, 24, 192]
  const demoTraining = [89, 64, 47, 23, 112, 19, 81, 14, 58, 137, 27, 71, 36, 11, 92]
  const demoHumans   = [42, 28, 19, 8, 51, 6, 36, 4, 24, 67, 12, 31, 17, 3, 38]
  const demoDeltas   = ['+3 new', 'unchanged', '−1 resolved', 'unchanged', '+2 new', 'unchanged', '+1 new', 'unchanged', '−2 resolved', '+4 new', 'unchanged', '+1 new', 'unchanged', 'unchanged', '−1 resolved']

  return (
    <>
      {rows.map((p, rIdx) => (
        <tr key={p.path}>
          <Td><span className="font-mono text-[10px] text-white/60 max-w-[140px] truncate block" title={p.path}>{p.path}</span></Td>
          <Td>
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold',
              p.type === 'Infrastructure' ? 'bg-[#FFFC60]/10 text-[#FFFC60]' : 'bg-[#60FF80]/10 text-[#60FF80]'
            )}>
              {p.type}
            </span>
          </Td>
          <Td>{demoMode ? <span className="tabular-nums text-white">{demoCites[rIdx % demoCites.length]}</span> : <span className="text-white/20 tabular-nums">--</span>}</Td>
          <Td>{demoMode ? <span className="tabular-nums text-white/70">{demoIndex[rIdx % demoIndex.length]}</span> : <span className="text-white/20 tabular-nums">--</span>}</Td>
          <Td>{demoMode ? <span className="tabular-nums text-white/70">{demoTraining[rIdx % demoTraining.length]}</span> : <span className="text-white/20 tabular-nums">--</span>}</Td>
          <Td><span className="tabular-nums text-white">{p.visits}</span></Td>
          <Td>{demoMode ? <span className="tabular-nums text-white/70">{demoHumans[rIdx % demoHumans.length]}</span> : <span className="text-white/20 tabular-nums">--</span>}</Td>
          <Td><span className="tabular-nums text-white">{p.issueData?.count ?? 0}</span></Td>
          <Td>
            {p.issueData ? (
              <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', PRIORITY_STYLE[p.issueData.highestSeverity as Priority] ?? 'bg-white/[0.06] text-white/40')}>
                {p.issueData.highestSeverity}
              </span>
            ) : <span className="text-white/20">--</span>}
          </Td>
          <Td>{demoMode ? (
            <span className={cn('text-[10px] font-semibold',
              demoDeltas[rIdx % demoDeltas.length].startsWith('+') ? 'text-[#FF4444]' :
              demoDeltas[rIdx % demoDeltas.length].startsWith('−') ? 'text-[#60FF80]' :
              'text-white/40'
            )}>{demoDeltas[rIdx % demoDeltas.length]}</span>
          ) : <span className="text-white/20">--</span>}</Td>
          <Td>
            {p.priorityFlag ? (
              <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold',
                p.priorityFlag === 'High' ? 'bg-[#FF4444]/10 text-[#FF4444]' :
                p.priorityFlag === 'Medium' ? 'bg-[#FFFC60]/10 text-[#FFFC60]' :
                'bg-white/[0.06] text-white/40'
              )}>
                {p.priorityFlag}
              </span>
            ) : <span className="text-white/20">--</span>}
          </Td>
        </tr>
      ))}
    </>
  )
}

// ── Section F: Anomalies ──────────────────────────────────────────────────────

// ── Section G: Fix list ────────────────────────────────────────────────────────

/**
 * Priority scoring per PRD:
 *   35% technical severity + 25% AI activity + 20% human visits from AI + 20% persistence
 * Since we don't have per-URL GA4 AI referral data yet, we approximate:
 *   - Severity: Critical=4, High=3, Medium=2, Low=1 (normalized to 0-1)
 *   - AI activity: 1 if bot visited the example URL, 0 otherwise
 *   - Human visits from AI: placeholder 0 (requires GA4 per-URL integration)
 *   - Persistence: New=0.8, Persistent=1.0, Improved=0.3, Resolved=0, Unchanged=0.5
 */
function computeFixPriority(
  issue: SFIssueDelta,
  botPaths: Set<string>,
): number {
  const severityMap: Record<string, number> = { Critical: 1.0, High: 0.75, Medium: 0.5, Low: 0.25 }
  const persistenceMap: Record<string, number> = { New: 0.8, Persistent: 1.0, Improved: 0.3, Resolved: 0, Unchanged: 0.5 }

  const severity    = severityMap[issue.severity] ?? 0.25
  const hasAI       = issue.exampleUrl && botPaths.has(new URL(issue.exampleUrl).pathname) ? 1 : 0
  const humanFromAI = 0 // placeholder until GA4 per-URL AI referral is wired
  const persistence = persistenceMap[issue.status] ?? 0.5

  return 0.35 * severity + 0.25 * hasAI + 0.20 * humanFromAI + 0.20 * persistence
}

function FixList({ sfData, agentData }: { sfData: SFData; agentData: AgentAnalyticsData | null }) {
  const botPaths = new Set<string>(agentData?.topPaths.map((p) => p.path) ?? [])
  const hasDelta = sfData.delta.length > 0

  const fixes = hasDelta
    ? sfData.delta
        .filter((d) => d.status !== 'Resolved' && d.status !== 'Unchanged')
        .map((d) => ({ ...d, priorityScore: computeFixPriority(d, botPaths) }))
        .sort((a, b) => b.priorityScore - a.priorityScore)
        .slice(0, 10)
    : sfData.current.topIssues.slice(0, 10).map(issue => ({
        checkId: issue.checkId,
        checkName: issue.checkName,
        severity: issue.severity,
        status: 'Unchanged' as const,
        prevCount: issue.count,
        currentCount: issue.count,
        delta: 0,
        exampleUrl: '' as string,
        recommendedAction: (issue as unknown as { recommendedAction?: string }).recommendedAction ?? 'Review and remediate',
        owner: (issue as unknown as { owner?: string }).owner ?? 'SEO',
        priorityScore: 0,
        category: issue.category,
      }))

  function whyItMatters(fix: { severity: string; status: string; checkName: string }): string {
    if (fix.severity === 'Critical') return 'Blocks crawler access and AI indexing directly'
    if (fix.status === 'New') return 'Newly introduced this crawl — requires immediate investigation'
    if (fix.status === 'Persistent') return 'Unresolved across multiple crawls — systemic issue'
    if (fix.severity === 'High') return 'High-severity issue impacting AI crawlability'
    return 'Ongoing technical debt affecting crawl health'
  }

  function hasAIActivity(exampleUrl: string): boolean {
    if (!exampleUrl) return false
    try { return botPaths.has(new URL(exampleUrl).pathname) } catch { return false }
  }

  function priorityLabel(score: number, severity: string): string {
    if (!hasDelta) return severity
    return score >= 0.6 ? 'Critical' : score >= 0.4 ? 'High' : score >= 0.2 ? 'Medium' : 'Low'
  }

  return (
    <div className="rounded-xl border border-[#60FDFF]/20 bg-[#60FDFF]/[0.03] p-6">
      <div className="mb-4 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-[#60FDFF]" />
        <span className="text-sm font-bold text-white">What SEO / Dev Should Fix Next</span>
        {!hasDelta && (
          <span className="ml-2 text-[10px] text-white/30">Showing top current issues — upload a prior crawl CSV for delta-based prioritization</span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <Th>Issue / Opportunity</Th>
              <Th>Affected URL</Th>
              <Th>Why It Matters</Th>
              <Th>AI Activity Present</Th>
              <Th>Severity</Th>
              <Th>Suggested Action</Th>
              <Th>Suggested Owner</Th>
              <Th>Priority</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {fixes.length > 0 ? (
              fixes.map((fix) => {
                const aiActive = hasAIActivity(fix.exampleUrl ?? '')
                const priority = priorityLabel(fix.priorityScore, fix.severity)
                const priorityColor = priority === 'Critical' || priority === 'High'
                  ? 'bg-[#FF4444]/10 text-[#FF4444]'
                  : priority === 'Medium' ? 'bg-[#FFFC60]/10 text-[#FFFC60]'
                  : 'bg-white/[0.06] text-white/40'
                return (
                  <tr key={fix.checkId}>
                    <Td><span className="font-semibold text-white/80">{fix.checkName}</span></Td>
                    <Td>
                      {fix.exampleUrl ? (
                        <span className="font-mono text-[10px] text-white/40 max-w-[130px] truncate block" title={fix.exampleUrl}>
                          {fix.exampleUrl.replace(/^https?:\/\/[^/]+/, '')}
                        </span>
                      ) : <span className="text-white/20">--</span>}
                    </Td>
                    <Td><span className="text-[11px] text-white/50 max-w-[160px] block">{whyItMatters(fix)}</span></Td>
                    <Td>
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold',
                        aiActive ? 'bg-[#60FDFF]/10 text-[#60FDFF]' : 'bg-white/[0.06] text-white/40'
                      )}>
                        {aiActive ? 'Yes' : 'No'}
                      </span>
                    </Td>
                    <Td>
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', PRIORITY_STYLE[fix.severity as Priority] ?? 'bg-white/[0.06] text-white/40')}>
                        {fix.severity}
                      </span>
                    </Td>
                    <Td><span className="text-[11px] text-white/50 max-w-[160px] block">{fix.recommendedAction}</span></Td>
                    <Td>
                      <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-white/40">{fix.owner}</span>
                    </Td>
                    <Td>
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', priorityColor)}>
                        {priority}
                      </span>
                    </Td>
                  </tr>
                )
              })
            ) : (
              <tr><td colSpan={8} className="py-10 text-center text-xs text-text-muted">No active issues to prioritize</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {agentData && agentData.errorPageHits > 0 && (
        <div className="mt-4 rounded-lg border border-[#FF4444]/20 bg-[#FF4444]/[0.04] p-3">
          <p className="text-[11px] font-semibold text-[#FF4444]">
            AI Bot Alert: {agentData.errorPageHits} bot visit{agentData.errorPageHits !== 1 ? 's' : ''} hit error pages in the last 30 days. Fix or redirect immediately.
          </p>
        </div>
      )}
    </div>
  )
}

// ── AEO Checklist ─────────────────────────────────────────────────────────────

function AEOChecklistSection({ checklist }: { checklist: AEOChecklist }) {
  const categories = [
    {
      title:       'Structured Data',
      description: 'Schema markup signals that help LLMs understand and classify content.',
      items:       Object.values(checklist.structuredData),
    },
    {
      title:       'Content & Heading Signals',
      description: 'Formatting patterns that increase LLM retrieval and citation probability.',
      items:       [
        checklist.contentFormat.headingHierarchy,
        checklist.crawlability.titleTags,
        checklist.crawlability.metaDescriptions,
        checklist.crawlability.h1Tags,
        checklist.crawlability.canonicalTags,
      ],
    },
    {
      title:       'Crawlability & Indexation',
      description: 'Technical factors ensuring LLM crawlers can access and index content.',
      items:       [
        checklist.crawlability.robotsTxtLLMBots,
        checklist.crawlability.httpsCoverage,
        checklist.crawlability.sitemapFreshness,
        checklist.crawlability.coreWebVitals,
      ],
    },
  ]

  return (
    <div>
      <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-text-muted">AEO Technical Checklist</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((cat) => (
          <div key={cat.title} className="flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-bg-surface p-5">
            <div>
              <h4 className="text-xs font-bold text-white">{cat.title}</h4>
              <p className="mt-0.5 text-[11px] text-text-muted">{cat.description}</p>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {cat.items.map((item) => (
                <AuditRow key={item.label} item={item} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Error boundary fallback ───────────────────────────────────────────────────

function DataUnavailable({ label }: { label: string }) {
  return (
    <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-white/[0.08]">
      <p className="text-xs text-text-muted">{label}</p>
    </div>
  )
}

// ── Main RSC ──────────────────────────────────────────────────────────────────

export async function TechnicalAuditReport({ clientSlug, demoMode = false }: { clientSlug: string; demoMode?: boolean }) {
  // Get client config for domain and other client-specific settings
  const clientConfig = await getClientBySlug(clientSlug)
  const clientDomain = clientConfig?.domain ?? ''

  // Fetch all data sources in parallel, with graceful degradation on each
  const [sfResult, sitebulbResult, agentResult] = await Promise.allSettled([
    getSFData(clientSlug),
    getSitebulbData(clientSlug),
    getAgentAnalytics(clientSlug),
  ])

  let sfData       = sfResult.status       === 'fulfilled' ? sfResult.value       : null
  const sitebulbData = sitebulbResult.status === 'fulfilled' ? sitebulbResult.value : null
  let agentData    = agentResult.status    === 'fulfilled' ? agentResult.value    : null

  // Demo mode: substitute realistic sample data for SF + agent analytics
  // when the real fetches returned null/empty. Powers Sections A (KPIs),
  // B (delta), C (trends), D (bot activity), E (page overlap), and
  // F (anomalies) so the audit demos consistently regardless of which
  // integrations the signed-in client has wired up.
  if (demoMode && !sfData)                                      sfData    = sampleSFData()
  if (demoMode && (!agentData || agentData.totalBotVisits === 0)) agentData = sampleAgentAnalytics()

  // Log any errors server-side (visible in Vercel logs / local dev)
  if (sfResult.status       === 'rejected') console.error('[technical-audit] SF data error:', sfResult.reason)
  if (sitebulbResult.status === 'rejected') console.error('[technical-audit] Sitebulb error:', sitebulbResult.reason)
  if (agentResult.status    === 'rejected') console.error('[technical-audit] Agent analytics error:', agentResult.reason)

  // Derive AEO checklist
  const robotsTxtStatus = agentData ? deriveRobotsTxtStatus(agentData) : undefined
  const aeoChecklist    = sitebulbData
    ? buildAEOChecklist(sitebulbData, robotsTxtStatus)
    : null

  // Section A KPIs
  const kpis = sfData
    ? [
        { label: 'Crawl Date',            value: sfData.current.crawlDate,              hint: 'Last Screaming Frog export', trend: undefined },
        { label: 'Pages Crawled',         value: sfData.current.totalUrls,              hint: 'Total URLs in crawl',
          trend: sfData.prev ? { delta: sfData.current.totalUrls - sfData.prev.totalUrls, label: 'vs prev' } : undefined },
        { label: 'Total Issues',          value: sfData.current.totalIssues,            hint: 'All severity levels',
          trend: sfData.prev ? { delta: sfData.current.totalIssues - sfData.prev.totalIssues, label: 'vs prev' } : undefined },
        { label: 'New Issues',            value: sfData.newIssues,                      hint: 'Not in prior crawl', trend: undefined },
        { label: 'Resolved Issues',       value: sfData.resolvedIssues,                 hint: 'Fixed since prior crawl', trend: undefined },
        { label: 'Persistent Issues',     value: sfData.persistentIssues,               hint: 'Present in both crawls', trend: undefined },
        { label: 'Priority-Weighted Score', value: sfData.weightedScore.toFixed(0),     hint: 'Severity × issue count',
          trend: sfData.prevWeightedScore !== null ? { delta: Math.round(sfData.weightedScore - sfData.prevWeightedScore), label: 'pts' } : undefined },
      ]
    : null

  return (
    <div className="flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFFC60]/10">
          <Settings className="h-5 w-5 text-[#FFFC60]" />
        </span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-white">Technical Audit Logs</h2>
            {demoMode && <SampleDataBadge />}
          </div>
          <p className="mt-0.5 text-sm text-text-muted">
            AEO technical health — structured data, crawlability, AI bot behavior, and the issue delta between crawl snapshots.
          </p>
        </div>
      </div>

      {/* ── Section A: Snapshot KPIs ── */}
      <div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-text-muted">Audit Snapshot</h3>
        {kpis ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {kpis.map(({ label, value, hint, trend }) => (
              <KpiCard key={label} label={label} value={value} hint={hint} trend={trend} />
            ))}
          </div>
        ) : (
          <DataUnavailable label="Screaming Frog CSV not configured for client" />
        )}
      </div>

      {/* ── Section B: What Changed ── */}
      <SectionCard
        title="What Changed Since Last Crawl"
        description="Issue delta between the most recent crawl and the prior crawl. New issues need immediate attention; resolved issues confirm fixes deployed."
      >
        {sfData ? (
          <>
            <DeltaTable delta={sfData.delta} hasPrev={sfData.prev !== null} />
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
          </>
        ) : (
          <DataUnavailable label="Screaming Frog CSV data unavailable" />
        )}
      </SectionCard>

      {/* ── Section C: Issue Trends ── */}
      <SectionCard
        title="Issue Trends"
        description="Issue counts across severity levels. Two crawl snapshots generate one comparison; add more crawls over time to build a full trend history."
      >
        {sfData ? (
          <>
            <TrendSection sfData={sfData} />
            {!sfData.prev && (
              <p className="text-[11px] text-text-muted">
                Only one crawl snapshot available — configure sfPrevCsvFileId in database for delta trending.
              </p>
            )}
          </>
        ) : (
          <DataUnavailable label="Screaming Frog CSV data unavailable" />
        )}
      </SectionCard>

      {/* ── Section D: AI Bot Activity ── */}
      <SectionCard
        title="AI Platform and Bot Activity"
        description="Which AI crawlers are actively visiting the site, at what frequency, and whether they are successfully accessing content or hitting blocks."
      >
        {agentData ? (
          <>
            <div className={cn(
              'grid gap-3',
              agentData.bots.length > 0
                ? `grid-cols-2 sm:grid-cols-${Math.min(agentData.bots.length, 4)} lg:grid-cols-${Math.min(agentData.bots.length, 6)}`
                : '',
            )}>
              {agentData.bots.slice(0, 6).map((bot) => (
                <BotCard key={bot.botId} bot={bot} />
              ))}
              {agentData.bots.length === 0 && (
                <p className="col-span-full text-xs text-text-muted">No AI bots detected in the last 30 days.</p>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <Th>AI Platform / Bot</Th>
                    <Th>Bot Type</Th>
                    <Th>Total Visits (30d)</Th>
                    <Th>Unique Pages</Th>
                    <Th>2xx Success Rate</Th>
                    <Th>Last Seen</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  <BotTable bots={agentData.bots} />
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <DataUnavailable label="Peec agent analytics unavailable — check PEEC_AI_CUSTOMER_TOKEN and PEEC_AI_CUSTOMER_PROJECT_ID_AVENUE_Z" />
        )}
      </SectionCard>

      {/* ── Section E: Pages with AI + Issues ── */}
      <SectionCard
        title="Pages with AI Activity and Technical Issues"
        description="Pages where AI bots are actively crawling AND where technical issues exist. Issues on AI-targeted pages have the highest priority — they directly impede LLM retrieval."
      >
        {sfData && agentData ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <Th>URL Path</Th>
                  <Th>Page Type</Th>
                  <Th>AI Citations</Th>
                  <Th>AI Indexing Visits</Th>
                  <Th>AI Training Visits</Th>
                  <Th>AI Agent Visits</Th>
                  <Th>Human Visits from AI</Th>
                  <Th>Technical Issues</Th>
                  <Th>Highest Severity</Th>
                  <Th>Change Since Last Crawl</Th>
                  <Th>Priority Flag</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                <PageOverlapTable agentData={agentData} sfData={sfData} clientDomain={clientDomain} demoMode={demoMode} />
              </tbody>
            </table>
          </div>
        ) : (
          <DataUnavailable label="Requires both Screaming Frog CSV and Peec agent analytics to cross-reference" />
        )}
      </SectionCard>

      {/* ── Section F: Anomalies ── */}
      <SectionCard
        title="AI Log Anomalies and Crawl Waste"
        description="Unusual AI bot behavior: hits on error pages, redirect chains, and crawl budget distribution between high-value and low-value pages."
      >
        {agentData ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'Error Page Hits',        value: agentData.errorPageHits,        color: '#FF4444' },
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
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <Th>AI Platform</Th>
                    <Th>Bot Type</Th>
                    <Th>URL / Path</Th>
                    <Th>HTTP Status</Th>
                    <Th>Request Count</Th>
                    <Th>Redirected</Th>
                    <Th>Low-Value Endpoint</Th>
                    <Th>Strategic Page</Th>
                    <Th>Last Seen</Th>
                    <Th>Recommended Action</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {agentData.topPaths.length > 0 ? (
                    agentData.topPaths.map((p, pIdx) => {
                      const LOW_VALUE = ['/robots.txt', '/sitemap', '/wp-json/', '/oembed', '/.well-known/', '/feed/', '/xmlrpc', '/wp-admin']
                      const isLowValue = LOW_VALUE.some(lv => p.path.toLowerCase().includes(lv))
                      const isRedirected = p.status >= 300 && p.status < 400
                      const isStrategic = !isLowValue && p.status < 300
                      const action = p.status >= 400
                        ? 'Fix or redirect — bots wasting budget on error pages'
                        : isRedirected && isLowValue ? 'Consolidate redirects; verify bot access rules'
                        : isRedirected ? 'Consolidate redirect chain to direct URL'
                        : isLowValue ? 'Verify robots.txt — limit unnecessary bot access'
                        : 'Monitor — strategic page with healthy bot activity'
                      const demoPlatforms = ['OpenAI', 'OpenAI', 'Anthropic', 'Perplexity', 'Google', 'Anthropic', 'OpenAI', 'Perplexity', 'Google', 'Anthropic', 'OpenAI', 'Perplexity']
                      const demoBotTypes  = ['search', 'training', 'training', 'retrieval', 'training', 'retrieval', 'search', 'retrieval', 'training', 'training', 'search', 'retrieval']
                      const demoLastSeen  = ['2026-06-02T10:34Z', '2026-06-02T08:51Z', '2026-06-02T03:18Z', '2026-06-01T22:07Z', '2026-06-01T19:42Z', '2026-06-01T14:23Z', '2026-06-01T11:18Z', '2026-06-01T06:51Z', '2026-05-31T20:04Z', '2026-05-31T15:27Z', '2026-05-31T09:43Z', '2026-05-30T23:18Z']
                      const platform = demoMode ? demoPlatforms[pIdx % demoPlatforms.length] : null
                      const botType  = demoMode ? demoBotTypes[pIdx % demoBotTypes.length] : null
                      const lastSeen = demoMode ? demoLastSeen[pIdx % demoLastSeen.length] : null
                      return (
                        <tr key={p.path}>
                          <Td>{platform ? <span className="text-white/70">{platform}</span> : <span className="text-white/20">--</span>}</Td>
                          <Td>{botType ? (
                            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize',
                              botType === 'training'  ? 'bg-[#FFFC60]/10 text-[#FFFC60]' :
                              botType === 'retrieval' ? 'bg-[#60FDFF]/10 text-[#60FDFF]' :
                              'bg-[#60FF80]/10 text-[#60FF80]'
                            )}>{botType}</span>
                          ) : <span className="text-white/20">--</span>}</Td>
                          <Td><span className="font-mono text-[10px] text-white/60 max-w-[140px] truncate block" title={p.path}>{p.path}</span></Td>
                          <Td>
                            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold',
                              p.status >= 400 ? 'bg-[#FF4444]/10 text-[#FF4444]' :
                              p.status >= 300 ? 'bg-[#FFFC60]/10 text-[#FFFC60]' :
                              'bg-[#60FF80]/10 text-[#60FF80]'
                            )}>
                              {p.status}
                            </span>
                          </Td>
                          <Td><span className="tabular-nums text-white">{p.visits}</span></Td>
                          <Td>
                            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold',
                              isRedirected ? 'bg-[#FFFC60]/10 text-[#FFFC60]' : 'bg-white/[0.06] text-white/40'
                            )}>
                              {isRedirected ? 'Yes' : 'No'}
                            </span>
                          </Td>
                          <Td>
                            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold',
                              isLowValue ? 'bg-[#FF4444]/10 text-[#FF4444]' : 'bg-white/[0.06] text-white/40'
                            )}>
                              {isLowValue ? 'Yes' : 'No'}
                            </span>
                          </Td>
                          <Td>
                            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold',
                              isStrategic ? 'bg-[#60FF80]/10 text-[#60FF80]' : 'bg-white/[0.06] text-white/40'
                            )}>
                              {isStrategic ? 'Yes' : 'No'}
                            </span>
                          </Td>
                          <Td>{lastSeen ? <span className="font-mono text-[10px] text-white/30">{lastSeen}</span> : <span className="text-white/20">--</span>}</Td>
                          <Td><span className="text-[11px] text-white/50">{action}</span></Td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr><td colSpan={10} className="py-10 text-center text-xs text-text-muted">No AI bot path data available</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {!demoMode && (
              <p className="text-[10px] text-text-muted">AI Platform and Bot Type per path require per-path bot breakdown (currently aggregated across bots). Last Seen requires extended log retention from Peec.</p>
            )}
          </>
        ) : (
          <DataUnavailable label="Peec agent analytics unavailable" />
        )}
      </SectionCard>

      {/* ── AEO Checklist ── */}
      {aeoChecklist ? (
        <AEOChecklistSection checklist={aeoChecklist} />
      ) : (
        <div>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-text-muted">AEO Technical Checklist</h3>
          <DataUnavailable label="Sitebulb Historical Hint Data unavailable for client" />
        </div>
      )}

      {/* ── Section G: Fix List ── */}
      {sfData ? (
        <FixList sfData={sfData} agentData={agentData} />
      ) : (
        <DataUnavailable label="Fix list requires Screaming Frog crawl data" />
      )}

      {/* Scoring methodology */}
      <div className="flex flex-col gap-4 rounded-xl border border-white/[0.06] bg-bg-surface p-6">
        <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted">How Priority Scoring Works</h3>
        <p className="text-sm leading-relaxed text-white/60">
          Each issue is scored using a weighted formula that combines technical severity with AI activity signals.
          Issues on pages that AI bots actively crawl are prioritized higher because they directly impede LLM retrieval.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Technical Severity',       weight: '35%', color: 'bg-[#FF4444]' },
            { label: 'AI Citation / Indexing',    weight: '25%', color: 'bg-[#60FDFF]' },
            { label: 'Human Visits from AI',      weight: '20%', color: 'bg-[#60FF80]' },
            { label: 'Issue Persistence / Growth', weight: '20%', color: 'bg-[#FFFC60]' },
          ].map(({ label, weight, color }) => (
            <div key={label} className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
              <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', color)} />
              <span className="text-xs font-semibold text-white/60">{label}</span>
              <span className="ml-auto text-xs font-bold text-white/30">{weight}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-text-muted">
        Technical Audit · Data sources: Screaming Frog CSV (Google Drive), Sitebulb Historical Hint Data (Google Sheets), Peec Agent Analytics
        {sfData && ` · Crawl: ${sfData.current.crawlDate}`}
        {agentData && ` · ${agentData.totalBotVisits} AI bot visits (30d)`}
      </p>
    </div>
  )
}
