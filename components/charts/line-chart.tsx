'use client'

import {
  ResponsiveContainer,
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceDot,
  DefaultTooltipContent,
  type DefaultTooltipContentProps,
  usePlotArea,
  useYAxisDomain,
} from 'recharts'
import { useEffect, useState, type ReactNode } from 'react'
import { CHART_COLORS } from '@/lib/constants'
import { money } from '@/lib/paid-media/format'
import { layoutPins, pinBand, PIN_CARD_HEIGHT, PIN_CARD_WIDTH, PIN_GAP, PIN_LINE_COLOR, type PinPlace } from './pins'

/** A day to flag on the x axis. Optional everywhere: a chart given no marks renders
 *  exactly as it did before this prop existed. */
export interface ChartMark {
  /** Must equal an x value present in `data`, else Recharts drops the dot silently. */
  x: string
}

/** A callout card drawn in a band above the plot, joined by a line to the dot of day `x`. Optional
 *  everywhere: a chart given no pins renders exactly as it did before this prop existed. */
export interface ChartPin {
  /** Must equal an x value present in `data`, or the pin is skipped. */
  x: string
  content: ReactNode
  /** The team's hidden or draft card: its line is faded, and neither line nor card prints. */
  muted?: boolean
}

type PinLayout = { places: PinPlace[]; tiers: number }

interface LineChartProps {
  data: Record<string, string | number>[]
  xKey: string
  yKeys: { key: string; color?: string; label?: string }[]
  marks?: ChartMark[]
  /** The team's approved notes, keyed by x value, shown under the value in the hover box. Optional
   *  everywhere: a chart given no notes renders exactly the Tooltip it rendered before this prop. */
  notes?: Record<string, string>
  /** Callout cards pinned to their dots, like the deck. Absent: no band, no cards, no connectors,
   *  and the chart is unchanged. */
  pins?: ChartPin[]
  /** Card height; the team's cards are taller to fit their buttons. Defaults to PIN_CARD_HEIGHT. */
  pinHeight?: number
  height?: number
  /** 'currency-cents' formats the Y axis + tooltip via money(); default = raw number. */
  valueFormat?: 'currency-cents'
}

// Auto-scale the Y axis to the data instead of pinning the baseline to 0.
// Recharts' YAxis defaults to [0, 'auto'], so a follower/engagement series that
// sits near the top of a 0→max range reads as a flat line even when it's moving.
// We frame the actual min/max with ~10% headroom and round the ends to a "nice"
// step so ticks stay clean. The axis labels still show true values, so the framing
// is honest — a non-zero baseline is the norm for trend lines (not bars). Clamp the
// floor at 0 for these non-negative count metrics; return undefined for degenerate
// data so Recharts falls back to its own default.

// Minimum visible span, as a fraction of the series magnitude. Framing to a *tight* band
// (the original PR #181) stopped near-max series reading as flat — but it also let a trivial
// move fill the chart: a 0.15% follower change (5896→5905) climbed nearly the full height, an
// inverse "lie factor" (PR #181 review). Flooring the span at ~10% of the value keeps genuine
// movement legible while a change smaller than that fraction stays visibly flat — honest for a
// client leave-behind. The floor scales with magnitude, so it still avoids the 0→max span that
// caused the original flat line, yet small-value series (Instagram ~30) keep their zoom.
export const MIN_SPAN_FRACTION = 0.1

export function niceYDomain(
  data: Record<string, string | number>[],
  yKeys: { key: string }[],
): [number, number] | undefined {
  const values = data
    .flatMap((row) => yKeys.map((k) => Number(row[k.key])))
    .filter((v) => Number.isFinite(v))
  if (values.length === 0) return undefined

  let min = Math.min(...values)
  let max = Math.max(...values)
  if (min === max) {
    // Flat series: pad around the single value so it sits mid-chart, not glued to an edge.
    const p = Math.max(1, Math.abs(min) * 0.05)
    min -= p
    max += p
  }

  // Floor the span so a trivial relative move can't fill the chart (see MIN_SPAN_FRACTION).
  const mid = (min + max) / 2
  const minSpan = Math.abs(mid) * MIN_SPAN_FRACTION
  if (max - min < minSpan) {
    min = mid - minSpan / 2
    max = mid + minSpan / 2
  }

  const range = max - min
  const step = Math.pow(10, Math.floor(Math.log10(range))) / 2 // half-decade, scales with magnitude
  const pad = range * 0.1
  let lo = Math.floor((min - pad) / step) * step
  const hi = Math.ceil((max + pad) / step) * step
  if (Math.min(...values) >= 0) lo = Math.max(0, lo) // counts never go below 0
  return [lo, hi]
}

/** The default hover box, plus the day's note under the value when there is one. Recharts passes a
 *  function `content` the same props it passes its own box, so with no note this is that box. Typed
 *  for string or number values, which is what this chart's Tooltip passes (its `formatter` takes a
 *  number or a string); Recharts' default value type also allows arrays, which tsc rejects there. */
export function NotedTooltip({ note, ...props }: DefaultTooltipContentProps<string | number, string | number> & { note?: string }) {
  if (!note) return <DefaultTooltipContent {...props} />
  return (
    <div style={{ margin: 0, padding: 10, ...props.contentStyle }}>
      <DefaultTooltipContent {...props} contentStyle={{ ...props.contentStyle, border: 'none', background: 'transparent', padding: 0 }} />
      <p style={{ margin: '6px 0 0', maxWidth: 240, whiteSpace: 'normal' }}>{note}</p>
    </div>
  )
}

/** Inside the chart, where Recharts knows the plot area and the y domain. A category point sits at
 *  plot.x + i / (n - 1) * plot.width and a value at plot.y + (1 - (v - lo) / (hi - lo)) * plot.height
 *  (proven against Recharts' own ReferenceDot, line-chart.test.tsx "each connector ends exactly on
 *  its dot"). Draws each card's connector and reports where the cards go. Pins ride the first series,
 *  as the marks do. */
function PinLayer({ pins, data, xKey, yKey, height, onLayout }: {
  pins: ChartPin[]
  data: Record<string, string | number>[]
  xKey: string
  yKey: string
  height: number
  onLayout: (layout: PinLayout) => void
}) {
  const plot = usePlotArea()
  const domain = useYAxisDomain()
  const n = data.length
  const lo = Array.isArray(domain) ? Number(domain[0]) : NaN
  const hi = Array.isArray(domain) ? Number(domain[domain.length - 1]) : NaN
  const dots = plot
    ? pins.flatMap((p) => {
        const i = data.findIndex((d) => d[xKey] === p.x)
        if (i < 0) return []
        const px = plot.x + (n > 1 ? (i / (n - 1)) * plot.width : plot.width / 2)
        const v = Number(data[i][yKey])
        const py = Number.isFinite(v) && hi > lo ? plot.y + (1 - (v - lo) / (hi - lo)) * plot.height : plot.y + plot.height
        return [{ x: p.x, px, py, muted: !!p.muted }]
      })
    : []
  const places = plot ? layoutPins(dots, plot) : []
  const tiers = places.reduce((m, p) => Math.max(m, p.tier + 1), 0)
  const key = JSON.stringify(places)
  // `key` describes places and tiers completely; onLayout is a state setter.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onLayout({ places, tiers }) }, [key])
  return (
    <g>
      {dots.map((d) => {
        const at = places.find((p) => p.x === d.x)!
        return (
          <line key={d.x} data-pin-line={d.x} x1={d.px} y1={at.tier * (height + PIN_GAP) + height}
            x2={d.px} y2={d.py} stroke={PIN_LINE_COLOR} strokeWidth={1.5}
            strokeOpacity={d.muted ? 0.4 : 1} className={d.muted ? 'no-print' : undefined} />
        )
      })}
    </g>
  )
}

export function LineChart({ data, xKey, yKeys, marks, notes, pins, pinHeight = PIN_CARD_HEIGHT, height = 300, valueFormat }: LineChartProps) {
  const yDomain = niceYDomain(data, yKeys)
  const fmt =
    valueFormat === 'currency-cents' ? (v?: number | string) => (v !== undefined ? money(Number(v)) : '') : undefined
  const [pinLayout, setPinLayout] = useState<PinLayout | null>(null)
  const pinned = !!pins && pins.length > 0 && yKeys.length > 0
  // The band above the plot grows by one row of cards per tier; 0 without pins, so the margin and
  // the height are exactly today's.
  const band = pinned ? pinBand(Math.max(1, pinLayout?.tiers ?? 1), pinHeight) : 0
  const chart = (
    <ResponsiveContainer width="100%" height={height + band}>
      <RechartsLineChart data={data} margin={{ top: 8 + band, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis
          dataKey={xKey}
          tick={{ fill: '#8A8A8A', fontSize: 12 }}
          axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
          tickLine={false}
        />
        <YAxis
          domain={yDomain ?? [0, 'auto']}
          allowDecimals={false}
          tick={{ fill: '#8A8A8A', fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={fmt}
        />
        <Tooltip
          formatter={fmt}
          contentStyle={{
            background: '#272727',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '8px',
            color: '#FFFFFF',
            fontSize: '13px',
          }}
          content={notes ? (p) => <NotedTooltip {...p} note={notes[String(p.label)]} /> : undefined}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {yKeys.map((series) => (
          <Line
            key={series.key}
            type="monotone"
            dataKey={series.key}
            name={series.label ?? series.key}
            stroke={series.color ?? CHART_COLORS.primary}
            strokeWidth={2}
            dot={false}
          />
        ))}
        {/* Marks ride the FIRST series, so a multi-series chart gets one dot per day
            rather than one per line. A mark whose x is not in `data` is skipped here
            rather than handed to Recharts, which would drop it without saying so. */}
        {(marks ?? [])
          .filter((m) => data.some((d) => d[xKey] === m.x))
          .map((m) => (
            <ReferenceDot
              key={`mark-${m.x}`}
              x={m.x}
              y={Number(data.find((d) => d[xKey] === m.x)?.[yKeys[0].key] ?? 0)}
              r={5}
              fill={CHART_COLORS.primary}
              stroke="#0B0B0B"
              strokeWidth={2}
            />
          ))}
        {pinned && <PinLayer pins={pins!} data={data} xKey={xKey} yKey={yKeys[0].key} height={pinHeight} onLayout={setPinLayout} />}
      </RechartsLineChart>
    </ResponsiveContainer>
  )
  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6">
      {pinned ? (
        <div className="relative">
          {chart}
          {pinLayout?.places.map((p) => {
            const pin = pins!.find((q) => q.x === p.x)
            return pin ? (
              <div key={p.x} data-pin-card={p.x} className={pin.muted ? 'absolute no-print' : 'absolute'}
                style={{ left: p.left, top: p.tier * (pinHeight + PIN_GAP), width: PIN_CARD_WIDTH, height: pinHeight }}>
                {pin.content}
              </div>
            ) : null
          })}
        </div>
      ) : chart}
    </div>
  )
}
