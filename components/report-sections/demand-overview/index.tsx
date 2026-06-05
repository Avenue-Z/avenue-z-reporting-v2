import { ga4Query, parseDateRange, deriveCompareRange } from '@/lib/ga4/client'
import { getPeecOverview } from '@/lib/peec/client'
import { getContactStats, getYearlyContactStats, getPipelineDeals, getContactBreakdown, HUBSPOT_SEARCH_CONCURRENCY } from '@/lib/hubspot/client'
import { mapWithConcurrency } from '@/lib/concurrency'
import { CHART_COLORS, AI_REFERRER_DOMAINS } from '@/lib/constants'
import { DemandJourney } from './demand-journey'
import { ContentFunnel } from './content-funnel'
import { ContentMatrix } from './content-matrix'
import { CitationBreakdown } from './citation-breakdown'
import type { DemandStage } from './demand-journey'
import type { ContentFunnelStage } from './content-funnel'
import type { MatrixPage } from './content-matrix'
import type { ReferralDomain } from './citation-breakdown'

const CLOSED_STAGE_IDS = new Set(['1043842411', '1043842412', '1047007274'])

const GA4_METRICS = [
  'sessions', 'activeUsers', 'newUsers',
  'bounceRate', 'averageSessionDuration',
  'conversions', 'sessionConversionRate',
]

function fmtNum(n: number | null | undefined) {
  if (n == null) return '—'
  return Math.round(n).toLocaleString()
}

function fmtPct(n: number | null | undefined) {
  if (n == null) return '—'
  return `${(n * 100).toFixed(1)}%`
}

function fmtUSD(n: number) {
  if (!n || isNaN(n)) return '—'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`
  return `$${Math.round(n).toLocaleString()}`
}

function pctDelta(current?: number | null, prior?: number | null) {
  if (current == null || prior == null || prior === 0) return undefined
  return ((current - prior) / prior) * 100
}

function fmtDate(d: string) {
  if (!d || d.length !== 8) return d
  const [y, m, day] = [d.slice(0, 4), d.slice(4, 6), d.slice(6, 8)]
  return new Date(`${y}-${m}-${day}`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtDur(s: number) {
  if (!s) return '0m 00s'
  const m = Math.floor(s / 60)
  const r = Math.round(s % 60)
  return `${m}m ${String(r).padStart(2, '0')}s`
}

interface DemandOverviewProps {
  clientSlug: string
}

export async function DemandOverviewReport({ clientSlug }: DemandOverviewProps) {
  const resolved = parseDateRange('last_30_days')
  const compare  = deriveCompareRange('last_30_days', 'previous_period')
  const mainIso  = `${resolved.startDate},${resolved.endDate}`
  const cmpIso   = compare ? `${compare.startDate},${compare.endDate}` : null

  // ── Phase 1: GA4 + Peec in parallel (no HubSpot rate-limit concern) ───────
  const [
    ga4Res, ga4CmpRes, ga4TrendRes,
    ga4ChannelRes, ga4PagesRes,
    ga4ReferralRes, ga4AiReferralRes,
    peecRes,
  ] = await Promise.allSettled([
    ga4Query({ clientSlug, dateRange: mainIso, metrics: GA4_METRICS }),
    cmpIso
      ? ga4Query({ clientSlug, dateRange: cmpIso, metrics: GA4_METRICS })
      : Promise.resolve(null),
    ga4Query({
      clientSlug, dateRange: mainIso,
      metrics: ['sessions'], dimensions: ['date'], limit: 31,
    }),
    // Channel breakdown for organic sessions
    ga4Query({
      clientSlug, dateRange: mainIso,
      metrics: ['sessions'],
      dimensions: ['sessionDefaultChannelGroup'],
      limit: 20,
    }),
    // Page performance for content matrix
    ga4Query({
      clientSlug, dateRange: mainIso,
      metrics: ['sessions', 'engagementRate', 'averageSessionDuration'],
      dimensions: ['pagePath'],
      limit: 50,
    }),
    // Referral sources — filtered client-side for sessionMedium = referral
    ga4Query({
      clientSlug, dateRange: mainIso,
      metrics: ['sessions'],
      dimensions: ['sessionSource', 'sessionMedium'],
      limit: 100,
    }),
    // AI referral traffic by page — pagePath × sessionSource, filtered client-side
    ga4Query({
      clientSlug, dateRange: mainIso,
      metrics: ['sessions'],
      dimensions: ['pagePath', 'sessionSource'],
      limit: 500,
    }),
    getPeecOverview(clientSlug),
  ])

  // ── Phase 2: HubSpot — parallel with a per-render concurrency gate ────────
  // Search ~4 req/s; SDK retry (numberOfApiCallRetries) absorbs any 429s from
  // the heavy internal pagination. Results keep the same PromiseSettledResult
  // shape the derivations below already consume.
  const [contactRes, dealsRes, contactYearlyRes, breakdownRes] = await mapWithConcurrency(
    [
      () => getContactStats(clientSlug),
      () => getPipelineDeals(clientSlug),
      () => getYearlyContactStats(clientSlug),
      () => getContactBreakdown(clientSlug),
    ],
    HUBSPOT_SEARCH_CONCURRENCY,
  )

  // ── GA4 ──────────────────────────────────────────────────────────────────
  const ga4      = ga4Res.status      === 'fulfilled' ? ga4Res.value?.rows[0]    ?? {} : {}
  const ga4Cmp   = ga4CmpRes.status   === 'fulfilled' ? ga4CmpRes.value?.rows[0] ?? null : null
  const ga4Trend = ga4TrendRes.status === 'fulfilled'
    ? (ga4TrendRes.value?.rows ?? [])
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        .map((r) => ({ date: fmtDate(String(r.date ?? '')), sessions: (r.sessions as number) ?? 0 }))
    : []

  const sessions    = (ga4.sessions    as number) ?? 0
  const cmpSessions = (ga4Cmp?.sessions as number) ?? undefined

  // ── GA4 Channel (organic sessions) ───────────────────────────────────────
  const channelRows = ga4ChannelRes.status === 'fulfilled'
    ? (ga4ChannelRes.value?.rows ?? [])
    : []
  const organicSessions = channelRows
    .filter((r) => {
      const ch = String(r.sessionDefaultChannelGroup ?? '').toLowerCase()
      return ch.includes('organic') || ch === 'organic search' || ch === 'organic social'
    })
    .reduce((sum, r) => sum + ((r.sessions as number) ?? 0), 0)

  // ── GA4 Page Performance (content matrix) ────────────────────────────────
  const pageRows: MatrixPage[] = ga4PagesRes.status === 'fulfilled'
    ? (ga4PagesRes.value?.rows ?? [])
        .filter((r) => {
          const path = String(r.pagePath ?? '/')
          return ((r.sessions as number) ?? 0) >= 10 && path !== '/' && path !== '/home'
        })
        .slice(0, 30)
        .map((r) => ({
          path:           String(r.pagePath ?? '/'),
          sessions:       (r.sessions as number) ?? 0,
          engagementRate: (r.engagementRate as number) ?? 0,
          avgDuration:    (r.averageSessionDuration as number) ?? 0,
        }))
    : []

  // ── GA4 AI referral sessions by page ─────────────────────────────────────
  const aiPageSessions: Record<string, number> = (() => {
    if (ga4AiReferralRes.status !== 'fulfilled') return {}
    const map: Record<string, number> = {}
    for (const r of ga4AiReferralRes.value?.rows ?? []) {
      const source = String(r.sessionSource ?? '').toLowerCase()
      if (!AI_REFERRER_DOMAINS.some((d) => source.includes(d))) continue
      const path     = String(r.pagePath ?? '/')
      const sessions = (r.sessions as number) ?? 0
      map[path] = (map[path] ?? 0) + sessions
    }
    return map
  })()

  // ── GA4 Referral domains ─────────────────────────────────────────────────
  const referralDomains: ReferralDomain[] = (() => {
    if (ga4ReferralRes.status !== 'fulfilled') return []
    const sessionMap: Record<string, number> = {}
    for (const r of ga4ReferralRes.value?.rows ?? []) {
      if (String(r.sessionMedium ?? '').toLowerCase() !== 'referral') continue
      const domain   = String(r.sessionSource ?? '').replace(/^www\./, '')
      const sessions = (r.sessions as number) ?? 0
      sessionMap[domain] = (sessionMap[domain] ?? 0) + sessions
    }
    return Object.entries(sessionMap)
      .map(([domain, sessions]) => ({ domain, sessions }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 8)
  })()

  // ── Peec AEO ─────────────────────────────────────────────────────────────
  const peec       = peecRes.status === 'fulfilled' ? peecRes.value : null
  const weekVis    = peec?.weeklyVisibility ?? []
  const latestWeek = weekVis[weekVis.length - 1]
  const prevWeek   = weekVis[weekVis.length - 2]
  const aeoVis     = latestWeek?.visibility ?? null
  const aeoVisDelta = latestWeek && prevWeek && prevWeek.visibility > 0
    ? ((latestWeek.visibility - prevWeek.visibility) / prevWeek.visibility) * 100
    : undefined
  const ownBrand = peec?.brandRankings?.find((b) =>
    b.name.toLowerCase().includes('avenue z') || b.name.toLowerCase().includes('avenuez')
  )
  const aeoSov = ownBrand?.sov ?? null

  // Citation data (YTD range)
  const totalCitations  = peec?.totalCitationsByRange?.['YTD'] ?? peec?.totalCitationsByRange?.['Last 30 Days'] ?? 0
  const llmBreakdown    = peec?.llmBreakdown ?? []
  const topDomains      = peec?.domainsByRange?.['YTD'] ?? peec?.domainsByRange?.['Last 30 Days'] ?? []

  // ── Inbound contacts ─────────────────────────────────────────────────────
  const contacts        = contactRes.status     === 'fulfilled' ? contactRes.value     : null
  const contactsYearly  = contactYearlyRes.status === 'fulfilled' ? contactYearlyRes.value : null
  const onlineContacts  = contacts?.online ?? null
  const icpContacts     = contacts?.icp    ?? null
  const mcpContacts     = contacts?.mcp    ?? null

  // samePeriodLastYearTotal from getYearlyContactStats is a fast count-only query —
  // same Jan-1-to-today window in 2025, online contacts only.
  const priorYearOnline  = contactsYearly?.samePeriodLastYearTotal ?? null
  const inboundYoYDelta  = (onlineContacts != null && priorYearOnline != null && priorYearOnline > 0)
    ? ((onlineContacts - priorYearOnline) / priorYearOnline) * 100
    : undefined

  // ── Pipeline deals ───────────────────────────────────────────────────────
  const deals = dealsRes.status === 'fulfilled' ? dealsRes.value : []

  const closeYear = (d: { properties?: { closedate?: string | null } }, yr: number) => {
    const cd = d.properties?.closedate
    return cd ? new Date(cd).getFullYear() === yr : false
  }

  const HIDDEN_STAGE_IDS = new Set([...CLOSED_STAGE_IDS, '1047007274'])

  const openDeals     = deals.filter((d) => !HIDDEN_STAGE_IDS.has(d.properties?.dealstage ?? '') && closeYear(d, 2026))
  const closedWon     = deals.filter((d) => d.properties?.dealstage === '1043842411' && closeYear(d, 2026))
  const openDeals2025 = deals.filter((d) => !HIDDEN_STAGE_IDS.has(d.properties?.dealstage ?? '') && closeYear(d, 2025))
  const closedWon2025 = deals.filter((d) => d.properties?.dealstage === '1043842411' && closeYear(d, 2025))

  const pipelineValue     = openDeals.reduce((s, d) => s + (parseFloat(d.properties?.amount ?? '0') || 0), 0)
  const closedWonValue    = closedWon.reduce((s, d) => s + (parseFloat(d.properties?.amount ?? '0') || 0), 0)
  const pipelineValue2025 = openDeals2025.reduce((s, d) => s + (parseFloat(d.properties?.amount ?? '0') || 0), 0)
  const closedWon2025Val  = closedWon2025.reduce((s, d) => s + (parseFloat(d.properties?.amount ?? '0') || 0), 0)

  const pipelineYoYDelta = pipelineValue2025 > 0
    ? ((pipelineValue - pipelineValue2025) / pipelineValue2025) * 100
    : undefined

  // ── Contact breakdown (organic contacts) ─────────────────────────────────
  const breakdown = breakdownRes.status === 'fulfilled' ? breakdownRes.value : []
  const organicRow = breakdown.find((b) => {
    const s = b.source.toLowerCase()
    return s.includes('organic') || s === 'organic search' || s === 'organic social'
  })
  const organicContacts    = organicRow ? organicRow.icp + organicRow.mcp + organicRow.unidentified : null
  const organicIcpContacts = organicRow?.icp ?? null

  // ── Merged journey + card stages ─────────────────────────────────────────
  const stages: DemandStage[] = [
    {
      key:       'aeo',
      source:    'AEO',
      label:     'AI Visibility',
      metric:    aeoVis != null ? `${aeoVis.toFixed(1)}%` : '—',
      subMetric: aeoSov != null ? `${aeoSov.toFixed(1)}% share of voice` : undefined,
      delta:     aeoVisDelta,
      color:     CHART_COLORS.primary,
      connector: 'drives\ndiscovery',
      heroLabel: 'visibility rate across tracked prompts',
      stats: [
        { label: 'Share of Voice',  value: aeoSov != null ? `${aeoSov.toFixed(1)}%` : '—' },
        { label: 'Tracked Brands',  value: peec?.brandRankings?.length?.toLocaleString() ?? '—' },
        { label: 'Tracked Prompts', value: peec?.trackedPrompts?.length?.toLocaleString() ?? '—' },
      ],
    },
    {
      key:       'ga4',
      source:    'Web Analytics',
      label:     'Site Sessions',
      metric:    fmtNum(sessions),
      subMetric: `${fmtPct(ga4.sessionConversionRate as number)} conv. rate`,
      delta:     pctDelta(sessions, cmpSessions),
      color:     CHART_COLORS.ga4,
      connector: 'converts\nto leads',
      heroLabel: 'sessions in the last 30 days',
      spark:     ga4Trend,
      stats: [
        { label: 'Active Users',  value: fmtNum(ga4.activeUsers as number) },
        { label: 'New Users',     value: fmtNum(ga4.newUsers as number) },
        { label: 'Conversions',   value: fmtNum(ga4.conversions as number) },
        { label: 'Bounce Rate',   value: fmtPct(ga4.bounceRate as number) },
      ],
    },
    {
      key:       'inbound',
      source:    'Inbound Funnel',
      label:     'Online Contacts',
      metric:    onlineContacts != null ? onlineContacts.toLocaleString() : '—',
      subMetric: icpContacts != null ? `${icpContacts.toLocaleString()} ICP` : undefined,
      delta:     inboundYoYDelta,
      color:     CHART_COLORS.hubspot,
      connector: 'qualifies\nto pipeline',
      heroLabel: 'contacts created in 2026 (YTD)',
      badge:     'YTD',
      stats: [
        { label: 'ICP Contacts',     value: icpContacts  != null ? icpContacts.toLocaleString()          : '—' },
        { label: 'MCP Contacts',     value: mcpContacts  != null ? mcpContacts.toLocaleString()          : '—' },
        { label: 'Offline Contacts', value: contacts?.offline != null ? contacts.offline.toLocaleString() : '—' },
        { label: '2025 Online (YTD)', value: priorYearOnline != null ? priorYearOnline.toLocaleString() : '—' },
      ],
    },
    {
      key:       'pipeline',
      source:    'Pipeline',
      label:     'Open Pipeline',
      metric:    fmtUSD(pipelineValue),
      subMetric: openDeals.length ? `${openDeals.length} open deals` : undefined,
      delta:     pipelineYoYDelta,
      color:     CHART_COLORS.positive,
      heroLabel: `across ${openDeals.length} active deals`,
      stats: [
        { label: 'Open Deals',        value: openDeals.length.toLocaleString() },
        { label: 'Closed Won',        value: fmtUSD(closedWonValue) },
        { label: 'Closed Won Deals',  value: closedWon.length.toLocaleString() },
        { label: '2025 Open Pipeline', value: pipelineValue2025 > 0 ? fmtUSD(pipelineValue2025) : '—' },
        { label: '2025 Closed Won',    value: closedWon2025Val > 0  ? fmtUSD(closedWon2025Val)  : '—' },
      ],
    },
  ]

  // ── Content funnel stages ─────────────────────────────────────────────────
  const contentStages: ContentFunnelStage[] = [
    {
      label:          'AI Citations',
      source:         'AEO · Peec AI',
      value:          totalCitations,
      formattedValue: totalCitations.toLocaleString(),
      detail:         'times cited in AI answers (YTD)',
      color:          CHART_COLORS.primary,
      skipConversion: false,
    },
    {
      label:          'Organic Sessions',
      source:         'Web Analytics · GA4',
      value:          organicSessions,
      formattedValue: organicSessions.toLocaleString(),
      detail:         'sessions from organic channels (last 30d)',
      color:          CHART_COLORS.ga4,
      skipConversion: true, // citations → sessions: units differ
    },
    {
      label:          'Organic Contacts',
      source:         'Inbound · HubSpot',
      value:          organicContacts ?? 0,
      formattedValue: organicContacts != null ? organicContacts.toLocaleString() : '—',
      detail:         'contacts from organic sources (YTD)',
      color:          CHART_COLORS.hubspot,
      skipConversion: false,
    },
    {
      label:          'ICP Contacts',
      source:         'Inbound · HubSpot',
      value:          organicIcpContacts ?? 0,
      formattedValue: organicIcpContacts != null ? organicIcpContacts.toLocaleString() : '—',
      detail:         'ideal customer profile fit (YTD)',
      color:          CHART_COLORS.positive,
      skipConversion: false,
    },
  ]

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-bold uppercase tracking-widest text-text-muted">
          Avenue Z
        </p>
        <h1 className="text-4xl font-extrabold uppercase text-white">
          Demand{' '}
          <span className="gradient-text-reputation">Overview</span>
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          AEO · Web Analytics · Inbound · Pipeline — rolled up in one view.
        </p>
      </div>

      <DemandJourney stages={stages} />

      {/* Content Impact section */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
          Content Impact
        </p>
        <h2 className="text-2xl font-extrabold text-white">From AI Mention to Qualified Contact</h2>
        <p className="mt-1 text-sm text-text-muted">
          How content drives AI visibility, organic traffic, and inbound pipeline.
        </p>
      </div>

      <ContentFunnel stages={contentStages} />

      <ContentMatrix pages={pageRows} aiPageSessions={aiPageSessions} />

      <CitationBreakdown
        referralDomains={referralDomains}
        topDomains={topDomains}
      />
    </div>
  )
}
