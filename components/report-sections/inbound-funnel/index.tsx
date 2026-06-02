import { Suspense } from 'react'
import {
  getWeeklyContactStats,
  getMonthlyContactBreakdown,
  getQuarterlyContactStats,
  getYearlyContactStats,
  getFormSubmissionCounts,
} from '@/lib/hubspot/client'
import { parseDateRange } from '@/lib/ga4/client'
import { FormTrendChart }      from './form-trend-chart'
import { FormPerformanceTable } from './form-performance-table'
import { WeeklyPerformance }   from './weekly-performance'
import { MonthlyBreakdown }    from './monthly-breakdown'
import { QuarterlyPacing }     from './quarterly-pacing'
import { YearlyPerformance }   from './yearly-performance'
import { KpisSection }              from './kpis-section'
import { TrendSection }             from './trend-section'
import { FunnelAndSourceSection }   from './funnel-source-section'
import { KpisSkeleton, TrendSkeleton, FunnelAndSourceSkeleton } from './_skeletons'
import { fmtISODate } from './_utils'

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
//
// Three independently-Suspense'd sections so each renders as its data lands
// instead of the whole report waiting on the slowest fetch. Each section
// fetches its own data sequentially within itself, which keeps the parallel
// HubSpot calls across sections at ~3 in flight at any moment (well within
// the 4 req/s ceiling).

function OverviewView({
  clientSlug,
  dateRange,
  compareRange,
}: {
  clientSlug:    string
  dateRange:     string
  compareRange:  string | null
}) {
  return (
    <div className="space-y-8">
      <Suspense fallback={<KpisSkeleton />}>
        <KpisSection clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
      </Suspense>

      <Suspense fallback={<TrendSkeleton />}>
        <TrendSection clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
      </Suspense>

      <Suspense fallback={<FunnelAndSourceSkeleton />}>
        <FunnelAndSourceSection clientSlug={clientSlug} dateRange={dateRange} />
      </Suspense>
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
