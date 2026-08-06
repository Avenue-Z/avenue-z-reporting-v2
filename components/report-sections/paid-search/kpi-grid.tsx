import { KpiCard } from '@/components/charts/kpi-card'
import { money, DASH } from '@/lib/paid-media/format'
import type { Kpi } from '@/lib/paid-search/types'

export function KpiGrid({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {kpis.map((k) => {
        // Money KPIs render cents; a null money value is an undefined ratio → dash.
        const isMoney = k.format === 'money'
        const display = isMoney ? (k.value == null ? DASH : money(k.value as number)) : (k.value as string | number)
        return (
          <KpiCard
            key={k.key}
            title={k.label}
            value={display}
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
