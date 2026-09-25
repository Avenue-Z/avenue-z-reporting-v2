import { ChannelTrendChart } from './trends'
import type { TrendSeries } from '@/lib/organic-social/types'
import type { AnnotationControls, ChartAnnotation, NoteControls } from '@/lib/organic-social/annotations'

/** Daily followers over time. On a platform subpage `series` has one channel.
 *  `annotations`, `noteControls` and `title` are optional: v1 of this part passes none of them and
 *  renders exactly as before, titled "Followers" over total followers. */
export function FollowerGraph({
  series, annotations, annotationControls, noteControls, title = 'Followers',
}: { series: TrendSeries; annotations?: ChartAnnotation[]; annotationControls?: AnnotationControls; noteControls?: NoteControls; title?: string }) {
  return <ChannelTrendChart series={series} title={title} annotations={annotations} annotationControls={annotationControls} noteControls={noteControls} />
}
