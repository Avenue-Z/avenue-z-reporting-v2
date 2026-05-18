import { ga4Query, parseDateRange, deriveCompareRange } from '@/lib/ga4/client'
import { KpiCard } from '@/components/charts/kpi-card'
import { SessionsTrendChart } from './sessions-trend-chart'
import { ChannelTabsChart } from './channel-tabs-chart'
import { DeviceBreakdown } from './device-breakdown'
import { NewReturning } from './new-returning'
import { TopEvents } from './top-events'
import { DayHourHeatmap } from './day-hour-heatmap'
import { GeoMap } from './geo-map'
import { TopPagesChart } from './top-pages-chart'
import { CHART_COLORS } from '@/lib/constants'

function InlineTooltip({ text }: { text: string }) {
  return (
    <div className="group relative flex-shrink-0">
      <span className="flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full border border-white/20 text-[9px] font-bold leading-none text-text-muted">
        ?
      </span>
      <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-64 -translate-x-1/2 rounded-md border border-white/[0.08] bg-bg-surface px-3 py-2 text-xs leading-relaxed text-text-muted opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
        {text}
        <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-white/[0.08]" />
      </div>
    </div>
  )
}

interface GA4Props {
  clientSlug: string
  dateRange?: string
  compareRange?: string | null
}

function fmtNum(n: number | null | undefined): string {
  if (n == null) return '—'
  return Math.round(n).toLocaleString()
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '—'
  return `${(n * 100).toFixed(1)}%`
}

function fmtDuration(seconds: number | null | undefined): string {
  if (seconds == null) return '—'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

/** Format GA4 date string "20250101" → "Jan 1" */
function fmtDate(d: string): string {
  if (!d || d.length !== 8) return d
  const year = parseInt(d.slice(0, 4))
  const month = parseInt(d.slice(4, 6)) - 1
  const day = parseInt(d.slice(6, 8))
  return new Date(year, month, day).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

/** Format ISO date "2025-01-01" → "Jan 1, 2025" */
function fmtISODate(d: string): string {
  if (!d) return d
  const [year, month, day] = d.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function pct(current: number | null | undefined, baseline: number | null | undefined): number | undefined {
  if (current == null || baseline == null || baseline === 0) return undefined
  return ((current - baseline) / baseline) * 100
}

const KPI_METRICS = [
  'sessions',
  'activeUsers',
  'newUsers',
  'bounceRate',
  'averageSessionDuration',
  'screenPageViewsPerSession',
  'conversions',
  'sessionConversionRate',
]

export async function GA4Report({ clientSlug, dateRange = 'last_30_days', compareRange = 'previous_period' }: GA4Props) {
  const resolvedMain    = parseDateRange(dateRange)
  const resolvedCompare = deriveCompareRange(dateRange, compareRange)

  const mainIso    = `${resolvedMain.startDate},${resolvedMain.endDate}`
  const compareIso = resolvedCompare
    ? `${resolvedCompare.startDate},${resolvedCompare.endDate}`
    : null

  // Fixed 90-day lookback — used to flag pages that are perennially in the top 10
  const last90Iso  = (() => {
    const end   = parseDateRange('last_30_days').endDate  // today proxy
    const start = parseDateRange('last_90_days').startDate
    return `${start},${end}`
  })()

  const [
    totalsRes, compareTotalsRes,
    trendRes, compareTrendRes,
    channelRes, compareChannelRes,
    pagesRes, entryPagesRes,
    deviceRes, audienceRes,
    eventsRes, heatmapRes, geoRes,
    channelSMRes,
    comparePageRes, compareEntryPageRes,
    pages90Res, entryPages90Res,
    compareAudienceRes,
  ] =
    await Promise.all([
      ga4Query({ clientSlug, dateRange: mainIso, metrics: KPI_METRICS }),
      compareIso
        ? ga4Query({ clientSlug, dateRange: compareIso, metrics: KPI_METRICS })
        : Promise.resolve(null),
      ga4Query({
        clientSlug,
        dateRange: mainIso,
        metrics: ['sessions', 'activeUsers', 'newUsers'],
        dimensions: ['date'],
        limit: 90,
      }),
      compareIso
        ? ga4Query({
            clientSlug,
            dateRange: compareIso,
            metrics: ['sessions', 'activeUsers', 'newUsers'],
            dimensions: ['date'],
            limit: 90,
          })
        : Promise.resolve(null),
      ga4Query({
        clientSlug,
        dateRange: mainIso,
        metrics: ['sessions', 'conversions', 'sessionConversionRate'],
        dimensions: ['sessionDefaultChannelGroup'],
        limit: 10,
      }),
      compareIso
        ? ga4Query({
            clientSlug,
            dateRange: compareIso,
            metrics: ['sessions'],
            dimensions: ['sessionDefaultChannelGroup'],
            limit: 10,
          })
        : Promise.resolve(null),
      ga4Query({
        clientSlug,
        dateRange: mainIso,
        metrics: ['sessions', 'conversions', 'sessionConversionRate'],
        dimensions: ['pagePath'],
        limit: 25, // extra headroom so Rising filter always has 10 to show
      }),
      ga4Query({
        clientSlug,
        dateRange: mainIso,
        metrics: ['sessions', 'conversions', 'sessionConversionRate'],
        dimensions: ['landingPage'],
        limit: 25,
      }),
      // Device breakdown
      ga4Query({
        clientSlug,
        dateRange: mainIso,
        metrics: ['sessions', 'bounceRate', 'engagementRate'],
        dimensions: ['deviceCategory'],
      }),
      // New vs. returning
      ga4Query({
        clientSlug,
        dateRange: mainIso,
        metrics: ['sessions', 'engagementRate', 'averageSessionDuration'],
        dimensions: ['newVsReturning'],
      }),
      // Top events
      ga4Query({
        clientSlug,
        dateRange: mainIso,
        metrics: ['eventCount', 'eventCountPerUser', 'keyEvents'],
        dimensions: ['eventName'],
        limit: 25,
      }),
      // Day × hour heatmap
      ga4Query({
        clientSlug,
        dateRange: mainIso,
        metrics: ['sessions'],
        dimensions: ['dayOfWeek', 'hour'],
        limit: 200,
      }),
      // Geo — fetch enough countries to paint the map meaningfully
      ga4Query({
        clientSlug,
        dateRange: mainIso,
        metrics: ['sessions', 'engagementRate'],
        dimensions: ['country'],
        limit: 150,
      }),
      // Channel × source/medium — drives hover detail on Traffic by Channel
      ga4Query({
        clientSlug,
        dateRange: mainIso,
        metrics: ['sessions'],
        dimensions: ['sessionDefaultChannelGroup', 'sessionSource', 'sessionMedium'],
        limit: 150,
      }),
      // Compare period — top pages (for delta arrows)
      compareIso
        ? ga4Query({
            clientSlug,
            dateRange: compareIso,
            metrics: ['sessions'],
            dimensions: ['pagePath'],
            limit: 25,
          })
        : Promise.resolve(null),
      // Compare period — top entry pages (for delta arrows)
      compareIso
        ? ga4Query({
            clientSlug,
            dateRange: compareIso,
            metrics: ['sessions'],
            dimensions: ['landingPage'],
            limit: 25,
          })
        : Promise.resolve(null),
      // 90-day lookback — top pages (used to flag perennially popular pages)
      ga4Query({
        clientSlug,
        dateRange: last90Iso,
        metrics: ['sessions'],
        dimensions: ['pagePath'],
        limit: 10,
      }),
      // 90-day lookback — top entry pages
      ga4Query({
        clientSlug,
        dateRange: last90Iso,
        metrics: ['sessions'],
        dimensions: ['landingPage'],
        limit: 10,
      }),
      // Compare period — new vs. returning (for prior period deltas on cards)
      compareIso
        ? ga4Query({
            clientSlug,
            dateRange: compareIso,
            metrics: ['sessions', 'engagementRate', 'averageSessionDuration'],
            dimensions: ['newVsReturning'],
          })
        : Promise.resolve(null),
    ])

  const t  = totalsRes.rows[0]  ?? {}
  const c  = compareTotalsRes?.rows[0] ?? null

  const kpis = [
    {
      title: 'Sessions',
      value: fmtNum(t.sessions as number),
      delta: pct(t.sessions as number, c?.sessions as number),
      tooltip: 'Total number of sessions in the selected period.',
    },
    {
      title: 'Active Users',
      value: fmtNum(t.activeUsers as number),
      delta: pct(t.activeUsers as number, c?.activeUsers as number),
      tooltip: 'Users who had at least one engaged session.',
    },
    {
      title: 'New Users',
      value: fmtNum(t.newUsers as number),
      delta: pct(t.newUsers as number, c?.newUsers as number),
      tooltip: 'First-time visitors in the selected period.',
    },
    {
      title: 'Bounce Rate',
      value: fmtPct(t.bounceRate as number),
      delta: pct(t.bounceRate as number, c?.bounceRate as number),
      invertDelta: true,
      tooltip: 'Sessions that ended with no engagement. Lower is better.',
    },
    {
      title: 'Avg Session Duration',
      value: fmtDuration(t.averageSessionDuration as number),
      delta: pct(t.averageSessionDuration as number, c?.averageSessionDuration as number),
      tooltip: 'Average time users spend per session. Higher = more engaged.',
    },
    {
      title: 'Pages / Session',
      value: (t.screenPageViewsPerSession as number)?.toFixed(1) ?? '—',
      delta: pct(t.screenPageViewsPerSession as number, c?.screenPageViewsPerSession as number),
      tooltip: 'Average number of pages viewed per session.',
    },
    {
      title: 'Conversions',
      value: fmtNum(t.conversions as number),
      delta: pct(t.conversions as number, c?.conversions as number),
      tooltip: 'Total conversion events fired in the selected period.',
    },
    {
      title: 'Conversion Rate',
      value: fmtPct(t.sessionConversionRate as number),
      delta: pct(t.sessionConversionRate as number, c?.sessionConversionRate as number),
      tooltip: 'Percentage of sessions that resulted in a conversion.',
    },
  ]

  const currentRows = (trendRes.rows ?? [])
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))

  const compareRows = (compareTrendRes?.rows ?? [])
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))

  const trendData = currentRows.map((r, i) => {
    const prev = compareRows[i] ?? null
    return {
      date:         fmtDate(String(r.date ?? '')),
      sessions:     (r.sessions    as number) ?? 0,
      users:        (r.activeUsers as number) ?? 0,
      newUsers:     (r.newUsers    as number) ?? 0,
      prevDate:     prev ? fmtDate(String(prev.date ?? '')) : undefined,
      prevSessions: prev ? ((prev.sessions    as number) ?? 0) : undefined,
      prevUsers:    prev ? ((prev.activeUsers as number) ?? 0) : undefined,
      prevNewUsers: prev ? ((prev.newUsers    as number) ?? 0) : undefined,
    }
  })

  const CHANNEL_COLORS = [
    CHART_COLORS.ga4,      // blue
    CHART_COLORS.positive, // green
    CHART_COLORS.primary,  // cyan
    CHART_COLORS.email,    // yellow
    '#FF7A59',             // orange
    CHART_COLORS.tiktok,   // pink
    CHART_COLORS.metaAds,  // purple
    CHART_COLORS.reddit,   // red-orange
    CHART_COLORS.neutral,  // grey (fallback)
  ]

  const channelTotal = (channelRes.rows ?? []).reduce(
    (sum, r) => sum + ((r.sessions as number) ?? 0), 0
  )

  // Map compare period sessions by channel name for O(1) lookup
  const compareChannelMap: Record<string, number> = {}
  for (const r of compareChannelRes?.rows ?? []) {
    compareChannelMap[String(r.sessionDefaultChannelGroup ?? 'Other')] =
      (r.sessions as number) ?? 0
  }

  const channelData = (channelRes.rows ?? [])
    .sort((a, b) => ((b.sessions as number) ?? 0) - ((a.sessions as number) ?? 0))
    .map((r, i) => ({
      name:     String(r.sessionDefaultChannelGroup ?? 'Other'),
      sessions: (r.sessions as number) ?? 0,
      pct:      channelTotal > 0
        ? Math.round(((r.sessions as number) ?? 0) / channelTotal * 100)
        : 0,
      convRate: (r.sessionConversionRate as number) ?? 0,
      color:    CHANNEL_COLORS[i % CHANNEL_COLORS.length],
    }))

  // Channels by conversion rate — same rows, sorted by conv rate, top 5 with ≥20 sessions
  const channelColorMap = Object.fromEntries(channelData.map((c) => [c.name, c.color]))
  const channelConvData = (channelRes.rows ?? [])
    .filter((r) => ((r.sessions as number) ?? 0) >= 20)
    .sort((a, b) => ((b.sessionConversionRate as number) ?? 0) - ((a.sessionConversionRate as number) ?? 0))
    .slice(0, 5)
    .map((r) => {
      const name    = String(r.sessionDefaultChannelGroup ?? 'Other')
      return {
        name,
        sessions:  (r.sessions             as number) ?? 0,
        convRate:  (r.sessionConversionRate as number) ?? 0,
        color:     channelColorMap[name] ?? CHART_COLORS.neutral,
      }
    })

  // Channel × source/medium map — top source/medium pairs per channel, shown on hover
  const channelSourceMediumMap: Record<string, Array<{ name: string; sessions: number }>> = {}
  for (const r of channelSMRes?.rows ?? []) {
    const channel = String(r.sessionDefaultChannelGroup ?? 'Other')
    const src     = String(r.sessionSource ?? '').toLowerCase()
    const med     = String(r.sessionMedium ?? '').toLowerCase()
    if (src === '(not set)' || src === '') continue
    const key = `${src} / ${med}`
    if (!channelSourceMediumMap[channel]) channelSourceMediumMap[channel] = []
    const entry = channelSourceMediumMap[channel].find((e) => e.name === key)
    if (entry) entry.sessions += (r.sessions as number) ?? 0
    else channelSourceMediumMap[channel].push({ name: key, sessions: (r.sessions as number) ?? 0 })
  }
  for (const ch of Object.keys(channelSourceMediumMap)) {
    channelSourceMediumMap[ch].sort((a, b) => b.sessions - a.sessions)
    channelSourceMediumMap[ch] = channelSourceMediumMap[ch].slice(0, 6)
  }

  const topPages = (pagesRes.rows ?? [])
    .sort((a, b) => ((b.sessions as number) ?? 0) - ((a.sessions as number) ?? 0))
    .map((r) => ({
      page:     String(r.pagePath ?? '/'),
      sessions: (r.sessions as number) ?? 0,
      convRate: (r.sessionConversionRate as number) ?? 0,
    }))

  const topEntryPages = (entryPagesRes.rows ?? [])
    .sort((a, b) => ((b.sessions as number) ?? 0) - ((a.sessions as number) ?? 0))
    .map((r) => ({
      page:     String(r.landingPage ?? '/'),
      sessions: (r.sessions as number) ?? 0,
      convRate: (r.sessionConversionRate as number) ?? 0,
    }))

  // Compare maps for delta arrows
  const comparePageMap: Record<string, number> = {}
  for (const r of comparePageRes?.rows ?? []) {
    comparePageMap[String(r.pagePath ?? '/')] = (r.sessions as number) ?? 0
  }
  const compareEntryMap: Record<string, number> = {}
  for (const r of compareEntryPageRes?.rows ?? []) {
    compareEntryMap[String(r.landingPage ?? '/')] = (r.sessions as number) ?? 0
  }

  // 90-day staleness sets — paths that have been top-10 over the last 90 days
  const stalePagePaths:  string[] = (pages90Res?.rows ?? []).map((r) => String(r.pagePath ?? '/'))
  const staleEntryPaths: string[] = (entryPages90Res?.rows ?? []).map((r) => String(r.landingPage ?? '/'))


  // Device breakdown
  // Normalise device rows into exactly Desktop / Mobile / Other buckets
  const KNOWN_DEVICES = new Set(['desktop', 'mobile'])
  const _deviceBuckets: Record<string, { sessions: number; bounceRate: number; engagementRate: number; weightedBounce: number; weightedEngage: number }> = {}
  for (const r of deviceRes.rows ?? []) {
    const raw    = String(r.deviceCategory ?? '').toLowerCase()
    const bucket = KNOWN_DEVICES.has(raw) ? (raw === 'desktop' ? 'Desktop' : 'Mobile') : 'Other'
    const s      = (r.sessions as number) ?? 0
    const br     = (r.bounceRate as number) ?? 0
    const er     = (r.engagementRate as number) ?? 0
    if (!_deviceBuckets[bucket]) _deviceBuckets[bucket] = { sessions: 0, bounceRate: 0, engagementRate: 0, weightedBounce: 0, weightedEngage: 0 }
    _deviceBuckets[bucket].sessions       += s
    _deviceBuckets[bucket].weightedBounce  += br * s
    _deviceBuckets[bucket].weightedEngage  += er * s
  }
  const DEVICE_ORDER = ['Desktop', 'Mobile', 'Other']
  const deviceData = DEVICE_ORDER
    .filter((d) => _deviceBuckets[d]?.sessions > 0)
    .map((d) => {
      const b = _deviceBuckets[d]
      return {
        device:         d,
        sessions:       b.sessions,
        bounceRate:     b.sessions > 0 ? b.weightedBounce  / b.sessions : 0,
        engagementRate: b.sessions > 0 ? b.weightedEngage  / b.sessions : 0,
      }
    })

  // New vs. returning — GA4 can return more than 2 rows (blank/(not set) values
  // also come back as separate entries). Aggregate all into exactly 2 buckets so
  // the split bar never renders fragmented segments.
  const _audienceMap: Record<string, { sessions: number; engRate: number; dur: number }> = {}
  for (const r of audienceRes.rows ?? []) {
    const raw  = String(r.newVsReturning ?? '').toLowerCase()
    const type = raw.includes('new') ? 'new' : 'returning'
    const s    = (r.sessions as number) ?? 0
    if (!_audienceMap[type]) _audienceMap[type] = { sessions: 0, engRate: 0, dur: 0 }
    _audienceMap[type].sessions += s
    // Weight engagement rate and duration by session count for a proper average
    _audienceMap[type].engRate  += ((r.engagementRate as number) ?? 0) * s
    _audienceMap[type].dur      += ((r.averageSessionDuration as number) ?? 0) * s
  }
  const audienceData = Object.entries(_audienceMap).map(([type, d]) => ({
    type,
    sessions:       d.sessions,
    engagementRate: d.sessions > 0 ? d.engRate / d.sessions : 0,
    avgDuration:    d.sessions > 0 ? d.dur    / d.sessions : 0,
  })).sort((a, b) => b.sessions - a.sessions)

  // Compare period audience — same bucketing logic
  const _compareAudienceMap: Record<string, { sessions: number; engRate: number; dur: number }> = {}
  for (const r of compareAudienceRes?.rows ?? []) {
    const raw  = String(r.newVsReturning ?? '').toLowerCase()
    const type = raw.includes('new') ? 'new' : 'returning'
    const s    = (r.sessions as number) ?? 0
    if (!_compareAudienceMap[type]) _compareAudienceMap[type] = { sessions: 0, engRate: 0, dur: 0 }
    _compareAudienceMap[type].sessions += s
    _compareAudienceMap[type].engRate  += ((r.engagementRate as number) ?? 0) * s
    _compareAudienceMap[type].dur      += ((r.averageSessionDuration as number) ?? 0) * s
  }
  const compareAudienceData = Object.entries(_compareAudienceMap).map(([type, d]) => ({
    type,
    sessions:       d.sessions,
    engagementRate: d.sessions > 0 ? d.engRate / d.sessions : 0,
    avgDuration:    d.sessions > 0 ? d.dur    / d.sessions : 0,
  }))

  // Top events — filter out automatic lifecycle events that duplicate KPIs
  const NOISE_EVENTS = new Set(['session_start', 'first_visit', 'user_engagement'])
  const eventsData = (eventsRes.rows ?? [])
    .filter((r) => !NOISE_EVENTS.has(String(r.eventName ?? '')))
    .sort((a, b) => ((b.eventCount as number) ?? 0) - ((a.eventCount as number) ?? 0))
    .slice(0, 15)
    .map((r) => ({
      name:      String(r.eventName ?? ''),
      count:     (r.eventCount as number) ?? 0,
      perUser:   (r.eventCountPerUser as number) ?? 0,
      keyEvents: (r.keyEvents as number) ?? 0,
    }))

  // Day × hour heatmap
  const heatmapData = (heatmapRes.rows ?? []).map((r) => ({
    day:      parseInt(String(r.dayOfWeek ?? '0'), 10),
    hour:     parseInt(String(r.hour ?? '0'), 10),
    sessions: (r.sessions as number) ?? 0,
  }))

  // Geo — raw numbers for the map (GeoMap handles its own formatting)
  const geoData = (geoRes.rows ?? [])
    .sort((a, b) => ((b.sessions as number) ?? 0) - ((a.sessions as number) ?? 0))
    .map((r) => ({
      name:           String(r.country ?? 'Unknown'),
      sessions:       (r.sessions as number) ?? 0,
      engagementRate: (r.engagementRate as number) ?? 0,
    }))

  // Session Depth Funnel — derived from existing totals, no extra API calls
  const totalSessions    = (t.sessions as number) ?? 0
  const bounceRate       = (t.bounceRate as number) ?? 0
  const convRate         = (t.sessionConversionRate as number) ?? 0
  const engagedSessions  = Math.round(totalSessions * (1 - bounceRate))
  const compareDateLabel = resolvedCompare
    ? `${fmtISODate(resolvedCompare.startDate)} – ${fmtISODate(resolvedCompare.endDate)}`
    : null

  return (
    <div className="space-y-8">
      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <KpiCard
            key={kpi.title}
            title={kpi.title}
            value={kpi.value}
            delta={kpi.delta}
            invertDelta={kpi.invertDelta}
            tooltip={kpi.tooltip}
          />
        ))}
      </div>

      {/* Sessions & Users trend */}
      <SessionsTrendChart data={trendData} compareLabel={compareDateLabel ?? undefined} />

      {/* New vs Returning */}
      <NewReturning
        rows={audienceData}
        compareRows={compareAudienceData.length > 0 ? compareAudienceData : undefined}
        returningUserCount={Math.max(0, ((t.activeUsers as number) ?? 0) - ((t.newUsers as number) ?? 0))}
      />

      {/* Traffic by Channel — tabbed: By Volume | By Conversion */}
      <ChannelTabsChart
        volumeData={channelData}
        convData={channelConvData}
        compareMap={compareChannelMap}
        compareLabel={compareDateLabel ?? undefined}
        sourceMediumMap={channelSourceMediumMap}
      />

      {/* Top Pages + Top Entry Pages — tabbed */}
      <TopPagesChart
        pages={topPages}
        entryPages={topEntryPages}
        comparePageMap={comparePageMap}
        compareEntryMap={compareEntryMap}
        compareLabel={compareDateLabel ?? undefined}
        stalePagePaths={stalePagePaths}
        staleEntryPaths={staleEntryPaths}
      />

      {/* Top Events — tabbed: All Events | Key Events */}
      {eventsData.length > 0 && <TopEvents events={eventsData} />}

      {/* Device Breakdown + Day × Hour Heatmap */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DeviceBreakdown devices={deviceData} />
        {heatmapData.length > 0 && <DayHourHeatmap data={heatmapData} />}
      </div>

      {/* Geographic Distribution */}
      {geoData.length > 0 && <GeoMap countries={geoData} />}

      <p className="text-xs text-text-muted">Live data from Google Analytics</p>
    </div>
  )
}
