import { ChannelTrendChart } from './trends'
import type { TrendSeries } from '@/lib/organic-social/types'
import type { AnnotationControls, ChartAnnotation } from '@/lib/organic-social/annotations'

/** Daily followers over time. On a platform subpage `series` has one channel.
 *  `annotations` and `title` are optional: v1 of this part passes neither and renders
 *  exactly as before, titled "Followers" over total followers. */
export function FollowerGraph({
  series, annotations, annotationControls, title = 'Followers',
}: { series: TrendSeries; annotations?: ChartAnnotation[]; annotationControls?: AnnotationControls; title?: string }) {
  return <ChannelTrendChart series={series} title={title} annotations={annotations} annotationControls={annotationControls} />
}
