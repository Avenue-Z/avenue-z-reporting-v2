import { Sparkles, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export type InsightType = 'positive' | 'negative' | 'neutral'

export interface CrossChannelInsight {
  type: InsightType
  headline: string
  detail: string
}

interface CrossChannelSummaryProps {
  narrative: string
  insights: CrossChannelInsight[]
}

const INSIGHT_STYLES: Record<InsightType, {
  icon: React.ComponentType<{ className?: string }>
  containerClass: string
  iconClass: string
}> = {
  positive: {
    icon: TrendingUp,
    containerClass: 'border-[#60FF80]/20 bg-[#60FF80]/[0.04]',
    iconClass: 'text-[#60FF80]',
  },
  negative: {
    icon: TrendingDown,
    containerClass: 'border-[#FF4444]/20 bg-[#FF4444]/[0.04]',
    iconClass: 'text-[#FF4444]',
  },
  neutral: {
    icon: AlertCircle,
    containerClass: 'border-white/[0.08] bg-white/[0.03]',
    iconClass: 'text-white/40',
  },
}

export function CrossChannelSummary({ narrative, insights }: CrossChannelSummaryProps) {
  return (
    <div className="flex flex-col gap-6 rounded-xl border border-[#60FDFF]/20 bg-[#60FDFF]/[0.03] p-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-[#60FDFF]" />
        <h3 className="text-sm font-bold text-white">Cross-Channel Insights</h3>
      </div>

      {/* Narrative */}
      <p className="text-sm leading-relaxed text-white/70">{narrative}</p>

      {/* Insight cards */}
      {insights.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {insights.map((insight, i) => {
            const style = INSIGHT_STYLES[insight.type]
            const Icon = style.icon
            return (
              <div
                key={i}
                className={cn(
                  'flex flex-col gap-2 rounded-lg border p-4',
                  style.containerClass
                )}
              >
                <div className="flex items-center gap-2">
                  <Icon className={cn('h-4 w-4 shrink-0', style.iconClass)} />
                  <span className="text-xs font-bold text-white">{insight.headline}</span>
                </div>
                <p className="text-xs leading-relaxed text-white/50">{insight.detail}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
