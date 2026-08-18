import { CHART_COLORS } from '@/lib/constants'
import type { DemandStage } from './demand-journey'
import type { TrendRow } from './sessions-trend-chart'
import { fmtNum, fmtPct, pct } from './reshape'

export interface StageInput {
  totals: Record<string, unknown> | null
  cmpTotals: Record<string, unknown> | null
  peec: {
    weeklyVisibility?: { visibility: number }[]
    brandRankings?: { name: string; sov: number; isYou?: boolean }[]
    trackedPrompts?: unknown[]
  } | null
  trendRows: TrendRow[]
  /** Derived from the client's CRM configuration (e.g. hubspotTokenEnvVar). Defaults to false. */
  crmConnected?: boolean
}

export function buildStages({ totals, cmpTotals, peec, trendRows, crmConnected }: StageInput): DemandStage[] {
  const weekly   = peec?.weeklyVisibility ?? []
  const latest   = weekly.at(-1)?.visibility ?? null
  const previous = weekly.at(-2)?.visibility ?? null
  // isYou is computed from clients.peec_your_brand. Matching on a literal brand
  // name here would blank share of voice for every client but the one hardcoded.
  const aeoSov   = peec?.brandRankings?.find((b) => b.isYou)?.sov ?? null
  const crm      = !!crmConnected

  return [
    {
      key: 'aeo', source: 'AEO', label: 'AI Visibility',
      metric: latest != null ? `${latest.toFixed(1)}%` : '—',
      subMetric: aeoSov != null ? `${aeoSov.toFixed(1)}% share of voice` : undefined,
      delta: latest != null && previous != null ? pct(latest, previous) : undefined,
      color: CHART_COLORS.primary,
      connector: 'drives discovery',
      // This card is year to date while the page label reads "Last 30 days",
      // so the badge is the honest marker of the mismatch.
      badge: 'YTD',
      heroLabel: 'visibility rate across tracked prompts',
      stats: [
        { label: 'Share of Voice',  value: aeoSov != null ? `${aeoSov.toFixed(1)}%` : '—' },
        { label: 'Tracked Brands',  value: peec?.brandRankings?.length?.toLocaleString() ?? '—' },
        { label: 'Tracked Prompts', value: peec?.trackedPrompts?.length?.toLocaleString() ?? '—' },
      ],
      // peec is null both when the client has no Peec project configured and
      // when the fetch failed. Either way there is nothing to show, so the
      // card renders the same "not connected" treatment as the CRM stages.
      connected: peec != null,
    },
    {
      key: 'ga4', source: 'Web Analytics', label: 'Site Sessions',
      metric: fmtNum(totals?.sessions as number),
      subMetric: `${fmtPct(totals?.sessionConversionRate as number)} conv. rate`,
      delta: pct(totals?.sessions as number, cmpTotals?.sessions as number),
      color: CHART_COLORS.ga4,
      connector: 'converts to leads',
      heroLabel: 'sessions in the last 30 days',
      spark: trendRows.map((r) => ({ date: r.date, sessions: r.sessions })),
      stats: [
        { label: 'Active Users', value: fmtNum(totals?.activeUsers as number) },
        { label: 'New Users',    value: fmtNum(totals?.newUsers as number) },
        { label: 'Conversions',  value: fmtNum(totals?.conversions as number) },
        { label: 'Bounce Rate',  value: fmtPct(totals?.bounceRate as number) },
      ],
    },
    {
      key: 'inbound', source: 'Inbound Funnel', label: 'Online Contacts',
      color: CHART_COLORS.positive,
      connector: 'becomes pipeline',
      connected: crm,
    },
    {
      key: 'pipeline', source: 'Pipeline', label: 'Open Pipeline',
      color: CHART_COLORS.neutral,
      connected: crm,
    },
  ]
}
