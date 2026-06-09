import { Settings, CheckCircle, XCircle, AlertCircle, Globe2, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getSFData } from '@/lib/screaming-frog/client'
import { getSitebulbData, buildAEOChecklist } from '@/lib/sitebulb/client'
import { getAgentAnalytics, deriveRobotsTxtStatus } from '@/lib/peec/agent-analytics'
import { getClientBySlug } from '@/lib/db/queries'
import type { SFData } from '@/lib/screaming-frog/types'
import type { AgentBot } from '@/lib/peec/agent-analytics'
import type { AEOChecklist, AEOChecklistItem, AEOStatus } from '@/lib/sitebulb/types'
import { sampleSFData } from '@/lib/demo-data/screaming-frog'
import { sampleAgentAnalytics } from '@/lib/demo-data/agent-analytics'
import { sampleSitebulbData } from '@/lib/demo-data/sitebulb'
import { SampleDataBadge } from '@/lib/demo-data/badge'
import {
  WhatChangedTable,
  BotActivityTable,
  PageOverlapTable,
  LogAnomaliesTable,
  FixListTable,
  buildFixListRows,
} from './technical-audit-tables'

// ── UI primitives ─────────────────────────────────────────────────────────────

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
      <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-text-muted">Is the site meeting the AEO technical checklist?</h3>
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

export async function TechnicalAuditReport({ clientSlug, dateRange: _dateRange, demoMode = false }: { clientSlug: string; dateRange?: string; demoMode?: boolean }) {
  // Get client config for domain and other client-specific settings.
  // In demo mode, override with the sample SF fixture's domain so the
  // page-overlap matching and FixList URL stripping behave consistently
  // — otherwise the real client's domain leaks into a sample render.
  const clientConfig = await getClientBySlug(clientSlug)
  const clientDomain = demoMode ? 'avenuez.com' : (clientConfig?.domain ?? '')

  // Fetch all data sources in parallel, with graceful degradation on each
  const [sfResult, sitebulbResult, agentResult] = await Promise.allSettled([
    getSFData(clientSlug),
    getSitebulbData(clientSlug),
    getAgentAnalytics(clientSlug),
  ])

  let sfData       = sfResult.status       === 'fulfilled' ? sfResult.value       : null
  let sitebulbData = sitebulbResult.status === 'fulfilled' ? sitebulbResult.value : null
  let agentData    = agentResult.status    === 'fulfilled' ? agentResult.value    : null

  // Demo mode: force-substitute every data source so the demo is
  // exclusively synthetic. Powers Sections A (KPIs), B (delta), C
  // (trends), D (bot activity), E (page overlap), F (anomalies), and
  // the AEO Checklist at the bottom.
  if (demoMode) {
    sfData       = sampleSFData()
    agentData    = sampleAgentAnalytics()
    sitebulbData = sampleSitebulbData()
  }

  // Log any errors server-side (visible in Vercel logs / local dev)
  if (sfResult.status       === 'rejected') console.error('[technical-audit] SF data error:', sfResult.reason)
  if (sitebulbResult.status === 'rejected') console.error('[technical-audit] Sitebulb error:', sitebulbResult.reason)
  if (agentResult.status    === 'rejected') console.error('[technical-audit] Agent analytics error:', agentResult.reason)

  // Derive AEO checklist
  const robotsTxtStatus = agentData ? deriveRobotsTxtStatus(agentData) : undefined
  const aeoChecklist    = sitebulbData
    ? buildAEOChecklist(sitebulbData, robotsTxtStatus)
    : null

  // Section G fix list rows (precomputed so we don't call the helper twice in JSX)
  const fixList = sfData ? buildFixListRows(sfData, agentData) : null

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
            <h2 className="text-lg font-bold text-white">What&apos;s the technical state of the site for AI crawlers?</h2>
            {demoMode && <SampleDataBadge />}
          </div>
          <p className="mt-0.5 text-sm text-text-muted">
            AEO technical health — structured data, crawlability, AI bot behavior, and the issue delta between crawl snapshots.
          </p>
        </div>
      </div>

      {/* ── Section A: Snapshot KPIs ── */}
      <div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-text-muted">What&apos;s the audit at a glance?</h3>
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
      {sfData ? (
        <WhatChangedTable delta={sfData.delta} hasPrev={sfData.prev !== null} />
      ) : (
        <SectionCard
          title="What changed since the last crawl?"
          description="Issue delta between the most recent crawl and the prior crawl. New issues need immediate attention; resolved issues confirm fixes deployed."
        >
          <DataUnavailable label="Screaming Frog CSV data unavailable" />
        </SectionCard>
      )}

      {/* ── Section C: Issue Trends ── */}
      <SectionCard
        title="How are technical issues trending?"
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
      {agentData ? (
        <BotActivityTable
          bots={agentData.bots}
          summary={
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
          }
        />
      ) : (
        <SectionCard
          title="Which AI platforms and bots are visiting the site?"
          description="Which AI crawlers are actively visiting the site, at what frequency, and whether they are successfully accessing content or hitting blocks."
        >
          <DataUnavailable label="Peec agent analytics unavailable — check PEEC_AI_CUSTOMER_TOKEN and PEEC_AI_CUSTOMER_PROJECT_ID_AVENUE_Z" />
        </SectionCard>
      )}

      {/* ── Section E: Pages with AI + Issues ── */}
      {sfData && agentData ? (
        <PageOverlapTable agentData={agentData} sfData={sfData} clientDomain={clientDomain} demoMode={demoMode} />
      ) : (
        <SectionCard
          title="Where do AI activity and technical issues overlap?"
          description="Pages where AI bots are actively crawling AND where technical issues exist. Issues on AI-targeted pages have the highest priority — they directly impede LLM retrieval."
        >
          <DataUnavailable label="Requires both Screaming Frog CSV and Peec agent analytics to cross-reference" />
        </SectionCard>
      )}

      {/* ── Section F: Anomalies ── */}
      {agentData ? (
        <LogAnomaliesTable agentData={agentData} demoMode={demoMode} />
      ) : (
        <SectionCard
          title="Where are AI crawlers wasting requests?"
          description="Unusual AI bot behavior: hits on error pages, redirect chains, and crawl budget distribution between high-value and low-value pages."
        >
          <DataUnavailable label="Peec agent analytics unavailable" />
        </SectionCard>
      )}

      {/* ── AEO Checklist ── */}
      {aeoChecklist ? (
        <AEOChecklistSection checklist={aeoChecklist} />
      ) : (
        <div>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-text-muted">Is the site meeting the AEO technical checklist?</h3>
          <DataUnavailable label="Sitebulb Historical Hint Data unavailable for client" />
        </div>
      )}

      {/* ── Section G: Fix List ── */}
      {fixList ? (
        <FixListTable
          rows={fixList.rows}
          hasDelta={fixList.hasDelta}
          errorPageHits={agentData?.errorPageHits ?? null}
        />
      ) : (
        <DataUnavailable label="Fix list requires Screaming Frog crawl data" />
      )}

      {/* Scoring methodology */}
      <div className="flex flex-col gap-4 rounded-xl border border-white/[0.06] bg-bg-surface p-6">
        <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted">How is priority scored?</h3>
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
