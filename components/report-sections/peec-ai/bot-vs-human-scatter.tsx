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
import { type BotVsHumanScatterResult, type BotVsHumanState, botVsHumanState } from '@/lib/peec/bot-vs-human-scatter'

interface Props {
  data: BotVsHumanScatterResult
}

// Message per non-renderable state. Distinguishes "no bot data" (the common
// case — Peec agent analytics not yet crawling the site) from a fully empty
// chart, so the reader isn't shown a degenerate strip of points at x=0.
const EMPTY_MESSAGE: Record<Exclude<BotVsHumanState, 'ok'>, string> = {
  'no-bots':
    "No AI bot crawl data in the last 30 days, so the bot axis can't be plotted. Peec agent analytics shows no AI crawler visits for this site yet.",
  'no-humans': 'No human GA4 sessions in the last 30 days for these pages.',
  'empty':
    'No page-level bot or human traffic in the last 30 days. Requires GA4 page-level data and Peec agent analytics.',
}

// Per-quadrant fill so the four buckets are visually distinct without a legend.
const QUADRANT_FILL: Record<string, string> = {
  'high-bot-high-human': '#60FF80', // green: both high (winners)
  'low-bot-high-human':  '#39A0FF', // blue: human-popular, AI-quiet
  'high-bot-low-human':  '#FFC857', // yellow: AI is crawling, humans aren't visiting
  'low-bot-low-human':   '#888888', // gray: both low (background)
}

export default function BotVsHumanScatter({ data }: Props) {
  const state = botVsHumanState(data)
  if (state !== 'ok') {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-white/[0.08]">
        <p className="max-w-md text-center text-xs text-text-muted">
          {EMPTY_MESSAGE[state]}
        </p>
      </div>
    )
  }

  const cornerLabel = 'text-[10px] font-semibold uppercase tracking-wide text-text-muted'

  // Render four overlay labels in a 2x2 CSS grid so each label sits in its
  // true quadrant cell (top-left = Low Bot/High Human, etc.).
  return (
    <div className="relative w-full">
      <div className="pointer-events-none absolute inset-0 z-10 grid grid-cols-2 grid-rows-2">
        <div className="flex items-start justify-start p-4"><span className={cornerLabel}>Low Bot, High Human</span></div>
        <div className="flex items-start justify-end p-4"><span className={cornerLabel}>High Bot, High Human</span></div>
        <div className="flex items-end justify-start p-4"><span className={cornerLabel}>Low Bot, Low Human</span></div>
        <div className="flex items-end justify-end p-4"><span className={cornerLabel}>High Bot, Low Human</span></div>
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
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) return null
              const p = payload[0]?.payload as { path?: string; bots?: number; humans?: number } | undefined
              if (!p) return null
              return (
                <div className="rounded-md border border-white/[0.08] bg-[#272727] p-3 text-xs">
                  <div className="mb-2 font-semibold text-white">{p.path ?? '(unknown)'}</div>
                  <div className="text-white/70">AI Bot Visits: <span className="tabular-nums text-white">{(p.bots ?? 0).toLocaleString()}</span></div>
                  <div className="text-white/70">Human Sessions: <span className="tabular-nums text-white">{(p.humans ?? 0).toLocaleString()}</span></div>
                </div>
              )
            }}
          />
          <ReferenceLine x={data.medianBot} stroke="#FFFFFF80" strokeDasharray="4 4" strokeWidth={1.5} />
          <ReferenceLine y={data.medianHuman} stroke="#FFFFFF80" strokeDasharray="4 4" strokeWidth={1.5} />
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
