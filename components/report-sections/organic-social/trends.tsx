import { LineChart } from '@/components/charts/line-chart'
import { CHART_COLORS } from '@/lib/constants'
import type { TrendSeries } from '@/lib/organic-social/types'

const PALETTE = [CHART_COLORS.primary, CHART_COLORS.ga4 ?? '#39A0FF', '#FF8A3D', '#9B7BFF']

function Chart({ title, series }: { title: string; series: TrendSeries }) {
  const yKeys = series.channels.map((c, i) => ({ key: c, label: c, color: PALETTE[i % PALETTE.length] }))
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-extrabold uppercase tracking-widest text-text-muted">{title}</h2>
      <LineChart data={series.points} xKey="date" yKeys={yKeys} />
    </section>
  )
}

export function Trends({ followers, engagement }: { followers: TrendSeries; engagement: TrendSeries }) {
  return (
    <>
      <Chart title="Follower Growth" series={followers} />
      <Chart title="Engagement" series={engagement} />
    </>
  )
}
