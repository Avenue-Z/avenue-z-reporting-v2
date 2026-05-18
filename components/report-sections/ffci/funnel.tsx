'use client'

import { CHART_COLORS } from '@/lib/constants'

interface FunnelStage {
  stage: string
  value: number
  label: string
}

interface FFCIFunnelProps {
  stages: FunnelStage[]
}

const STAGE_COLORS = [
  CHART_COLORS.metaAds,  // purple — PR impressions
  CHART_COLORS.primary,  // cyan — branded searches
  CHART_COLORS.ga4,      // blue — sessions
  CHART_COLORS.positive, // green — conversions
  CHART_COLORS.email,    // yellow — revenue
]

export function FFCIFunnel({ stages }: FFCIFunnelProps) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-bg-surface p-6">
      <div className="flex flex-col gap-2">
        {stages.map((stage, i) => {
          // Width shrinks from 100% to a minimum of 20%
          const widthPercent = 100 - (i / (stages.length - 1)) * 70
          const color = STAGE_COLORS[i] ?? CHART_COLORS.neutral
          const conversionRate =
            i > 0
              ? ((stages[i].value / stages[i - 1].value) * 100).toFixed(
                  stages[i].value / stages[i - 1].value < 0.01 ? 2 : 1
                )
              : null

          return (
            <div key={stage.stage} className="flex items-center gap-4">
              {/* Funnel bar */}
              <div className="flex-1">
                <div
                  className="flex items-center justify-between rounded-lg px-4 py-3 transition-all"
                  style={{
                    width: `${widthPercent}%`,
                    background: `${color}18`,
                    borderLeft: `3px solid ${color}`,
                  }}
                >
                  <span className="text-sm font-bold text-white">{stage.stage}</span>
                  <span className="text-sm font-extrabold text-white">{stage.label}</span>
                </div>
              </div>

              {/* Conversion rate arrow */}
              <div className="w-16 text-right">
                {conversionRate !== null && (
                  <span className="text-xs text-white/40">{conversionRate}%</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Overall conversion label */}
      <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-4">
        <span className="text-xs font-bold uppercase tracking-widest text-text-muted">
          Overall PR → Revenue Rate
        </span>
        <span className="text-sm font-bold" style={{ color: CHART_COLORS.positive }}>
          {((stages[stages.length - 1].value / stages[0].value) * 100).toFixed(4)}%
        </span>
      </div>
    </div>
  )
}
