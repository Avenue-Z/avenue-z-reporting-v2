import { cloneElement, isValidElement, type ReactElement } from 'react'
import { CommentarySection } from '@/components/report-sections/commentary'
import { RECOMMENDATIONS_LABELS } from '@/lib/commentary/labels'
import { recommendationsViewKeyFor, type CommentaryViewKey } from '@/lib/commentary/views'
import type { PartImpl, PartRegistry } from '@/lib/report-sections/types'

/** Minimal context every shared part receives. `requestedRange` is set only by Organic Social. */
export type SharedCtx = { slug: string; viewKey: CommentaryViewKey; requestedRange?: string
  /** Staff's "Preview as client" (Organic Social only, the last look fixes L5). Absent everywhere else, so every other
   *  department's box gets exactly the props it got before. */
  preview?: true }

export type SharedPlacement = 'top' | 'bottom'

/** Insights (the box formerly titled Commentary; the part id stays `commentary`, it is stored in every
 *  client's sharedParts). Renders the existing async CommentarySection RSC at the top of the view. */
export const commentaryPart: PartImpl<SharedCtx> = {
  id: 'commentary',
  version: 1,
  published: true,
  defaultLabel: 'Insights',
  render: (ctx) => ctx.requestedRange === undefined
    ? <CommentarySection clientSlug={ctx.slug} viewKey={ctx.viewKey} {...(ctx.preview ? { preview: true } : {})} />
    : <CommentarySection clientSlug={ctx.slug} viewKey={ctx.viewKey} requestedRange={ctx.requestedRange} {...(ctx.preview ? { preview: true } : {})} />,
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
      ? <CommentarySection clientSlug={ctx.slug} viewKey={viewKey} labels={RECOMMENDATIONS_LABELS} {...(ctx.preview ? { preview: true } : {})} />
      : <CommentarySection clientSlug={ctx.slug} viewKey={viewKey} requestedRange={ctx.requestedRange} labels={RECOMMENDATIONS_LABELS} {...(ctx.preview ? { preview: true } : {})} />
  },
}

/** The two boxes on the design kit (plan docs/superpowers/plans/2026-11-23-os-design-phase1.md, Task 11): @1's element with
 *  `look="kit"`, nothing else different. CommentarySection applies it only on an Organic Social view. Published, because a
 *  client's sharedParts pin must name a published part (lib/report-sections/validate.ts) or that client's next config
 *  save fails; shared parts have no template to promote into and no snapshot to freeze into, and resolveSharedParts
 *  renders only the version a client pins (shared/parts/resolve.ts), so publishing reaches no one who has not pinned it. */
function withKitLook(v1: PartImpl<SharedCtx>): PartImpl<SharedCtx> {
  return {
    id: v1.id,
    version: 2,
    published: true,
    defaultLabel: v1.defaultLabel,
    render: (ctx, resolved) => {
      const el = v1.render(ctx, resolved)
      return isValidElement(el) ? cloneElement(el as ReactElement<{ look?: 'kit' }>, { look: 'kit' }) : el
    },
  }
}
export const commentaryPartV2 = withKitLook(commentaryPart)
export const recommendationsPartV2 = withKitLook(recommendationsPart)

export const SHARED_PARTS: PartRegistry<SharedCtx> = {
  commentary: { 1: commentaryPart, 2: commentaryPartV2 },
  recommendations: { 1: recommendationsPart, 2: recommendationsPartV2 },
}

/** Where a shared part renders. Unlisted ids render at the top, as every part did before. */
export const SHARED_PART_PLACEMENT: Record<string, SharedPlacement> = {
  commentary: 'top',
  recommendations: 'bottom',
}
