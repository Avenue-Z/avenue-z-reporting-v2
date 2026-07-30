import { ChannelTrendChart } from './trends'
import type { TrendSeries } from '@/lib/organic-social/types'

/** Daily follower count over time. On a platform subpage `series` has one channel. */
export function FollowerGraph({ series }: { series: TrendSeries }) {
  return <ChannelTrendChart series={series} title="Followers" />
}
