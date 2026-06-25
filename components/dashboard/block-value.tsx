import { cn } from '@/lib/utils'
import type { ResolveResult } from '@/lib/dashboard/types'
import { BlockValueError } from './metric-block-states'
import { kpiAnnotationColor, KPI_ANNOTATION_CLASS } from './blocks/kpi-annotations'

/** Streams the block's current value (or an inline error) when its promise resolves.
 *  `resolveBlock` already formatted the number, so we render `r.formatted` directly.
 *  When `target` or `ceiling` are set, the value text is colored:
 *    value ≥ ceiling → orange; value ≥ target & < ceiling → green; else default white. */
export async function BlockValue({
  valuePromise,
  slug,
  target,
  ceiling,
}: {
  valuePromise: Promise<ResolveResult>
  slug: string
  target?: number
  ceiling?: number
}) {
  const r = await valuePromise
  if (!r.ok) return <BlockValueError error={r.error} slug={slug} />
  const band = kpiAnnotationColor(r.value, target, ceiling)
  const colorClass = band ? KPI_ANNOTATION_CLASS[band] : 'text-white'
  return <p className={cn('text-3xl font-extrabold', colorClass)}>{r.formatted}</p>
}
