'use client'

import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts'

export interface SignalStat {
  label: string
  value: string
}

export interface SparkPoint {
  date:     string
  sessions: number
}

export interface SignalCardProps {
  source:    string
  title:     string
  hero:      string
  heroLabel: string
  delta?:    number
  stats:     SignalStat[]
  color:     string
  spark?:    SparkPoint[]
  badge?:    string  // optional pill (e.g. "YTD")
}

function MiniTooltip({ active, payload }: { active?: boolean; payload?: { value?: number }[] }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded border border-white/[0.08] bg-[#1e1e1e] px-2 py-1 text-[10px] text-white shadow-xl">
      {payload[0]?.value?.toLocaleString()}
    </div>
  )
}

export function SignalCard({
  source, title, hero, heroLabel, delta, stats, color, spark, badge,
}: SignalCardProps) {
  const up = delta != null && delta >= 0

  return (
    <div className="relative flex flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-bg-surface">
      {/* Top accent */}
      <div className="h-0.5 w-full" style={{ backgroundColor: color }} />

      {/* Subtle glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(ellipse at top left, ${color}10 0%, transparent 60%)` }}
      />

      <div className="relative flex flex-1 flex-col p-5">
        {/* Source chip */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-[10px] font-bold uppercase tracking-widest"
                  style={{ color }}>
              {source}
            </span>
          </div>
          {badge && (
            <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-text-muted">
              {badge}
            </span>
          )}
        </div>

        {/* Title */}
        <p className="mb-1 text-xs font-semibold text-text-muted">{title}</p>

        {/* Hero */}
        <p className="text-4xl font-extrabold tracking-tight text-white">{hero}</p>
        <p className="mb-4 text-[11px] text-text-muted">{heroLabel}</p>

        {/* Delta */}
        {delta != null && (
          <div className="mb-4 flex items-center gap-2">
            <span
              className="rounded-full px-2.5 py-0.5 text-xs font-bold"
              style={{
                backgroundColor: up ? 'rgba(96,255,128,0.12)' : 'rgba(255,68,68,0.12)',
                color:            up ? '#60FF80'               : '#FF4444',
              }}
            >
              {up ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}%
            </span>
            <span className="text-[10px] text-text-muted">vs prior period</span>
          </div>
        )}

        {/* Sparkline */}
        {spark && spark.length > 1 && (
          <div className="mb-4 h-14">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={spark} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={`spark-grad-${source}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor={color} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={color} stopOpacity={0}   />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="sessions"
                  stroke={color}
                  strokeWidth={1.5}
                  fill={`url(#spark-grad-${source})`}
                  dot={false}
                  activeDot={{ r: 3, fill: color, strokeWidth: 0 }}
                />
                <Tooltip
                  content={<MiniTooltip />}
                  cursor={{ stroke: 'rgba(255,255,255,0.06)', strokeWidth: 1 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Supporting stats */}
        <div className="mt-auto space-y-2 border-t border-white/[0.06] pt-3">
          {stats.map((s) => (
            <div key={s.label} className="flex items-center justify-between">
              <span className="text-xs text-text-muted">{s.label}</span>
              <span className="tabular-nums text-xs font-semibold text-white/80">{s.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
