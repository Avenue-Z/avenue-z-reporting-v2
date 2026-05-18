'use client'

import { useState } from 'react'
import type { WeeklyVisibility } from '@/lib/peec/client'

export function VisibilityChart({
  data,
  competitorData,
  brandName,
}: {
  data: WeeklyVisibility[]
  competitorData: WeeklyVisibility[]
  brandName?: string
}) {
  const [hovered, setHovered] = useState<number | null>(null)

  if (data.length === 0) return null

  const CHART_MAX = Math.max(...data.map((d) => d.visibility), ...competitorData.map((d) => d.visibility), 1)
  const n = data.length

  // Build a map of competitor visibility by weekStart for alignment
  const competitorMap = new Map(competitorData.map((d) => [d.weekStart, d.visibility]))

  // SVG line points: x = center of each bar slot (0..1), y = visibility / 100
  const competitorPoints = data.map((week, i) => {
    const x = (i + 0.5) / n
    const vis = competitorMap.get(week.weekStart) ?? null
    return { x, vis }
  }).filter((p): p is { x: number; vis: number } => p.vis !== null)

  // Build SVG polyline points string (y is inverted: 0% vis = bottom = 100% svg y)
  const svgPoints = competitorPoints
    .map((p) => `${(p.x * 100).toFixed(2)},${(100 - (p.vis / CHART_MAX) * 100).toFixed(2)}`)
    .join(' ')

  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-5">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-text-muted">AI Visibility — Year to Date</p>
          {brandName && <p className="text-xs text-text-muted mt-0.5">{brandName} · weekly</p>}
        </div>
        <div className="flex items-center gap-4 text-[10px] text-text-muted">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-sm bg-[#60FDFF]" />
            Avenue Z
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 border-t border-dashed border-[#8A8A8A]" />
            Competitor avg
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="flex gap-2">
        {/* Bars + SVG overlay */}
        <div className="relative flex-1 h-40">
          {/* Gridlines */}
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="w-full border-t border-white/[0.04]" />
            ))}
          </div>

          {/* Bars */}
          <div className="relative flex gap-1 h-full">
            {data.map((week, i) => {
              const heightPct = (week.visibility / CHART_MAX) * 100
              const isHovered = hovered === i
              const compVis = competitorMap.get(week.weekStart)
              return (
                <div
                  key={week.weekStart}
                  className="relative flex-1 h-full group cursor-default"
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                >
                  {isHovered && (
                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap rounded-md border border-white/[0.08] bg-bg-surface px-2.5 py-1.5 text-xs shadow-xl pointer-events-none">
                      <p className="font-bold text-white">{week.visibility.toFixed(1)}%</p>
                      {compVis !== undefined && (
                        <p className="text-text-muted">Competitors: {compVis.toFixed(1)}%</p>
                      )}
                      <p className="text-text-muted">{week.weekLabel}</p>
                    </div>
                  )}
                  <div
                    className="absolute bottom-0 left-0 right-0 rounded-sm transition-colors duration-150"
                    style={{
                      height: `${Math.max(heightPct, 1)}%`,
                      backgroundColor: isHovered ? '#9BFEFF' : '#60FDFF',
                      opacity: hovered !== null && !isHovered ? 0.35 : 1,
                    }}
                  />
                </div>
              )
            })}
          </div>

          {/* SVG competitor line overlay */}
          {competitorPoints.length > 1 && (
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <polyline
                points={svgPoints}
                fill="none"
                stroke="#8A8A8A"
                strokeWidth="1.5"
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          )}
        </div>
      </div>

      {/* X-axis labels — every other week */}
      <div className="flex gap-1 mt-2">
        {data.map((week, i) => (
          <div key={week.weekStart} className="flex-1 text-center overflow-hidden">
            {i % 2 === 0 && (
              <span className="text-[9px] text-text-muted tabular-nums">{week.weekLabel}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
