/**
 * DemandJourney section — the 4-stage horizontal flow at the top of the report.
 * Combines AEO (Peec), Web Analytics (GA4), Inbound (HubSpot contacts), and
 * Pipeline (HubSpot deals). Slowest section because of the HubSpot fetches.
 */
import { ga4Query, parseDateRange, deriveCompareRange } from '@/lib/ga4/client'
import { getPeecOverview } from '@/lib/peec/client'
import { getContactStats, getYearlyContactStats, getPipelineDeals } from '@/lib/hubspot/client'
import { CHART_COLORS } from '@/lib/constants'
import { DemandJourney } from './demand-journey'
import type { DemandStage } from './demand-journey'
import {
  GA4_METRICS,
  HIDDEN_STAGE_IDS,
  CLOSED_STAGE_IDS,
  closeYear,
  fmtNum, fmtPct, fmtUSD, fmtDate,
  pctDelta,
} from './_utils'

interface Props {
  clientSlug: string
}

export async function DemandJourneySection({ clientSlug }: Props) {
  const resolved = parseDateRange('last_30_days')
  const compare  = deriveCompareRange('last_30_days', 'previous_period')
  const mainIso  = `${resolved.startDate},${resolved.endDate}`
  const cmpIso   = compare ? `${compare.startDate},${compare.endDate}` : null

  // Phase 1: GA4 + Peec in parallel
  const [ga4Res, ga4CmpRes, ga4TrendRes, peecRes] = await Promise.allSettled([
    ga4Query({ clientSlug, dateRange: mainIso, metrics: GA4_METRICS }),
    cmpIso
      ? ga4Query({ clientSlug, dateRange: cmpIso, metrics: GA4_METRICS })
      : Promise.resolve(null),
    ga4Query({
      clientSlug, dateRange: mainIso,
      metrics: ['sessions'], dimensions: ['date'], limit: 31,
    }),
    getPeecOverview(clientSlug),
  ])

  // Phase 2: HubSpot — sequential to respect 4 req/s rate limit
  const [contactRes]       = await Promise.allSettled([getContactStats(clientSlug)])
  const [dealsRes]         = await Promise.allSettled([getPipelineDeals(clientSlug)])
  const [contactYearlyRes] = await Promise.allSettled([getYearlyContactStats(clientSlug)])

  const ga4      = ga4Res.status      === 'fulfilled' ? ga4Res.value?.rows[0]    ?? {} : {}
  const ga4Cmp   = ga4CmpRes.status   === 'fulfilled' ? ga4CmpRes.value?.rows[0] ?? null : null
  const ga4Trend = ga4TrendRes.status === 'fulfilled'
    ? (ga4TrendRes.value?.rows ?? [])
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        .map((r) => ({ date: fmtDate(String(r.date ?? '')), sessions: (r.sessions as number) ?? 0 }))
    : []

  const sessions    = (ga4.sessions    as number) ?? 0
  const cmpSessions = (ga4Cmp?.sessions as number) ?? undefined

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

  const contacts       = contactRes.status       === 'fulfilled' ? contactRes.value       : null
  const contactsYearly = contactYearlyRes.status === 'fulfilled' ? contactYearlyRes.value : null
  const onlineContacts = contacts?.online ?? null
  const icpContacts    = contacts?.icp    ?? null
  const mcpContacts    = contacts?.mcp    ?? null
  const priorYearOnline = contactsYearly?.samePeriodLastYearTotal ?? null
  const inboundYoYDelta = (onlineContacts != null && priorYearOnline != null && priorYearOnline > 0)
    ? ((onlineContacts - priorYearOnline) / priorYearOnline) * 100
    : undefined

  const deals = dealsRes.status === 'fulfilled' ? dealsRes.value : []

  const openDeals     = deals.filter((d) => !HIDDEN_STAGE_IDS.has(d.properties?.dealstage ?? '') && closeYear(d, 2026))
  const closedWon     = deals.filter((d) => d.properties?.dealstage === '1043842411' && closeYear(d, 2026))
  const openDeals2025 = deals.filter((d) => !HIDDEN_STAGE_IDS.has(d.properties?.dealstage ?? '') && closeYear(d, 2025))
  const closedWon2025 = deals.filter((d) => d.properties?.dealstage === '1043842411' && closeYear(d, 2025))
  void CLOSED_STAGE_IDS // tree-shaking guard; HIDDEN_STAGE_IDS already references it

  const pipelineValue     = openDeals.reduce((s, d) => s + (parseFloat(d.properties?.amount ?? '0') || 0), 0)
  const closedWonValue    = closedWon.reduce((s, d) => s + (parseFloat(d.properties?.amount ?? '0') || 0), 0)
  const pipelineValue2025 = openDeals2025.reduce((s, d) => s + (parseFloat(d.properties?.amount ?? '0') || 0), 0)
  const closedWon2025Val  = closedWon2025.reduce((s, d) => s + (parseFloat(d.properties?.amount ?? '0') || 0), 0)
  const pipelineYoYDelta  = pipelineValue2025 > 0
    ? ((pipelineValue - pipelineValue2025) / pipelineValue2025) * 100
    : undefined

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
        { label: 'Open Deals',         value: openDeals.length.toLocaleString() },
        { label: 'Closed Won',         value: fmtUSD(closedWonValue) },
        { label: 'Closed Won Deals',   value: closedWon.length.toLocaleString() },
        { label: '2025 Open Pipeline', value: pipelineValue2025 > 0 ? fmtUSD(pipelineValue2025) : '—' },
        { label: '2025 Closed Won',    value: closedWon2025Val > 0  ? fmtUSD(closedWon2025Val)  : '—' },
      ],
    },
  ]

  return <DemandJourney stages={stages} />
}
