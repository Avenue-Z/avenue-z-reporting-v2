import { Suspense } from 'react'
import { getClientBySlug } from '@/lib/db/queries'
import { CHART_COLORS, REPORT_NAMES } from '@/lib/constants'
import { fetchDataSnapshot } from '@/lib/report-generator/context'
import type { DataSnapshot } from '@/lib/report-generator/context'
import { PeriodSelector } from './period-selector'
import type { SummaryPeriod } from './period-selector'
import { ChannelSummaryCard } from './channel-summary-card'
import type { ChannelSummaryCardProps } from './channel-summary-card'
import { CrossChannelSummary } from './cross-channel-summary'
import type { CrossChannelInsight } from './cross-channel-summary'
import { FileText } from 'lucide-react'

// ---------------------------------------------------------------------------
// Channel metadata
// ---------------------------------------------------------------------------

const CHANNEL_META: Record<string, { color: string; order: number }> = {
  'ga4':                  { color: CHART_COLORS.ga4,       order: 1 },
  'inbound-funnel':       { color: CHART_COLORS.hubspot,   order: 2 },
  'hubspot-performance':  { color: CHART_COLORS.hubspot,   order: 3 },
  'peec-ai':              { color: CHART_COLORS.primary,   order: 4 },
  'meta-ads':             { color: CHART_COLORS.metaAds,   order: 5 },
  'google-ads':           { color: CHART_COLORS.googleAds, order: 6 },
  'email-marketing':      { color: CHART_COLORS.email,     order: 7 },
  'linkedin-ads':         { color: CHART_COLORS.linkedin,  order: 8 },
  'tiktok-ads':           { color: CHART_COLORS.tiktok,    order: 9 },
  'shopify-performance':  { color: CHART_COLORS.shopify,   order: 10 },
}

const NON_CHANNEL_SLUGS = new Set([
  'exec-summary', 'demand-overview', 'blended-performance',
  'ai-summaries', 'report-generator', 'ffci', 'pr-placements', 'profound-ai',
])

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function fmt(n: number)  { return n.toLocaleString('en-US', { maximumFractionDigits: 0 }) }
function fmtPct(n: number) { return `${n.toFixed(1)}%` }
function fmtCurrency(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

// ---------------------------------------------------------------------------
// Channel card builders — real data where available, clear fallback if not
// ---------------------------------------------------------------------------

function buildChannelCard(
  slug: string,
  period: SummaryPeriod,
  snapshot: DataSnapshot,
): Omit<ChannelSummaryCardProps, 'icon'> {
  const color = CHANNEL_META[slug]?.color ?? '#8A8A8A'
  const periodLabel = period === 'weekly' ? 'week' : period === 'monthly' ? 'month' : 'quarter'
  const { ga4, inbound, pipeline, peec, dateLabel } = snapshot

  if (slug === 'ga4') {
    if (!ga4) return fallbackCard(slug, color, periodLabel, 'GA4 property not connected')
    const sessionTrend = ga4.sessionsDelta >= 3 ? 'up' : ga4.sessionsDelta <= -3 ? 'down' : 'flat'
    return {
      channel: REPORT_NAMES[slug] ?? slug,
      color,
      metrics: [
        { label: 'Sessions',    value: fmt(ga4.sessions),      delta: ga4.sessionsDelta },
        { label: 'Users',       value: fmt(ga4.users),         delta: ga4.usersDelta    },
        { label: 'Bounce Rate', value: fmtPct(ga4.bounceRate), delta: ga4.bounceDelta   },
      ],
      insight: `Website sessions are ${sessionTrend} ${Math.abs(ga4.sessionsDelta).toFixed(1)}% vs the prior ${periodLabel} at ${fmt(ga4.sessions)} total. ${fmt(ga4.users)} unique users visited the site with a ${fmtPct(ga4.bounceRate)} bounce rate.`,
      highlights: [
        `Sessions: ${fmt(ga4.sessions)} (${ga4.sessionsDelta >= 0 ? '+' : ''}${ga4.sessionsDelta.toFixed(1)}% vs prior ${periodLabel})`,
        `Active users: ${fmt(ga4.users)} (${ga4.usersDelta >= 0 ? '+' : ''}${ga4.usersDelta.toFixed(1)}%)`,
        ga4.bounceRate > 55
          ? `Bounce rate ${fmtPct(ga4.bounceRate)} — above 55% threshold, worth reviewing landing page experience`
          : `Bounce rate ${fmtPct(ga4.bounceRate)} — healthy engagement signal`,
      ],
    }
  }

  if (slug === 'inbound-funnel') {
    if (!inbound) return fallbackCard(slug, color, periodLabel, 'HubSpot token not connected')
    const icpRateLabel = inbound.icpRate >= 20 ? 'strong' : inbound.icpRate >= 10 ? 'moderate' : 'low'
    return {
      channel: REPORT_NAMES[slug] ?? slug,
      color,
      metrics: [
        { label: 'New Contacts', value: fmt(inbound.total), delta: inbound.totalDelta },
        { label: 'ICP Contacts', value: fmt(inbound.icp) },
        { label: 'MCP Contacts', value: fmt(inbound.mcp) },
        { label: 'ICP Rate',     value: fmtPct(inbound.icpRate) },
      ],
      insight: `${fmt(inbound.total)} new contacts came in over the ${dateLabel.toLowerCase()} — ${inbound.totalDelta >= 0 ? 'up' : 'down'} ${Math.abs(inbound.totalDelta).toFixed(1)}% vs prior. ICP quality is ${icpRateLabel} at ${fmtPct(inbound.icpRate)} (${fmt(inbound.icp)} ideal-fit contacts).`,
      highlights: [
        `${fmt(inbound.icp)} ICP-quality leads (${fmtPct(inbound.icpRate)} of total)`,
        `${fmt(inbound.mcp)} MCP-quality contacts`,
        inbound.totalDelta >= 5
          ? `Lead volume up ${inbound.totalDelta.toFixed(1)}% — positive momentum`
          : inbound.totalDelta <= -5
          ? `Lead volume down ${Math.abs(inbound.totalDelta).toFixed(1)}% — review top sources`
          : `Lead volume tracking closely with prior ${periodLabel}`,
      ],
    }
  }

  if (slug === 'hubspot-performance') {
    if (!pipeline) return fallbackCard(slug, color, periodLabel, 'HubSpot pipeline not connected')
    return {
      channel: REPORT_NAMES[slug] ?? slug,
      color,
      metrics: [
        { label: 'Open Deals',     value: fmt(pipeline.openDeals) },
        { label: 'Pipeline Value', value: fmtCurrency(pipeline.totalValue) },
        { label: 'Avg Deal Value', value: fmtCurrency(pipeline.avgDealValue) },
      ],
      insight: `There are ${fmt(pipeline.openDeals)} open deals with a combined pipeline value of ${fmtCurrency(pipeline.totalValue)}. Average deal size is ${fmtCurrency(pipeline.avgDealValue)}.`,
      highlights: [
        `${fmt(pipeline.openDeals)} active deals in pipeline`,
        `Total pipeline value: ${fmtCurrency(pipeline.totalValue)}`,
        `Average deal size: ${fmtCurrency(pipeline.avgDealValue)}`,
      ],
    }
  }

  if (slug === 'peec-ai') {
    if (!peec) return fallbackCard(slug, color, periodLabel, 'Peec AI token not connected')
    return {
      channel: REPORT_NAMES[slug] ?? slug,
      color,
      metrics: [
        { label: 'AI Visibility',   value: fmtPct(peec.ownVisibility) },
        { label: 'Share of Voice',  value: fmtPct(peec.ownSov) },
        { label: 'Tracked Prompts', value: fmt(peec.trackedPrompts) },
        { label: 'Citations',       value: fmt(peec.totalCitations) },
      ],
      insight: `Brand AI visibility is ${fmtPct(peec.ownVisibility)} with ${fmtPct(peec.ownSov)} share of voice across ${fmt(peec.trackedPrompts)} tracked prompts. ${fmt(peec.totalCitations)} brand citations captured. Strongest platform: ${peec.topLLM}.`,
      highlights: [
        `${fmtPct(peec.ownVisibility)} AI visibility — share of LLM responses mentioning the brand`,
        `Top LLM platform: ${peec.topLLM}`,
        `${fmt(peec.totalCitations)} brand citations tracked across AI tools`,
      ],
    }
  }

  // Generic fallback for any other connected channel
  return fallbackCard(slug, color, periodLabel, 'Integration pending')
}

function fallbackCard(
  slug: string,
  color: string,
  periodLabel: string,
  reason: string,
): Omit<ChannelSummaryCardProps, 'icon'> {
  return {
    channel: REPORT_NAMES[slug] ?? slug,
    color,
    metrics: [
      { label: 'Metric 1', value: '—' },
      { label: 'Metric 2', value: '—' },
      { label: 'Metric 3', value: '—' },
      { label: 'Metric 4', value: '—' },
    ],
    insight: `${reason}. ${REPORT_NAMES[slug] ?? slug} ${periodLabel}ly insights will appear here automatically once the integration is live.`,
    highlights: [
      `${periodLabel.charAt(0).toUpperCase() + periodLabel.slice(1)}ly data pending: ${reason}`,
      'Trend analysis vs. prior period will populate here',
      'AI-generated recommendations will appear once connected',
    ],
  }
}

// ---------------------------------------------------------------------------
// Cross-channel summary — uses real data where available
// ---------------------------------------------------------------------------

function buildCrossChannelSummary(
  activeChannels: string[],
  period: SummaryPeriod,
  snapshot: DataSnapshot,
): { narrative: string; insights: CrossChannelInsight[] } {
  const periodLabel = period === 'weekly' ? 'week' : period === 'monthly' ? 'month' : 'quarter'
  const { ga4, inbound, pipeline, peec } = snapshot

  const hasLiveData = !!(ga4 || inbound || pipeline || peec)

  const narrative = hasLiveData
    ? [
        ga4     && `Web sessions ${ga4.sessionsDelta >= 0 ? 'up' : 'down'} ${Math.abs(ga4.sessionsDelta).toFixed(1)}% at ${fmt(ga4.sessions)}.`,
        inbound && `${fmt(inbound.total)} new leads with ${fmtPct(inbound.icpRate)} ICP rate.`,
        pipeline && `${fmt(pipeline.openDeals)} open deals worth ${fmtCurrency(pipeline.totalValue)}.`,
        peec    && `AI visibility at ${fmtPct(peec.ownVisibility)} across ${fmt(peec.trackedPrompts)} tracked prompts.`,
      ].filter(Boolean).join(' ')
    : `This ${periodLabel}ly cross-channel summary will synthesize performance signals across ${activeChannels.length} active channel${activeChannels.length !== 1 ? 's' : ''} once all data connections are live.`

  const insights: CrossChannelInsight[] = []

  if (ga4 && inbound) {
    const trafficToLeadRatio = ga4.sessions > 0 ? (inbound.total / ga4.sessions) * 100 : 0
    insights.push({
      type:     trafficToLeadRatio >= 1 ? 'positive' : 'neutral',
      headline: 'Traffic → Lead conversion',
      detail:   `${fmt(inbound.total)} leads from ${fmt(ga4.sessions)} sessions — ${trafficToLeadRatio.toFixed(2)}% site-to-lead rate.`,
    })
  }

  if (inbound) {
    insights.push({
      type:     inbound.totalDelta >= 5 ? 'positive' : inbound.totalDelta <= -10 ? 'negative' : 'neutral',
      headline: 'Lead volume trend',
      detail:   `Inbound contacts ${inbound.totalDelta >= 0 ? 'up' : 'down'} ${Math.abs(inbound.totalDelta).toFixed(1)}% vs prior ${periodLabel}. ICP rate: ${fmtPct(inbound.icpRate)}.`,
    })
  }

  if (peec) {
    insights.push({
      type:     peec.ownVisibility >= 20 ? 'positive' : 'neutral',
      headline: 'AI search presence',
      detail:   `${fmtPct(peec.ownVisibility)} visibility in LLM responses. ${fmt(peec.totalCitations)} citations tracked. Lead source: ${peec.topLLM}.`,
    })
  }

  if (pipeline) {
    insights.push({
      type:     pipeline.totalValue > 0 ? 'positive' : 'neutral',
      headline: 'Pipeline health',
      detail:   `${fmt(pipeline.openDeals)} open deals, ${fmtCurrency(pipeline.totalValue)} total value, ${fmtCurrency(pipeline.avgDealValue)} average.`,
    })
  }

  // Always pad to 3 insights minimum
  while (insights.length < 3) {
    insights.push({
      type:     'neutral',
      headline: 'Connect more channels',
      detail:   `Add additional channel integrations to unlock full cross-channel attribution for the ${periodLabel}ly report.`,
    })
  }

  return { narrative, insights: insights.slice(0, 4) }
}

// ---------------------------------------------------------------------------
// Export bar
// ---------------------------------------------------------------------------

function ExportBar({ period }: { period: SummaryPeriod }) {
  const label = period === 'weekly' ? 'Weekly' : period === 'monthly' ? 'Monthly' : 'Quarterly'
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-text-muted">Ready to copy into a client deck or export as PDF.</p>
      <button
        disabled
        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white/40 cursor-not-allowed"
        title="Export coming soon"
      >
        <FileText className="h-4 w-4" />
        Export {label} Summary
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface AISummariesReportProps {
  clientSlug: string
  period?: SummaryPeriod
}

export async function AISummariesReport({ clientSlug, period = 'monthly' }: AISummariesReportProps) {
  const client = await getClientBySlug(clientSlug)
  if (!client) return null

  const activeChannels = client.enabledReports
    .filter((slug) => !NON_CHANNEL_SLUGS.has(slug) && CHANNEL_META[slug])
    .sort((a, b) => (CHANNEL_META[a]?.order ?? 99) - (CHANNEL_META[b]?.order ?? 99))

  // Fetch live data from all connected channels in parallel, period-aware
  const snapshot = await fetchDataSnapshot(clientSlug, period)
  const crossChannel = buildCrossChannelSummary(activeChannels, period, snapshot)

  const liveCount = [snapshot.ga4, snapshot.inbound, snapshot.pipeline, snapshot.peec]
    .filter(Boolean).length

  return (
    <div className="flex flex-col gap-8">

      {/* Header + period selector */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-bold text-white">AI Summaries</h2>
          <p className="text-sm text-text-muted">
            {snapshot.dateLabel} · {liveCount} of {activeChannels.length} channel{activeChannels.length !== 1 ? 's' : ''} live
          </p>
        </div>
        <Suspense>
          <PeriodSelector activePeriod={period} />
        </Suspense>
      </div>

      {/* Cross-channel summary */}
      <CrossChannelSummary
        narrative={crossChannel.narrative}
        insights={crossChannel.insights}
      />

      {/* Per-channel cards */}
      {activeChannels.length > 0 ? (
        <div className="flex flex-col gap-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-text-muted">
            Channel Breakdown
          </h3>
          <div className="flex flex-col gap-4">
            {activeChannels.map((slug) => (
              <ChannelSummaryCard
                key={slug}
                {...buildChannelCard(slug, period, snapshot)}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-white/[0.06] bg-bg-surface py-16 text-center">
          <p className="text-sm font-semibold text-white">No active channels configured</p>
          <p className="text-sm text-text-muted">
            Enable report sections in the client config to see per-channel summaries here.
          </p>
        </div>
      )}

      <ExportBar period={period} />

      <p className="text-xs text-text-muted">
        Live data from connected channels · {new Date(snapshot.fetchedAt).toLocaleString()}
      </p>
    </div>
  )
}
