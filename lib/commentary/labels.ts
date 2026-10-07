/** The words a commentary box shows. Plain data: the panel is a client component, so the labels are
 *  props and must serialize (no functions). Every string a box prints is derived here, in one place. */
export type CommentaryLabels = { title: string; noun: string }

export const INSIGHTS_LABELS: CommentaryLabels = { title: 'Insights', noun: 'insights' }
export const RECOMMENDATIONS_LABELS: CommentaryLabels = { title: 'Recommendations', noun: 'recommendations' }

export const addText = (l: CommentaryLabels) => `Add ${l.noun}`
export const emptyText = (l: CommentaryLabels) => `No ${l.noun} yet.`
export const emptyMonthText = (l: CommentaryLabels, monthTitle: string) => `No ${l.noun} for ${monthTitle} yet`
