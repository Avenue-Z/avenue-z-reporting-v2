'use client'
// 02 · Change over time (spec §5.4, Appendix A.1): a strip of six KPI tiles (value, delta vs the previous snapshot,
// sparkline) and one trend chart for the KPI picked in the strip, on its own axis, with the selected and previous
// snapshots marked. A month without the data is a gap, never a zero; a delta is "—" when either month lacks it.
import { useState } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useExportMode } from '@/components/export/export-mode'
import { deltaTone, KPI_DEFS, kpiDelta, kpiValue, type KpiDef, type KpiKey, type ViewMetrics } from '@/lib/technical-audit/kpis'
import type { SeriesPoint } from '@/lib/technical-audit/view'
import { fmtDate, fmtDelta, fmtKpi, TONE_COLOR } from './format'

const LINE = '#60FDFF'
const SPARK_W = 100
const SPARK_H = 28

/** An SVG path through the non-null points, restarting after each gap so a missing month is never drawn as a line. */
export function sparkPath(values: (number | null)[], w = SPARK_W, h = SPARK_H): string {
  const present = values.filter((v): v is number => v !== null)
  if (present.length === 0) return ''
  const min = Math.min(...present)
  const span = Math.max(...present) - min || 1
  const step = values.length > 1 ? w / (values.length - 1) : 0
  let d = ''
  let pen = false
  values.forEach((v, i) => {
    if (v === null) { pen = false; return }
    const x = (i * step).toFixed(1)
    const y = (h - 2 - ((v - min) / span) * (h - 4)).toFixed(1)
    d += `${pen ? 'L' : 'M'} ${x} ${y} `
    pen = true
  })
  return d.trim()
}

function Sparkline({ points }: { points: SeriesPoint[] }) {
  const d = sparkPath(points.map((p) => p.value))
  const lone = points.length === 1 && points[0].value !== null
  return (
    <svg viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} preserveAspectRatio="none" className="h-7 w-full" aria-hidden>
      {d && <path d={d} fill="none" stroke={LINE} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
      {lone && <circle cx={SPARK_W / 2} cy={SPARK_H / 2} r={2} fill={LINE} />}
    </svg>
  )
}

function KpiTile({ def, cur, prev, points, active, onSelect }: {
  def: KpiDef; cur: number | null; prev: number | null; points: SeriesPoint[]; active: boolean; onSelect: () => void
}) {
  const d = kpiDelta(cur, prev)
  const tone = deltaTone(def.key, d)
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={`flex flex-col gap-1 rounded-2xl border bg-bg-surface p-4 text-left ${active ? 'border-[#60FDFF]' : 'border-white/[0.06]'}`}
    >
      <span className="text-xs text-text-muted">{def.label}</span>
      <span className="text-xl font-extrabold text-white">{fmtKpi(def.unit, cur)}</span>
      <span className="text-xs font-bold" style={{ color: tone ? TONE_COLOR[tone] : '#8A8A8A' }}>
        {fmtDelta(def.unit, d)}
      </span>
      <Sparkline points={points} />
    </button>
  )
}

function TrendChart({ def, points, selectedDate, previousDate }: { def: KpiDef; points: SeriesPoint[]; selectedDate: string; previousDate: string | null }) {
  const exportMode = useExportMode()
  const dates = new Set(points.map((p) => p.date))
  const bounded = def.unit === 'pct' || def.key === 'health'
  return (
    <div className="h-72 w-full" role="img" aria-label={`${def.label} over time`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 16, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={(d: string) => fmtDate(d)} tick={{ fill: '#8A8A8A', fontSize: 11 }} stroke="rgba(255,255,255,0.1)" />
          <YAxis domain={bounded ? [0, 100] : ['auto', 'auto']} tick={{ fill: '#8A8A8A', fontSize: 11 }} stroke="rgba(255,255,255,0.1)" width={56}
            tickFormatter={(v: number) => fmtKpi(def.unit, v)} />
          {!exportMode && (
            <Tooltip
              contentStyle={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12 }}
              labelFormatter={(d) => fmtDate(String(d))}
              formatter={(v) => [fmtKpi(def.unit, typeof v === 'number' ? v : null), def.label]}
            />
          )}
          {previousDate && dates.has(previousDate) && (
            <ReferenceLine x={previousDate} stroke="#8A8A8A" strokeDasharray="4 4" label={{ value: 'Previous', fill: '#8A8A8A', fontSize: 11, position: 'top' }} />
          )}
          {dates.has(selectedDate) && (
            <ReferenceLine x={selectedDate} stroke="#FFFFFF" label={{ value: 'Selected', fill: '#FFFFFF', fontSize: 11, position: 'top' }} />
          )}
          <Line type="monotone" dataKey="value" name={def.label} stroke={LINE} strokeWidth={2} dot={{ r: 3, fill: LINE }}
            connectNulls={false} {...(exportMode ? { isAnimationActive: false } : {})} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function ChangeOverTime({ series, metrics, prevMetrics, selectedDate, previousDate }: {
  series: Record<KpiKey, SeriesPoint[]>
  metrics: ViewMetrics | null
  prevMetrics: ViewMetrics | null
  selectedDate: string
  previousDate: string | null
}) {
  const exportMode = useExportMode()
  const [active, setActive] = useState<KpiKey>('health')
  const def = KPI_DEFS.find((d) => d.key === active) ?? KPI_DEFS[0]
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {KPI_DEFS.map((d) => (
          <KpiTile key={d.key} def={d} cur={kpiValue(d.key, metrics)} prev={kpiValue(d.key, prevMetrics)}
            points={series[d.key]} active={d.key === active} onSelect={() => setActive(d.key)} />
        ))}
      </div>
      <div className="rounded-2xl border border-white/[0.06] bg-bg-surface p-6">
        <h3 className="text-sm font-bold text-white">{def.label}</h3>
        {!exportMode && <p className="mt-0.5 text-xs text-text-muted">Pick a KPI above to chart it.</p>}
        <TrendChart def={def} points={series[def.key]} selectedDate={selectedDate} previousDate={previousDate} />
      </div>
    </div>
  )
}
