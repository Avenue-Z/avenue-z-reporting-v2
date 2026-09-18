import { ChannelTrendChart } from './trends'
import type { TrendSeries } from '@/lib/organic-social/types'
import type { PostMark } from '@/lib/organic-social/post-marks'

/** Daily follower count over time. On a platform subpage `series` has one channel.
 *  `marks` is optional: v1 of this part passes none and renders exactly as before. */
export function FollowerGraph({ series, marks }: { series: TrendSeries; marks?: PostMark[] }) {
  return <ChannelTrendChart series={series} title="Followers" marks={marks} />
}
