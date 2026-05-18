import { Settings, CheckCircle, XCircle, AlertCircle, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Framework component — Technical Performance
//
// AEO technical health: structured data, content format signals, and
// crawlability factors that affect LLM training and retrieval probability.
//
// Data sources (planned):
//   - GSC (lib/gsc/client.ts) — crawl coverage, indexation status
//   - Custom audit rules — schema markup, heading structure, FAQ format,
//     table usage, list structure, internal linking
//   - Peec AI — compare visibility scores against technical health score
//
// TODO: Build an audit runner that fetches top pages from GA4, then
//       fetches each URL server-side and scores AEO technical signals
// ---------------------------------------------------------------------------

type AuditStatus = 'pass' | 'fail' | 'warn' | 'pending'

interface AuditItem {
  label:       string
  description: string
  status:      AuditStatus
  detail?:     string
}

const STATUS_CONFIG: Record<AuditStatus, {
  icon:  React.ComponentType<{ className?: string }>
  color: string
  bg:    string
  label: string
}> = {
  pass:    { icon: CheckCircle,  color: 'text-[#60FF80]', bg: 'bg-[#60FF80]/10',  label: 'Pass'    },
  fail:    { icon: XCircle,      color: 'text-[#FF4444]', bg: 'bg-[#FF4444]/10',  label: 'Fail'    },
  warn:    { icon: AlertCircle,  color: 'text-[#FFFC60]', bg: 'bg-[#FFFC60]/10',  label: 'Warning' },
  pending: { icon: Settings,     color: 'text-white/20',  bg: 'bg-white/[0.04]',  label: 'Pending' },
}

const AUDIT_CATEGORIES: { title: string; description: string; items: AuditItem[] }[] = [
  {
    title:       'Structured Data',
    description: 'Schema markup signals that help LLMs understand and classify content.',
    items: [
      { label: 'Organization schema',  description: 'Identifies the brand, logo, and social profiles to AI crawlers.',  status: 'pending' },
      { label: 'FAQ schema',           description: 'Q&A markup is the highest-signal format for LLM extraction.',         status: 'pending' },
      { label: 'Article / BlogPosting',description: 'Signals publication date and authorship for content trust scoring.', status: 'pending' },
      { label: 'BreadcrumbList',       description: 'Site hierarchy clarity — improves content context for LLMs.',         status: 'pending' },
    ],
  },
  {
    title:       'Content Format Signals',
    description: 'Formatting patterns that increase the probability of LLM retrieval and citation.',
    items: [
      { label: 'FAQ / Q&A sections',    description: 'Direct question-answer format is the most-cited content pattern.',   status: 'pending' },
      { label: 'Numbered lists',        description: 'Step-by-step and ranked content is frequently extracted verbatim.',   status: 'pending' },
      { label: 'Definition blocks',     description: '"X is defined as..." patterns earn citations in informational queries.', status: 'pending' },
      { label: 'Table usage',           description: 'Comparison tables are retrieved for feature/spec queries.',           status: 'pending' },
      { label: 'Heading hierarchy',     description: 'Proper H1→H2→H3 structure helps LLMs segment and retrieve content.',  status: 'pending' },
    ],
  },
  {
    title:       'Crawlability & Indexation',
    description: 'Technical factors ensuring LLM crawlers can access and index content.',
    items: [
      { label: 'Robots.txt — LLM bots', description: 'Ensure GPTBot, ClaudeBot, PerplexityBot are not blocked.',           status: 'pending' },
      { label: 'Sitemap freshness',     description: 'XML sitemap submitted and updated in the last 30 days.',              status: 'pending' },
      { label: 'Core Web Vitals',       description: 'Page speed is a proxy signal for content quality in LLM scoring.',   status: 'pending' },
      { label: 'HTTPS coverage',        description: 'All pages served over HTTPS — baseline trust signal.',                status: 'pending' },
    ],
  },
]

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

function ScoreRing({ score, label }: { score: number | null; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-xl border border-white/[0.06] bg-bg-surface py-5 px-4">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/[0.08]">
        <span className="text-lg font-bold text-white/20">{score !== null ? score : '—'}</span>
      </div>
      <span className="text-center text-[11px] font-semibold text-text-muted">{label}</span>
    </div>
  )
}

export function TechnicalAuditReport() {
  return (
    <div className="flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFFC60]/10">
          <Settings className="h-5 w-5 text-[#FFFC60]" />
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-bold text-white">Technical Performance</h2>
          <p className="text-sm text-text-muted">
            AEO technical health — structured data, content format signals, and crawlability factors
            that affect how LLMs retrieve and cite brand content.
          </p>
        </div>
      </div>

      {/* Score cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ScoreRing score={null} label="Overall AEO Score" />
        <ScoreRing score={null} label="Structured Data" />
        <ScoreRing score={null} label="Content Format" />
        <ScoreRing score={null} label="Crawlability" />
      </div>

      {/* Audit categories */}
      {AUDIT_CATEGORIES.map((cat) => (
        <div key={cat.title} className="flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-bg-surface p-6">
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-bold text-white">{cat.title}</h3>
            <p className="text-xs text-text-muted">{cat.description}</p>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {cat.items.map((item) => (
              <AuditRow key={item.label} item={item} />
            ))}
          </div>
        </div>
      ))}

      {/* AI recommendations */}
      <div className="rounded-xl border border-[#60FDFF]/20 bg-[#60FDFF]/[0.03] p-6">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#60FDFF]" />
          <span className="text-sm font-bold text-white">Technical AEO Recommendations</span>
        </div>
        <p className="text-sm leading-relaxed text-white/60">
          Prioritized fix list will appear here once the audit runner is connected. Recommendations are ranked by estimated visibility impact — highest-lift technical changes surfaced first.
        </p>
      </div>

      {/* How scoring works */}
      <div className="flex flex-col gap-4 rounded-xl border border-white/[0.06] bg-bg-surface p-6">
        <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted">How AEO Scoring Works</h3>
        <p className="text-sm leading-relaxed text-white/60">
          Each check is weighted by its estimated impact on LLM retrieval probability. Structured data signals carry the most weight (schema markup directly informs LLM knowledge graphs), followed by content format (FAQ and list content is extracted at a higher rate), and crawlability (a prerequisite for any indexation).
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
        Technical Performance · Requires GSC integration + page crawler
      </p>
    </div>
  )
}
