import { CommentarySection } from '@/components/report-sections/commentary'
import type { CommentaryViewKey } from '@/lib/commentary/views'
import type { PartImpl, PartRegistry } from '@/lib/report-sections/types'

/** Minimal context every shared part receives. `requestedRange` is set only by Organic Social. */
export type SharedCtx = { slug: string; viewKey: CommentaryViewKey; requestedRange?: string }

/** Commentary as a shared part — render returns the existing async CommentarySection RSC. */
export const commentaryPart: PartImpl<SharedCtx> = {
  id: 'commentary',
  version: 1,
  published: true,
  defaultLabel: 'Commentary',
  render: (ctx) => ctx.requestedRange === undefined
    ? <CommentarySection clientSlug={ctx.slug} viewKey={ctx.viewKey} />
    : <CommentarySection clientSlug={ctx.slug} viewKey={ctx.viewKey} requestedRange={ctx.requestedRange} />,
}

export const SHARED_PARTS: PartRegistry<SharedCtx> = {
  commentary: { 1: commentaryPart },
}
