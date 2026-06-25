'use client'

// FB-037: Recharts ScatterChart for §D "AI Bot Traffic vs. Human Traffic".
//
// X-axis = AI bot crawl visits per page (last 30 days, Peec /agent-analytics).
// Y-axis = Human GA4 sessions per page (last 30 days, sessionSource not in
//          the AI referrer list).
// 4 quadrants via median-split reference lines + corner labels.

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import type { BotVsHumanScatterResult } from '@/lib/peec/bot-vs-human-scatter'

interface Props {
  data: BotVsHumanScatterResult
}

// Per-quadrant fill so the four buckets are visually distinct without a legend.
const QUADRANT_FILL: Record<string, string> = {
  'high-bot-high-human': '#60FF80', // green: both high (winners)
  'low-bot-high-human':  '#39A0FF', // blue: human-popular, AI-quiet
  'high-bot-low-human':  '#FFC857', // yellow: AI is crawling, humans aren't visiting
  'low-bot-low-human':   '#888888', // gray: both low (background)
}

export default function BotVsHumanScatter({ data }: Props) {
  if (data.points.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-white/[0.08]">
        <p className="text-xs text-text-muted">
          No page-level bot or human traffic in the last 30 days. Requires GA4 page-level data and Peec agent analytics.
        </p>
      </div>
    )
  }

  const cornerLabel = 'text-[10px] font-semibold uppercase tracking-wide text-text-muted'

  // Render four overlay tags (one per corner). The chart fills the parent
  // container; the labels are absolutely positioned over the chart pane.
  return (
    <div className="relative w-full">
      <div className="pointer-events-none absolute inset-0 z-10">
        <span className={`absolute left-4 top-4 ${cornerLabel}`}>Low Bot Traffic, High Human Traffic</span>
        <span className={`absolute right-4 top-4 ${cornerLabel}`}>High Bot Traffic, High Human Traffic</span>
        <span className={`absolute left-4 bottom-12 ${cornerLabel}`}>Low Bot Traffic, Low Human Traffic</span>
        <span className={`absolute right-4 bottom-12 ${cornerLabel}`}>High Bot Traffic, Low Human Traffic</span>
      </div>
      <ResponsiveContainer width="100%" height={420}>
        <ScatterChart margin={{ top: 24, right: 24, bottom: 40, left: 24 }}>
          <CartesianGrid stroke="#FFFFFF14" />
          <XAxis
            type="number"
            dataKey="bots"
            name="AI Bot Visits"
            tick={{ fill: '#9CA3AF', fontSize: 11 }}
            label={{ value: 'AI Bot Visits (last 30 days)', position: 'insideBottom', offset: -10, fill: '#9CA3AF', fontSize: 11 }}
          />
          <YAxis
            type="number"
            dataKey="humans"
            name="Human Sessions"
            tick={{ fill: '#9CA3AF', fontSize: 11 }}
            label={{ value: 'Human Sessions (last 30 days)', angle: -90, position: 'insideLeft', fill: '#9CA3AF', fontSize: 11 }}
          />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            contentStyle={{ background: '#272727', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6 }}
            labelStyle={{ color: '#FFFFFF', fontWeight: 600 }}
            itemStyle={{ color: '#FFFFFF' }}
            formatter={(value: unknown, name: unknown) => [String(value), String(name)]}
            labelFormatter={(_label, payload) => {
              const p = payload?.[0]?.payload as { path?: string } | undefined
              return p?.path ?? ''
            }}
          />
          <ReferenceLine x={data.medianBot} stroke="#FFFFFF40" strokeDasharray="4 4" />
          <ReferenceLine y={data.medianHuman} stroke="#FFFFFF40" strokeDasharray="4 4" />
          <Scatter
            data={data.points.map((p) => ({
              ...p,
              fill: QUADRANT_FILL[p.quadrant],
            }))}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}
