import { ga4Query, parseDateRange, deriveCompareRange } from '@/lib/ga4/client'
import { getPeecOverview } from '@/lib/peec/client'
import { getClientBySlug } from '@/lib/db/queries'
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
import { getSalesforcePipeline } from '@/lib/salesforce/pipeline'
import { getSalesforceWeeklyContacts } from '@/lib/salesforce/contacts'
import { isSalesforceConfigured, canQuerySalesforce } from '@/lib/salesforce/configured'
import { PipelinePerformance } from './pipeline-performance'
import { ContactPacing } from './contact-pacing'
import { LoadFailed } from './no-data'

const KPI_METRICS = [
  'sessions', 'activeUsers', 'newUsers', 'bounceRate',
  'averageSessionDuration', 'screenPageViewsPerSession',
  'conversions', 'sessionConversionRate',
]

// ga4Query never sets an order by default, so GA4 returns rows in an
// unspecified order. The three channel queries below use `limit` to cap row
// count, which is only a "top N by sessions" cap when the rows are actually
// sorted that way first, otherwise it truncates an arbitrary N, which can
// drop a client's biggest channel (e.g. Organic Search) and skew the
// share-of-total percentage in reshape.ts, whose denominator is the sum of
// exactly these truncated rows.
const SESSIONS_DESC_ORDER = [{ metric: { metricName: 'sessions' }, desc: true }]

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

  // Same guard pattern as peec-ai/index.tsx: only call Peec when this client
  // actually has a Peec project configured. Calling it unconditionally would
  // fall back to the env-default project and render another client's AEO
  // numbers as if they were this client's.
  const client        = await getClientBySlug(clientSlug)
  const peecConfigured = !!client?.peecCustomerProjectId

  // Two questions, two predicates (lib/salesforce/configured.ts).
  //   hasCrm   decides what we TELL the reader (LoadFailed vs NeedsConnection)
  //   canFetch decides whether we ISSUE the request at all
  // They differ on exactly one case: a configured client on a deployment whose
  // shared Supermetrics key is unset. Using canFetch for the render decision
  // there would tell them to connect a CRM they already connected.
  const hasCrm   = isSalesforceConfigured(client)
  const canFetch = canQuerySalesforce(client)

  const [
    totalsRes, cmpTotalsRes, trendRes, cmpTrendRes,
    channelRes, cmpChannelRes, channelSMRes,
    audienceRes, cmpAudienceRes, peecRes,
    pipelineRes, contactsRes,
  ] = await Promise.allSettled([
    ga4Query({ clientSlug, dateRange: mainIso, metrics: KPI_METRICS }),
    cmpIso ? ga4Query({ clientSlug, dateRange: cmpIso, metrics: KPI_METRICS }) : Promise.resolve(null),
    ga4Query({ clientSlug, dateRange: mainIso, metrics: ['sessions', 'activeUsers', 'newUsers'], dimensions: ['date'], limit: 90 }),
    cmpIso ? ga4Query({ clientSlug, dateRange: cmpIso, metrics: ['sessions', 'activeUsers', 'newUsers'], dimensions: ['date'], limit: 90 }) : Promise.resolve(null),
    // 25, not 10: the By Conversion tab ranks this row set by CONVERSION RATE,
    // so capping the fetch at the volume tab's display limit meant a channel
    // ranked 11th by sessions but first by conversion rate could never appear,
    // contradicting that tab's own tooltip. buildChannelData slices the volume
    // tab back to its top 10; only the conversion ranking sees the wider pool.
    // Same reasoning as the compare fetch below, and the same cost argument:
    // channel groups are a small, bounded dimension.
    ga4Query({ clientSlug, dateRange: mainIso, metrics: ['sessions', 'conversions', 'sessionConversionRate'], dimensions: ['sessionDefaultChannelGroup'], limit: 25, orderBys: SESSIONS_DESC_ORDER }),
    // 25, not 10: this is the COMPARE period's ranking, and a channel that
    // ranks in the current top 10 can rank outside the compare top 10 while
    // still being present further down. Capping the compare fetch at the
    // same 10 as the display limit truncated it out of compareMap entirely,
    // which rendered a grown channel as "Prior period 0" (see reshape.ts /
    // channel-tabs-chart.tsx). Channel groups are a small, bounded dimension,
    // so a wider compare fetch costs nothing.
    cmpIso ? ga4Query({ clientSlug, dateRange: cmpIso, metrics: ['sessions'], dimensions: ['sessionDefaultChannelGroup'], limit: 25, orderBys: SESSIONS_DESC_ORDER }) : Promise.resolve(null),
    ga4Query({ clientSlug, dateRange: mainIso, metrics: ['sessions'], dimensions: ['sessionDefaultChannelGroup', 'sessionSource', 'sessionMedium'], limit: 150, orderBys: SESSIONS_DESC_ORDER }),
    ga4Query({ clientSlug, dateRange: mainIso, metrics: ['sessions', 'engagementRate', 'averageSessionDuration'], dimensions: ['newVsReturning'] }),
    cmpIso ? ga4Query({ clientSlug, dateRange: cmpIso, metrics: ['sessions', 'engagementRate', 'averageSessionDuration'], dimensions: ['newVsReturning'] }) : Promise.resolve(null),
    peecConfigured ? getPeecOverview(clientSlug, 'year_to_date') : Promise.resolve(null),
    canFetch ? getSalesforcePipeline(clientSlug)       : Promise.resolve(null),
    canFetch ? getSalesforceWeeklyContacts(clientSlug) : Promise.resolve(null),
  ])

  const val = <T,>(r: PromiseSettledResult<T>): T | null =>
    r.status === 'fulfilled' ? r.value : null

  // A REJECTED primary query (an outage, not an empty-but-successful result)
  // must render a distinct "couldn't load" state, never NoData. val() above
  // flattens both cases to null/[], which is right for the numbers themselves
  // but loses the outage signal each chart needs to pick the honest empty
  // state. Only the PRIMARY (current-period) query per chart is tracked here;
  // a failed compare-only query still lets the current-period data render.
  const trendFailed    = trendRes.status === 'rejected'
  const audienceFailed = audienceRes.status === 'rejected'
  const channelFailed  = channelRes.status === 'rejected'

  const totals      = val(totalsRes)?.rows?.[0] ?? null
  const cmpTotals   = val(cmpTotalsRes)?.rows?.[0] ?? null
  // Pass the true resolved period-start dates (converted from ISO
  // "YYYY-MM-DD" to GA4's row "date" format "YYYYMMDD") so buildTrendRows can
  // anchor the compare join on the actual start of each period, not on
  // whichever row GA4 happened to return first (it omits zero-session days,
  // including a period's own first day).
  const trendRows   = buildTrendRows(
    val(trendRes)?.rows ?? null,
    val(cmpTrendRes)?.rows ?? null,
    resolved.startDate.replace(/-/g, ''),
    compare ? compare.startDate.replace(/-/g, '') : undefined,
  )
  const channel     = buildChannelData(val(channelRes)?.rows ?? null, val(cmpChannelRes)?.rows ?? null, val(channelSMRes)?.rows ?? null, totals?.sessions as number | undefined)
  const audience    = buildAudienceRows(val(audienceRes)?.rows ?? null)
  const cmpAudience = buildAudienceRows(val(cmpAudienceRes)?.rows ?? null)
  const peec        = val(peecRes)
  const pipeline    = val(pipelineRes)
  const contacts    = val(contactsRes)
  const cmpLabel    = buildCompareLabel(compare)

  const stages = buildStages({
    totals, cmpTotals, peec, trendRows, peecConnected: peecConfigured,
    pipeline, contacts, crmConnected: hasCrm,
  })

  return (
    <div className="space-y-8">
      <DemandJourney stages={stages} />

      <section className="space-y-6">
        <h2 className="text-sm font-bold uppercase tracking-widest text-text-muted">Web Analytics</h2>
        <p className="text-xs font-bold uppercase tracking-widest text-text-muted">Last 30 days</p>
        <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
          <KpiCard title="Sessions"             value={fmtNum(totals?.sessions as number)}                    delta={pct(totals?.sessions as number, cmpTotals?.sessions as number)} comparisonExpected tooltip="Total number of sessions in the selected period." />
          <KpiCard title="Active Users"         value={fmtNum(totals?.activeUsers as number)}                 delta={pct(totals?.activeUsers as number, cmpTotals?.activeUsers as number)} comparisonExpected tooltip="Users who had at least one engaged session." />
          <KpiCard title="New Users"            value={fmtNum(totals?.newUsers as number)}                    delta={pct(totals?.newUsers as number, cmpTotals?.newUsers as number)} comparisonExpected tooltip="First-time visitors in the selected period." />
          <KpiCard title="Bounce Rate"          value={fmtPct(totals?.bounceRate as number)}                  delta={pct(totals?.bounceRate as number, cmpTotals?.bounceRate as number)} invertDelta comparisonExpected tooltip="Sessions that ended with no engagement. Lower is better." />
          <KpiCard title="Avg Session Duration" value={fmtDuration(totals?.averageSessionDuration as number)} delta={pct(totals?.averageSessionDuration as number, cmpTotals?.averageSessionDuration as number)} comparisonExpected tooltip="Average time users spend per session. Higher = more engaged." />
          <KpiCard title="Pages / Session"      value={totals?.screenPageViewsPerSession != null ? Number(totals.screenPageViewsPerSession).toFixed(1) : '—'} delta={pct(totals?.screenPageViewsPerSession as number, cmpTotals?.screenPageViewsPerSession as number)} comparisonExpected tooltip="Average number of pages viewed per session." />
          <KpiCard title="Conversions"          value={fmtNum(totals?.conversions as number)}                 delta={pct(totals?.conversions as number, cmpTotals?.conversions as number)} comparisonExpected tooltip="Total conversion events fired in the selected period." />
          <KpiCard title="Conversion Rate"      value={fmtPct(totals?.sessionConversionRate as number)}       delta={pct(totals?.sessionConversionRate as number, cmpTotals?.sessionConversionRate as number)} comparisonExpected tooltip="Percentage of sessions that resulted in a conversion." />
        </div>
        <SessionsTrendChart data={trendRows} compareLabel={cmpLabel} failed={trendFailed} />
        <NewReturning rows={audience.rows} compareRows={cmpAudience.rows} failed={audienceFailed} />
        <ChannelTabsChart volumeData={channel.volumeData} convData={channel.convData} compareMap={channel.compareMap} sourceMediumMap={channel.sourceMediumMap} failed={channelFailed} />
      </section>

      <section className="space-y-6">
        <h2 className="text-sm font-bold uppercase tracking-widest text-text-muted">Contact Creation</h2>
        {contacts ? <ContactPacing data={contacts} />
          : hasCrm ? <LoadFailed message="Couldn't load contact data." />
          : <NeedsConnection sourceName="CRM" />}
      </section>

      <section className="space-y-6">
        <h2 className="text-sm font-bold uppercase tracking-widest text-text-muted">Pipeline Performance</h2>
        {pipeline ? <PipelinePerformance data={pipeline} />
          : hasCrm ? <LoadFailed message="Couldn't load pipeline data." />
          : <NeedsConnection sourceName="CRM" />}
      </section>
    </div>
  )
}
