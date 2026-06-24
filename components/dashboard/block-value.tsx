import type { ResolveResult } from '@/lib/dashboard/types'
import { BlockValueError } from './metric-block-states'

/** Streams the block's current value (or an inline error) when its promise resolves.
 *  `resolveBlock` already formatted the number, so we render `r.formatted` directly. */
export async function BlockValue({
  valuePromise,
  slug,
}: {
  valuePromise: Promise<ResolveResult>
  slug: string
}) {
  const r = await valuePromise
  if (!r.ok) return <BlockValueError error={r.error} slug={slug} />
  return <p className="text-3xl font-extrabold text-white">{r.formatted}</p>
}
