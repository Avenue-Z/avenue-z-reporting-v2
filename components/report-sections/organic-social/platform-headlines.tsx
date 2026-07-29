import { KpiCard } from '@/components/charts/kpi-card'
import { num } from '@/lib/organic-social/base'
import type { PlatformHeadline } from '@/lib/organic-social/types'

function PlatformSection({ h }: { h: PlatformHeadline }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-extrabold uppercase tracking-widest text-text-muted">{h.label}</h3>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {h.kpis.map((k) => (
          <KpiCard
            key={k.key}
            title={k.label}
            value={k.format === 'percent' ? k.value.toFixed(1) : num(k.value)}
            suffix={k.format === 'percent' ? '%' : undefined}
            delta={k.delta}
            footnote={k.footnote}
          />
        ))}
      </div>
    </section>
  )
}

export function PlatformHeadlines({ headlines }: { headlines: PlatformHeadline[] }) {
  return (
    <div className="space-y-6">
      {headlines.map((h) => (
        <PlatformSection key={h.channel} h={h} />
      ))}
    </div>
  )
}
