import { Newspaper, TrendingUp, ExternalLink, Sparkles } from 'lucide-react'

// ---------------------------------------------------------------------------
// Framework component — PR Influence
//
// Tracks how earned media and PR activity feeds brand visibility in AI tools.
// Data sources (planned):
//   - News API (lib/newsapi.ts) — coverage volume, publication tier, sentiment
//   - Peec AI (lib/peec/client.ts) — citation overlap: which press mentions
//     are being retrieved and cited in LLM responses
//
// TODO: Wire fetchPRCoverage() + cross-reference with Peec citation domains
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

export function PRInfluenceReport() {
  return (
    <div className="flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#39A0FF]/10">
          <Newspaper className="h-5 w-5 text-[#39A0FF]" />
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-bold text-white">PR Influence</h2>
          <p className="text-sm text-text-muted">
            How earned media and press coverage drives brand visibility in AI-generated responses.
          </p>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiShell label="Articles Published"       hint="News API · last 30 days" />
        <KpiShell label="Estimated Reach"          hint="News API · audience size" />
        <KpiShell label="Press Citations in LLMs"  hint="Peec AI · cross-reference" />
        <KpiShell label="Avg Sentiment Score"      hint="News API · NLP scoring" />
      </div>

      {/* Coverage volume */}
      <FrameworkSection
        title="Coverage Volume Over Time"
        description="Monthly article count across tracked publications — shows whether PR cadence is accelerating or declining."
      />

      {/* Publication tier breakdown */}
      <FrameworkSection
        title="Publication Tier Breakdown"
        description="Coverage split by tier (Tier 1 nationals, trade publications, blogs) — higher tiers carry more LLM citation weight."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {['Tier 1 — National', 'Tier 2 — Trade/Industry', 'Tier 3 — Blogs/Other'].map((tier) => (
            <div key={tier} className="flex flex-col gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] p-4">
              <span className="text-xs font-semibold text-white/60">{tier}</span>
              <span className="text-xl font-bold text-white/20">—</span>
              <span className="text-[10px] text-text-muted">articles · pending</span>
            </div>
          ))}
        </div>
      </FrameworkSection>

      {/* LLM citation overlap */}
      <FrameworkSection
        title="Press → LLM Citation Correlation"
        description="Which press placements are actively being retrieved and cited by AI tools. High-authority placements directly boost brand AEO visibility."
      >
        <div className="flex flex-col gap-2">
          {['Publication', 'Article', 'LLM Visibility Impact', 'Cited By'].map((col, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg bg-white/[0.02] px-4 py-2.5">
              <span className="text-xs font-semibold text-white/20">{col}</span>
              <span className="text-xs text-white/10">—</span>
            </div>
          ))}
        </div>
      </FrameworkSection>

      {/* AI insight panel */}
      <div className="rounded-xl border border-[#60FDFF]/20 bg-[#60FDFF]/[0.03] p-6">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#60FDFF]" />
          <span className="text-sm font-bold text-white">PR → AEO Insight</span>
        </div>
        <p className="text-sm leading-relaxed text-white/60">
          AI-generated analysis of how PR activity is influencing LLM brand visibility will appear here once News API and Peec AI data are correlated. This section will surface which publications drive the most citation lift and where coverage gaps exist.
        </p>
      </div>

      {/* How it works */}
      <div className="flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-bg-surface p-6">
        <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted">How This Works</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { icon: Newspaper,    step: '1', title: 'Track Coverage',    body: 'News API monitors brand mentions across thousands of publications in real time.' },
            { icon: TrendingUp,   step: '2', title: 'Score Influence',   body: 'Publications are scored by domain authority, audience size, and LLM training signal weight.' },
            { icon: ExternalLink, step: '3', title: 'Correlate to LLMs', body: 'Peec AI data identifies which press mentions appear as citations inside AI-generated answers.' },
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
        PR Influence · Requires News API key + Peec AI integration
      </p>
    </div>
  )
}
