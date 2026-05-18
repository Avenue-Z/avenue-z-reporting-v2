import { getPeecOverview } from '@/lib/peec/client'
import type { TrackedPrompt } from '@/lib/peec/client'
import { ga4Query, parseDateRange, deriveCompareRange } from '@/lib/ga4/client'
import { AI_REFERRER_DOMAINS } from '@/lib/constants'
import { KpiCard } from '@/components/charts/kpi-card'
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

function fmt(n: number, decimals = 1, suffix = '%') {
  return `${n.toFixed(decimals)}${suffix}`
}

function Delta({ value, invert = false }: { value: number; invert?: boolean }) {
  const positive = invert ? value < 0 : value >= 0
  return (
    <span className={cn('text-xs font-semibold tabular-nums', positive ? 'text-[#60FF80]' : 'text-[#FF4444]')}>
      {value >= 0 ? '↑' : '↓'}{Math.abs(value).toFixed(1)}%
    </span>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap pb-3 pr-5 text-left text-xs font-extrabold uppercase tracking-widest text-text-muted last:pr-0">
      {children}
    </th>
  )
}

function TableEmpty({ cols, message }: { cols: number; message: string }) {
  return (
    <tr>
      <td colSpan={cols} className="py-10 text-center text-xs text-text-muted">{message}</td>
    </tr>
  )
}

interface PRInfluenceProps {
  clientSlug: string
  dateRange?: string
}

export async function PRInfluenceReport({ clientSlug, dateRange = 'last_30_days' }: PRInfluenceProps) {
  const resolvedMain   = parseDateRange(dateRange)
  const mainIso        = `${resolvedMain.startDate},${resolvedMain.endDate}`
  const resolvedCompare = deriveCompareRange(dateRange, 'previous_period')
  const compareIso     = resolvedCompare
    ? `${resolvedCompare.startDate},${resolvedCompare.endDate}`
    : null

  const [peecResult, aiReferralResult, compareAiResult] = await Promise.allSettled([
    getPeecOverview(),
    ga4Query({
      clientSlug,
      dateRange: mainIso,
      metrics: ['sessions'],
      dimensions: ['sessionSource'],
      limit: 150,
    }),
    compareIso
      ? ga4Query({
          clientSlug,
          dateRange: compareIso,
          metrics: ['sessions'],
          dimensions: ['sessionSource'],
          limit: 150,
        })
      : Promise.resolve(null),
  ])

  const data             = peecResult.status === 'fulfilled' ? peecResult.value : null
  const aiReferralRows   = aiReferralResult.status === 'fulfilled' ? (aiReferralResult.value?.rows ?? []) : []
  const compareAiRows    = compareAiResult.status === 'fulfilled'  ? (compareAiResult.value?.rows  ?? []) : []

  const isAiSource = (source: unknown) =>
    (AI_REFERRER_DOMAINS as readonly string[]).some(d =>
      String(source ?? '').toLowerCase().includes(d)
    )

  const aiSessions = aiReferralRows
    .filter(r => isAiSource(r.sessionSource))
    .reduce((sum, r) => sum + ((r.sessions as number) ?? 0), 0)

  const compareAiSessions = compareAiRows
    .filter(r => isAiSource(r.sessionSource))
    .reduce((sum, r) => sum + ((r.sessions as number) ?? 0), 0)

  const aiSessionsDelta =
    aiSessions > 0 && compareAiSessions > 0
      ? ((aiSessions - compareAiSessions) / compareAiSessions) * 100
      : undefined

  const youMetrics       = data?.brandRankings.find(b => b.isYou) ?? null
  const editorialDomains = (data?.domainsByRange['YTD'] ?? []).filter(d => d.type === 'Editorial')
  const totalCitations   = data?.totalCitationsByRange['YTD'] ?? 0

  // Cluster gap analysis
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
        avgPosition: posPrompts.length > 0
          ? posPrompts.reduce((s, p) => s + p.position, 0) / posPrompts.length
          : 0,
        activeLLMs: new Set(prompts.flatMap(p => p.sources)).size,
      }
    })
    .sort((a, b) => a.avgVisibility - b.avgVisibility)

  return (
    <div className="space-y-8">

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          title="AI Visibility"
          value={youMetrics ? fmt(youMetrics.visibility) : '—'}
          delta={youMetrics?.visibilityDelta}
          tooltip="Share of AI responses mentioning your brand across tracked prompts. Source: Peec AI YTD."
        />
        <KpiCard
          title="Avg AI Position"
          value={youMetrics ? youMetrics.position.toFixed(1) : '—'}
          delta={youMetrics ? -youMetrics.positionDelta : undefined}
          invertDelta
          tooltip="Average position your brand appears at in AI responses. Lower is better. Source: Peec AI YTD."
        />
        <KpiCard
          title="AI Citations"
          value={totalCitations > 0 ? totalCitations.toLocaleString() : '—'}
          tooltip="Total times your brand or content was cited in AI-generated responses. Source: Peec AI YTD."
        />
        <KpiCard
          title="AI Referral Sessions"
          value={aiReferralResult.status === 'fulfilled' && aiSessions > 0
            ? aiSessions.toLocaleString()
            : '—'}
          delta={aiSessionsDelta}
          tooltip="Website sessions driven by AI assistants (ChatGPT, Perplexity, Claude, Gemini, etc.). Source: GA4."
          subValue={aiReferralResult.status === 'rejected' ? 'GA4 not configured' : undefined}
        />
        <KpiCard
          title="PR Placements Cited"
          value="—"
          tooltip="Secured PR placements that appear in AI citation results. Requires PR placement log upload."
          subValue="Connect PR placement log"
        />
        <KpiCard
          title="Brand-Absent Editorial"
          value="—"
          tooltip="Editorial URLs cited by AI for your tracked prompts where your brand is not mentioned — highest-priority pitch targets."
          subValue="Requires Peec AI Pro"
        />
      </div>

      {/* Top Editorial Domains */}
      <div className="rounded-lg border border-white/[0.08] bg-bg-surface p-6">
        <div className="mb-5">
          <h3 className="text-sm font-bold text-white">Top Editorial Domains Cited by AI</h3>
          <p className="mt-1 text-xs text-text-muted">
            Editorial outlets most frequently retrieved in AI responses for your tracked prompt set. Coverage in these domains has direct AEO impact.
          </p>
        </div>
        {editorialDomains.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/[0.08]">
                  <Th>Domain</Th>
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
                    <td className="py-2.5 pr-5 tabular-nums text-white">{fmt(d.retrieved)}</td>
                    <td className="py-2.5 pr-5"><Delta value={d.retrievedDelta} /></td>
                    <td className="py-2.5 pr-5 tabular-nums text-white">{fmt(d.citationRate)}</td>
                    <td className="py-2.5"><Delta value={d.citationRateDelta} /></td>
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
      </div>

      {/* PR Placement Matchback */}
      <div className="rounded-lg border border-white/[0.08] bg-bg-surface p-6">
        <div className="mb-5">
          <h3 className="text-sm font-bold text-white">PR Placements Secured → Cited in AI</h3>
          <p className="mt-1 text-xs text-text-muted">
            Each secured PR placement matched against Peec AI citation data. Upload a PR placement log CSV to populate.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/[0.08]">
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
      </div>

      {/* Brand-Absent Editorial URLs */}
      <div className="rounded-lg border border-white/[0.08] bg-bg-surface p-6">
        <div className="mb-5">
          <h3 className="text-sm font-bold text-white">Top Editorial URLs Cited by AI — Brand Absent</h3>
          <p className="mt-1 text-xs text-text-muted">
            High-authority editorial URLs actively cited by AI for your tracked prompts where your brand is not mentioned. These are the highest-priority PR targets.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/[0.08]">
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
      </div>

      {/* Prompt Cluster Gap Analysis */}
      <div className="rounded-lg border border-white/[0.08] bg-bg-surface p-6">
        <div className="mb-5">
          <h3 className="text-sm font-bold text-white">Prompt Clusters — Lowest Brand Presence</h3>
          <p className="mt-1 text-xs text-text-muted">
            Sorted by lowest brand visibility first. These are the categories where one strong PR placement can shift the needle fastest.
          </p>
        </div>
        {clusterRows.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/[0.08]">
                    <Th>Prompt Cluster</Th>
                    <Th>Prompts</Th>
                    <Th>Brand Visibility</Th>
                    <Th>Brand SOV</Th>
                    <Th>Avg Position</Th>
                    <Th>Active LLMs</Th>
                    <Th>Opportunity</Th>
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
            <p className="mt-4 text-xs text-text-muted">
              Opportunity = 100 − Brand Visibility %. Editorial citation density and competitor presence columns require PR placement log.
            </p>
          </>
        ) : (
          <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-white/[0.08]">
            <p className="text-xs text-text-muted">No tracked prompts yet — add prompts in Peec AI to populate cluster analysis</p>
          </div>
        )}
      </div>

      {/* What PR Should Pitch Next */}
      <div className="rounded-lg border border-white/[0.08] bg-bg-surface p-6">
        <div className="mb-5 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#60FDFF]" />
          <h3 className="text-sm font-bold text-white">What PR Should Pitch Next</h3>
        </div>
        <p className="mb-5 text-sm leading-relaxed text-text-muted">
          Pitch targets are determined by cross-referencing prompt clusters where brand presence is lowest, editorial citation density is highest, and competitors are most active. Connect a PR placement log to unlock AI-generated pitch briefs per target outlet.
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
        Peec AI (live) · GA4 AI referral sessions (live) · PR placement log and URL-level citation data pending connection
      </p>
    </div>
  )
}
