import { ga4Query, parseDateRange, deriveCompareRange } from '@/lib/ga4/client'
import { getPeecOverview } from '@/lib/peec/client'
import { KpiCard } from './kpi-card'
import { NeedsConnection } from './needs-connection'
import { DemandJourney } from './demand-journey'
import { SessionsTrendChart } from './sessions-trend-chart'
import { NewReturning } from './new-returning'
import { ChannelTabsChart } from './channel-tabs-chart'
import {
  fmtNum, fmtPct, fmtDuration, pct,
  buildTrendRows, buildAudienceRows, buildChannelData, buildCompareLabel,
} from './reshape'
import { buildStages } from './stages'

const KPI_METRICS = [
  'sessions', 'activeUsers', 'newUsers', 'bounceRate',
  'averageSessionDuration', 'screenPageViewsPerSession',
  'conversions', 'sessionConversionRate',
]

interface ExecutiveOverviewProps {
  clientSlug: string
}

export async function ExecutiveOverviewReport({ clientSlug }: ExecutiveOverviewProps) {
  // Ranges are resolved here, never taken from props. Every route passes
  // compareRange as null for a section with no date picker, and a default
  // parameter does not fire for null. Taking it from the caller renders every
  // delta on this page blank.
  const resolved = parseDateRange('last_30_days')
  const compare  = deriveCompareRange('last_30_days', 'previous_period')
  const mainIso  = `${resolved.startDate},${resolved.endDate}`
  const cmpIso   = compare ? `${compare.startDate},${compare.endDate}` : null

  const [
    totalsRes, cmpTotalsRes, trendRes, cmpTrendRes,
    channelRes, cmpChannelRes, channelSMRes,
    audienceRes, cmpAudienceRes, peecRes,
  ] = await Promise.allSettled([
    ga4Query({ clientSlug, dateRange: mainIso, metrics: KPI_METRICS }),
    cmpIso ? ga4Query({ clientSlug, dateRange: cmpIso, metrics: KPI_METRICS }) : Promise.resolve(null),
    ga4Query({ clientSlug, dateRange: mainIso, metrics: ['sessions', 'activeUsers', 'newUsers'], dimensions: ['date'], limit: 90 }),
    cmpIso ? ga4Query({ clientSlug, dateRange: cmpIso, metrics: ['sessions', 'activeUsers', 'newUsers'], dimensions: ['date'], limit: 90 }) : Promise.resolve(null),
    ga4Query({ clientSlug, dateRange: mainIso, metrics: ['sessions', 'conversions', 'sessionConversionRate'], dimensions: ['sessionDefaultChannelGroup'], limit: 10 }),
    cmpIso ? ga4Query({ clientSlug, dateRange: cmpIso, metrics: ['sessions'], dimensions: ['sessionDefaultChannelGroup'], limit: 10 }) : Promise.resolve(null),
    ga4Query({ clientSlug, dateRange: mainIso, metrics: ['sessions'], dimensions: ['sessionDefaultChannelGroup', 'sessionSource', 'sessionMedium'], limit: 150 }),
    ga4Query({ clientSlug, dateRange: mainIso, metrics: ['sessions', 'engagementRate', 'averageSessionDuration'], dimensions: ['newVsReturning'] }),
    cmpIso ? ga4Query({ clientSlug, dateRange: cmpIso, metrics: ['sessions', 'engagementRate', 'averageSessionDuration'], dimensions: ['newVsReturning'] }) : Promise.resolve(null),
    getPeecOverview(clientSlug, 'year_to_date'),
  ])

  const val = <T,>(r: PromiseSettledResult<T>): T | null =>
    r.status === 'fulfilled' ? r.value : null

  const totals      = val(totalsRes)?.rows?.[0] ?? null
  const cmpTotals   = val(cmpTotalsRes)?.rows?.[0] ?? null
  const trendRows   = buildTrendRows(val(trendRes)?.rows ?? null, val(cmpTrendRes)?.rows ?? null)
  const channel     = buildChannelData(val(channelRes)?.rows ?? null, val(cmpChannelRes)?.rows ?? null, val(channelSMRes)?.rows ?? null)
  const audience    = buildAudienceRows(val(audienceRes)?.rows ?? null)
  const cmpAudience = buildAudienceRows(val(cmpAudienceRes)?.rows ?? null)
  const peec        = val(peecRes)
  const cmpLabel    = buildCompareLabel(compare)

  const stages = buildStages({ totals, cmpTotals, peec, trendRows })

  return (
    <div className="space-y-8">
      <p className="text-xs font-bold uppercase tracking-widest text-text-muted">Last 30 days</p>

      <DemandJourney stages={stages} />

      <section className="space-y-6">
        <h2 className="text-sm font-bold uppercase tracking-widest text-text-muted">Web Analytics</h2>
        <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
          <KpiCard title="Sessions"             value={fmtNum(totals?.sessions as number)}                    delta={pct(totals?.sessions as number, cmpTotals?.sessions as number)} tooltip="Total number of sessions in the selected period." />
          <KpiCard title="Active Users"         value={fmtNum(totals?.activeUsers as number)}                 delta={pct(totals?.activeUsers as number, cmpTotals?.activeUsers as number)} tooltip="Users who had at least one engaged session." />
          <KpiCard title="New Users"            value={fmtNum(totals?.newUsers as number)}                    delta={pct(totals?.newUsers as number, cmpTotals?.newUsers as number)} tooltip="First-time visitors in the selected period." />
          <KpiCard title="Bounce Rate"          value={fmtPct(totals?.bounceRate as number)}                  delta={pct(totals?.bounceRate as number, cmpTotals?.bounceRate as number)} invertDelta tooltip="Sessions that ended with no engagement. Lower is better." />
          <KpiCard title="Avg Session Duration" value={fmtDuration(totals?.averageSessionDuration as number)} delta={pct(totals?.averageSessionDuration as number, cmpTotals?.averageSessionDuration as number)} tooltip="Average time users spend per session. Higher = more engaged." />
          <KpiCard title="Pages / Session"      value={totals?.screenPageViewsPerSession != null ? Number(totals.screenPageViewsPerSession).toFixed(1) : '—'} delta={pct(totals?.screenPageViewsPerSession as number, cmpTotals?.screenPageViewsPerSession as number)} tooltip="Average number of pages viewed per session." />
          <KpiCard title="Conversions"          value={fmtNum(totals?.conversions as number)}                 delta={pct(totals?.conversions as number, cmpTotals?.conversions as number)} tooltip="Total conversion events fired in the selected period." />
          <KpiCard title="Conversion Rate"      value={fmtPct(totals?.sessionConversionRate as number)}       delta={pct(totals?.sessionConversionRate as number, cmpTotals?.sessionConversionRate as number)} tooltip="Percentage of sessions that resulted in a conversion." />
        </div>
        <SessionsTrendChart data={trendRows} compareLabel={cmpLabel} />
        <NewReturning rows={audience.rows} compareRows={cmpAudience.rows} />
        <ChannelTabsChart volumeData={channel.volumeData} convData={channel.convData} compareMap={channel.compareMap} sourceMediumMap={channel.sourceMediumMap} />
      </section>

      <section className="space-y-6">
        <h2 className="text-sm font-bold uppercase tracking-widest text-text-muted">Contact Creation</h2>
        <NeedsConnection sourceName="CRM" />
      </section>

      <section className="space-y-6">
        <h2 className="text-sm font-bold uppercase tracking-widest text-text-muted">Pipeline Performance</h2>
        <NeedsConnection sourceName="CRM" />
      </section>
    </div>
  )
}
