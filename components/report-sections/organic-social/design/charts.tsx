// The shared Organic Social design kit's charts, first used by the Social Listening tab. Ported from the mockup the team
// approved on 2026-11-19 (docs/social-listening/mock.template.html: change, kpi, lineChart, donut, legend, hbars, ytdColumns,
// pointLines, dailyStack, cloud). Plain SVG and HTML with the mockup's geometry and classes, so the page, the PDF and the
// mockup draw the same thing. Server-safe.
// The one change from the mockup: a year to date month with no data is a gap (no column, a break in the line), never a 0.
import type { ComponentProps, ReactNode } from 'react'
import type { KpiCard } from '@/components/charts/kpi-card'
import { HoverHint } from '@/components/charts/hover-hint'
import { roundDelta } from '@/lib/delta-rounding'
import { SENTIMENT_COLORS } from '@/lib/organic-social/social-listening/colors'
import type { SlPct, YtdPoint } from '@/lib/organic-social/social-listening/compare'
import type { SlDay } from '@/lib/organic-social/social-listening/types'
import type { SlCrossRow, SlMediaRow } from '@/lib/organic-social/social-listening/view-model'
import s from './kit.module.css'

type K = 'pos' | 'neu' | 'neg'
const KEYS: K[] = ['pos', 'neu', 'neg']
const NAME: Record<K, string> = { pos: 'Positive', neu: 'Neutral', neg: 'Negative' }
const SC = SENTIMENT_COLORS
/** The dash glyph KpiCard draws before a zero change and as its no-prior placeholder (kpi-card.tsx:67, :73). */
const DASH = '\u2014'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const fmt = (n: number) => Math.round(n).toLocaleString('en-US')
const short = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : fmt(v))
const pct1 = (a: number, b: number) => (b > 0 ? Math.round((1000 * a) / b) / 10 : 0)
const dayLabel = (day: string) => `${MONTHS[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}`
const monthShort = (key: string) => MONTHS[Number(key.slice(5, 7)) - 1] ?? key

function niceStep(raw: number): number {
  if (!(raw > 0)) return 1
  const p = Math.pow(10, Math.floor(Math.log10(raw)))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= raw) return m * p
  return 10 * p
}

/** A change line: the arrow from the number, the colour from whether up is good. `%` changes round as the tiles do
 *  (roundDelta: whole from 1%, one decimal under); points keep one decimal. Missing: "n/a".
 *  Three options let a kit tile read exactly as the shared KpiCard (components/charts/kpi-card.tsx), which every Organic
 *  Social tile uses today; absent, the line is as before, so Social Listening is unchanged:
 *  - `noPrior` replaces "n/a" (KpiCard's `comparisonExpected` placeholder is the dash glyph, kpi-card.tsx:73);
 *  - `zeroDash` puts that dash before a zero change (kpi-card.tsx:67);
 *  - `oneDecimal` shows a `%` change unrounded at one decimal, as KpiCard does without `wholeDelta` (kpi-card.tsx:41, :68),
 *    so 12.34 reads 12.3 and 0.04 reads 0.0 with an up arrow. Points already keep one decimal. */
export function Change({ v, unit, label, invert, neutral, noPrior, zeroDash, oneDecimal }: {
  v: number | null | undefined; unit: '%' | 'pts'; label: string; invert?: boolean; neutral?: boolean
  noPrior?: string; zeroDash?: boolean; oneDecimal?: boolean
}) {
  if (v === null || v === undefined) {
    if (noPrior !== undefined) return <span className={s.flat}>{`${noPrior} ${label}`}</span>
    return <span className={s.flat}>n/a {label}</span>
  }
  const exact = unit === '%' && oneDecimal === true
  const r = exact ? v : unit === '%' ? roundDelta(v) : Math.round(Math.abs(v) * 10) / 10 * Math.sign(v)
  const size = Math.abs(r)
  const shown = exact ? size.toFixed(1) : unit === '%' ? (size >= 1 ? size.toFixed(0) : size.toFixed(1)) : size.toFixed(1)
  if (size === 0) {
    if (zeroDash || exact) return <span className={s.flat}>{`${zeroDash ? `${DASH} ` : ''}${exact ? '0.0' : '0'}${unit === '%' ? '%' : ' pts'} ${label}`}</span>
    return <span className={s.flat}>0{unit === '%' ? '%' : ' pts'} {label}</span>
  }
  const up = r > 0
  const good = neutral ? null : invert ? !up : up
  return <span className={good === null ? s.flat : good ? s.up : s.down}>{up ? '↑' : '↓'} {shown}{unit === '%' ? '%' : ' pts'} {label}</span>
}

/** A tile. `tooltip` draws the shared hover hint beside the title, as KpiCard does (kpi-card.tsx:49); `noChange` drops
 *  the change line, as KpiCard does when there is no delta and no comparison is expected; `noPrior`, `zeroDash` and
 *  `oneDecimal` are passed to `Change`. All absent: the tile is as before. */
export function Kpi({ title, value, delta, unit = '%', label, sub, invert, neutral, tooltip, noPrior, zeroDash, noChange, oneDecimal }: {
  title: string; value: string; delta: number | null | undefined; unit?: '%' | 'pts'; label: string; sub?: string; invert?: boolean; neutral?: boolean
  tooltip?: string; noPrior?: string; zeroDash?: boolean; noChange?: boolean; oneDecimal?: boolean
}) {
  return (
    <div className={s.kpi} data-export-block="">
      {tooltip ? (
        <div className={s.th}><p className={s.t}>{title}</p><HoverHint text={tooltip} /></div>
      ) : (
        <p className={s.t}>{title}</p>
      )}
      <p className={s.v}>{value}</p>
      {!noChange && (
        <p className={s.d}><Change v={delta} unit={unit} label={label} invert={invert} neutral={neutral} noPrior={noPrior} zeroDash={zeroDash} oneDecimal={oneDecimal} /></p>
      )}
      {sub && <p className={s.s}>{sub}</p>}
    </div>
  )
}

/** The kit tile for a part that draws KpiCard today: it takes KpiCard's props and reads exactly as KpiCard does, the
 *  same title, hint, value, change line (arrow, precision, dash, label) and note, with the change coloured the same way.
 *  `kpi-tile.test.tsx` proves that across every combination of KpiCard's props. So a new part version swaps KpiCard for
 *  KpiTile and changes the look only. */
export function KpiTile({ title, value, delta, invertDelta, prefix, suffix, tooltip, deltaLabel = 'vs prior period', comparisonExpected, subValue, wholeDelta }: ComponentProps<typeof KpiCard>) {
  return (
    <Kpi
      title={title}
      value={`${prefix ?? ''}${typeof value === 'number' ? value.toLocaleString() : value}${suffix ?? ''}`}
      delta={delta}
      label={deltaLabel}
      invert={invertDelta}
      tooltip={tooltip}
      noPrior={DASH}
      zeroDash
      oneDecimal={!wholeDelta}
      noChange={delta === undefined && !comparisonExpected}
      sub={subValue}
    />
  )
}

export function Key({ items }: { items: { name: string; color: string }[] }) {
  return <div className={s.key}>{items.map((i) => <span key={i.name}><i style={{ background: i.color }} />{i.name}</span>)}</div>
}
const SENT_KEY = KEYS.map((k) => ({ name: NAME[k], color: SC[k] }))

/** Results over time: the line, its fill, the grid and the peak labelled. */
export function LineChart({ days, color, id }: { days: SlDay[]; color: string; id: string }) {
  const W = 960, H = 240, L = 48, R = 16, T = 24, B = 30
  const values = days.map((d) => d.results)
  if (values.length === 0) return null
  const max = Math.max(...values, 1)
  const step = niceStep((max * 1.15) / 4), top = step * Math.ceil((max * 1.15) / step)
  const x = (i: number) => L + (i * (W - L - R)) / Math.max(values.length - 1, 1)
  const y = (v: number) => T + (H - T - B) * (1 - v / top)
  const grid: ReactNode[] = []
  for (let v = 0; v <= top + 1e-9; v += step) {
    grid.push(<line key={`g${v}`} className={s.gridLine} x1={L} x2={W - R} y1={y(v)} y2={y(v)} />)
    grid.push(<text key={`t${v}`} className={s.tMuted} x={L - 8} y={y(v) + 4} fontSize={11} textAnchor="end">{short(v)}</text>)
  }
  days.forEach((d, i) => {
    if (i % 7 === 0 || i === days.length - 1) grid.push(<text key={`x${i}`} className={s.tMuted} x={x(i)} y={H - 8} fontSize={11} textAnchor="middle">{dayLabel(d.day)}</text>)
  })
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const area = `M${x(0)},${y(0)} L${pts.replace(/ /g, ' L')} L${x(values.length - 1)},${y(0)} Z`
  const pk = values.indexOf(Math.max(...values))
  const anchor = pk > values.length - 4 ? 'end' : pk < 3 ? 'start' : 'middle'
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Results per day, peak ${fmt(values[pk])} on ${dayLabel(days[pk].day)}`}>
      <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity={0.35} /><stop offset="1" stopColor={color} stopOpacity={0} /></linearGradient></defs>
      {grid}
      <path d={area} fill={`url(#${id})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" />
      <circle cx={x(pk)} cy={y(values[pk])} r={5} fill={color} stroke="#272727" strokeWidth={2} />
      <text className={s.tFg} x={x(pk)} y={y(values[pk]) - 12} fontSize={12} fontWeight={800} textAnchor={anchor}>{fmt(values[pk])} on {dayLabel(days[pk].day)}</text>
    </svg>
  )
}

export function Donut({ counts, centerLabel = 'results' }: { counts: Record<K, number>; centerLabel?: string }) {
  const total = counts.pos + counts.neu + counts.neg
  const r = 62, c = 2 * Math.PI * r
  const lens = KEYS.map((k) => (total > 0 ? (c * counts[k]) / total : 0))
  const segs = KEYS.map((k, i) => {
    const off = lens.slice(0, i).reduce((a, b) => a + b, 0)
    return <circle key={k} cx={84} cy={84} r={r} fill="none" stroke={SC[k]} strokeWidth={28} strokeDasharray={`${lens[i]} ${c - lens[i]}`} strokeDashoffset={-off} transform="rotate(-90 84 84)" />
  })
  return (
    <svg viewBox="0 0 168 168" role="img" aria-label={KEYS.map((k) => `${NAME[k]} ${pct1(counts[k], total)}%`).join(', ')}>
      {segs}
      <text className={s.tFg} x={84} y={84} fontSize={22} fontWeight={800} textAnchor="middle">{fmt(total)}</text>
      <text className={s.tMuted} x={84} y={102} fontSize={11} textAnchor="middle">{centerLabel}</text>
    </svg>
  )
}

/** The donut's legend: each sentiment with its count, its share and, when given, its points change. */
export function Legend({ counts, pct, changes, label }: { counts: Record<K, number>; pct: SlPct; changes?: Record<K, number | null> | null; label?: string }) {
  return (
    <ul className={s.legend}>
      {KEYS.map((k) => (
        <li key={k}>
          <span className={s.sw} style={{ background: SC[k] }} />
          <span>{NAME[k]} <span className={s.mutedText}>({fmt(counts[k])})</span></span>
          <span className={s.num}>{pct[k]}%</span>
          {changes && <span className={s.chg}><Change v={changes[k]} unit="pts" label={label ?? ''} invert={k === 'neg'} neutral={k === 'neu'} /></span>}
        </li>
      ))}
    </ul>
  )
}

/** Sentiment by media type: one stacked bar per type, the share printed inside a segment of 9% or more. */
export function HBars({ rows }: { rows: SlCrossRow[] }) {
  return (
    <>
      <div className={s.hbars}>
        {rows.map((r) => (
          <div key={r.media} className={s.hrow}>
            <div className={s.lab} title={r.media}>{r.media}<span>{fmt(r.total)}</span></div>
            <div className={s.hbar} role="img" aria-label={`${r.media}: ${KEYS.map((k) => `${NAME[k]} ${fmt(r[k])}`).join(', ')}`}>
              {KEYS.map((k) => {
                const p = r.total > 0 ? (100 * r[k]) / r.total : 0
                return p > 0 ? <i key={k} style={{ width: `${p}%`, background: SC[k] }} title={`${NAME[k]}: ${fmt(r[k])}`}>{p >= 9 ? `${Math.round(p)}%` : ''}</i> : null
              })}
            </div>
          </div>
        ))}
      </div>
      <Key items={SENT_KEY} />
    </>
  )
}

/** Share of media types: a cyan bar, the share and the change against the previous month's export. */
export function MediaShare({ rows }: { rows: SlMediaRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count))
  return (
    <div>
      <div className={s.mhead}><span>Media type</span><span>Share</span><span>%</span><span>Change</span></div>
      {rows.map((r) => (
        <div key={r.media} className={s.mrow}>
          <span className={s.lab} title={r.media}>{r.media} <span>{fmt(r.count)}</span></span>
          <span className={s.track}><i style={{ width: `${(100 * r.count) / max}%` }} /></span>
          <span className={s.pct}>{r.pct}%</span>
          <span className={s.chg}>{r.change === null ? <span className={s.flat}>n/a</span> : <Change v={r.change} unit="%" label="" neutral />}</span>
        </div>
      ))}
    </div>
  )
}

/** Year to date: one 100% column per month, each share printed inside when there is room; the last month in bold. A month
 *  with no data has no column. */
export function YtdColumns({ points, aria }: { points: YtdPoint[]; aria: string }) {
  const W = 960, H = 250, L = 8, R = 8, T = 8, B = 28
  const n = Math.max(points.length, 1)
  const slot = (W - L - R) / n, bw = Math.min(64, slot * 0.62)
  const out: ReactNode[] = []
  points.forEach((p, i) => {
    const cx = L + slot * i + slot / 2
    if (p.value) {
      const tr = [p.value.pos, p.value.neu, p.value.neg]
      const tot = tr[0] + tr[1] + tr[2] || 1
      let yb = H - B
      tr.forEach((v, j) => {
        const h = ((H - B - T) * v) / tot
        const ytop = yb - h
        out.push(<rect key={`r${i}${j}`} x={cx - bw / 2} y={ytop} width={bw} height={Math.max(h - 1, 0)} rx={3} style={{ fill: SC[KEYS[j]] }} />)
        if (h >= 16) out.push(<text key={`v${i}${j}`} className={s.tSeg} x={cx} y={ytop + h / 2 + 4} fontSize={11} textAnchor="middle">{v}</text>)
        yb = ytop
      })
    }
    out.push(<text key={`m${i}`} className={s.tMuted} x={cx} y={H - 8} fontSize={12} textAnchor="middle" fontWeight={i === points.length - 1 ? 800 : 400}>{monthShort(p.month)}</text>)
  })
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={aria}>{out}</svg>
      <Key items={SENT_KEY} />
    </>
  )
}

/** Year-to-date counts as columns, one per month, each labelled with its value: the shape of YtdColumns for a count
 *  (followers, views) rather than sentiment shares (plan docs/superpowers/plans/2026-11-23-os-design-phase1.md, Task 6).
 *  Scaled to the largest value. A month with no data is a gap (no column, its month still labelled), never a 0. */
export function CountColumns({ points, aria }: { points: { label: string; value: number | null }[]; aria: string }) {
  const W = 960, H = 250, L = 8, R = 8, T = 24, B = 28
  const n = Math.max(points.length, 1)
  const slot = (W - L - R) / n, bw = Math.min(64, slot * 0.62)
  const max = Math.max(0, ...points.map((p) => p.value ?? 0)) || 1
  const out: ReactNode[] = []
  points.forEach((p, i) => {
    const cx = L + slot * i + slot / 2
    if (p.value !== null) {
      const h = ((H - B - T) * Math.max(p.value, 0)) / max
      out.push(<rect key={`r${i}`} x={cx - bw / 2} y={H - B - h} width={bw} height={h} rx={3} style={{ fill: 'var(--cyan)' }} />)
      out.push(<text key={`v${i}`} className={s.tFg} x={cx} y={H - B - h - 6} fontSize={12} fontWeight={700} textAnchor="middle">{p.value.toLocaleString('en-US')}</text>)
    }
    out.push(<text key={`m${i}`} className={s.tMuted} x={cx} y={H - 8} fontSize={12} textAnchor="middle" fontWeight={i === points.length - 1 ? 800 : 400}>{p.label}</text>)
  })
  return <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={aria}>{out}</svg>
}

/** Two lines with every point labelled (positive + neutral above, negative below); a month with no data breaks the line. */
export function PointLines({ months, series }: { months: string[]; series: { name: string; vals: (number | null)[]; color: string; below?: boolean }[] }) {
  const W = 960, H = 240, L = 34, R = 16, T = 22, B = 28
  // A single month sits in the middle rather than on the left axis.
  const x = (i: number) => (months.length === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (months.length - 1))
  const y = (v: number) => T + (H - T - B) * (1 - v / 100)
  const g: ReactNode[] = []
  for (let v = 0; v <= 100; v += 25) {
    g.push(<line key={`g${v}`} className={s.gridLine} x1={L} x2={W - R} y1={y(v)} y2={y(v)} />)
    g.push(<text key={`t${v}`} className={s.tMuted} x={L - 6} y={y(v) + 4} fontSize={11} textAnchor="end">{v}%</text>)
  }
  months.forEach((m, i) => g.push(<text key={`m${i}`} className={s.tMuted} x={x(i)} y={H - 8} fontSize={11} textAnchor="middle" fontWeight={i === months.length - 1 ? 800 : 400}>{monthShort(m)}</text>))
  series.forEach(({ name, vals, color, below }) => {
    let run: string[] = []
    const runs: string[][] = []
    vals.forEach((v, i) => { if (v === null) { if (run.length) runs.push(run); run = [] } else run.push(`${x(i)},${y(v)}`) })
    if (run.length) runs.push(run)
    runs.forEach((r, j) => g.push(<polyline key={`${name}l${j}`} points={r.join(' ')} fill="none" stroke={color} strokeWidth={2.5} />))
    vals.forEach((v, i) => {
      if (v === null) return
      g.push(<circle key={`${name}c${i}`} cx={x(i)} cy={y(v)} r={4} fill={color} stroke="#272727" strokeWidth={2} />)
      g.push(<text key={`${name}t${i}`} className={s.tFg} x={x(i)} y={below ? y(v) + 18 : y(v) - 10} fontSize={11} fontWeight={700} textAnchor="middle">{v}</text>)
    })
  })
  const aria = series.map((sr) => `${sr.name}: ${months.map((m, i) => `${monthShort(m)} ${sr.vals[i] ?? 'no data'}${sr.vals[i] === null ? '' : '%'}`).join(', ')}`).join('; ')
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={aria}>{g}</svg>
      <Key items={series.map((sr) => ({ name: sr.name, color: sr.color }))} />
    </>
  )
}

/** Industry sentiment over time: a stacked column per day, the peak labelled. */
export function DailyStack({ rows }: { rows: ({ day: string } & Record<K, number>)[] }) {
  const W = 960, H = 240, L = 48, R = 12, T = 24, B = 30
  if (rows.length === 0) return null
  const tot = rows.map((r) => r.pos + r.neu + r.neg)
  const max = Math.max(...tot, 1), step = niceStep((max * 1.1) / 4), top = step * Math.ceil((max * 1.1) / step)
  const slot = (W - L - R) / rows.length, bw = slot * 0.7
  const y = (v: number) => T + (H - T - B) * (1 - v / top)
  const g: ReactNode[] = []
  for (let v = 0; v <= top + 1e-9; v += step) {
    g.push(<line key={`g${v}`} className={s.gridLine} x1={L} x2={W - R} y1={y(v)} y2={y(v)} />)
    g.push(<text key={`t${v}`} className={s.tMuted} x={L - 8} y={y(v) + 4} fontSize={11} textAnchor="end">{short(v)}</text>)
  }
  rows.forEach((r, i) => {
    let base = 0
    const cx = L + slot * i + slot / 2
    KEYS.forEach((k) => {
      g.push(<rect key={`r${i}${k}`} x={cx - bw / 2} y={y(base + r[k])} width={bw} height={Math.max(y(base) - y(base + r[k]), 0)} style={{ fill: SC[k] }} />)
      base += r[k]
    })
    if (i % 7 === 0 || i === rows.length - 1) g.push(<text key={`x${i}`} className={s.tMuted} x={cx} y={H - 8} fontSize={11} textAnchor="middle">{dayLabel(r.day)}</text>)
  })
  const pk = tot.indexOf(Math.max(...tot)), px = L + slot * pk + slot / 2
  g.push(<text key="pk" className={s.tFg} x={px} y={y(tot[pk]) - 8} fontSize={12} fontWeight={800} textAnchor="end">{fmt(tot[pk])} on {dayLabel(rows[pk].day)}</text>)
  return <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Results per day by sentiment">{g}</svg>
}

/** The cloud shows the top themes by share, as the mockup's (24 brand, 25 industry in October). */
export const CLOUD_MAX = 25

/** The keyword cloud: the top themes, biggest in the middle, size by the square root of the share. */
export function Cloud({ themes, colorFor }: { themes: { theme: string; share: number; color: string }[]; colorFor: (t: { color: string }, i: number) => string }) {
  if (themes.length === 0) return <p className={s.note}>No themes in this export.</p>
  const sorted = [...themes].sort((a, b) => b.share - a.share).slice(0, CLOUD_MAX)
  const lo = sorted[sorted.length - 1].share, hi = sorted[0].share
  const arr: typeof sorted = []
  sorted.forEach((t, i) => (i % 2 ? arr.push(t) : arr.unshift(t)))
  return (
    <div className={s.cloud} aria-label="Keyword themes">
      {arr.map((t, i) => {
        const size = 13 + 19 * Math.sqrt((t.share - lo) / (hi - lo || 1))
        return <span key={t.theme} style={{ fontSize: `${size.toFixed(1)}px`, color: colorFor(t, i) }} title={`${t.theme}: ${(t.share * 100).toFixed(1)}% of results`}>{t.theme}</span>
      })}
    </div>
  )
}

/** The industry cloud's decoration colours, as the mockup's (they mean nothing). */
export const decoColor = (_t: unknown, i: number) => ['#60FDFF', '#39A0FF', '#A08BFF', '#9EFEFF'][i % 4]
