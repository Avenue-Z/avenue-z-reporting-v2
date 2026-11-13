'use client'
// The four graphs, two across (spec section 3, item 2). Their own small line chart, styled exactly as the shared one
// (components/charts/line-chart.tsx: grid, axes, tooltip, 2 px line, no dots, no animation in the export), because the first graph is a
// percent and the shared chart has no percent format; changing it would touch every report that uses it.
// Colors (spec section 3, Avenue Z brand colors with continuity across the dashboard), read from the constants, never repeated:
// used as a source: brand green, a color no Organic Social line uses; all platforms: white, the dashboard's color for totals across
// channels (CHART_COLORS.blended); LinkedIn and the fourth graph: that platform's line color on the other Organic Social tabs (CHANNEL_COLOR).
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CHART_COLORS } from '@/lib/constants'
import { pctCompact } from '@/lib/organic-social/format'
// The pure graph module only: the adapter's entry point (index.ts) reaches the Peec reader and must never be bundled for the browser.
import { graphOrder, type GraphId, type GraphPoint } from '@/lib/organic-social/aeo-informed/graphs'
import type { FourthGraph } from '@/lib/organic-social/aeo-informed/fourth-graph'
import { useExportMode } from '@/components/export/export-mode'
import { formatMonthDay } from '@/components/charts/line-chart'
import { CHANNEL_COLOR } from '../trends'
import { NoData } from '../no-data'
import { GRAPH_TITLE, NO_SOURCE_DATA, PARTIAL_WEEK } from './copy'

export type GraphSpec = { id: GraphId; title: string; color: string; unit: 'percent' | 'citations' }

const COLOR: Record<GraphId, string> = {
  used_as_source_all: 'var(--color-brand-green)',
  citations_all: CHART_COLORS.blended,
  citations_linkedin: CHANNEL_COLOR.LinkedIn,
  citations_instagram: CHANNEL_COLOR.Instagram,
  citations_tiktok: CHANNEL_COLOR.TikTok,
}

/** The four graphs drawn for this fourth graph, in page order. */
export function graphSpecs(fourth: FourthGraph): GraphSpec[] {
  return graphOrder(fourth).map((id) => ({ id, title: GRAPH_TITLE[id], color: COLOR[id], unit: id === 'used_as_source_all' ? 'percent' : 'citations' }))
}

/** A percent graph's value is a fraction (0.12 is 12%), shown as the Organic Social rates are (pctCompact); citations as whole numbers. */
export function formatGraphValue(unit: 'percent' | 'citations', v: number): string {
  return unit === 'percent' ? pctCompact(v * 100) : v.toLocaleString('en-US')
}

/** One row per weekly bucket, keyed by its first day. A null value is a gap in the line (the adapter's "no source" state). */
export function chartRows(points: GraphPoint[]): { week: string; value: number | null; partial: boolean }[] {
  return points.map((p) => ({ week: p.weekStart, value: p.value, partial: p.partial }))
}

function Graph({ spec, points }: { spec: GraphSpec; points: GraphPoint[] }) {
  const exportMode = useExportMode()
  const rows = chartRows(points)
  const empty = rows.length === 0 || rows.every((r) => r.value === null)
  const fmt = (v: unknown) => (typeof v === 'number' ? formatGraphValue(spec.unit, v) : '')
  return (
    <div className="rounded-lg border border-white/[0.08] bg-bg-surface p-5">
      <h3 className="mb-3 text-sm font-extrabold text-white">{spec.title}</h3>
      {empty ? <NoData message={NO_SOURCE_DATA} /> : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="week" tick={{ fill: '#8A8A8A', fontSize: 12 }} axisLine={{ stroke: 'rgba(255,255,255,0.06)' }} tickLine={false} tickFormatter={(v) => formatMonthDay(v)} />
            <YAxis domain={[0, 'auto']} allowDecimals={spec.unit === 'percent'} tick={{ fill: '#8A8A8A', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={fmt} />
            <Tooltip
              formatter={(v) => [fmt(v), spec.unit === 'percent' ? 'Used as a source' : 'Citations']}
              labelFormatter={(label) => {
                const row = rows.find((r) => r.week === label)
                return `Week of ${formatMonthDay(String(label))}${row?.partial ? ` ${PARTIAL_WEEK}` : ''}`
              }}
              contentStyle={{ background: '#272727', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#FFFFFF', fontSize: '13px' }}
            />
            <Line type="monotone" dataKey="value" stroke={spec.color} strokeWidth={2} dot={false} connectNulls={false} {...(exportMode ? { isAnimationActive: false } : {})} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

export function AeoGraphs({ graphs, fourthGraph }: { graphs: GraphPoint[]; fourthGraph: FourthGraph }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {graphSpecs(fourthGraph).map((spec) => <Graph key={spec.id} spec={spec} points={graphs.filter((p) => p.graphId === spec.id)} />)}
    </div>
  )
}
