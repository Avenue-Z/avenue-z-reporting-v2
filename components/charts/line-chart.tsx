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
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { CHART_COLORS } from '@/lib/constants'
import { money } from '@/lib/paid-media/format'
import { PIN_CARD_WIDTH, PIN_LINE_COLOR, PIN_STUB } from './pins'

/** A day to flag on the x axis. Optional everywhere: a chart given no marks renders
 *  exactly as it did before this prop existed. */
export interface ChartMark {
  /** Must equal an x value present in `data`, else Recharts drops the dot silently. */
  x: string
}

/** A day whose card shows when its dot is hovered, focused or tapped (Phase 2b: dots only on the
 *  graph). Optional everywhere: a chart given no callouts renders exactly as it did before this prop
 *  existed. */
export interface ChartCallout {
  /** Must equal an x value present in `data`, or the callout is skipped. */
  x: string
  /** Names the dot and the card for screen readers, e.g. `8/12 | +28 Followers`. */
  label: string
  content: ReactNode
  /** The team's hidden or draft-only day: a faint dot that never prints. */
  muted?: boolean
}

type Spot = { x: string; px: number; py: number }
type CalloutLayout = { spots: Spot[]; plot: { x: number; y: number; width: number; height: number } }

interface LineChartProps {
  data: Record<string, string | number>[]
  xKey: string
  yKeys: { key: string; color?: string; label?: string }[]
  marks?: ChartMark[]
  /** The team's approved notes, keyed by x value, shown under the value in the hover box. Optional
   *  everywhere: a chart given no notes renders exactly the Tooltip it rendered before this prop. */
  notes?: Record<string, string>
  /** Days with a card that opens on its dot (hover, focus or tap). Absent: no hit areas, no card, no
   *  extra wrapper, and the chart is unchanged. */
  callouts?: ChartCallout[]
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
 *  (proven against Recharts' own ReferenceDot, line-chart.test.tsx "each hit area sits exactly on
 *  Recharts' own dot"). Callouts ride the first series, as the marks do. Draws each callout's hit area
 *  (a focusable button over its dot), the team's faint dots, and the red line to the open card, and
 *  reports where the dots are so the card can be placed beside its own. */
function CalloutLayer({ callouts, data, xKey, yKey, open, side, onLayout, hits, on }: {
  callouts: ChartCallout[]
  data: Record<string, string | number>[]
  xKey: string
  yKey: string
  open: string | null
  side: 'above' | 'below'
  onLayout: (layout: CalloutLayout) => void
  hits: Map<string, SVGCircleElement>
  on: {
    enter: (x: string, e: PointerEvent<SVGCircleElement>) => void
    leave: (e: PointerEvent<SVGCircleElement>) => void
    tap: (x: string) => void
    key: (x: string, e: KeyboardEvent<SVGCircleElement>) => void
  }
}) {
  const plot = usePlotArea()
  const domain = useYAxisDomain()
  const n = data.length
  const lo = Array.isArray(domain) ? Number(domain[0]) : NaN
  const hi = Array.isArray(domain) ? Number(domain[domain.length - 1]) : NaN
  const spots: Spot[] = plot
    ? callouts.flatMap((c) => {
        const i = data.findIndex((d) => d[xKey] === c.x)
        if (i < 0) return []
        const px = plot.x + (n > 1 ? (i / (n - 1)) * plot.width : plot.width / 2)
        const v = Number(data[i][yKey])
        const py = Number.isFinite(v) && hi > lo ? plot.y + (1 - (v - lo) / (hi - lo)) * plot.height : plot.y + plot.height
        return [{ x: c.x, px, py }]
      })
    : []
  const box = plot ? { x: plot.x, y: plot.y, width: plot.width, height: plot.height } : null
  const key = JSON.stringify({ spots, box })
  // `key` describes spots and box completely; onLayout is a state setter.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (box) onLayout({ spots, plot: box }) }, [key])
  const byX = new Map(callouts.map((c) => [c.x, c]))
  const at = spots.find((s) => s.x === open)
  return (
    <g>
      {spots.filter((s) => byX.get(s.x)?.muted).map((s) => (
        <circle key={`faint-${s.x}`} data-callout-faint={s.x} className="no-print" cx={s.px} cy={s.py} r={5}
          fill="none" stroke="#8A8A8A" strokeWidth={1.5} strokeDasharray="2 2" />
      ))}
      {at && (
        <line data-callout-stub={at.x} className="no-print" x1={at.px} y1={at.py + (side === 'above' ? -PIN_STUB : PIN_STUB)}
          x2={at.px} y2={at.py} stroke={PIN_LINE_COLOR} strokeWidth={1.5} />
      )}
      {spots.map((s) => (
        <circle key={`hit-${s.x}`} data-callout-hit={s.x} cx={s.px} cy={s.py} r={14} fill="transparent"
          role="button" tabIndex={0} aria-label={byX.get(s.x)!.label} aria-expanded={open === s.x}
          className="outline-none focus-visible:stroke-white" strokeWidth={1.5} style={{ cursor: 'pointer' }}
          ref={(el) => { if (el) hits.set(s.x, el); else hits.delete(s.x) }}
          onPointerEnter={(e) => on.enter(s.x, e)} onPointerLeave={on.leave}
          onClick={() => on.tap(s.x)} onKeyDown={(e) => on.key(s.x, e)} />
      ))}
    </g>
  )
}

/** Not a touch or a pen: a real mouse (jsdom sends no pointerType, and counts as one). */
const isMouse = (e: PointerEvent<Element>) => e.pointerType !== 'touch' && e.pointerType !== 'pen'
/** D11: a mouse must rest this long on a dot, so a sweep across the chart never flashes cards. */
const OPEN_DELAY = 100
/** D4: time to cross from a dot to its card before the card closes. */
const CLOSE_GRACE = 150

export function LineChart({ data, xKey, yKeys, marks, notes, callouts, height = 300, valueFormat }: LineChartProps) {
  const yDomain = niceYDomain(data, yKeys)
  const fmt =
    valueFormat === 'currency-cents' ? (v?: number | string) => (v !== undefined ? money(Number(v)) : '') : undefined
  const hasCallouts = !!callouts && callouts.length > 0 && yKeys.length > 0
  const [layout, setLayout] = useState<CalloutLayout | null>(null)
  const [open, setOpen] = useState<{ x: string; by: 'pointer' | 'key' } | null>(null)
  const [placed, setPlaced] = useState<{ side: 'above' | 'below'; h: number }>({ side: 'above', h: 0 })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)
  // One stable map of the dots' hit areas, to hand focus back on Escape (not a ref read during render).
  const [hits] = useState(() => new Map<string, SVGCircleElement>())
  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null } }
  const later = (ms: number, fn: () => void) => { clear(); timer.current = setTimeout(() => { timer.current = null; fn() }, ms) }
  const close = (refocus: boolean) => {
    clear()
    const x = open?.x
    setOpen(null)
    if (refocus && x) hits.get(x)?.focus()
  }
  useEffect(() => () => clear(), [])
  // A tap or click anywhere outside the open card and the dots closes it (D4).
  useEffect(() => {
    if (!open) return
    const outside = (e: Event) => {
      const t = e.target
      if (t instanceof Node && cardRef.current?.contains(t)) return
      if (t instanceof Element && t.closest('[data-callout-hit]')) return
      clear()
      setOpen(null)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  // D2, D16: the card's side is settled from its measured height before it is first painted.
  useLayoutEffect(() => {
    const spot = layout?.spots.find((s) => s.x === open?.x)
    if (!open || !spot || !cardRef.current) return
    const h = cardRef.current.offsetHeight
    const side = spot.py - PIN_STUB - h >= 0 ? 'above' : 'below'
    setPlaced((p) => (p.side === side && p.h === h ? p : { side, h }))
  }, [open, layout])
  // D12: opened from the keyboard, focus moves into the card so its buttons are next in Tab order.
  useLayoutEffect(() => { if (open?.by === 'key') cardRef.current?.focus() }, [open])
  const on = {
    enter: (x: string, e: PointerEvent<SVGCircleElement>) => {
      if (!isMouse(e)) return
      if (open?.x === x) { clear(); return }
      later(OPEN_DELAY, () => setOpen({ x, by: 'pointer' }))
    },
    leave: (e: PointerEvent<SVGCircleElement>) => { if (isMouse(e)) later(CLOSE_GRACE, () => setOpen(null)) },
    // A tap or click only ever opens: a touchscreen fires a simulated mouse-enter before the click.
    tap: (x: string) => { clear(); setOpen({ x, by: 'pointer' }) },
    key: (x: string, e: KeyboardEvent<SVGCircleElement>) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); clear(); setOpen({ x, by: 'key' }) }
      else if (e.key === 'Escape') close(true)
    },
  }
  const chart = (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsLineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
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
          {...(callouts ? { active: open ? false : undefined } : {})}
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
        {hasCallouts && (
          <CalloutLayer callouts={callouts!} data={data} xKey={xKey} yKey={yKeys[0].key} open={open?.x ?? null}
            side={placed.side} onLayout={setLayout} hits={hits} on={on} />
        )}
      </RechartsLineChart>
    </ResponsiveContainer>
  )
  if (!hasCallouts) return <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6">{chart}</div>
  const callout = open ? callouts!.find((c) => c.x === open.x) : undefined
  const spot = open ? layout?.spots.find((s) => s.x === open.x) : undefined
  let card = null
  if (callout && spot && layout) {
    const { plot } = layout
    const chartWidth = plot.x + plot.width + 8
    const w = Math.min(PIN_CARD_WIDTH, chartWidth)
    let minLeft = plot.x
    let maxLeft = plot.x + plot.width - w
    if (maxLeft < minLeft) { minLeft = 0; maxLeft = Math.max(0, chartWidth - w) } // a phone's narrow plot
    const left = Math.min(Math.max(spot.px - w / 2, minLeft), maxLeft)
    const top = placed.side === 'above' ? spot.py - PIN_STUB - placed.h : spot.py + PIN_STUB
    card = (
      <div ref={cardRef} data-callout-card={callout.x} role="group" aria-label={callout.label} tabIndex={-1}
        className="no-print absolute z-20 outline-none" style={{ left, top, width: w }}
        onPointerEnter={clear} onPointerLeave={(e) => { if (isMouse(e)) later(CLOSE_GRACE, () => setOpen(null)) }}
        onKeyDown={(e) => { if (e.key === 'Escape') close(true) }}>
        {callout.content}
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6">
      <div className="relative">
        {chart}
        {card}
      </div>
    </div>
  )
}
