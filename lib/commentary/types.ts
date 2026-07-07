import type { CommentaryViewKey } from './views'

export type CommentaryStatus = 'draft' | 'approved'

/** Serializable entry passed from the RSC to client components. Dates are strings:
 *  period_* as 'YYYY-MM-DD'; timestamps as ISO 8601. */
export interface CommentaryEntry {
  id: string
  viewKey: CommentaryViewKey
  bodyHtml: string
  periodStart: string
  periodEnd: string
  status: CommentaryStatus
  updatedBy: string
  updatedAt: string
  approvedBy: string | null
  approvedAt: string | null
}

/** What the current viewer may do. */
export interface CommentaryCapabilities {
  canEdit: boolean    // @avenuez.com
  canApprove: boolean // in COMMENTARY_APPROVERS
}

/** Editor → saveCommentary payload. */
export interface CommentaryInput {
  id?: string
  clientSlug: string
  viewKey: CommentaryViewKey
  bodyHtml: string
  periodStart: string
  periodEnd: string
}
