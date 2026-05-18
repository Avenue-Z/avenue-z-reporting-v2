'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

export interface FunnelStage {
  label: string
  description: string
  count: number
  color: string
}

interface SessionDepthFunnelProps {
  stages: FunnelStage[]
}

function InlineTooltip({ text }: { text: string }) {
  return (
    <div className="group relative flex-shrink-0">
      <span className="flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full border border-white/20 text-[9px] font-bold leading-none text-text-muted">
        ?
      </span>
      <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-72 -translate-x-1/2 rounded-md border border-white/[0.08] bg-bg-surface px-3 py-2 text-xs leading-relaxed text-text-muted opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
        {text}
        <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-white/[0.08]" />
      </div>
    </div>
  )
}

export function SessionDepthFunnel({ stages }: SessionDepthFunnelProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  if (!stages.length) return null

  const top = stages[0].count || 1

  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6">
      <div className="mb-6 flex items-center gap-2">
        <h3 className="text-lg font-bold text-white">Session Depth Funnel</h3>
        <InlineTooltip text="How far visitors progress through a session. Each stage shows how many sessions cleared that threshold — from everyone who visited, to those who engaged, to those who converted. Drop-off between stages reveals where you lose the most visitors." />
      </div>

      <div className="space-y-1">
        {stages.map((stage, i) => {
          const retentionPct = (stage.count / top) * 100
          const prevCount    = i > 0 ? stages[i - 1].count : null
          const dropoffCount = prevCount != null ? prevCount - stage.count : null
          const dropoffPct   = prevCount != null && prevCount > 0
            ? ((prevCount - stage.count) / prevCount) * 100
            : null

          const isHovered = hoveredIdx === i
          const isDimmed  = hoveredIdx !== null && !isHovered

          return (
            <div key={stage.label}>
              {/* Drop-off connector */}
              {dropoffCount != null && dropoffPct != null && (
                <div
                  className={cn(
                    'flex items-center gap-3 py-1.5 pl-2 transition-opacity duration-200',
                    isDimmed ? 'opacity-20' : 'opacity-100'
                  )}
                >
                  <div className="flex h-4 w-4 shrink-0 items-center justify-center">
                    <svg width="8" height="16" viewBox="0 0 8 16" fill="none">
                      <path d="M4 0 L4 12 M1 9 L4 13 L7 9" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <span className="text-[11px] text-text-muted/60">
                    {dropoffCount.toLocaleString()} dropped off
                  </span>
                  <span className="text-[11px] font-bold text-[#FF4444]/70">
                    −{dropoffPct.toFixed(1)}%
                  </span>
                </div>
              )}

              {/* Stage row */}
              <div
                className={cn(
                  'group relative cursor-default overflow-hidden rounded-lg border px-4 py-3 transition-all duration-200',
                  isHovered
                    ? 'border-white/[0.15] bg-white/[0.04]'
                    : 'border-white/[0.06] bg-white/[0.02]',
                  isDimmed ? 'opacity-25' : 'opacity-100'
                )}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                {/* Funnel fill bar */}
                <div
                  className="pointer-events-none absolute inset-y-0 left-0 rounded-lg transition-all duration-500"
                  style={{
                    width: `${retentionPct}%`,
                    backgroundColor: stage.color,
                    opacity: isHovered ? 0.14 : 0.08,
                  }}
                />

                <div className="relative flex items-center gap-4">
                  {/* Rank badge */}
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[11px] font-bold text-black"
                    style={{ backgroundColor: stage.color }}
                  >
                    {i + 1}
                  </span>

                  {/* Label + description */}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white">{stage.label}</p>
                    <p className="text-[11px] text-text-muted">{stage.description}</p>
                  </div>

                  {/* Count + retention */}
                  <div className="shrink-0 text-right">
                    <p className="tabular-nums text-sm font-bold text-white">
                      {stage.count.toLocaleString()}
                    </p>
                    <p
                      className="text-[11px] font-semibold"
                      style={{ color: i === 0 ? 'rgba(255,255,255,0.4)' : stage.color }}
                    >
                      {i === 0 ? '100%' : `${retentionPct.toFixed(1)}% of total`}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Summary bar */}
      <div className="mt-5 flex gap-1 overflow-hidden rounded-full">
        {stages.map((stage, i) => {
          const width =
            i < stages.length - 1
              ? ((stage.count - stages[i + 1].count) / top) * 100
              : (stage.count / top) * 100
          if (width <= 0) return null
          return (
            <div
              key={stage.label}
              className="h-1.5 rounded-full transition-all duration-300"
              style={{
                width: `${width}%`,
                backgroundColor: stage.color,
                opacity: hoveredIdx === null || hoveredIdx === i ? 0.8 : 0.2,
              }}
              title={`${stage.label}: ${stage.count.toLocaleString()}`}
            />
          )
        })}
      </div>
      <div className="mt-2 flex gap-4">
        {stages.map((stage, i) => {
          const width =
            i < stages.length - 1
              ? ((stage.count - stages[i + 1].count) / top) * 100
              : (stage.count / top) * 100
          if (width <= 0) return null
          return (
            <div key={stage.label} className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: stage.color }} />
              <span className="text-[10px] text-text-muted">{stage.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
