import { getPeecOverview } from '@/lib/peec/client'
import type { TrackedPrompt } from '@/lib/peec/client'
import { Newspaper, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// PR Influence on AI Visibility
// PRD Sections A–F
//
// Live data:  Peec AI (visibility, position, citations, editorial domains,
//             prompt cluster gap analysis)
// Pending:    PR placement log CSV, GA4 AI-referral sessions,
//             URL-level brand-absent citation data (Peec Pro)
// ---------------------------------------------------------------------------

function fmt(n: number, decimals = 1, suffix = '%') {
  return `${n.toFixed(decimals)}${suffix}`
}

function Delta({ value, invert = false }: { value: number; invert?: boolean }) {
  const positive = invert ? value < 0 : value >= 0
  return (
    <span className={cn('text-xs font-semibold tabular-nums', positive ? 'text-[#60FF80]' : 'text-[#FF4444]')}>
      {value >= 0 ? '+' : ''}{value.toFixed(1)}
    </span>
  )
}

function KpiCard({
  label,
  value,
  delta,
  deltaInvert,
  hint,
  live = false,
}: {
  label: string
  value: string
  delta?: number
  deltaInvert?: boolean
  hint: string
  live?: boolean
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-white/[0.06] bg-bg-surface p-4">
      <span className="text-[11px] font-semibold text-text-muted">{label}</span>
      <span className={cn('text-xl font-bold tabular-nums', live ? 'text-white' : 'text-white/20')}>{value}</span>
      {delta !== undefined && live ? (
        <Delta value={delta} invert={deltaInvert} />
      ) : (
        <span className="text-[10px] text-text-muted">{hint}</span>
      )}
    </div>
  )
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

function TableEmpty({ cols, message }: { cols: number; message: string }) {
  return (
    <tr>
      <td colSpan={cols} className="py-10 text-center text-xs text-text-muted">{message}</td>
    </tr>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap pb-2.5 pr-5 text-left text-[10px] font-bold uppercase tracking-wider text-text-muted last:pr-0">
      {children}
    </th>
  )
}

export async function PRInfluenceReport() {
  let data = null
  try {
    data = await getPeecOverview()
  } catch {
    // graceful degradation — render empty-state structure
  }

  const youMetrics = data?.brandRankings.find(b => b.isYou) ?? null
  const editorialDomains = (data?.domainsByRange['YTD'] ?? []).filter(d => d.type === 'Editorial')
  const totalCitations = data?.totalCitationsByRange['YTD'] ?? 0

  // Section E — group tracked prompts into clusters, sort lowest brand visibility first (highest opportunity)
  type ClusterRow = {
    cluster: string
    count: number
    avgVisibility: number
    avgSov: number
    avgPosition: number
    activeLLMs: number
  }
  const clusterMap = new Map<string, TrackedPrompt[]>()
  for (const p of data?.trackedPrompts ?? []) {
    if (!clusterMap.has(p.group)) clusterMap.set(p.group, [])
    clusterMap.get(p.group)!.push(p)
  }
  const clusterRows: ClusterRow[] = Array.from(clusterMap.entries())
    .map(([cluster, prompts]) => {
      const posPrompts = prompts.filter(p => p.position > 0)
      return {
        cluster,
        count: prompts.length,
        avgVisibility: prompts.reduce((s, p) => s + p.visibility, 0) / prompts.length,
        avgSov: prompts.reduce((s, p) => s + p.sov, 0) / prompts.length,
        avgPosition: posPrompts.length > 0 ? posPrompts.reduce((s, p) => s + p.position, 0) / posPrompts.length : 0,
        activeLLMs: new Set(prompts.flatMap(p => p.sources)).size,
      }
    })
    .sort((a, b) => a.avgVisibility - b.avgVisibility) // lowest brand presence = highest opportunity first

  return (
    <div className="flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#39A0FF]/10">
          <Newspaper className="h-5 w-5 text-[#39A0FF]" />
        </span>
        <div>
          <h2 className="text-lg font-bold text-white">PR Influence on AI Visibility</h2>
          <p className="mt-0.5 text-sm text-text-muted">
            How earned media and press coverage drives brand visibility in AI-generated responses.
          </p>
        </div>
      </div>

      {/* ── Section A: KPI Strip ── */}
      <div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-text-muted">KPI Strip</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <KpiCard
            label="AI Visibility %"
            value={youMetrics ? fmt(youMetrics.visibility) : '—'}
            delta={youMetrics?.visibilityDelta}
            hint="Peec AI · YTD"
            live={!!youMetrics}
          />
          <KpiCard
            label="Avg AI Position"
            value={youMetrics ? youMetrics.position.toFixed(1) : '—'}
            delta={youMetrics ? -youMetrics.positionDelta : undefined}
            deltaInvert
            hint="Peec AI · YTD (lower = better)"
            live={!!youMetrics}
          />
          <KpiCard
            label="# AI Citations"
            value={totalCitations > 0 ? totalCitations.toLocaleString() : '—'}
            hint="Peec AI · total YTD"
            live={totalCitations > 0}
          />
          <KpiCard
            label="PR Placements Cited by AI"
            value="—"
            hint="Connect PR placement log"
          />
          <KpiCard
            label="AI Referral Sessions"
            value="—"
            hint="Connect GA4 source data"
          />
          <KpiCard
            label="Editorial Share — Brand Absent"
            value="—"
            hint="Requires URL-level citation data"
          />
        </div>
      </div>

      {/* ── Section B: PR Placements Secured → Cited in AI ── */}
      <SectionCard
        title="PR Placements Secured → Cited in AI"
        description="Match each secured PR placement against Peec AI citation data to see which earned media is driving LLM retrieval. Upload a PR placement log CSV to populate."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <Th>Outlet</Th>
                <Th>Headline / URL</Th>
                <Th>Pub Date</Th>
                <Th>Domain Type</Th>
                <Th>Retrieved %</Th>
                <Th>Citation Rate</Th>
                <Th># LLMs</Th>
                <Th>Brand Mention</Th>
              </tr>
            </thead>
            <tbody>
              <TableEmpty cols={8} message="Upload PR placement log (CSV) to populate matchback table" />
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* ── Section C: Top Editorial Domains Cited by AI ── */}
      <SectionCard
        title="Top Editorial Domains Cited by AI"
        description="Editorial domains most frequently retrieved in AI responses for your tracked prompt set. These outlets already carry LLM citation weight — securing coverage here has direct AEO impact."
      >
        {editorialDomains.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <Th>Domain</Th>
                  <Th>Type</Th>
                  <Th>Retrieved %</Th>
                  <Th>Δ vs Prior</Th>
                  <Th>Citation Rate</Th>
                  <Th>Δ vs Prior</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {editorialDomains.slice(0, 25).map(d => (
                  <tr key={d.domain}>
                    <td className="py-2.5 pr-5 font-medium text-white/80">{d.domain}</td>
                    <td className="py-2.5 pr-5">
                      <span className="rounded-full bg-[#39A0FF]/10 px-2 py-0.5 text-[10px] font-semibold text-[#39A0FF]">
                        {d.type}
                      </span>
                    </td>
                    <td className="py-2.5 pr-5 tabular-nums text-white">{fmt(d.retrieved)}</td>
                    <td className="py-2.5 pr-5">
                      <Delta value={d.retrievedDelta} />
                    </td>
                    <td className="py-2.5 pr-5 tabular-nums text-white">{fmt(d.citationRate)}</td>
                    <td className="py-2.5">
                      <Delta value={d.citationRateDelta} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-white/[0.08]">
            <p className="text-xs text-text-muted">No editorial domains found in current Peec AI project</p>
          </div>
        )}
      </SectionCard>

      {/* ── Section D: Brand-Absent Editorial URLs ── */}
      <SectionCard
        title="Top Editorial URLs Cited by AI Where Brand Is Absent"
        description="High-authority editorial URLs that AI tools are actively citing for your tracked prompts, but where Avenue Z is not mentioned. These are the highest-priority PR targets."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <Th>URL</Th>
                <Th>Domain</Th>
                <Th>Domain Type</Th>
                <Th># Prompts Cited</Th>
                <Th># LLMs</Th>
                <Th>Brand Mentioned</Th>
                <Th>Last Seen</Th>
              </tr>
            </thead>
            <tbody>
              <TableEmpty cols={7} message="Requires URL-level citation data — available on Peec AI Pro" />
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* ── Section E: Prompt Gap View ── */}
      <SectionCard
        title="Prompt Clusters with Strong Editorial Citation and Weak Brand Presence"
        description="Clusters sorted by lowest brand visibility (highest opportunity first). These are the categories where competitors and editorial sources own the AI conversation — and where one strong PR placement can shift the needle."
      >
        {clusterRows.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <Th>Prompt Cluster</Th>
                    <Th>Prompts</Th>
                    <Th>Brand Visibility %</Th>
                    <Th>Brand SOV %</Th>
                    <Th>Avg Position</Th>
                    <Th>Active LLMs</Th>
                    <Th>Opportunity Score</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {clusterRows.map(row => {
                    const opp = Math.max(0, 100 - row.avgVisibility)
                    const oppColor = opp > 60 ? '#60FF80' : opp > 30 ? '#FFFC60' : '#FF4444'
                    return (
                      <tr key={row.cluster}>
                        <td className="py-2.5 pr-5 font-semibold text-white/80">{row.cluster}</td>
                        <td className="py-2.5 pr-5 tabular-nums text-white">{row.count}</td>
                        <td className="py-2.5 pr-5">
                          <div className="flex items-center gap-2">
                            <div className="h-1 w-16 overflow-hidden rounded-full bg-white/[0.06]">
                              <div
                                className="h-full rounded-full bg-[#39A0FF]"
                                style={{ width: `${Math.min(row.avgVisibility, 100)}%` }}
                              />
                            </div>
                            <span className="tabular-nums text-white">{fmt(row.avgVisibility)}</span>
                          </div>
                        </td>
                        <td className="py-2.5 pr-5 tabular-nums text-white">{fmt(row.avgSov)}</td>
                        <td className="py-2.5 pr-5 tabular-nums text-white">
                          {row.avgPosition > 0 ? row.avgPosition.toFixed(1) : '—'}
                        </td>
                        <td className="py-2.5 pr-5 tabular-nums text-white">{row.activeLLMs}</td>
                        <td className="py-2.5">
                          <span className="text-xs font-bold tabular-nums" style={{ color: oppColor }}>
                            {opp.toFixed(0)}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-text-muted">
              Opportunity Score = 100 − Brand Visibility %. Sorted ascending by brand visibility. Editorial Citation Density and Competitor Presence columns require PR placement log connection.
            </p>
          </>
        ) : (
          <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-white/[0.08]">
            <p className="text-xs text-text-muted">No tracked prompts yet — add prompts in Peec AI to populate cluster analysis</p>
          </div>
        )}
      </SectionCard>

      {/* ── Section F: What PR Should Pitch Next ── */}
      <div className="rounded-xl border border-[#60FDFF]/20 bg-[#60FDFF]/[0.03] p-6">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#60FDFF]" />
          <span className="text-sm font-bold text-white">What PR Should Pitch Next</span>
        </div>
        <p className="mb-5 text-sm leading-relaxed text-white/60">
          Pitch targets are determined by cross-referencing prompt clusters where brand presence is lowest, editorial citation density is highest, and competitors are most active. Connect PR placement log to unlock AI-generated pitch briefs for each target outlet.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            {
              color: '#39A0FF',
              title: 'Target High-Authority Editorial Domains',
              body: 'Outlets already cited in AI responses for your category but not mentioning your brand are the highest-ROI pitch targets. Focus on getting quoted — or added — to existing top-cited articles rather than creating net-new coverage.',
            },
            {
              color: '#60FF80',
              title: 'Fill Prompt Cluster Gaps',
              body: 'Clusters with 0–20% brand visibility represent categories where competitors own the AI conversation. A single placement in a top editorial outlet for a high-gap cluster can shift brand visibility within 30 days of indexing.',
            },
            {
              color: '#FFFC60',
              title: 'Secure Thought Leadership Bylines',
              body: 'Bylines and contributor features outperform press mentions for LLM citation. AI tools score original authorship higher than third-party brand references — a Forbes byline earns more citation weight than a Forbes feature about you.',
            },
          ].map(({ color, title, body }) => (
            <div key={title} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                <p className="text-xs font-bold text-white/80">{title}</p>
              </div>
              <p className="text-[11px] leading-relaxed text-text-muted">{body}</p>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-text-muted">
        PR Influence on AI Visibility · Peec AI (live) · PR placement log and GA4 AI-referral sessions pending connection
      </p>
    </div>
  )
}
