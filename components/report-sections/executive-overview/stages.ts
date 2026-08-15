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
}

export function buildStages({ totals, cmpTotals, peec, trendRows }: StageInput): DemandStage[] {
  const weekly   = peec?.weeklyVisibility ?? []
  const latest   = weekly.at(-1)?.visibility ?? null
  const previous = weekly.at(-2)?.visibility ?? null
  // isYou is computed from clients.peec_your_brand. Matching on a literal brand
  // name here would blank share of voice for every client but the one hardcoded.
  const aeoSov   = peec?.brandRankings?.find((b) => b.isYou)?.sov ?? null

  return [
    {
      key: 'aeo', source: 'AEO', label: 'AI Visibility',
      metric: latest != null ? `${latest.toFixed(1)}%` : '—',
      subMetric: aeoSov != null ? `${aeoSov.toFixed(1)}% share of voice` : undefined,
      delta: latest != null && previous != null ? pct(latest, previous) : undefined,
      color: CHART_COLORS.primary,
      connector: 'drives\ndiscovery',
      heroLabel: 'visibility rate across tracked prompts',
      stats: [
        { label: 'Share of Voice',  value: aeoSov != null ? `${aeoSov.toFixed(1)}%` : '—' },
        { label: 'Tracked Brands',  value: peec?.brandRankings?.length?.toLocaleString() ?? '—' },
        { label: 'Tracked Prompts', value: peec?.trackedPrompts?.length?.toLocaleString() ?? '—' },
      ],
    },
    {
      key: 'ga4', source: 'Web Analytics', label: 'Site Sessions',
      metric: fmtNum(totals?.sessions as number),
      subMetric: `${fmtPct(totals?.sessionConversionRate as number)} conv. rate`,
      delta: pct(Number(totals?.sessions ?? 0), Number(cmpTotals?.sessions ?? 0)),
      color: CHART_COLORS.ga4,
      connector: 'converts\nto leads',
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
      connector: 'becomes\npipeline',
      connected: false,
    },
    {
      key: 'pipeline', source: 'Pipeline', label: 'Open Pipeline',
      color: CHART_COLORS.neutral,
      connected: false,
    },
  ]
}
