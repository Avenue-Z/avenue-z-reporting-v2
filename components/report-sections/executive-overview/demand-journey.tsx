'use client'

import { useState } from 'react'
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts'
import { cn } from '@/lib/utils'

export interface DemandStage {
  key:         string
  source:      string
  label:       string
  metric?:     string
  subMetric?:  string
  delta?:      number
  color:       string
  connector?:  string
  // Expanded card content
  heroLabel?:  string
  badge?:      string
  stats?:      { label: string; value: string }[]
  spark?:      { date: string; sessions: number }[]
  /** false renders the needs-connection treatment. Omitted or true renders normally. */
  connected?:  boolean
}

export interface DemandJourneyProps {
  stages: DemandStage[]
}

function MiniTooltip({ active, payload }: { active?: boolean; payload?: { value?: number }[] }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded border border-white/[0.08] bg-[#1e1e1e] px-2 py-1 text-[10px] text-white shadow-xl">
      {payload[0]?.value?.toLocaleString()}
    </div>
  )
}

export function DemandJourney({ stages }: DemandJourneyProps) {
  const [hovered, setHovered] = useState<string | null>(null)

  return (
    <div className="rounded-xl border border-white/[0.06] bg-bg-surface p-6">
      {/* Flow row */}
      <div className="flex items-start gap-0">
        {stages.map((stage, i) => {
          const isHov    = hovered === stage.key
          const isDimmed = hovered !== null && !isHov
          const isLast   = i === stages.length - 1
          const up       = (stage.delta ?? 0) >= 0

          return (
            <div key={stage.key} className="flex flex-1 items-start">
              {/* ── Node card ── */}
              <div
                className={cn(
                  'relative flex flex-1 cursor-default flex-col overflow-hidden rounded-xl border transition-all duration-300',
                  isHov    ? 'border-white/20 shadow-lg'         : 'border-white/[0.06]',
                  isDimmed ? 'opacity-25'                        : 'opacity-100',
                )}
                style={{ backgroundColor: isHov ? `${stage.color}0d` : 'rgba(255,255,255,0.02)' }}
                onMouseEnter={() => { if (stage.connected !== false) setHovered(stage.key) }}
                onMouseLeave={() => { if (stage.connected !== false) setHovered(null) }}
              >
                {/* Top accent bar */}
                <div
                  className="h-0.5 w-full shrink-0 transition-opacity duration-300"
                  style={{ backgroundColor: stage.color, opacity: isHov ? 1 : 0.4 }}
                />

                {/* Ambient glow */}
                <div
                  className="pointer-events-none absolute inset-0 transition-opacity duration-300"
                  style={{
                    background: `radial-gradient(ellipse at top left, ${stage.color}18 0%, transparent 65%)`,
                    opacity:    isHov ? 1 : 0,
                  }}
                />

                {/* ── Base section (always visible) ── */}
                <div className="relative p-5">
                  {/* Source label + badge */}
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: stage.color }}
                      />
                      <p
                        className="text-[10px] font-bold uppercase tracking-widest"
                        style={{ color: stage.color }}
                      >
                        {stage.source}
                      </p>
                    </div>
                    {stage.badge && (
                      <span className="rounded-full border border-white/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-text-muted">
                        {stage.badge}
                      </span>
                    )}
                  </div>

                  {/* Label */}
                  <p className="mb-1 text-xs font-semibold text-text-muted">{stage.label}</p>

                  {/* Hero metric */}
                  {stage.connected === false ? (
                    <>
                      <p className="text-sm font-bold text-white">Not connected</p>
                      <p className="mt-1 text-xs text-text-muted">Connect your CRM to see this</p>
                    </>
                  ) : (
                    <p className="text-3xl font-extrabold tracking-tight text-white">
                      {stage.metric}
                    </p>
                  )}

                  {/* Hero label (shown on hover) */}
                  <div
                    className="overflow-hidden transition-all duration-300"
                    style={{ maxHeight: isHov ? '40px' : '0', opacity: isHov ? 1 : 0 }}
                  >
                    {stage.heroLabel && (
                      <p className="mt-0.5 text-[11px] text-text-muted">{stage.heroLabel}</p>
                    )}
                  </div>

                  {/* Sub-metric (shown when NOT hovered) */}
                  <div
                    className="overflow-hidden transition-all duration-300"
                    style={{ maxHeight: !isHov ? '32px' : '0', opacity: !isHov ? 1 : 0 }}
                  >
                    {stage.subMetric && (
                      <p className="mt-0.5 text-xs text-text-muted">{stage.subMetric}</p>
                    )}
                  </div>

                  {/* Delta */}
                  {stage.delta != null && (
                    <div className="mt-3">
                      <span
                        className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold"
                        style={{
                          backgroundColor: up ? 'rgba(96,255,128,0.12)' : 'rgba(255,68,68,0.12)',
                          color:            up ? '#60FF80'               : '#FF4444',
                        }}
                      >
                        {up ? '↑' : '↓'} {Math.abs(stage.delta).toFixed(1)}%
                      </span>
                      <p className="mt-0.5 text-[9px] text-text-muted/60">vs prior period</p>
                    </div>
                  )}
                </div>

                {/* ── Expanded section (revealed on hover) ── */}
                <div
                  className="overflow-hidden transition-all duration-500"
                  style={{ maxHeight: isHov ? '400px' : '0' }}
                >
                  <div className="relative px-5 pb-5">
                    {/* Sparkline */}
                    {stage.spark && stage.spark.length > 1 && (
                      <div className="mb-4 h-16">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={stage.spark} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                            <defs>
                              <linearGradient id={`grad-${stage.key}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%"   stopColor={stage.color} stopOpacity={0.35} />
                                <stop offset="100%" stopColor={stage.color} stopOpacity={0}    />
                              </linearGradient>
                            </defs>
                            <Area
                              type="monotone"
                              dataKey="sessions"
                              stroke={stage.color}
                              strokeWidth={1.5}
                              fill={`url(#grad-${stage.key})`}
                              dot={false}
                              activeDot={{ r: 3, fill: stage.color, strokeWidth: 0 }}
                            />
                            <Tooltip
                              content={<MiniTooltip />}
                              cursor={{ stroke: 'rgba(255,255,255,0.06)', strokeWidth: 1 }}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {/* Stats list */}
                    {(stage.stats?.length ?? 0) > 0 && (
                      <div className="space-y-2 border-t border-white/[0.06] pt-3">
                        {stage.stats?.map((s) => (
                          <div key={s.label} className="flex items-center justify-between">
                            <span className="text-xs text-text-muted">{s.label}</span>
                            <span className="tabular-nums text-xs font-semibold text-white/80">
                              {s.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Connector arrow ── */}
              {!isLast && (
                <div className="flex w-10 shrink-0 flex-col items-center gap-1 pt-10">
                  <div className="h-px w-full bg-white/[0.08]" />
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                    <path
                      d="M0 4 L6 4 M4 1 L7 4 L4 7"
                      stroke="rgba(255,255,255,0.2)"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  {stage.connector && (
                    <p className="text-center text-[8px] leading-tight text-text-muted/40">
                      {stage.connector}
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
