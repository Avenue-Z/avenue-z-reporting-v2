import { ga4Query } from '@/lib/ga4/client'
import { CHART_COLORS } from '@/lib/constants'
import { ConversionPageTables } from './conversion-journey-tables'

const NOISE_EVENTS = new Set([
  'session_start', 'first_visit', 'user_engagement', 'scroll',
  'page_view', 'click', 'file_download', 'video_start',
  'video_progress', 'video_complete',
])

interface ConversionJourneyProps {
  clientSlug: string
  dateRange?: string
}

function fmtPct(n: number, decimals = 1) {
  return `${(n * 100).toFixed(decimals)}%`
}

function fmtNum(n: number) {
  return n.toLocaleString()
}

function Tooltip({ text }: { text: string }) {
  return (
    <div className="group relative flex-shrink-0">
      <span className="flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full border border-white/20 text-[9px] font-bold leading-none text-text-muted">
        ?
      </span>
      <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-72 -translate-x-1/2 rounded-md border border-white/[0.08] bg-bg-surface px-3 py-2 text-xs leading-relaxed text-text-muted opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
        {text}
        <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-white/[0.08]" />
      </div>
    </div>
  )
}

export async function ConversionJourneyReport({
  clientSlug,
  dateRange = 'last_30_days',
}: ConversionJourneyProps) {

  const [
    overallRes,
    landingRes,
    pagesRes,
    keyEventsRes,
    landing90Res,
    pages90Res,
  ] = await Promise.all([
    // Overall summary metrics
    ga4Query({
      clientSlug,
      dateRange,
      metrics: ['sessions', 'engagedSessions', 'keyEvents', 'sessionConversionRate'],
    }),
    // Landing pages — where converting journeys start (large pool for Rising)
    ga4Query({
      clientSlug,
      dateRange,
      metrics: ['sessions', 'engagedSessions', 'keyEvents', 'sessionConversionRate'],
      dimensions: ['landingPage'],
      limit: 25,
    }),
    // All pages in converting sessions (large pool for Rising)
    ga4Query({
      clientSlug,
      dateRange,
      metrics: ['sessions', 'keyEvents', 'sessionConversionRate'],
      dimensions: ['pagePath'],
      limit: 30,
    }),
    // Key events by name
    ga4Query({
      clientSlug,
      dateRange,
      metrics: ['keyEvents'],
      dimensions: ['eventName'],
      limit: 20,
    }),
    // 90-day landing pages — used to identify evergreen entry points
    ga4Query({
      clientSlug,
      dateRange: 'last_90_days',
      metrics: ['keyEvents'],
      dimensions: ['landingPage'],
      limit: 10,
    }),
    // 90-day converting pages — used to identify evergreen converting pages
    ga4Query({
      clientSlug,
      dateRange: 'last_90_days',
      metrics: ['keyEvents'],
      dimensions: ['pagePath'],
      limit: 10,
    }),
  ])

  // ── Overall summary ──────────────────────────────────────────────────────
  const overall         = overallRes.rows?.[0] ?? {}
  const totalSessions   = (overall.sessions             as number) ?? 0
  const totalEngaged    = (overall.engagedSessions      as number) ?? 0
  const totalKeyEvents  = (overall.keyEvents            as number) ?? 0
  const overallConvRate = (overall.sessionConversionRate as number) ?? 0
  const engagedRate     = totalSessions > 0 ? totalEngaged / totalSessions : 0

  // ── Landing pages ────────────────────────────────────────────────────────
  const landingRows = (landingRes.rows ?? [])
    .map((r) => ({
      page:      String(r.landingPage ?? ''),
      sessions:  (r.sessions              as number) ?? 0,
      engaged:   (r.engagedSessions       as number) ?? 0,
      keyEvents: (r.keyEvents             as number) ?? 0,
      convRate:  (r.sessionConversionRate as number) ?? 0,
    }))
    .filter((r) => r.sessions >= 5)
    .sort((a, b) => b.keyEvents - a.keyEvents)

  // ── Converting pages ─────────────────────────────────────────────────────
  const convertingPages = (pagesRes.rows ?? [])
    .map((r) => ({
      page:      String(r.pagePath ?? ''),
      sessions:  (r.sessions              as number) ?? 0,
      keyEvents: (r.keyEvents             as number) ?? 0,
      convRate:  (r.sessionConversionRate as number) ?? 0,
    }))
    .filter((r) => r.sessions >= 10 && r.keyEvents > 0)
    .sort((a, b) => b.keyEvents - a.keyEvents)

  // ── 90-day stale sets ─────────────────────────────────────────────────────
  // Top-10 pages by keyEvents over the last 90 days = "evergreen" = hidden when Rising is on
  const staleLandingPaths: string[] = (landing90Res.rows ?? [])
    .sort((a, b) => ((b.keyEvents as number) ?? 0) - ((a.keyEvents as number) ?? 0))
    .slice(0, 10)
    .map((r) => String(r.landingPage ?? ''))

  const staleConvertingPaths: string[] = (pages90Res.rows ?? [])
    .sort((a, b) => ((b.keyEvents as number) ?? 0) - ((a.keyEvents as number) ?? 0))
    .slice(0, 10)
    .map((r) => String(r.pagePath ?? ''))

  // ── Key event breakdown ──────────────────────────────────────────────────
  const keyEventRows = (keyEventsRes.rows ?? [])
    .filter((r) => {
      const name = String(r.eventName ?? '')
      return !NOISE_EVENTS.has(name) && ((r.keyEvents as number) ?? 0) > 0
    })
    .sort((a, b) => ((b.keyEvents as number) ?? 0) - ((a.keyEvents as number) ?? 0))
    .slice(0, 8)

  const maxKeyEventCount = (keyEventRows[0]?.keyEvents as number) ?? 1

  return (
    <div className="space-y-5">

      {/* ── Summary KPIs ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-4">
        {[
          {
            label: 'Total Sessions',
            value: fmtNum(totalSessions),
            sub:   'in period',
            color: CHART_COLORS.ga4,
          },
          {
            label: 'Engagement Rate',
            value: fmtPct(engagedRate),
            sub:   'of sessions engaged',
            color: CHART_COLORS.ga4,
          },
          {
            label: 'Conversion Rate',
            value: fmtPct(overallConvRate),
            sub:   'sessions with key event',
            color: CHART_COLORS.positive,
          },
          {
            label: 'Total Key Events',
            value: fmtNum(totalKeyEvents),
            sub:   'conversion events fired',
            color: CHART_COLORS.positive,
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-lg border border-white/[0.06] bg-bg-surface px-5 py-4"
          >
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              {kpi.label}
            </p>
            <p className="tabular-nums text-2xl font-bold" style={{ color: kpi.color }}>
              {kpi.value}
            </p>
            <p className="mt-0.5 text-[11px] text-text-muted">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Page tables with Rising toggles (client component) ────────────── */}
      <ConversionPageTables
        landingRows={landingRows}
        convertingPages={convertingPages}
        staleLandingPaths={staleLandingPaths}
        staleConvertingPaths={staleConvertingPaths}
        overallConvRate={overallConvRate}
      />

      {/* ── Key Event Breakdown ──────────────────────────────────────────── */}
      {keyEventRows.length > 0 && (
        <div className="rounded-lg border border-white/[0.06] bg-bg-surface px-6 py-5">
          <div className="mb-5 flex items-center gap-2">
            <h3 className="text-lg font-bold text-white">Key Event Breakdown</h3>
            <Tooltip text="Which specific conversion events fired most often. Events must be marked as Key Events in your GA4 property settings to appear here." />
          </div>

          <div className="mb-2 flex items-center gap-4 px-2">
            <div className="w-7 shrink-0" />
            <div className="min-w-0 flex-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">Event</div>
            <div className="w-32 shrink-0" />
            <div className="w-20 shrink-0 text-right text-[10px] font-bold uppercase tracking-wider text-text-muted">Key Events</div>
            <div className="w-20 shrink-0 text-right text-[10px] font-bold uppercase tracking-wider text-text-muted">% of Total</div>
          </div>

          <div className="space-y-1.5">
            {keyEventRows.map((row, i) => {
              const count          = (row.keyEvents as number) ?? 0
              const barW           = (count / maxKeyEventCount) * 100
              const pctOfKeyEvents = totalKeyEvents > 0 ? count / totalKeyEvents : 0

              return (
                <div key={String(row.eventName)} className="flex items-center gap-4 rounded-md px-2 py-1.5">
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold"
                    style={{
                      backgroundColor: i < 3 ? CHART_COLORS.positive : 'rgba(255,255,255,0.1)',
                      color:           i < 3 ? '#000'                 : 'rgba(255,255,255,0.4)',
                    }}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="truncate font-mono text-sm text-white/80">{String(row.eventName)}</span>
                  </div>
                  <div className="relative h-1.5 w-32 shrink-0 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${barW}%`, backgroundColor: CHART_COLORS.positive, opacity: 0.8 }}
                    />
                  </div>
                  <span className="w-20 shrink-0 text-right tabular-nums text-sm font-semibold text-white">
                    {fmtNum(count)}
                  </span>
                  <span className="w-20 shrink-0 text-right tabular-nums text-xs text-text-muted">
                    {fmtPct(pctOfKeyEvents)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Empty state — no key events configured */}
      {keyEventRows.length === 0 && convertingPages.length === 0 && (
        <div className="rounded-lg border border-white/[0.06] bg-bg-surface px-6 py-12 text-center">
          <p className="text-sm italic text-text-muted/60">
            No key events recorded in this period. Mark events as Key Events in your GA4 property settings to unlock the full conversion journey view.
          </p>
        </div>
      )}

    </div>
  )
}
