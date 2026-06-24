import { KpiCard } from '@/components/charts/kpi-card'
import { num } from '@/lib/organic-social/base'
import type { PlatformHeadline } from '@/lib/organic-social/types'

function PlatformSection({ h }: { h: PlatformHeadline }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-extrabold uppercase tracking-widest text-text-muted">{h.label}</h3>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard title="Followers" value={num(h.followers)} delta={h.deltas?.followers} />
        <KpiCard title="Net New Followers" value={num(h.netNewFollowers)} delta={h.deltas?.netNewFollowers} />
        <KpiCard title={h.exposureLabel} value={num(h.exposure)} delta={h.deltas?.exposure} />
        <KpiCard title="Engagements" value={num(h.engagements)} delta={h.deltas?.engagements} />
        <KpiCard
          title="Engagement Rate"
          value={h.engagementRate.toFixed(1)}
          suffix="%"
          delta={h.deltas?.engagementRate}
        />
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
