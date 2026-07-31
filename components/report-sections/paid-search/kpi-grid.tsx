import { KpiCard } from '@/components/charts/kpi-card'
import { money } from '@/lib/paid-media/format'
import type { Kpi } from '@/lib/paid-search/types'

export function KpiGrid({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {kpis.map((k) => {
        // Money KPIs carry a numeric value (so rollups can read it) and render
        // in cents here (item 11d) — the '$' comes from money(), not prefix.
        const isMoney = k.format === 'money' && typeof k.value === 'number'
        return (
          <KpiCard
            key={k.key}
            title={k.label}
            value={isMoney ? money(k.value as number) : k.value}
            prefix={isMoney ? undefined : k.prefix}
            suffix={k.suffix}
            delta={k.delta}
            invertDelta={k.invertDelta}
            tooltip={k.tooltip}
          />
        )
      })}
    </div>
  )
}
