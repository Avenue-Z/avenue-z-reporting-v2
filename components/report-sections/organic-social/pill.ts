/** The small rounded button the notes use everywhere, as one base so the copies cannot drift (Paul's
 *  review of #273, C13). On a card it also never prints and never wraps. Top Content's designation
 *  toggle has a similar look but is on Renaissance's page, so it keeps its own. */
export const PILL = 'rounded-full border border-white/[0.12] px-2 py-0.5 text-[11px] font-bold text-text-muted hover:text-white disabled:opacity-50'
export const CARD_PILL = `no-print whitespace-nowrap ${PILL}`
