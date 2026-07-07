import { Suspense } from 'react'
import { getClientBySlug } from '@/lib/db/queries'
import { lookup } from '@/lib/report-sections/registry'
import { ReportErrorBoundary } from '@/components/report-sections/error-boundary'
import type { CommentaryViewKey } from '@/lib/commentary/views'
import { resolveSharedParts } from './parts/resolve'
import { SHARED_PARTS, type SharedCtx } from './parts/registry'

/** Renders a client's opted-in shared parts (e.g. commentary) at the top of a report
 *  view. Opt-in lives in reportSectionConfig[viewKey].sharedParts. Renders nothing when
 *  the client hasn't opted in. Place in the section's RSC parent, above client children. */
export async function SharedPartsHeader({
  viewKey, clientSlug,
}: { viewKey: CommentaryViewKey; clientSlug: string }) {
  const client = await getClientBySlug(clientSlug) // React.cache-memoized: N headers → 1 fetch/render
  const resolved = resolveSharedParts(client?.reportSectionConfig?.[viewKey]?.sharedParts, SHARED_PARTS as any)
  if (resolved.length === 0) return null
  const ctx: SharedCtx = { slug: clientSlug, viewKey }
  return (
    <>
      {resolved.map((r) => {
        const impl = lookup<SharedCtx>(SHARED_PARTS, r.id, r.version)
        if (!impl) return null // defensive; resolveSharedParts already guarantees presence
        return (
          <ReportErrorBoundary key={`${r.id}@${r.version}`} sectionName={`Commentary (${r.id})`}>
            <Suspense fallback={null}>{impl.render(ctx, r)}</Suspense>
          </ReportErrorBoundary>
        )
      })}
    </>
  )
}
