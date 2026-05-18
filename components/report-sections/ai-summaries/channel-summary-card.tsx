import { cn } from '@/lib/utils'
import { Sparkles } from 'lucide-react'

export interface ChannelSummaryCardProps {
  channel: string
  icon?: React.ReactNode
  color: string          // Tailwind bg or hex for the accent dot
  metrics: {
    label: string
    value: string
    delta?: number       // percent change; undefined = no delta shown
  }[]
  insight: string        // AI-generated narrative (placeholder for now)
  highlights: string[]   // Bullet-point takeaways
}

function DeltaBadge({ delta }: { delta: number }) {
  const positive = delta >= 0
  return (
    <span
      className={cn(
        'ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
        positive
          ? 'bg-[#60FF80]/10 text-[#60FF80]'
          : 'bg-[#FF4444]/10 text-[#FF4444]'
      )}
    >
      {positive ? '+' : ''}{delta.toFixed(1)}%
    </span>
  )
}

export function ChannelSummaryCard({
  channel,
  icon,
  color,
  metrics,
  insight,
  highlights,
}: ChannelSummaryCardProps) {
  return (
    <div className="flex flex-col gap-5 rounded-xl border border-white/[0.06] bg-bg-surface p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm"
          style={{ background: color + '22', color }}
        >
          {icon ?? channel.charAt(0)}
        </span>
        <h3 className="text-sm font-bold text-white">{channel}</h3>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.label} className="flex flex-col gap-0.5">
            <span className="text-[11px] font-semibold text-text-muted">{m.label}</span>
            <div className="flex items-baseline">
              <span className="text-base font-bold text-white tabular-nums">{m.value}</span>
              {m.delta !== undefined && <DeltaBadge delta={m.delta} />}
            </div>
          </div>
        ))}
      </div>

      {/* AI insight block */}
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-4">
        <div className="mb-2 flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-[#60FDFF]" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#60FDFF]">
            AI Insight
          </span>
        </div>
        <p className="text-sm leading-relaxed text-white/70">{insight}</p>
      </div>

      {/* Highlights */}
      {highlights.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {highlights.map((h, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-white/60">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white/20" />
              {h}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
