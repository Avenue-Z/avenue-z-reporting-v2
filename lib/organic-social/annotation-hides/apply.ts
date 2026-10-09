import type { Annotation, AnnotationChart } from '../annotations'

export const hideKey = (chart: AnnotationChart, day: string) => `${chart}|${day}`

/** Clients never receive a hidden annotation: it is dropped here, on the server, so it is
 *  not in the page at all. Staff receive every annotation, hidden ones marked so the row can
 *  fade them. No backfill: hiding a peak does not promote the next day down. */
export function applyHides(
  items: Annotation[], hidden: Set<string>, chart: AnnotationChart, audience: 'client' | 'staff',
): Annotation[] {
  const marked = items.map((a) => ({ ...a, hidden: hidden.has(hideKey(chart, a.date)) }))
  return audience === 'client' ? marked.filter((a) => !a.hidden) : marked
}
