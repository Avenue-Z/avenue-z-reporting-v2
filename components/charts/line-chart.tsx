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
} from 'recharts'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
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

/** One callout's spot, as the `shape` of a ReferenceDot: Recharts hands it the exact cx and cy it gives
 *  the marks, from its own scale, and it reports them and draws the team's faint dot there (D17). A real
 *  component, because Recharts calls a function `shape` directly (ReferenceDot.js renderDot). */
function SpotProbe({ x, cx, cy, muted, report }: {
  x: string
  cx?: number
  cy?: number
  muted: boolean
  report: (x: string, at: { px: number; py: number } | null) => void
}) {
  useLayoutEffect(() => {
    if (cx === undefined || cy === undefined) return
    report(x, { px: cx, py: cy })
    return () => report(x, null)
  }, [x, cx, cy, report])
  if (!muted || cx === undefined || cy === undefined) return <g />
  return <FaintDot x={x} px={cx} py={cy} />
}

/** The team's faint dot for a hidden or draft-only day (D5): hollow, dashed, never printed. */
function FaintDot({ x, px, py }: { x: string; px: number; py: number }) {
  return (
    <circle data-callout-faint={x} className="no-print" cx={px} cy={py} r={5}
      fill="none" stroke={CHART_COLORS.neutral} strokeWidth={1.5} strokeDasharray="2 2" />
  )
}

/** Inside the chart, where Recharts knows the plot area and the scales. Each callout's spot is placed
 *  by Recharts itself (a ReferenceDot per callout, the same code that draws the marks), never computed
 *  from the y domain: Recharts widens that domain to whole ticks, and a spot computed from the domain
 *  asked for sat 17px off its dot on a follower graph (seen live, 2026-09-24). A callout on a day with
 *  no value, which Recharts would drop, keeps the bottom of the plot so it stays reachable. Callouts
 *  ride the first series, as the marks do. Draws the team's faint dots and the red line to the open
 *  card, and reports where the dots are, so the hit areas and the card can be placed in the HTML layer
 *  above the chart (LineChart). */
function CalloutLayer({ callouts, data, xKey, yKey, open, side, onLayout }: {
  callouts: ChartCallout[]
  data: Record<string, string | number>[]
  xKey: string
  yKey: string
  open: string | null
  side: 'above' | 'below'
  onLayout: (layout: CalloutLayout) => void
}) {
  const plot = usePlotArea()
  const [reported, setReported] = useState<Record<string, { px: number; py: number }>>({})
  const report = useCallback((x: string, at: { px: number; py: number } | null) => setReported((prev) => {
    const cur = prev[x]
    if (at === null) {
      if (!cur) return prev
      const rest = { ...prev }
      delete rest[x]
      return rest
    }
    return cur && cur.px === at.px && cur.py === at.py ? prev : { ...prev, [x]: at }
  }), [])
  const n = data.length
  const onChart = callouts.flatMap((c) => {
    const i = data.findIndex((d) => d[xKey] === c.x)
    return i < 0 ? [] : [{ c, i, v: Number(data[i][yKey]) }]
  })
  const spots: Spot[] = plot
    ? onChart.flatMap(({ c, i, v }) => {
        if (Number.isFinite(v)) return reported[c.x] ? [{ x: c.x, ...reported[c.x] }] : []
        const px = plot.x + (n > 1 ? (i / (n - 1)) * plot.width : plot.width / 2)
        return [{ x: c.x, px, py: plot.y + plot.height }]
      })
    : []
  const box = plot ? { x: plot.x, y: plot.y, width: plot.width, height: plot.height } : null
  const key = JSON.stringify({ spots, box })
  // `key` describes spots and box completely; onLayout is a state setter.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (box) onLayout({ spots, plot: box }) }, [key])
  const valued = new Set(onChart.filter(({ v }) => Number.isFinite(v)).map(({ c }) => c.x))
  const byX = new Map(callouts.map((c) => [c.x, c]))
  const at = spots.find((s) => s.x === open)
  return (
    <g>
      {onChart.filter(({ v }) => Number.isFinite(v)).map(({ c, v }) => (
        <ReferenceDot key={`spot-${c.x}`} x={c.x} y={v} r={0}
          shape={(p: { cx?: number; cy?: number }) => <SpotProbe x={c.x} cx={p.cx} cy={p.cy} muted={!!c.muted} report={report} />} />
      ))}
      {spots.filter((s) => !valued.has(s.x) && byX.get(s.x)?.muted).map((s) => (
        <FaintDot key={`faint-${s.x}`} x={s.x} px={s.px} py={s.py} />
      ))}
      {at && (
        <line data-callout-stub={at.x} className="no-print" x1={at.px} y1={at.py + (side === 'above' ? -PIN_STUB : PIN_STUB)}
          x2={at.px} y2={at.py} stroke={PIN_LINE_COLOR} strokeWidth={1.5} />
      )}
    </g>
  )
}

/** Not a touch or a pen: a real mouse (jsdom sends no pointerType, and counts as one). */
const isMouse = (e: PointerEvent<Element>) => e.pointerType !== 'touch' && e.pointerType !== 'pen'
/** D11: a mouse must rest this long on a dot, so a sweep across the chart never flashes cards. */
const OPEN_DELAY = 100
/** D4: time to cross from a dot to its card before the card closes. */
const CLOSE_GRACE = 150
/** The smallest gap kept between an open card and the top of the area it must stay inside. */
const SCREEN_MARGIN = 8

/** The top, on screen, of the area an open card must stay inside: the nearest ancestor that scrolls
 *  or clips (the report page scrolls inside its own container), or the window. */
function areaTop(el: HTMLElement): number {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY
    if (o === 'auto' || o === 'scroll' || o === 'hidden') return p.getBoundingClientRect().top
  }
  return 0
}

export function LineChart({ data, xKey, yKeys, marks, notes, callouts, height = 300, valueFormat }: LineChartProps) {
  const yDomain = niceYDomain(data, yKeys)
  const fmt =
    valueFormat === 'currency-cents' ? (v?: number | string) => (v !== undefined ? money(Number(v)) : '') : undefined
  const hasCallouts = !!callouts && callouts.length > 0 && yKeys.length > 0
  const [layout, setLayout] = useState<CalloutLayout | null>(null)
  const [open, setOpen] = useState<{ x: string; by: 'pointer' | 'key' } | null>(null)
  // A refresh can remove the open card's callout (a deleted draft, a top day that moved). That card
  // counts as closed at once, and the state follows during render, as React documents for state that
  // tracks props, so the same day coming back later does not reopen it (Paul's review of #273, C1).
  const openLive = open && callouts?.some((c) => c.x === open.x) ? open : null
  if (open && !openLive) setOpen(null)
  const [side, setSide] = useState<'above' | 'below'>('above')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)
  // This chart's own layer of dots and card, so a tap on another chart's dot counts as outside (C8).
  const wrapRef = useRef<HTMLDivElement | null>(null)
  // One stable map of the dots' hit areas, to hand focus back on Escape (not a ref read during render).
  const [hits] = useState(() => new Map<string, HTMLButtonElement>())
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
      // Only this chart's dots are spared: a tap on another graph's dot closes this card, one card at a
      // time on the page (Paul's review of #273, C8).
      if (t instanceof Element && t.closest('[data-callout-hit]') && wrapRef.current?.contains(t)) return
      clear()
      setOpen(null)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  // D2, D16: above the dot, as in the approved mockup, rising past the top of the chart box when
  // needed; below only when the screen has no room above. Settled from the card's measured height
  // before it is first painted. (Callouts are the top days, near the top of the chart, so "above when
  // it fits in the chart" sent nearly every card below, over the graph: amended 2026-09-24.) Settled
  // again whenever the open card changes size, since a card that grows (Hide adds a line, an error its
  // message, a refresh the draft's pictures) can outgrow the room above (Paul's second review, R4).
  useLayoutEffect(() => {
    const spot = layout?.spots.find((s) => s.x === openLive?.x)
    const el = cardRef.current
    if (!openLive || !spot || !el?.parentElement) return
    const wrap = el.parentElement
    const settle = () => {
      const dotOnScreen = wrap.getBoundingClientRect().top + spot.py
      setSide(dotOnScreen - PIN_STUB - el.offsetHeight - areaTop(el) >= SCREEN_MARGIN ? 'above' : 'below')
    }
    settle()
    if (typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(settle)
    watch.observe(el)
    return () => watch.disconnect()
  }, [openLive, layout])
  // D12: opened from the keyboard, focus moves into the card so its buttons are next in Tab order.
  useLayoutEffect(() => { if (openLive?.by === 'key') cardRef.current?.focus() }, [openLive])
  const on = {
    enter: (x: string, e: PointerEvent<HTMLButtonElement>) => {
      if (!isMouse(e)) return
      if (open?.x === x) { clear(); return }
      later(OPEN_DELAY, () => setOpen({ x, by: 'pointer' }))
    },
    leave: (e: PointerEvent<HTMLButtonElement>) => { if (isMouse(e)) later(CLOSE_GRACE, () => setOpen(null)) },
    // A tap or click only ever opens: a touchscreen fires a simulated mouse-enter before the click.
    tap: (x: string) => { clear(); setOpen({ x, by: 'pointer' }) },
    key: (x: string, e: KeyboardEvent<HTMLButtonElement>) => {
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
          {...(callouts ? { active: openLive ? false : undefined } : {})}
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
          <CalloutLayer callouts={callouts!} data={data} xKey={xKey} yKey={yKeys[0].key} open={openLive?.x ?? null}
            side={side} onLayout={setLayout} />
        )}
      </RechartsLineChart>
    </ResponsiveContainer>
  )
  if (!hasCallouts) return <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6">{chart}</div>
  const callout = openLive ? callouts!.find((c) => c.x === openLive.x) : undefined
  const spot = openLive ? layout?.spots.find((s) => s.x === openLive.x) : undefined
  let card = null
  if (callout && spot && layout) {
    const { plot } = layout
    const chartWidth = plot.x + plot.width + 8
    const w = Math.min(PIN_CARD_WIDTH, chartWidth)
    let minLeft = plot.x
    let maxLeft = plot.x + plot.width - w
    if (maxLeft < minLeft) { minLeft = 0; maxLeft = Math.max(0, chartWidth - w) } // a phone's narrow plot
    const left = Math.min(Math.max(spot.px - w / 2, minLeft), maxLeft)
    // Above its dot the card is anchored by its bottom, just above the red line, so a card that grows
    // after opening (Hide adds a line, a failed Approve its message) grows upward and never covers the
    // dot (Paul's review of #273, C6). Below its dot it hangs from its top, as before.
    const place = side === 'above' ? { bottom: `calc(100% - ${spot.py - PIN_STUB}px)` } : { top: spot.py + PIN_STUB }
    card = (
      <div ref={cardRef} data-callout-card={callout.x} role="group" aria-label={callout.label} tabIndex={-1}
        className="no-print absolute z-40 outline-none" style={{ left, width: w, ...place }}
        onPointerEnter={clear} onPointerLeave={(e) => { if (isMouse(e)) later(CLOSE_GRACE, () => setOpen(null)) }}
        onKeyDown={(e) => { if (e.key === 'Escape') close(true) }}>
        {callout.content}
      </div>
    )
  }
  // The hit areas live in the HTML layer above the chart, not in its SVG: Recharts paints its line and
  // dots after any extra children, so inside the SVG they covered a dot's centre and a real mouse never
  // reached the hit area (found live, 2026-09-24). Real buttons also bring native focus and keys. The
  // layout lags the props by one render, so a spot whose callout is gone is skipped (C1).
  const hitAreas = layout?.spots.flatMap((s) => {
    const c = callouts!.find((q) => q.x === s.x)
    if (!c) return []
    return [
      <button key={`hit-${s.x}`} type="button" data-callout-hit={s.x} aria-label={c.label} aria-expanded={openLive?.x === s.x}
        className="no-print absolute z-10 h-7 w-7 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-white"
        style={{ left: s.px, top: s.py }}
        ref={(el) => { if (el) hits.set(s.x, el); else hits.delete(s.x) }}
        onPointerEnter={(e) => on.enter(s.x, e)} onPointerLeave={on.leave}
        onClick={() => on.tap(s.x)} onKeyDown={(e) => on.key(s.x, e)} />,
    ]
  })
  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6">
      <div className="relative" ref={wrapRef}>
        {chart}
        {hitAreas}
        {card}
      </div>
    </div>
  )
}
