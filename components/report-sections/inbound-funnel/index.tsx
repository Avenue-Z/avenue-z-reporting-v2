import {
  getContactBreakdown,
  getWeeklyContactStats,
  getMonthlyContactBreakdown,
  getQuarterlyContactStats,
  getYearlyContactStats,
  getDailyContactTrend,
  getContactStatsForRange,
  getFormSubmissionCounts,
  getLifecycleStageCounts,
} from '@/lib/hubspot/client'
import { parseDateRange, deriveCompareRange } from '@/lib/ga4/client'
import { KpiCard } from '@/components/charts/kpi-card'
import { ContactsTrendChart } from './ytd-contact-chart'
import { LifecycleFunnel }    from './lifecycle-funnel'
import { LeadQualityMix }     from './quality-mix'
import { SourceQualityTable } from './source-quality-table'
import { FormTrendChart }      from './form-trend-chart'
import { FormPerformanceTable } from './form-performance-table'
import { WeeklyPerformance }   from './weekly-performance'
import { MonthlyBreakdown }    from './monthly-breakdown'
import { QuarterlyPacing }     from './quarterly-pacing'
import { YearlyPerformance }   from './yearly-performance'

// ── Helpers ──────────────────────────────────────────────────────────────────

function rangeDelta(current: number, prior: number | null | undefined): number | undefined {
  if (prior == null || prior === 0) return undefined
  return ((current - prior) / prior) * 100
}

function fmtISODate(d: string): string {
  if (!d) return d
  const [year, month, day] = d.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface InboundFunnelProps {
  clientSlug:    string
  dateRange?:    string
  compareRange?: string | null
  subsection?:   string
}

// ── Router ────────────────────────────────────────────────────────────────────

export async function InboundFunnelReport({
  clientSlug,
  dateRange    = 'this_year',
  compareRange = null,
  subsection,
}: InboundFunnelProps) {
  if (subsection === 'pacing') {
    return <PacingView clientSlug={clientSlug} />
  }
  if (subsection === 'forms') {
    return <FormsView clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
  }
  return <OverviewView clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
}

// ── Overview ──────────────────────────────────────────────────────────────────

async function OverviewView({
  clientSlug,
  dateRange,
  compareRange,
}: {
  clientSlug:    string
  dateRange:     string
  compareRange:  string | null
}) {
  const main    = parseDateRange(dateRange)
  const compare = deriveCompareRange(dateRange, compareRange)

  // Sequential — HubSpot search API is rate-limited to 4 req/s
  const rangeStats   = await getContactStatsForRange(clientSlug, main.startDate, main.endDate)
  const compareStats = compare
    ? await getContactStatsForRange(clientSlug, compare.startDate, compare.endDate)
    : null

  const mainTrend    = await getDailyContactTrend(clientSlug, main.startDate, main.endDate)
  const compareTrend = compare
    ? await getDailyContactTrend(clientSlug, compare.startDate, compare.endDate)
    : null

  const lifecycle  = await getLifecycleStageCounts(clientSlug, main.startDate, main.endDate)
  const breakdown  = await getContactBreakdown(clientSlug)

  // Zip main + compare daily series into TrendRow[]
  const chartData = mainTrend.map((row, i) => {
    const prev = compareTrend?.[i]
    return {
      date:  row.date,
      total: row.total,
      icp:   row.icp,
      mcp:   row.mcp,
      ...(prev && {
        prevDate:  prev.date,
        prevTotal: prev.total,
        prevIcp:   prev.icp,
        prevMcp:   prev.mcp,
      }),
    }
  })

  const compareDateLabel = compare
    ? `${fmtISODate(compare.startDate)} – ${fmtISODate(compare.endDate)}`
    : undefined

  const deltaLabel    = compareDateLabel
  const fmt           = (n: number | null) => n === null ? '—' : n.toLocaleString()
  const unidentified  = rangeStats.online - rangeStats.icp - rangeStats.mcp

  return (
    <div className="space-y-8">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        <KpiCard
          title="Online Contacts"
          value={fmt(rangeStats.online)}
          delta={rangeDelta(rangeStats.online, compareStats?.online)}
          deltaLabel={deltaLabel}
          subValue={compareStats != null ? `${compareStats.online.toLocaleString()} prior` : undefined}
          tooltip="Inbound contacts created from online sources in the selected date range. Excludes Offline contacts (events, cold outreach, etc.)."
        />
        <KpiCard
          title="ICP Contacts"
          value={fmt(rangeStats.icp)}
          delta={rangeDelta(rangeStats.icp, compareStats?.icp)}
          deltaLabel={deltaLabel}
          subValue={compareStats != null ? `${compareStats.icp.toLocaleString()} prior` : undefined}
          tooltip="Contacts in the selected date range with their Profile property set to ICP (Ideal Customer Profile)."
        />
        <KpiCard
          title="MCP Contacts"
          value={fmt(rangeStats.mcp)}
          delta={rangeDelta(rangeStats.mcp, compareStats?.mcp)}
          deltaLabel={deltaLabel}
          subValue={compareStats != null ? `${compareStats.mcp.toLocaleString()} prior` : undefined}
          tooltip="Contacts in the selected date range with their Profile property set to MCP (Most Compatible Profile)."
        />
        <KpiCard
          title="Offline Contacts"
          value={fmt(rangeStats.offline)}
          delta={rangeDelta(rangeStats.offline ?? 0, compareStats?.offline)}
          deltaLabel={deltaLabel}
          subValue={compareStats?.offline != null ? `${compareStats.offline.toLocaleString()} prior` : undefined}
          tooltip="Contacts in the selected date range whose original source is Offline — events, trade shows, cold outreach, and other non-digital channels."
        />
      </div>

      {/* Contacts trend chart */}
      {chartData.length > 0 && (
        <ContactsTrendChart data={chartData} compareLabel={compareDateLabel} />
      )}

      {/* Lifecycle funnel */}
      <LifecycleFunnel stages={lifecycle} />

      {/* Lead quality mix */}
      <LeadQualityMix
        icp={rangeStats.icp}
        mcp={rangeStats.mcp}
        unidentified={unidentified}
      />

      {/* Source × quality table */}
      {breakdown.length > 0 && (
        <SourceQualityTable data={breakdown} />
      )}

      <p className="text-xs text-text-muted">Live data from HubSpot CRM</p>
    </div>
  )
}

// ── Forms ─────────────────────────────────────────────────────────────────────

async function FormsView({
  clientSlug,
  dateRange,
}: {
  clientSlug:   string
  dateRange:    string
  compareRange: string | null
}) {
  const main = parseDateRange(dateRange)
  const rows = await getFormSubmissionCounts(clientSlug, main.startDate, main.endDate)

  const totalSubmissions = rows.reduce((s, r) => s + r.total, 0)
  const totalIcp         = rows.reduce((s, r) => s + r.icp, 0)
  const totalContacts    = rows.reduce((s, r) => s + r.icp + r.mcp + r.unidentified, 0)
  const overallIcpRate   = totalContacts > 0 ? (totalIcp / totalContacts) * 100 : null

  const ICP_COLOR = '#60FF80'
  const MCP_COLOR = '#60FDFF'

  return (
    <div className="space-y-6">
      {/* Summary strip */}
      <div className="flex flex-wrap items-center gap-6">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-text-muted">Submissions</p>
          <p className="mt-0.5 text-2xl font-extrabold tabular-nums text-white">{totalSubmissions.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-text-muted">Contacts Attributed</p>
          <p className="mt-0.5 text-2xl font-extrabold tabular-nums text-white">{totalContacts.toLocaleString()}</p>
        </div>
        {overallIcpRate !== null && (
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-widest text-text-muted">ICP Rate</p>
            <p className="mt-0.5 text-2xl font-extrabold tabular-nums" style={{ color: ICP_COLOR }}>
              {overallIcpRate.toFixed(1)}%
            </p>
          </div>
        )}
        <p className="ml-auto text-xs text-text-muted">
          {fmtISODate(main.startDate)} – {fmtISODate(main.endDate)}
        </p>
      </div>

      {/* Form table */}
      <div className="rounded-lg border border-white/[0.06] bg-bg-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="px-5 py-3 text-left   text-[11px] font-extrabold uppercase tracking-widest text-text-muted">Form</th>
              <th className="px-5 py-3 text-right  text-[11px] font-extrabold uppercase tracking-widest text-text-muted">Submissions</th>
              <th className="px-5 py-3 text-right  text-[11px] font-extrabold uppercase tracking-widest text-text-muted">Contacts</th>
              <th className="px-5 py-3 text-center text-[11px] font-extrabold uppercase tracking-widest text-text-muted">ICP / MCP</th>
              <th className="px-5 py-3 text-right  text-[11px] font-extrabold uppercase tracking-widest text-text-muted">ICP Rate</th>
              <th className="px-5 py-3 text-right  text-[11px] font-extrabold uppercase tracking-widest text-text-muted">Customers</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-xs text-text-muted">
                  No form submissions found for this date range.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const contacts = row.icp + row.mcp + row.unidentified
                const icpRate  = contacts > 0 ? (row.icp / contacts) * 100 : null
                return (
                  <tr key={row.formId} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]">
                    <td className="px-5 py-3 text-white">{row.formName}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-white">{row.total.toLocaleString()}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-text-muted">{contacts > 0 ? contacts.toLocaleString() : '—'}</td>
                    <td className="px-5 py-3 text-center text-xs tabular-nums">
                      {contacts > 0 ? (
                        <span>
                          <span style={{ color: ICP_COLOR }}>{row.icp}</span>
                          <span className="mx-1 text-white/20">/</span>
                          <span style={{ color: MCP_COLOR }}>{row.mcp}</span>
                        </span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-xs font-bold">
                      {icpRate !== null ? (
                        <span style={{
                          color: icpRate >= 40 ? ICP_COLOR
                               : icpRate >= 20 ? '#FFD060'
                               : 'rgba(255,255,255,0.4)',
                        }}>
                          {icpRate.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-xs font-bold">
                      {row.customers > 0
                        ? <span className="text-white">{row.customers}</span>
                        : <span className="text-text-muted">—</span>
                      }
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-text-muted">
        Submissions from HubSpot Forms API · ICP/MCP from contact first-touch attribution
      </p>
    </div>
  )
}

// ── Pacing ────────────────────────────────────────────────────────────────────

async function PacingView({ clientSlug }: { clientSlug: string }) {
  // Sequential — HubSpot rate limits
  const weekly    = await getWeeklyContactStats(clientSlug)
  const monthly   = await getMonthlyContactBreakdown(clientSlug)
  const quarterly = await getQuarterlyContactStats(clientSlug)
  const yearly    = await getYearlyContactStats(clientSlug)

  return (
    <div className="space-y-8">
      <WeeklyPerformance stats={weekly} />
      {monthly.months.length > 0 && <MonthlyBreakdown data={monthly} />}
      <QuarterlyPacing data={quarterly} />
      <YearlyPerformance stats={yearly} months={monthly.months} />
      <p className="text-xs text-text-muted">Live data from HubSpot CRM</p>
    </div>
  )
}
