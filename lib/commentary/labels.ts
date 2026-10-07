/** The words a commentary box shows. Plain data: the panel is a client component, so the labels are
 *  props and must serialize (no functions). Every string a box prints is derived here, in one place. */
export type CommentaryLabels = {
  title: string
  noun: string
  /** The outline a NEW entry opens with (HTML), or null for an empty editor. Each box owns its own. */
  outline: string | null
}

// Suggested Insights structure (PRD "Commentary Guidance"). Pre-filled as an editable scaffold when adding a NEW
// entry; authors replace each line. Editing an existing entry shows its own content instead.
export const INSIGHTS_OUTLINE =
  '<ul>' +
  '<li>Headline with business framing</li>' +
  '<li>Prior-period change</li>' +
  '<li>Why it changed</li>' +
  '<li>Operational caveats</li>' +
  '<li>Bigger-picture trend context</li>' +
  '<li>Cross-channel notes</li>' +
  '<li>Risks or watchouts, if relevant</li>' +
  '<li>Next steps</li>' +
  '</ul>'

export const INSIGHTS_LABELS: CommentaryLabels = { title: 'Insights', noun: 'insights', outline: INSIGHTS_OUTLINE }
// No outline yet: the box opens empty until the team writes one (Paul, #334 round 2; Thomas, 2026-10-07).
export const RECOMMENDATIONS_LABELS: CommentaryLabels = { title: 'Recommendations', noun: 'recommendations', outline: null }

const strip = (h: string) => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

/** True when the editor still holds the box's untouched outline, which must not be saved as a real entry. A box with
 *  no outline can never be "untouched"; its empty save is refused by the server's text rule instead. */
export function untouchedOutline(html: string, outline: string | null): boolean {
  return outline !== null && strip(html) === strip(outline)
}

export const addText = (l: CommentaryLabels) => `Add ${l.noun}`
export const emptyText = (l: CommentaryLabels) => `No ${l.noun} yet.`
export const emptyMonthText = (l: CommentaryLabels, monthTitle: string) => `No ${l.noun} for ${monthTitle} yet`
