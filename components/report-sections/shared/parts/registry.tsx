import { CommentarySection } from '@/components/report-sections/commentary'
import { RECOMMENDATIONS_LABELS } from '@/lib/commentary/labels'
import { recommendationsViewKeyFor, type CommentaryViewKey } from '@/lib/commentary/views'
import type { PartImpl, PartRegistry } from '@/lib/report-sections/types'

/** Minimal context every shared part receives. `requestedRange` is set only by Organic Social. */
export type SharedCtx = { slug: string; viewKey: CommentaryViewKey; requestedRange?: string }

export type SharedPlacement = 'top' | 'bottom'

/** Insights (the box formerly titled Commentary; the part id stays `commentary`, it is stored in every
 *  client's sharedParts). Renders the existing async CommentarySection RSC at the top of the view. */
export const commentaryPart: PartImpl<SharedCtx> = {
  id: 'commentary',
  version: 1,
  published: true,
  defaultLabel: 'Insights',
  render: (ctx) => ctx.requestedRange === undefined
    ? <CommentarySection clientSlug={ctx.slug} viewKey={ctx.viewKey} />
    : <CommentarySection clientSlug={ctx.slug} viewKey={ctx.viewKey} requestedRange={ctx.requestedRange} />,
}

/** Recommendations: the same section under the view's recommendations key, at the bottom. A view with no
 *  recommendations key (any other section) renders nothing. */
export const recommendationsPart: PartImpl<SharedCtx> = {
  id: 'recommendations',
  version: 1,
  published: true,
  defaultLabel: 'Recommendations',
  render: (ctx) => {
    const viewKey = recommendationsViewKeyFor(ctx.viewKey)
    if (!viewKey) return null
    return ctx.requestedRange === undefined
      ? <CommentarySection clientSlug={ctx.slug} viewKey={viewKey} labels={RECOMMENDATIONS_LABELS} />
      : <CommentarySection clientSlug={ctx.slug} viewKey={viewKey} requestedRange={ctx.requestedRange} labels={RECOMMENDATIONS_LABELS} />
  },
}

export const SHARED_PARTS: PartRegistry<SharedCtx> = {
  commentary: { 1: commentaryPart },
  recommendations: { 1: recommendationsPart },
}

/** Where a shared part renders. Unlisted ids render at the top, as every part did before. */
export const SHARED_PART_PLACEMENT: Record<string, SharedPlacement> = {
  commentary: 'top',
  recommendations: 'bottom',
}
