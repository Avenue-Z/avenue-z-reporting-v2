import { ChannelTrendChart, lookOf, type ChartLook } from './trends'
import type { TrendSeries } from '@/lib/organic-social/types'
import type { AnnotationControls, ChartAnnotation, NoteControls } from '@/lib/organic-social/annotations'

/** Daily followers over time. On a platform subpage `series` has one channel.
 *  `annotations`, `noteControls` and `title` are optional: v1 of this part passes none of them and
 *  renders exactly as before, titled "Followers" over total followers. `shaded` and `frameless` are the design kit's
 *  look (follower-graph@3); absent, the chart is as before. */
export function FollowerGraph({
  series, annotations, annotationControls, noteControls, title = 'Followers', shaded, frameless,
}: { series: TrendSeries; annotations?: ChartAnnotation[]; annotationControls?: AnnotationControls; noteControls?: NoteControls; title?: string } & ChartLook) {
  return <ChannelTrendChart series={series} title={title} annotations={annotations} annotationControls={annotationControls} noteControls={noteControls} {...lookOf({ shaded, frameless })} />
}
