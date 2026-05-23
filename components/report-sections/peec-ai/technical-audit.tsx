import { Settings, CheckCircle, XCircle, AlertCircle, Sparkles, Globe2, Activity, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getSFData } from '@/lib/screaming-frog/client'
import { getSitebulbData, buildAEOChecklist } from '@/lib/sitebulb/client'
import { getAgentAnalytics, deriveRobotsTxtStatus } from '@/lib/peec/agent-analytics'
import type { SFData, SFIssueDelta, SFDeltaStatus } from '@/lib/screaming-frog/types'
import type { AgentAnalyticsData, AgentBot } from '@/lib/peec/agent-analytics'
import type { AEOChecklist, AEOChecklistItem, AEOStatus } from '@/lib/sitebulb/types'

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
      {bots.map((bot) => (
        <tr key={bot.botId} className="divide-y divide-white/[0.04]">
          <Td><span className="font-medium text-white">{bot.botName}</span></Td>
          <Td><span className="tabular-nums text-white">{bot.totalVisits.toLocaleString()}</span></Td>
          <Td><span className="tabular-nums text-white/60">{bot.uniquePages}</span></Td>
          <Td>
            {bot.successRate !== null ? (
              <span className={cn('text-xs font-semibold tabular-nums',
                bot.successRate >= 0.8 ? 'text-[#60FF80]' : bot.successRate >= 0.4 ? 'text-[#FFFC60]' : 'text-[#FF4444]'
              )}>
                {Math.round(bot.successRate * 100)}%
              </span>
            ) : <span className="text-white/20">—</span>}
          </Td>
          <Td><span className="text-white/30 text-[10px] font-mono">{bot.lastSeen ?? '—'}</span></Td>
        </tr>
      ))}
    </>
  )
}

// ── Section E: High-value page overlap ────────────────────────────────────────

function PageOverlapTable({ agentData, sfData }: { agentData: AgentAnalyticsData; sfData: SFData }) {
  // Find paths that bots visited AND that have SF issues
  const issuesByUrl = new Map<string, string[]>()
  for (const issue of sfData.current.issueSummaries) {
    if (issue.exampleUrl) {
      const existing = issuesByUrl.get(issue.exampleUrl) ?? []
      existing.push(issue.checkName)
      issuesByUrl.set(issue.exampleUrl, existing)
    }
  }

  // Cross-reference bot visits with known issue URLs
  const overlaps = agentData.topPaths
    .filter((p) => {
      const fullUrl = `https://avenuez.com${p.path}`
      return issuesByUrl.has(fullUrl) || issuesByUrl.has(p.path)
    })
    .slice(0, 10)

  if (overlaps.length === 0) {
    return (
      <EmptyBody
        cols={5}
        message="No overlap detected between AI bot visits and pages with known issues — this is a good sign"
      />
    )
  }

  return (
    <>
      {overlaps.map((p) => {
        const issues = issuesByUrl.get(`https://avenuez.com${p.path}`) ?? issuesByUrl.get(p.path) ?? []
        return (
          <tr key={p.path}>
            <Td>
              <span className="font-mono text-[10px] text-white/60 max-w-[200px] truncate block" title={p.path}>
                {p.path}
              </span>
            </Td>
            <Td><span className="tabular-nums text-white">{p.visits}</span></Td>
            <Td><span className="tabular-nums text-white/60">{issues.length}</span></Td>
            <Td>
              {issues[0]
                ? <span className="text-white/50 text-[11px]">{issues[0]}</span>
                : <span className="text-white/20">—</span>}
            </Td>
            <Td>
              <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold',
                p.status >= 400 ? PRIORITY_STYLE.High
                  : p.status >= 300 ? PRIORITY_STYLE.Medium
                  : 'bg-white/[0.06] text-white/40'
              )}>
                {p.status}
              </span>
            </Td>
          </tr>
        )
      })}
    </>
  )
}

// ── Section F: Anomalies ──────────────────────────────────────────────────────

function AnomalyCards({ agentData }: { agentData: AgentAnalyticsData }) {
  const cards = [
    {
      color:  '#FF4444',
      title:  'Bot Hits on Error Pages',
      body:   'AI bots crawling 4xx or 5xx pages waste crawl budget and signal poor site health.',
      stat:   agentData.errorPageHits > 0 ? `${agentData.errorPageHits} visits` : '0 error hits',
      status: agentData.errorPageHits > 10 ? 'fail' : agentData.errorPageHits > 0 ? 'warn' : 'pass',
    },
    {
      color:  '#FFFC60',
      title:  'Bot Hits on Redirect Responses',
      body:   'AI bots encountering 301/302 may not follow all hops, causing incomplete indexing.',
      stat:   agentData.redirectHits > 0 ? `${agentData.redirectHits} redirects` : '0 redirects',
      status: agentData.redirectHits > 50 ? 'fail' : agentData.redirectHits > 10 ? 'warn' : 'pass',
    },
    {
      color:  '#39A0FF',
      title:  'Robots.txt Traffic',
      body:   'High bot traffic to /robots.txt means bots are checking access rules — expected, but monitor response status.',
      stat:   agentData.robotsTxtHits > 0 ? `${agentData.robotsTxtHits} visits` : '0 visits',
      status: 'info' as string,
    },
    {
      color:  '#60FDFF',
      title:  'High-Value Page Bot Visits',
      body:   'Bot visits to non-utility pages (excluding robots.txt, sitemap) — these are the pages LLMs may index.',
      stat:   agentData.highValuePageBotHits > 0 ? `${agentData.highValuePageBotHits} visits` : '0 visits',
      status: agentData.highValuePageBotHits > 0 ? 'pass' : 'warn',
    },
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {cards.map(({ color, title, body, stat, status }) => (
        <div key={title} className="flex flex-col gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-3.5 w-3.5" style={{ color }} />
              <span className="text-xs font-bold text-white/70">{title}</span>
            </div>
            <span className={cn(
              'text-xs font-bold',
              status === 'fail' ? 'text-[#FF4444]'
                : status === 'warn' ? 'text-[#FFFC60]'
                : status === 'pass' ? 'text-[#60FF80]'
                : 'text-white/20',
            )}>
              {stat}
            </span>
          </div>
          <p className="text-[11px] leading-relaxed text-text-muted">{body}</p>
        </div>
      ))}
    </div>
  )
}

// ── Section G: Fix list ────────────────────────────────────────────────────────

function FixList({ sfData, agentData }: { sfData: SFData; agentData: AgentAnalyticsData | null }) {
  // Build prioritized fix list from delta data
  const criticalNew  = sfData.delta.filter((d) => d.status === 'New'        && d.severity === 'Critical')
  const highNew      = sfData.delta.filter((d) => d.status === 'New'        && d.severity === 'High')
  const persistent   = sfData.delta.filter((d) => d.status === 'Persistent' && (d.severity === 'Critical' || d.severity === 'High'))
  const topIssues    = sfData.current.topIssues.slice(0, 6)

  // If we have no delta, fall back to top issues from current crawl
  const hasDelta = sfData.delta.length > 0
  const fixes = hasDelta
    ? [...criticalNew, ...highNew, ...persistent].slice(0, 8)
    : []

  return (
    <div className="rounded-xl border border-[#60FDFF]/20 bg-[#60FDFF]/[0.03] p-6">
      <div className="mb-4 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-[#60FDFF]" />
        <span className="text-sm font-bold text-white">What SEO / Dev Should Fix Next</span>
      </div>

      {hasDelta && fixes.length > 0 ? (
        <div className="flex flex-col gap-2">
          {fixes.map((fix, i) => (
            <div key={fix.checkId} className="flex items-start gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
              <span className={cn(
                'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                fix.status === 'New'        ? 'bg-[#FF4444]/10 text-[#FF4444]'
                  : fix.status === 'Persistent' ? 'bg-[#FFFC60]/10 text-[#FFFC60]'
                  : 'bg-white/[0.06] text-white/40',
              )}>
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-white/80">{fix.checkName}</span>
                  <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase', PRIORITY_STYLE[fix.severity as Priority])}>
                    {fix.severity}
                  </span>
                  <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase', DELTA_STATUS_STYLE[fix.status])}>
                    {fix.status}
                  </span>
                  <span className="ml-auto rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-semibold text-white/40">
                    {fix.owner}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-text-muted">{fix.recommendedAction}</p>
                {fix.exampleUrl && (
                  <p className="mt-0.5 font-mono text-[10px] text-white/20 truncate" title={fix.exampleUrl}>
                    {fix.exampleUrl}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div>
          {!hasDelta && (
            <p className="mb-4 text-xs text-white/40">
              Showing top issues from current crawl — add a prior crawl CSV to enable delta-based prioritization.
            </p>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {topIssues.map((issue, i) => (
              <div key={issue.checkId} className="flex items-start gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[10px] font-bold text-white/40">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-white/80">{issue.checkName}</span>
                    <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase', PRIORITY_STYLE[issue.severity as Priority])}>
                      {issue.severity}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-text-muted">{issue.count.toLocaleString()} affected URLs</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {agentData && agentData.errorPageHits > 0 && (
        <div className="mt-4 rounded-lg border border-[#FF4444]/20 bg-[#FF4444]/[0.04] p-3">
          <p className="text-[11px] font-semibold text-[#FF4444]">
            AI Bot Alert: {agentData.errorPageHits} bot visit{agentData.errorPageHits !== 1 ? 's' : ''} hit error pages in the last 30 days.
            Fix or redirect these pages immediately — bots are burning crawl budget on dead ends.
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

export async function TechnicalAuditReport({ clientSlug }: { clientSlug: string }) {
  // Fetch all data sources in parallel, with graceful degradation on each
  const [sfResult, sitebulbResult, agentResult] = await Promise.allSettled([
    getSFData(clientSlug),
    getSitebulbData(clientSlug),
    getAgentAnalytics(clientSlug),
  ])

  const sfData       = sfResult.status       === 'fulfilled' ? sfResult.value       : null
  const sitebulbData = sitebulbResult.status === 'fulfilled' ? sitebulbResult.value : null
  const agentData    = agentResult.status    === 'fulfilled' ? agentResult.value    : null

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
        <div>
          <h2 className="text-lg font-bold text-white">Technical Audit Logs</h2>
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
          <DataUnavailable label="Screaming Frog CSV not configured — add sfCsvFileId to clients.config.ts" />
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
                Only one crawl snapshot available — add sfPrevCsvFileId to clients.config.ts for delta trending.
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
                    <Th>Bot</Th>
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
                  <Th>Bot Visits</Th>
                  <Th>Known Issues</Th>
                  <Th>Top Issue</Th>
                  <Th>Response Status</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                <PageOverlapTable agentData={agentData} sfData={sfData} />
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
            <AnomalyCards agentData={agentData} />
            {agentData.topPaths.length > 0 && (
              <div className="mt-2">
                <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-text-muted">Top 10 Paths by Bot Visits</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        <Th>Path</Th>
                        <Th>Bot Visits</Th>
                        <Th>Response Status</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {agentData.topPaths.map((p) => (
                        <tr key={p.path}>
                          <Td><span className="font-mono text-[10px] text-white/60">{p.path}</span></Td>
                          <Td><span className="tabular-nums text-white">{p.visits}</span></Td>
                          <Td>
                            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold',
                              p.status >= 400 ? 'bg-[#FF4444]/10 text-[#FF4444]'
                                : p.status >= 300 ? 'bg-[#FFFC60]/10 text-[#FFFC60]'
                                : 'bg-[#60FF80]/10 text-[#60FF80]'
                            )}>
                              {p.status}
                            </span>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
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
          <DataUnavailable label="Sitebulb Historical Hint Data unavailable — check sitebulbSheetId in clients.config.ts" />
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
        <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted">How AEO Technical Scoring Works</h3>
        <p className="text-sm leading-relaxed text-white/60">
          Each check is weighted by its estimated impact on LLM retrieval probability. Structured data signals carry the most weight
          (schema markup directly informs LLM knowledge graphs), followed by content signals (H1, title, meta), and crawlability
          (prerequisite for any indexation).
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            { label: 'Structured Data', weight: '40%', color: 'bg-[#60FDFF]' },
            { label: 'Content Signals', weight: '35%', color: 'bg-[#60FF80]' },
            { label: 'Crawlability',    weight: '25%', color: 'bg-[#FFFC60]' },
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
