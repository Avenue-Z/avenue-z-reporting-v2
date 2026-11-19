'use client'
// The tab's Recharts charts: results over time, sentiment over time, the sentiment donut and the year to date charts.
// Animations are off in the PDF export (useExportMode), as the other charts do. A YTD gap is a missing bar or a break
// in the line, never a zero.
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { useExportMode } from '@/components/export/export-mode'
import { SENTIMENT_COLORS } from '@/lib/organic-social/social-listening/colors'
import type { SlPct, YtdPoint } from '@/lib/organic-social/social-listening/compare'
import type { SlDay } from '@/lib/organic-social/social-listening/types'

const TOOLTIP = { background: '#272727', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#FFFFFF', fontSize: '12px' }
const AXIS = { stroke: 'rgba(255,255,255,0.4)', fontSize: 11 }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthShort = (key: string) => MONTHS[Number(key.slice(5, 7)) - 1] ?? key
const dayShort = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`

export function DailyResults({ days }: { days: SlDay[] }) {
  const animate = !useExportMode()
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={days} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="day" tickFormatter={dayShort} {...AXIS} />
        <YAxis {...AXIS} width={40} allowDecimals={false} />
        <Tooltip contentStyle={TOOLTIP} />
        <Area type="monotone" dataKey="results" name="Results" stroke="#60FDFF" fill="#60FDFF" fillOpacity={0.15} isAnimationActive={animate} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function DailySentiment({ days }: { days: ({ day: string } & { pos: number; neu: number; neg: number })[] }) {
  const animate = !useExportMode()
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={days} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="day" tickFormatter={dayShort} {...AXIS} />
        <YAxis {...AXIS} width={40} allowDecimals={false} />
        <Tooltip contentStyle={TOOLTIP} />
        {(['pos', 'neu', 'neg'] as const).map((k) => (
          <Area key={k} type="monotone" dataKey={k} stackId="s" name={{ pos: 'Positive', neu: 'Neutral', neg: 'Negative' }[k]}
            stroke={SENTIMENT_COLORS[k]} fill={SENTIMENT_COLORS[k]} fillOpacity={0.35} isAnimationActive={animate} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function SentimentDonut({ counts }: { counts: { pos: number; neu: number; neg: number } }) {
  const animate = !useExportMode()
  const data = (['pos', 'neu', 'neg'] as const).map((k) => ({ name: { pos: 'Positive', neu: 'Neutral', neg: 'Negative' }[k], value: counts[k], color: SENTIMENT_COLORS[k] }))
  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Pie data={data} dataKey="value" innerRadius="58%" outerRadius="85%" paddingAngle={2} stroke="none" isAnimationActive={animate}>
          {data.map((d) => <Cell key={d.name} fill={d.color} />)}
        </Pie>
        <Tooltip contentStyle={TOOLTIP} />
      </PieChart>
    </ResponsiveContainer>
  )
}

/** One bar per month, positive, neutral and negative stacked as whole percents. A gap month has no bar. */
export function YtdStacked({ points }: { points: YtdPoint[] }) {
  const animate = !useExportMode()
  const data = points.map((p) => ({ month: monthShort(p.month), ...(p.value ?? {}) } as { month: string } & Partial<SlPct>))
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="month" {...AXIS} />
        <YAxis {...AXIS} width={40} domain={[0, 100]} unit="%" />
        <Tooltip contentStyle={TOOLTIP} formatter={(v) => `${v}%`} />
        {(['pos', 'neu', 'neg'] as const).map((k) => (
          <Bar key={k} dataKey={k} stackId="s" name={{ pos: 'Positive', neu: 'Neutral', neg: 'Negative' }[k]} fill={SENTIMENT_COLORS[k]} isAnimationActive={animate} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Positive + neutral against negative, by month: two lines, broken at a gap. */
export function YtdPosNeu({ points, negative }: { points: { month: string; value: number | null }[]; negative: YtdPoint[] }) {
  const animate = !useExportMode()
  const data = points.map((p, i) => ({ month: monthShort(p.month), posNeu: p.value ?? undefined, neg: negative[i]?.value?.neg ?? undefined }))
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="month" {...AXIS} />
        <YAxis {...AXIS} width={40} domain={[0, 100]} unit="%" />
        <Tooltip contentStyle={TOOLTIP} formatter={(v) => `${v}%`} />
        <Line dataKey="posNeu" name="Positive + neutral" stroke={SENTIMENT_COLORS.pos} strokeWidth={2} dot isAnimationActive={animate} />
        <Line dataKey="neg" name="Negative" stroke={SENTIMENT_COLORS.neg} strokeWidth={2} dot isAnimationActive={animate} />
      </LineChart>
    </ResponsiveContainer>
  )
}
