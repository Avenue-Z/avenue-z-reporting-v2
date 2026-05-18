'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

export interface ContentFunnelStage {
  label:          string
  source:         string
  value:          number
  formattedValue: string
  detail?:        string
  color:          string
  // If true, a "—" conversion rate is shown (units differ from prior stage)
  skipConversion?: boolean
}

interface ContentFunnelProps {
  stages: ContentFunnelStage[]
}

export function ContentFunnel({ stages }: ContentFunnelProps) {
  const [hovered, setHovered] = useState<number | null>(null)
  const max = stages[0]?.value || 1

  return (
    <div className="rounded-xl border border-white/[0.06] bg-bg-surface p-6">
      <div className="mb-6">
        <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
          End-to-End Attribution
        </p>
        <h3 className="text-xl font-extrabold text-white">Content Funnel</h3>
        <p className="mt-1 text-xs text-text-muted">
          How content creates reach, traffic, and qualified contacts.
        </p>
      </div>

      <div className="space-y-1">
        {stages.map((stage, i) => {
          const barPct    = (stage.value / max) * 100
          const prev      = stages[i - 1]
          const isHov     = hovered === i
          const isDimmed  = hovered !== null && !isHov

          // Conversion rate between adjacent stages (only where units are comparable)
          const convRate = prev && !stage.skipConversion && prev.value > 0
            ? (stage.value / prev.value) * 100
            : null

          return (
            <div key={stage.label}>
              {/* Drop-off connector */}
              {i > 0 && (
                <div
                  className={cn(
                    'flex items-center gap-3 py-1.5 pl-1 transition-opacity duration-200',
                    isDimmed ? 'opacity-20' : 'opacity-100'
                  )}
                >
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center">
                    <svg width="10" height="16" viewBox="0 0 10 16" fill="none">
                      <path
                        d="M5 0 L5 11 M2 8 L5 12 L8 8"
                        stroke="rgba(255,255,255,0.15)"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  {convRate != null ? (
                    <>
                      <span className="text-[10px] text-text-muted/60">
                        {convRate.toFixed(2)}% conversion
                      </span>
                      <span className="text-[10px] font-bold text-[#FF4444]/60">
                        −{(100 - convRate).toFixed(1)}% drop-off
                      </span>
                    </>
                  ) : (
                    <span className="text-[10px] text-text-muted/40 italic">
                      different units — see below for context
                    </span>
                  )}
                </div>
              )}

              {/* Stage row */}
              <div
                className={cn(
                  'group relative flex cursor-default items-center gap-4 overflow-hidden rounded-lg border px-4 py-3 transition-all duration-200',
                  isHov    ? 'border-white/[0.12] shadow-sm' : 'border-white/[0.06]',
                  isDimmed ? 'opacity-25'                    : 'opacity-100'
                )}
                style={{ backgroundColor: isHov ? `${stage.color}0d` : 'rgba(255,255,255,0.02)' }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              >
                {/* Bar fill */}
                <div
                  className="pointer-events-none absolute inset-y-0 left-0 rounded-lg transition-all duration-500"
                  style={{
                    width:           `${barPct}%`,
                    backgroundColor: stage.color,
                    opacity:         isHov ? 0.12 : 0.07,
                  }}
                />

                {/* Rank + source badge */}
                <div className="relative flex w-52 shrink-0 items-center gap-3">
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold"
                    style={{ backgroundColor: stage.color, color: '#000' }}
                  >
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">{stage.label}</p>
                    <p className="text-[10px]" style={{ color: stage.color }}>
                      {stage.source}
                    </p>
                  </div>
                </div>

                {/* Bar track */}
                <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${barPct}%`, backgroundColor: stage.color, opacity: 0.8 }}
                  />
                </div>

                {/* Value + detail */}
                <div className="relative w-36 shrink-0 text-right">
                  <p className="tabular-nums text-lg font-bold text-white">
                    {stage.formattedValue}
                  </p>
                  {stage.detail && (
                    <p className="text-[10px] text-text-muted">{stage.detail}</p>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
