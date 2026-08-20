import { CHART_COLORS } from '@/lib/constants'
import type { DemandStage } from './demand-journey'
import type { TrendRow } from './sessions-trend-chart'
import { fmtNum, fmtPct, pct } from './reshape'

export interface StageInput {
  totals: Record<string, unknown> | null
  cmpTotals: Record<string, unknown> | null
  peec: {
    weeklyVisibility?: { weekStart: string; visibility: number }[]
    /**
     * False when lib/peec/client.ts could not determine which tracked brand is
     * the client (no peec_your_brand column and no PEEC_AI_YOUR_BRAND env
     * fallback). In that state filterYou keeps every brand, so weeklyVisibility
     * is an all-brands average rather than the client's own visibility. Absent
     * on older callers, which are treated as resolved.
     */
    yourBrandResolved?: boolean
    brandRankings?: { name: string; sov: number; isYou?: boolean }[]
    trackedPrompts?: unknown[]
  } | null
  trendRows: TrendRow[]
  /**
   * Whether the client is CONFIGURED for AI-visibility tracking (has a Peec
   * project), independent of whether this fetch returned data. A configured
   * client whose fetch failed or came back empty must NOT read "not connected";
   * it dashes like the GA4 hero card. Only a genuinely unconfigured client is
   * unconnected. When omitted, falls back to `peec != null` for older callers.
   */
  peecConnected?: boolean
  /**
   * Injectable "current time" for the partial-week detection below. Defaults
   * to the real current time; tests pass a fixed Date so the AI Visibility
   * delta assertions are not time-dependent.
   */
  now?: Date
}

/** ISO date (UTC) of the Monday that starts the week containing `date`. Mirrors
 *  the Monday key computed by groupByWeek in lib/peec/client.ts, so the two
 *  stay in lockstep, this must keep matching that function's math exactly. */
function isoWeekStart(date: Date): string {
  const day  = date.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(date)
  monday.setUTCDate(date.getUTCDate() + diff)
  return monday.toISOString().split('T')[0]
}

/**
 * Drops the final bucket of a weeklyVisibility series when it is the current,
 * still-accumulating ISO week. The last bucket from Peec's weekly grouping is
 * the in-progress week (e.g. two days of data on a Tuesday), so comparing it
 * to a full prior week understates or inflates the delta depending on the day
 * it's read. A no-op when the final bucket is not the current week (Peec may
 * already exclude it).
 */
function dropPartialWeek<T extends { weekStart: string }>(weekly: T[], now: Date): T[] {
  if (weekly.length === 0) return weekly
  const last = weekly[weekly.length - 1]
  return last.weekStart === isoWeekStart(now) ? weekly.slice(0, -1) : weekly
}

export function buildStages({ totals, cmpTotals, peec, trendRows, peecConnected, now = new Date() }: StageInput): DemandStage[] {
  // With no resolvable "your brand", weeklyVisibility is an average across every
  // tracked brand (filterYou degrades to a pass-through), which is emphatically
  // not this client's visibility rate. Dash instead of publishing a number that
  // means something else. Share of Voice already dashes in this state, since
  // isYou is false for every brand, so this also keeps the card self-consistent.
  const brandResolved = peec?.yourBrandResolved !== false
  const completeWeeks = brandResolved ? dropPartialWeek(peec?.weeklyVisibility ?? [], now) : []
  const latest   = completeWeeks.at(-1)?.visibility ?? null
  const previous = completeWeeks.at(-2)?.visibility ?? null
  // isYou is computed from clients.peec_your_brand. Matching on a literal brand
  // name here would blank share of voice for every client but the one hardcoded.
  const aeoSov   = peec?.brandRankings?.find((b) => b.isYou)?.sov ?? null

  return [
    {
      key: 'aeo', source: 'AEO', label: 'AI Visibility',
      metric: latest != null ? `${latest.toFixed(1)}%` : '—',
      // Share of voice is genuinely year-to-date (it comes from the same
      // year_to_date-scoped brandRankings query), while the hero metric above
      // is the last complete week. Naming the window inline keeps the card
      // honest instead of implying both numbers share one window.
      subMetric: aeoSov != null ? `${aeoSov.toFixed(1)}% share of voice, year to date` : undefined,
      delta: latest != null && previous != null ? pct(latest, previous) : undefined,
      color: CHART_COLORS.primary,
      connector: 'drives discovery',
      // The hero metric is the latest COMPLETE week's visibility (see
      // dropPartialWeek above), not a year-to-date figure, so the badge names
      // that window instead of claiming YTD.
      badge: 'LAST FULL WEEK',
      deltaLabel: 'vs prior week',
      heroLabel: 'visibility rate across tracked prompts',
      stats: [
        { label: 'Share of Voice',  value: aeoSov != null ? `${aeoSov.toFixed(1)}%` : '—' },
        { label: 'Tracked Brands',  value: peec?.brandRankings?.length?.toLocaleString() ?? '—' },
        { label: 'Tracked Prompts', value: peec?.trackedPrompts?.length?.toLocaleString() ?? '—' },
      ],
      // Connected reflects whether the source is CONFIGURED, not whether this
      // fetch returned data. A configured client whose fetch failed or came
      // back empty dashes (metric falls back to the null glyph above), the same
      // as the GA4 hero card on a GA4 outage, rather than being told to connect
      // a source that is already connected. Only a genuinely unconfigured
      // client is unconnected. Falls back to the old peec-presence check for
      // callers that do not pass the flag.
      connected: peecConnected ?? (peec != null),
      // Vendor-neutral: this is AI-visibility tracking, not a CRM. The generic
      // "Not connected" branch used to hardcode CRM wording for every
      // unconnected stage, which told an unconfigured AEO client to go connect
      // a CRM that has nothing to do with it.
      unconnectedHint: 'Connect AI visibility tracking to see this',
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
      // This page has no CRM data source: index.tsx fetches only GA4 and
      // Peec. A CRM-configured client still has nothing to show here, so
      // this stays hardcoded unconnected rather than following the client's
      // hubspotTokenEnvVar flag (which previously claimed a connection this
      // page could not honor, rendering an empty hero line). The follow-up
      // PR that wires in CRM data flips this to a real connection check.
      key: 'inbound', source: 'Inbound Funnel', label: 'Online Contacts',
      color: CHART_COLORS.positive,
      connector: 'becomes pipeline',
      connected: false,
      unconnectedHint: 'Connect your CRM to see this',
    },
    {
      // Same as 'inbound' above: no CRM data source on this page yet.
      key: 'pipeline', source: 'Pipeline', label: 'Open Pipeline',
      color: CHART_COLORS.neutral,
      connected: false,
      unconnectedHint: 'Connect your CRM to see this',
    },
  ]
}
