'use client'

import type { WeeklyContactStats } from '@/lib/hubspot/client'

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
    <p
      className="mt-1 text-sm font-bold"
      style={{ color: up ? ICP_COLOR : '#FF4444' }}
    >
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

interface StatCardProps {
  title: string
  value: number | string
  delta?: number | null
  tooltip: string
}

function StatCard({ title, value, delta, tooltip }: StatCardProps) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-black/20 px-6 py-5">
      <div className="flex items-center gap-1.5">
        <p className="text-xs font-extrabold uppercase tracking-widest text-text-muted">
          {title}
        </p>
        <InlineTooltip text={tooltip} />
      </div>
      <p className="mt-2 text-3xl font-extrabold tabular-nums text-white">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      {delta !== undefined && <DeltaBadge value={delta ?? null} />}
    </div>
  )
}

function PacingTrackerWeekly({
  current,
  baseline,
  daysElapsed,
  workingDays,
  baselineLabel,
}: {
  current: number
  baseline: number
  daysElapsed: number
  workingDays: number
  baselineLabel: string
}) {
  const timePct   = (daysElapsed / workingDays) * 100
  const expected  = baseline * (daysElapsed / workingDays)
  const ahead     = current >= expected
  const accentColor = ahead ? ICP_COLOR : '#FF4444'

  // Contacts bar: current as % of full-week baseline (capped at 110% for display)
  const contactsPct = baseline > 0 ? Math.min((current / baseline) * 100, 110) : 0

  const projected = daysElapsed > 0 ? (current / daysElapsed) * workingDays : 0
  const projDelta = baseline > 0 ? ((projected - baseline) / baseline) * 100 : null
  const remainingDays = workingDays - daysElapsed
  const gap = Math.round(baseline - current)
  const gapPerDay = remainingDays > 0 && !ahead ? Math.ceil(gap / remainingDays) : null

  return (
    <div className="rounded-md border border-white/[0.06] bg-black/20 px-5 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-extrabold uppercase tracking-widest text-text-muted">
          Pacing · Day {daysElapsed} of {workingDays}
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
          <span>Week elapsed</span>
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
            {current} / {expected.toFixed(1)} expected
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
        On pace for <span className="font-bold text-white">{Math.round(projected)}</span> contacts this week
        {gapPerDay !== null && (
          <span> — need <span className="font-bold text-white">{gapPerDay}</span> per day to hit {baselineLabel}</span>
        )}
      </p>
    </div>
  )
}

interface WeeklyPerformanceProps {
  stats: WeeklyContactStats
}

export function WeeklyPerformance({ stats }: WeeklyPerformanceProps) {
  const cur = stats.currentWeekTotal
  const avg = stats.prevQuarterWeeklyAvg

  const maxDay = Math.max(...stats.days.map((d) => d.total), 1)

  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-bold text-white">Weekly Pacing</h3>
        <InlineTooltip text="Current-week contact creation vs. prior week, prior year same week, and the previous quarter's weekly average. Pacing tracker updates daily." />
      </div>

      {/* Pacing tracker */}
      <PacingTrackerWeekly
        current={cur}
        baseline={stats.prevWeekTotal}
        daysElapsed={stats.daysElapsed}
        workingDays={stats.workingDaysInWeek}
        baselineLabel="prev week"
      />

      {/* 4-card KPI grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          title="Current Week"
          value={cur}
          tooltip={`Inbound contacts created Mon–Fri of the week of ${stats.weekStart} – ${stats.weekEnd}.`}
        />
        <StatCard
          title="Previous Week"
          value={stats.prevWeekTotal}
          delta={pct(cur, stats.prevWeekTotal)}
          tooltip="Inbound contacts created Mon–Fri of last week. Delta shows how the current week compares."
        />
        <StatCard
          title="Prior Year Week"
          value={stats.prevYearWeekTotal}
          delta={pct(cur, stats.prevYearWeekTotal)}
          tooltip="Inbound contacts created during the same calendar week one year ago. Delta shows year-over-year change."
        />
        <StatCard
          title={`${stats.prevQuarterLabel} Avg`}
          value={avg.toFixed(1)}
          delta={pct(cur, avg)}
          tooltip={`Average inbound contacts per working week in ${stats.prevQuarterLabel}. Delta shows how this week tracks against that baseline.`}
        />
      </div>

      {/* Daily bars */}
      <div>
        <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-text-muted">
          Daily Breakdown
        </p>
        <div className="space-y-2.5">
          {stats.days.map((day) => {
            const barPct  = (day.total / maxDay) * 100
            const icpPct  = day.total > 0 ? (day.icp  / day.total) * 100 : 0
            const mcpPct  = day.total > 0 ? (day.mcp  / day.total) * 100 : 0
            const unidPct = day.total > 0 ? (day.unidentified / day.total) * 100 : 0

            return (
              <div key={day.label} className="flex items-center gap-3">
                <div className="w-10 shrink-0 text-right text-xs text-text-muted">{day.label}</div>
                <div className="w-14 shrink-0 text-[11px] text-text-muted">{day.date}</div>

                <div className="relative h-6 flex-1 overflow-hidden rounded-sm bg-white/[0.04]">
                  <div
                    className="absolute inset-y-0 left-0 flex h-full overflow-hidden rounded-sm"
                    style={{ width: `${barPct}%` }}
                  >
                    {icpPct > 0  && <div style={{ width: `${icpPct}%`,  backgroundColor: ICP_COLOR          }} title={`ICP: ${day.icp}`} />}
                    {mcpPct > 0  && <div style={{ width: `${mcpPct}%`,  backgroundColor: MCP_COLOR          }} title={`MCP: ${day.mcp}`} />}
                    {unidPct > 0 && <div style={{ width: `${unidPct}%`, backgroundColor: UNIDENTIFIED_COLOR }} title={`Not Identified: ${day.unidentified}`} />}
                  </div>
                </div>

                <div className="w-24 shrink-0 text-xs">
                  <span className="tabular-nums text-white">{day.total}</span>
                  {day.total > 0 && (
                    <span className="ml-1.5 text-[10px]">
                      {day.icp  > 0 && <span style={{ color: ICP_COLOR }}>{day.icp}I </span>}
                      {day.mcp  > 0 && <span style={{ color: MCP_COLOR }}>{day.mcp}M </span>}
                      {day.unidentified > 0 && <span className="text-text-muted">{day.unidentified}—</span>}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap items-center gap-5">
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
    </div>
  )
}
