import { FileText, BarChart2, Target, Sparkles } from 'lucide-react'

// ---------------------------------------------------------------------------
// Framework component — Content Impact
//
// Tracks which content assets are cited by LLMs and how content investments
// translate into AI search visibility.
//
// Data sources (planned):
//   - Peec AI (lib/peec/client.ts) — citation domains, prompt coverage
//   - GA4 (lib/ga4/client.ts) — top pages cross-referenced with Peec citations
//   - GSC (lib/gsc/client.ts) — search query data to identify content gaps
//
// TODO: Cross-reference Peec citation domains with GA4 top pages +
//       GSC query data to identify which content earns LLM citations
// ---------------------------------------------------------------------------

function FrameworkSection({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-white/[0.06] bg-bg-surface p-6">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-bold text-white">{title}</h3>
        <p className="text-xs text-text-muted">{description}</p>
      </div>
      {children ?? (
        <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-white/[0.08]">
          <p className="text-xs text-text-muted">Data integration pending</p>
        </div>
      )}
    </div>
  )
}

function KpiShell({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-white/[0.06] bg-white/[0.03] p-4">
      <span className="text-[11px] font-semibold text-text-muted">{label}</span>
      <span className="text-lg font-bold text-white/20">—</span>
      <span className="text-[10px] text-text-muted">{hint}</span>
    </div>
  )
}

const CONTENT_TYPES = [
  { type: 'Blog / Articles',    desc: 'Long-form editorial content — highest LLM citation rate' },
  { type: 'FAQ Pages',          desc: 'Structured Q&A format — directly optimized for AI extraction' },
  { type: 'Case Studies',       desc: 'Social proof content — cited for credibility signals' },
  { type: 'Landing Pages',      desc: 'Conversion-focused pages — lower citation rate, high traffic value' },
]

export function ContentImpactReport() {
  return (
    <div className="flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#60FF80]/10">
          <FileText className="h-5 w-5 text-[#60FF80]" />
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-bold text-white">Content Impact</h2>
          <p className="text-sm text-text-muted">
            Which content assets earn LLM citations, and where content gaps are holding back AEO visibility.
          </p>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiShell label="Cited Content Pieces"  hint="Peec AI · citation domains" />
        <KpiShell label="Prompt Coverage Rate"  hint="% of target prompts covered" />
        <KpiShell label="Content Gap Score"     hint="Uncovered high-value prompts" />
        <KpiShell label="Top Cited Page"        hint="GA4 + Peec cross-reference" />
      </div>

      {/* Top cited content */}
      <FrameworkSection
        title="Top Cited Content"
        description="Pages and assets most frequently retrieved by LLMs when answering tracked prompts. Ranked by citation frequency."
      >
        <div className="flex flex-col divide-y divide-white/[0.04]">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
              <div className="flex items-center gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-white/[0.06] text-[10px] font-bold text-white/30">{i}</span>
                <span className="text-sm font-semibold text-white/20">/content-page-{i}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xs text-white/20">— citations</span>
                <span className="text-xs text-white/20">— LLMs</span>
              </div>
            </div>
          ))}
        </div>
      </FrameworkSection>

      {/* Content type breakdown */}
      <FrameworkSection
        title="Citation Rate by Content Type"
        description="Different content formats earn citations at different rates. Understanding this helps prioritize content investment for AEO."
      >
        <div className="flex flex-col gap-2">
          {CONTENT_TYPES.map(({ type, desc }) => (
            <div key={type} className="flex items-center gap-4 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-white/60">{type}</p>
                <p className="text-[10px] text-text-muted">{desc}</p>
              </div>
              <div className="flex h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-white/[0.06]">
                {/* Bar fills in when data is available */}
              </div>
              <span className="w-8 text-right text-xs text-white/20">—</span>
            </div>
          ))}
        </div>
      </FrameworkSection>

      {/* Topic cluster coverage */}
      <FrameworkSection
        title="Topic Cluster Coverage"
        description="How well the content library covers the topics that AI tools are being asked about most. Gap analysis drives the content roadmap."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {['Core Brand Topics', 'Industry / Category', 'Competitive Topics', 'Problem-Aware Queries', 'Solution-Aware Queries', 'Product / Service'].map((topic) => (
            <div key={topic} className="flex flex-col gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
              <span className="text-[11px] font-semibold text-white/50">{topic}</span>
              <div className="flex items-center gap-2">
                <div className="h-1 flex-1 rounded-full bg-white/[0.06]" />
                <span className="text-[10px] text-white/20">—%</span>
              </div>
            </div>
          ))}
        </div>
      </FrameworkSection>

      {/* AI insight */}
      <div className="rounded-xl border border-[#60FDFF]/20 bg-[#60FDFF]/[0.03] p-6">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#60FDFF]" />
          <span className="text-sm font-bold text-white">Content → AEO Insight</span>
        </div>
        <p className="text-sm leading-relaxed text-white/60">
          AI-generated content gap analysis will appear here once Peec AI and GA4 data are correlated. This section will surface specific content pieces to create or update to improve brand citations in LLM responses.
        </p>
      </div>

      {/* How it works */}
      <div className="flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-bg-surface p-6">
        <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted">How This Works</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { icon: Target,   step: '1', title: 'Map Prompts to Content', body: 'Each tracked prompt is matched against the content library to identify which pages (if any) are being cited.' },
            { icon: BarChart2, step: '2', title: 'Score Coverage',        body: 'Coverage rate measures what % of high-value prompts have strong content backing them.' },
            { icon: FileText, step: '3', title: 'Surface Gaps',           body: 'Prompts with no strong content match become the content roadmap — the highest-ROI pieces to create.' },
          ].map(({ icon: Icon, step, title, body }) => (
            <div key={step} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[10px] font-bold text-white/50">{step}</span>
                <span className="text-xs font-bold text-white/70">{title}</span>
              </div>
              <p className="text-xs leading-relaxed text-text-muted">{body}</p>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-text-muted">
        Content Impact · Requires Peec AI + GA4 integration
      </p>
    </div>
  )
}
