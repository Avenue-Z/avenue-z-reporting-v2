import { CommentarySection } from '@/components/report-sections/commentary'
import type { CommentaryViewKey } from '@/lib/commentary/views'
import type { PartImpl, PartRegistry } from '@/lib/report-sections/types'

/** Minimal context every shared part receives. */
export type SharedCtx = { slug: string; viewKey: CommentaryViewKey }

/** Commentary as a shared part — render returns the existing async CommentarySection RSC. */
export const commentaryPart: PartImpl<SharedCtx> = {
  id: 'commentary',
  version: 1,
  published: true,
  defaultLabel: 'Commentary',
  render: (ctx) => <CommentarySection clientSlug={ctx.slug} viewKey={ctx.viewKey} />,
}

export const SHARED_PARTS: PartRegistry<SharedCtx> = {
  commentary: { 1: commentaryPart },
}
