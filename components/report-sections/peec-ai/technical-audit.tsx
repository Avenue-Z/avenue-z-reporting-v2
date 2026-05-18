import { Settings, CheckCircle, XCircle, AlertCircle, Sparkles, Globe2, Activity } from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Technical Audit Logs
// PRD Sections A–G
//
// Live data:  None yet — requires Screaming Frog / Sitebulb crawl exports
//             (CSV or API), server access logs for AI bot behavior,
//             GA4 page-level data, Peec AI for citation-overlap section
//
// Renders full PRD structure with proper column schemas and empty states,
// ready for data wiring.
// ---------------------------------------------------------------------------

type AuditStatus = 'pass' | 'fail' | 'warn' | 'pending'
type Priority    = 'High' | 'Medium' | 'Low'

const STATUS_CONFIG: Record<AuditStatus, {
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

const PRIORITY_STYLE: Record<Priority, string> = {
  High:   'bg-[#FF4444]/10 text-[#FF4444]',
  Medium: 'bg-[#FFFC60]/10 text-[#FFFC60]',
  Low:    'bg-white/[0.06] text-white/40',
}

interface AuditItem {
  label: string
  description: string
  status: AuditStatus
  detail?: string
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

function KpiCard({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-white/[0.06] bg-bg-surface p-4">
      <span className="text-[11px] font-semibold text-text-muted">{label}</span>
      <span className="text-xl font-bold text-white/20">—</span>
      <span className="text-[10px] text-text-muted">{hint}</span>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap pb-2.5 pr-5 text-left text-[10px] font-bold uppercase tracking-wider text-text-muted last:pr-0">
      {children}
    </th>
  )
}

function EmptyBody({ cols, message }: { cols: number; message: string }) {
  return (
    <tr>
      <td colSpan={cols} className="py-10 text-center text-xs text-text-muted">{message}</td>
    </tr>
  )
}

function AuditRow({ item }: { item: AuditItem }) {
  const cfg  = STATUS_CONFIG[item.status]
  const Icon = cfg.icon
  return (
    <div className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <span className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full', cfg.bg)}>
        <Icon className={cn('h-3 w-3', cfg.color)} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-white/70">{item.label}</span>
          <span className={cn('shrink-0 text-[10px] font-bold uppercase tracking-wider', cfg.color)}>
            {cfg.label}
          </span>
        </div>
        <p className="mt-0.5 text-[11px] text-text-muted">{item.description}</p>
        {item.detail && (
          <p className="mt-1 text-[11px] text-white/40">{item.detail}</p>
        )}
      </div>
    </div>
  )
}

// ── Audit checklist data (pending until crawl data is connected) ──

const AUDIT_CATEGORIES: { title: string; description: string; items: AuditItem[] }[] = [
  {
    title: 'Structured Data',
    description: 'Schema markup signals that help LLMs understand and classify content.',
    items: [
      { label: 'Organization schema',    description: 'Identifies the brand, logo, and social profiles to AI crawlers.',         status: 'pending' },
      { label: 'FAQ schema',             description: 'Q&A markup is the highest-signal format for LLM extraction.',              status: 'pending' },
      { label: 'Article / BlogPosting',  description: 'Signals publication date and authorship for content trust scoring.',       status: 'pending' },
      { label: 'BreadcrumbList',         description: 'Site hierarchy clarity — improves content context for LLMs.',              status: 'pending' },
    ],
  },
  {
    title: 'Content Format Signals',
    description: 'Formatting patterns that increase the probability of LLM retrieval and citation.',
    items: [
      { label: 'FAQ / Q&A sections',    description: 'Direct question-answer format is the most-cited content pattern.',         status: 'pending' },
      { label: 'Numbered lists',        description: 'Step-by-step and ranked content is frequently extracted verbatim.',         status: 'pending' },
      { label: 'Definition blocks',     description: '"X is defined as..." patterns earn citations in informational queries.',    status: 'pending' },
      { label: 'Table usage',           description: 'Comparison tables are retrieved for feature / spec queries.',               status: 'pending' },
      { label: 'Heading hierarchy',     description: 'Proper H1→H2→H3 structure helps LLMs segment and retrieve content.',       status: 'pending' },
    ],
  },
  {
    title: 'Crawlability & Indexation',
    description: 'Technical factors ensuring LLM crawlers can access and index content.',
    items: [
      { label: 'Robots.txt — LLM bots', description: 'Ensure GPTBot, ClaudeBot, PerplexityBot are not blocked.',                status: 'pending' },
      { label: 'Sitemap freshness',     description: 'XML sitemap submitted and updated in the last 30 days.',                   status: 'pending' },
      { label: 'Core Web Vitals',       description: 'Page speed is a proxy signal for content quality in LLM scoring.',        status: 'pending' },
      { label: 'HTTPS coverage',        description: 'All pages served over HTTPS — baseline trust signal.',                     status: 'pending' },
    ],
  },
]

const ISSUE_TYPES = [
  { type: '4xx Errors',           priority: 'High'   as Priority },
  { type: 'Broken Internal Links', priority: 'High'   as Priority },
  { type: 'Missing Title Tags',   priority: 'High'   as Priority },
  { type: 'Duplicate H1s',        priority: 'Medium' as Priority },
  { type: 'Missing Meta Descriptions', priority: 'Medium' as Priority },
  { type: 'Missing Schema Markup', priority: 'High'  as Priority },
  { type: 'Redirect Chains',      priority: 'Medium' as Priority },
  { type: 'Slow Page Speed',      priority: 'Medium' as Priority },
  { type: 'Orphan Pages',         priority: 'Low'    as Priority },
  { type: 'Canonical Issues',     priority: 'Medium' as Priority },
]

export function TechnicalAuditReport() {
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
            AEO technical health — structured data, content format signals, crawlability factors, and AI bot behavior that affect how LLMs retrieve and cite brand content.
          </p>
        </div>
      </div>

      {/* ── Section A: Audit Snapshot KPI ── */}
      <div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-text-muted">Audit Snapshot</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          <KpiCard label="Current Crawl Date"     hint="Last Screaming Frog export" />
          <KpiCard label="Pages Crawled"          hint="Total URLs in crawl" />
          <KpiCard label="Total Issues"           hint="All severity levels" />
          <KpiCard label="New Issues"             hint="Not in prior crawl" />
          <KpiCard label="Resolved Issues"        hint="Fixed since prior crawl" />
          <KpiCard label="Persistent Issues"      hint="Present in both crawls" />
          <KpiCard label="Priority-Weighted Score" hint="Severity × issue count" />
        </div>
      </div>

      {/* ── Section B: What Changed Since Last Crawl ── */}
      <SectionCard
        title="What Changed Since Last Crawl"
        description="Issue delta between the most recent crawl and the prior crawl. New issues need immediate attention; resolved issues confirm fixes deployed; persistent issues are highest priority."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <Th>Issue Type</Th>
                <Th>Priority</Th>
                <Th>Prev Count</Th>
                <Th>Current Count</Th>
                <Th>Delta</Th>
                <Th>Status</Th>
                <Th>Example URL</Th>
                <Th>Recommended Action</Th>
                <Th>Owner</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {/* Schema rows shown in ghost state */}
              {ISSUE_TYPES.map((issue) => (
                <tr key={issue.type} className="opacity-20">
                  <td className="py-2.5 pr-5 font-medium text-white">{issue.type}</td>
                  <td className="py-2.5 pr-5">
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', PRIORITY_STYLE[issue.priority])}>
                      {issue.priority}
                    </span>
                  </td>
                  <td className="py-2.5 pr-5 tabular-nums text-white">—</td>
                  <td className="py-2.5 pr-5 tabular-nums text-white">—</td>
                  <td className="py-2.5 pr-5 tabular-nums text-white">—</td>
                  <td className="py-2.5 pr-5">
                    <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-white/40">—</span>
                  </td>
                  <td className="py-2.5 pr-5 text-white">—</td>
                  <td className="py-2.5 pr-5 text-white">—</td>
                  <td className="py-2.5 text-white">—</td>
                </tr>
              ))}
              <tr>
                <td colSpan={9} className="py-6 text-center text-xs text-text-muted">
                  Upload Screaming Frog or Sitebulb crawl export (CSV) to populate issue delta table
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-3">
          {[
            { label: 'New',        color: 'bg-[#FF4444]/10 text-[#FF4444]' },
            { label: 'Resolved',   color: 'bg-[#60FF80]/10 text-[#60FF80]' },
            { label: 'Persistent', color: 'bg-[#FFFC60]/10 text-[#FFFC60]' },
          ].map(({ label, color }) => (
            <span key={label} className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', color)}>{label}</span>
          ))}
        </div>
      </SectionCard>

      {/* ── Section C: Issue Trend View ── */}
      <SectionCard
        title="Issue Trends Over Time"
        description="Historical crawl data shows whether total technical issues are trending up, down, or stagnant. Persistent upward trends signal a site health deterioration requiring structural intervention."
      >
        <div className="grid grid-cols-3 gap-3">
          {['4xx Errors', 'Missing Schema', 'Broken Internal Links'].map((issueType) => (
            <div key={issueType} className="flex flex-col gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
              <span className="text-[11px] font-semibold text-text-muted">{issueType}</span>
              <div className="flex h-12 items-end gap-0.5">
                {[40, 55, 50, 62, 48, 45, 38].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t-sm bg-white/[0.06]"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
              <span className="text-[10px] text-text-muted">7 crawls — pending live data</span>
            </div>
          ))}
        </div>
        <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-white/[0.08]">
          <p className="text-xs text-text-muted">Full trend chart — requires at least 2 crawl exports uploaded</p>
        </div>
      </SectionCard>

      {/* ── Section D: AI Crawl Behavior ── */}
      <SectionCard
        title="AI Platform and Bot Activity"
        description="Which AI crawlers are actively visiting the site, at what frequency, and which pages they target most. Identifies whether LLM training and retrieval bots have full access or are hitting blocks."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {['GPTBot', 'ClaudeBot', 'PerplexityBot', 'GoogleBot-AI', 'CCBot', 'Applebot'].map((bot) => (
            <div key={bot} className="flex flex-col gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="flex items-center gap-1.5">
                <Globe2 className="h-3.5 w-3.5 text-text-muted" />
                <span className="text-[11px] font-bold text-white/50">{bot}</span>
              </div>
              <span className="text-lg font-bold text-white/20">—</span>
              <span className="text-[10px] text-text-muted">visits / 30d</span>
              <span className="text-[10px] text-text-muted">— pages crawled</span>
            </div>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <Th>Bot</Th>
                <Th>Total Visits (30d)</Th>
                <Th>Unique Pages</Th>
                <Th>Avg Crawl Depth</Th>
                <Th>Top Page Crawled</Th>
                <Th>Robots.txt Status</Th>
                <Th>Last Seen</Th>
              </tr>
            </thead>
            <tbody>
              <EmptyBody cols={7} message="Requires server access log parsing — connect log file or CDN export" />
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* ── Section E: Pages AI Systems Care About + Technical Overlap ── */}
      <SectionCard
        title="Pages with AI Activity and Technical Overlap"
        description="Pages where AI bots are actively crawling AND where technical issues exist. Technical issues on AI-targeted pages have the highest priority — they directly impede LLM retrieval and citation."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <Th>URL</Th>
                <Th>AI Bot Visits</Th>
                <Th>AI Citations (Peec)</Th>
                <Th>Human Sessions (GA4)</Th>
                <Th>Active Issues</Th>
                <Th>Top Issue</Th>
                <Th>Priority</Th>
                <Th>Page Priority Score</Th>
              </tr>
            </thead>
            <tbody>
              <EmptyBody cols={8} message="Requires crawl export + access logs + Peec AI citation data (URL-level)" />
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-text-muted">
          Page Priority Score = 35% technical severity + 25% AI citation / indexing + 20% human visits from AI + 20% issue persistence
        </p>
      </SectionCard>

      {/* ── Section F: AI Log Anomalies and Crawl Waste ── */}
      <SectionCard
        title="AI Log Anomalies and Crawl Waste"
        description="Unusual AI bot behavior: excessive crawling of low-value pages, repeated visits to error pages, or bots blocked from high-value content. Crawl waste on error pages indicates resources wasted on unindexable content."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            {
              color: '#FF4444',
              title: 'Bot Hitting Error Pages',
              body: 'AI bots crawling 4xx or 5xx pages waste crawl budget and signal poor site health. Identify and fix or redirect all error pages AI bots are hitting.',
              stat: '— pages',
            },
            {
              color: '#FFFC60',
              title: 'Blocked High-Value Pages',
              body: 'High-traffic or high-citation pages blocked by robots.txt or noindex tags. These are AI-invisible despite being content-rich.',
              stat: '— pages',
            },
            {
              color: '#39A0FF',
              title: 'Redirect Chain Waste',
              body: 'AI bots that hit redirect chains (3xx → 3xx → final URL) may not follow all hops. These pages may be partially indexed or de-ranked.',
              stat: '— chains',
            },
            {
              color: '#60FDFF',
              title: 'Crawl Concentration on Low-Value Pages',
              body: 'Bots spending disproportionate time on tag archives, paginated indexes, or parameter URLs rather than canonical content pages.',
              stat: '—% of crawl',
            },
          ].map(({ color, title, body, stat }) => (
            <div key={title} className="flex flex-col gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5" style={{ color }} />
                  <span className="text-xs font-bold text-white/70">{title}</span>
                </div>
                <span className="text-xs font-bold text-white/20">{stat}</span>
              </div>
              <p className="text-[11px] leading-relaxed text-text-muted">{body}</p>
            </div>
          ))}
        </div>
        <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-white/[0.08]">
          <p className="text-xs text-text-muted">Bot behavior detail table — requires access log file or CDN log export</p>
        </div>
      </SectionCard>

      {/* ── AEO Checklist (from original technical-audit framework) ── */}
      <div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-text-muted">AEO Technical Checklist</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {AUDIT_CATEGORIES.map((cat) => (
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

      {/* ── Section G: What SEO / Dev Should Fix Next ── */}
      <div className="rounded-xl border border-[#60FDFF]/20 bg-[#60FDFF]/[0.03] p-6">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#60FDFF]" />
          <span className="text-sm font-bold text-white">What SEO / Dev Should Fix Next</span>
        </div>
        <p className="mb-5 text-sm leading-relaxed text-white/60">
          Prioritized fix list will appear here once crawl data is connected. Recommendations are ranked by Page Priority Score — technical changes that unblock AI crawlers on high-citation, high-traffic pages are surfaced first.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: 'Fix AI-Blocked High-Value Pages',
              color: '#FF4444',
              weight: '35%',
              body: 'Technical severity: remove noindex / robots.txt blocks from pages AI bots should access. These are zero-cost fixes with immediate visibility impact.',
            },
            {
              label: 'Add Schema to Unstructured Content',
              color: '#FFFC60',
              weight: '25%',
              body: 'AI citation + indexing: add Organization, FAQ, and Article schema to top-cited pages that are missing structured data markup.',
            },
            {
              label: 'Clear Redirect Chains on AI Targets',
              color: '#39A0FF',
              weight: '20%',
              body: 'Human visits from AI: resolve redirect chains (301→301) on pages AI bots crawl frequently — bots may not follow all hops, causing partial indexing.',
            },
            {
              label: 'Fix Persistent 4xx Pages',
              color: '#60FF80',
              weight: '20%',
              body: 'Issue persistence: 4xx pages in multiple consecutive crawls waste bot crawl budget and signal low site quality to LLM training pipelines.',
            },
          ].map(({ label, color, weight, body }) => (
            <div key={label} className="flex flex-col gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="flex items-center justify-between">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-[10px] font-bold text-white/30">{weight}</span>
              </div>
              <p className="text-xs font-bold text-white/80">{label}</p>
              <p className="text-[11px] leading-relaxed text-text-muted">{body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Scoring methodology */}
      <div className="flex flex-col gap-4 rounded-xl border border-white/[0.06] bg-bg-surface p-6">
        <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted">How AEO Technical Scoring Works</h3>
        <p className="text-sm leading-relaxed text-white/60">
          Each check is weighted by its estimated impact on LLM retrieval probability. Structured data signals carry the most weight (schema markup directly informs LLM knowledge graphs), followed by content format (FAQ and list content is extracted at a higher rate), and crawlability (prerequisite for any indexation).
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            { label: 'Structured Data', weight: '40%', color: 'bg-[#60FDFF]' },
            { label: 'Content Format',  weight: '35%', color: 'bg-[#60FF80]' },
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
        Technical Audit Logs · Requires: Screaming Frog or Sitebulb crawl export (CSV), server access logs or CDN log export for AI bot analysis
      </p>
    </div>
  )
}
