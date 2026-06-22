import { KpiCard } from '@/components/charts/kpi-card'
import type { Kpi } from '@/lib/paid-search/types'

export function KpiGrid({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {kpis.map((k) => (
        <KpiCard
          key={k.key}
          title={k.label}
          value={k.value}
          prefix={k.prefix}
          suffix={k.suffix}
          delta={k.delta}
          tooltip={k.tooltip}
        />
      ))}
    </div>
  )
}
