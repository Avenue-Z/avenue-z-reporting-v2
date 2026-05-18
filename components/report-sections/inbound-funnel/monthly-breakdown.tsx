'use client'

import type { MonthlyContactResult } from '@/lib/hubspot/client'

const ICP_COLOR          = '#60FF80'
const MCP_COLOR          = '#60FDFF'
const UNIDENTIFIED_COLOR = 'rgba(255,255,255,0.15)'

function pct(current: number, baseline: number) {
  if (baseline === 0) return null
  return ((current - baseline) / baseline) * 100
}

function DeltaBadge({ value }: { value: number | null }) {
  if (value === null) return null
  const up = value >= 0
  return (
    <p className="mt-1 text-sm font-bold" style={{ color: up ? ICP_COLOR : '#FF4444' }}>
      {up ? '↑' : '↓'} {Math.abs(value).toFixed(1)}% vs prior period
    </p>
  )
}

function InlineTooltip({ text }: { text: string }) {
  return (
    <div className="group relative flex-shrink-0">
      <span className="flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full border border-white/20 text-[9px] font-bold leading-none text-text-muted">
        ?
      </span>
      <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-56 -translate-x-1/2 rounded-md border border-white/[0.08] bg-bg-surface px-3 py-2 text-xs leading-relaxed text-text-muted opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
        {text}
        <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-white/[0.08]" />
      </div>
    </div>
  )
}

function StatCard({ title, value, delta, tooltip }: {
  title: string
  value: number | string
  delta?: number | null
  tooltip: string
}) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-black/20 px-6 py-5">
      <div className="flex items-center gap-1.5">
        <p className="text-xs font-extrabold uppercase tracking-widest text-text-muted">{title}</p>
        <InlineTooltip text={tooltip} />
      </div>
      <p className="mt-2 text-3xl font-extrabold tabular-nums text-white">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      {delta !== undefined && <DeltaBadge value={delta ?? null} />}
    </div>
  )
}

function PacingTrackerMonthly({
  current,
  baseline,
  baselineLabel,
  daysElapsed,
  totalDays,
  monthLabel,
}: {
  current: number
  baseline: number
  baselineLabel: string
  daysElapsed: number
  totalDays: number
  monthLabel: string
}) {
  const timePct     = (daysElapsed / totalDays) * 100
  const expected    = baseline * (daysElapsed / totalDays)
  const ahead       = current >= expected
  const accentColor = ahead ? ICP_COLOR : '#FF4444'

  const contactsPct = baseline > 0 ? Math.min((current / baseline) * 100, 110) : 0
  const projected   = daysElapsed > 0 ? (current / daysElapsed) * totalDays : 0
  const projDelta   = baseline > 0 ? ((projected - baseline) / baseline) * 100 : null
  const remainingDays = totalDays - daysElapsed
  const gap = Math.round(baseline - current)
  const gapPerDay = remainingDays > 0 && !ahead ? Math.ceil(gap / remainingDays) : null

  return (
    <div className="rounded-md border border-white/[0.06] bg-black/20 px-5 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-extrabold uppercase tracking-widest text-text-muted">
          Pacing · Day {daysElapsed} of {totalDays} · {monthLabel}
        </p>
        {projDelta !== null && (
          <p className="text-xs font-bold" style={{ color: accentColor }}>
            {ahead ? '↑' : '↓'} {Math.abs(projDelta).toFixed(1)}% vs {baselineLabel}
          </p>
        )}
      </div>

      {/* Time bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[10px] text-text-muted">
          <span>Month elapsed</span>
          <span>{timePct.toFixed(0)}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
          <div className="h-full rounded-full bg-white/25" style={{ width: `${timePct}%` }} />
        </div>
      </div>

      {/* Contacts bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[10px] text-text-muted">
          <span>Contacts vs {baselineLabel} ({baseline.toLocaleString()})</span>
          <span className="font-bold" style={{ color: accentColor }}>
            {current.toLocaleString()} / {Math.round(expected).toLocaleString()} expected
          </span>
        </div>
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${contactsPct}%`, backgroundColor: accentColor }}
          />
          {/* Time marker */}
          <div
            className="absolute top-0 h-full w-px bg-white/40"
            style={{ left: `${timePct}%` }}
          />
        </div>
      </div>

      <p className="text-[10px] text-text-muted">
        On pace for <span className="font-bold text-white">{Math.round(projected).toLocaleString()}</span> contacts this month
        {gapPerDay !== null && (
          <span> — need <span className="font-bold text-white">{gapPerDay}</span> per day to hit {baselineLabel}</span>
        )}
      </p>
    </div>
  )
}

interface MonthlyBreakdownProps {
  data: MonthlyContactResult
}

export function MonthlyBreakdown({ data }: MonthlyBreakdownProps) {
  const { months, currentMonthTotal, currentMonthLabel, prevMonthTotal, prevYearMonthTotal, prevQuarterMonthlyAvg, prevQuarterLabel, daysElapsed, totalDaysInMonth } = data
  const maxTotal = Math.max(...months.map((d) => d.total), 1)

  if (months.length === 0) return null

  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-bold text-white">Monthly Pacing</h3>
        <InlineTooltip text="Current-month contact creation vs. prior month, prior year same month, and the previous quarter's monthly average. Pacing tracker updates daily." />
      </div>

      {/* Pacing tracker */}
      <PacingTrackerMonthly
        current={currentMonthTotal}
        baseline={prevMonthTotal}
        baselineLabel="prev month"
        daysElapsed={daysElapsed}
        totalDays={totalDaysInMonth}
        monthLabel={currentMonthLabel}
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          title="Current Month"
          value={currentMonthTotal}
          tooltip={`Inbound contacts created so far in ${currentMonthLabel}.`}
        />
        <StatCard
          title="Previous Month"
          value={prevMonthTotal}
          delta={pct(currentMonthTotal, prevMonthTotal)}
          tooltip="Inbound contacts created in the previous calendar month. Delta shows how the current month compares."
        />
        <StatCard
          title="Prior Year Month"
          value={prevYearMonthTotal}
          delta={pct(currentMonthTotal, prevYearMonthTotal)}
          tooltip={`Inbound contacts created during the same calendar month one year ago. Delta shows year-over-year change.`}
        />
        <StatCard
          title={`${prevQuarterLabel} Avg`}
          value={prevQuarterMonthlyAvg.toFixed(1)}
          delta={pct(currentMonthTotal, prevQuarterMonthlyAvg)}
          tooltip={`Average inbound contacts per month in ${prevQuarterLabel}. Delta shows how the current month tracks against that baseline.`}
        />
      </div>

      {/* Monthly bars */}
      <div className="space-y-3">
        {months.map((item) => {
          const barPct  = (item.total / maxTotal) * 100
          const icpPct  = item.total > 0 ? (item.icp  / item.total) * 100 : 0
          const mcpPct  = item.total > 0 ? (item.mcp  / item.total) * 100 : 0
          const unidPct = item.total > 0 ? (item.unidentified / item.total) * 100 : 0

          return (
            <div key={item.monthKey} className="flex items-center gap-3">
              <div className="w-16 shrink-0 text-right text-xs text-text-muted">{item.month}</div>

              <div className="relative h-6 flex-1 overflow-hidden rounded-sm bg-white/[0.04]">
                <div
                  className="absolute inset-y-0 left-0 flex h-full overflow-hidden rounded-sm"
                  style={{ width: `${barPct}%` }}
                >
                  {icpPct  > 0 && <div style={{ width: `${icpPct}%`,  backgroundColor: ICP_COLOR          }} title={`ICP: ${item.icp}`} />}
                  {mcpPct  > 0 && <div style={{ width: `${mcpPct}%`,  backgroundColor: MCP_COLOR          }} title={`MCP: ${item.mcp}`} />}
                  {unidPct > 0 && <div style={{ width: `${unidPct}%`, backgroundColor: UNIDENTIFIED_COLOR }} title={`Not Identified: ${item.unidentified}`} />}
                </div>
              </div>

              <div className="w-32 shrink-0 text-xs">
                <span className="tabular-nums text-white">{item.total.toLocaleString()}</span>
                {item.total > 0 && (
                  <span className="ml-1.5 text-[10px]">
                    {item.icp  > 0 && <span style={{ color: ICP_COLOR }}>{item.icp}I </span>}
                    {item.mcp  > 0 && <span style={{ color: MCP_COLOR }}>{item.mcp}M </span>}
                    {item.unidentified > 0 && <span className="text-text-muted">{item.unidentified}—</span>}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-5">
        {[
          { label: 'ICP',            color: ICP_COLOR          },
          { label: 'MCP',            color: MCP_COLOR          },
          { label: 'Not Identified', color: UNIDENTIFIED_COLOR },
        ].map(({ label, color }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
            <span className="text-[11px] text-text-muted">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
