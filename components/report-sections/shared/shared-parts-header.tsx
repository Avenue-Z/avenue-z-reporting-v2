import { Suspense } from 'react'
import { getClientBySlug } from '@/lib/db/queries'
import { lookup } from '@/lib/report-sections/registry'
import { ReportErrorBoundary } from '@/components/report-sections/error-boundary'
import type { CommentaryViewKey } from '@/lib/commentary/views'
import type { PartRegistry } from '@/lib/report-sections/types'
import { resolveSharedParts } from './parts/resolve'
import { SHARED_PARTS, SHARED_PART_PLACEMENT, type SharedCtx, type SharedPlacement } from './parts/registry'

/** Renders a client's opted-in shared parts (e.g. the Insights box) at the top of a report
 *  view, or, with placement 'bottom', the ones that belong at the bottom (the Recommendations
 *  box). Opt-in lives in reportSectionConfig[configKey].sharedParts; `viewKey` is the
 *  content identity the part is keyed by. They usually match (configKey defaults to
 *  viewKey), but a section with per-tab commentary (Organic Social platform subpages)
 *  opts in once under a base configKey while each tab carries its own per-channel viewKey —
 *  so the per-tab keys don't each need their own opt-in entry. Renders nothing when the
 *  client hasn't opted in. Place in the section's RSC parent, above client children (and,
 *  for the bottom placement, after them). */
export async function SharedPartsHeader({
  viewKey, configKey = viewKey, clientSlug, requestedRange, placement = 'top',
}: { viewKey: CommentaryViewKey; configKey?: CommentaryViewKey; clientSlug: string; requestedRange?: string; placement?: SharedPlacement }) {
  const client = await getClientBySlug(clientSlug) // React.cache-memoized: N headers → 1 fetch/render
  const resolved = resolveSharedParts(client?.reportSectionConfig?.[configKey]?.sharedParts, SHARED_PARTS as unknown as PartRegistry<unknown>)
    .filter((r) => (SHARED_PART_PLACEMENT[r.id] ?? 'top') === placement)
  if (resolved.length === 0) return null
  const ctx: SharedCtx = requestedRange === undefined ? { slug: clientSlug, viewKey } : { slug: clientSlug, viewKey, requestedRange }
  return (
    <>
      {resolved.map((r) => {
        const impl = lookup<SharedCtx>(SHARED_PARTS, r.id, r.version)
        if (!impl) return null // defensive; resolveSharedParts already guarantees presence
        return (
          <ReportErrorBoundary key={`${r.id}@${r.version}`} sectionName={`${impl.defaultLabel} (${r.id})`}>
            <Suspense fallback={null}>{impl.render(ctx, r)}</Suspense>
          </ReportErrorBoundary>
        )
      })}
    </>
  )
}
