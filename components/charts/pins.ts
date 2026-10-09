import { CHART_COLORS } from '@/lib/constants'

/** A day's callout card, shown beside its dot when the dot is hovered, focused or tapped (Phase 2b:
 *  dots only on the graph, one card at a time). */
export const PIN_CARD_WIDTH = 280
/** The short line joining a dot to its open card: red, as in the approved sketch and the team's deck. */
export const PIN_LINE_COLOR = CHART_COLORS.callout
/** The gap between a dot and its open card, which the red line spans. 20px so the line shows past the
 *  dot (r 5 plus its stroke); at 12px the dot covered half of it (seen live, 2026-09-24). */
export const PIN_STUB = 20
