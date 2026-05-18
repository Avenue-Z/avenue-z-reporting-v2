'use client'

import type { LifecycleStageCount } from '@/lib/hubspot/client'

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

interface LifecycleFunnelProps {
  stages: LifecycleStageCount[]
}

export function LifecycleFunnel({ stages }: LifecycleFunnelProps) {
  const maxTotal = Math.max(...stages.map((s) => s.total), 1)
  const hasData  = stages.some((s) => s.total > 0)

  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6">
      <div className="mb-6 flex items-center gap-2">
        <h3 className="text-lg font-bold text-white">Lifecycle Stage Funnel</h3>
        <InlineTooltip text="Shows how contacts created in this period have progressed through HubSpot lifecycle stages. Conversion rate shown between adjacent stages." />
      </div>

      {!hasData ? (
        <p className="py-10 text-center text-sm italic text-text-muted/50">
          No lifecycle data available for this period.
        </p>
      ) : (
        <div className="space-y-1">
          {stages.map((stage, i) => {
            const barPct = (stage.total / maxTotal) * 100
            const prev   = stages[i - 1]
            const convRate = prev && prev.total > 0
              ? ((stage.total / prev.total) * 100).toFixed(0)
              : null

            return (
              <div key={stage.stage}>
                {/* Conversion rate connector */}
                {convRate !== null && (
                  <div className="my-1 flex items-center gap-3 pl-28">
                    <div className="h-3 w-px bg-white/[0.08]" />
                    <span className="text-[10px] font-bold text-text-muted">
                      {convRate}% converted
                    </span>
                  </div>
                )}

                {/* Stage row */}
                <div className="flex items-center gap-3">
                  {/* Label */}
                  <div className="w-24 shrink-0 text-right">
                    <span className="text-xs font-semibold text-text-muted">{stage.label}</span>
                  </div>

                  {/* Bar */}
                  <div className="relative flex-1">
                    <div className="h-8 w-full overflow-hidden rounded-md bg-white/[0.04]">
                      <div
                        className="h-full rounded-md transition-all duration-300"
                        style={{
                          width: `${barPct}%`,
                          background: i === 0
                            ? 'rgba(255,255,255,0.1)'
                            : i === stages.length - 1
                            ? 'linear-gradient(90deg, #60FF80 0%, #60FDFF 100%)'
                            : `rgba(96,255,128,${0.08 + (i / stages.length) * 0.18})`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Count */}
                  <div className="w-16 shrink-0 text-right">
                    <span className="text-sm font-bold tabular-nums text-white">
                      {stage.total.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
