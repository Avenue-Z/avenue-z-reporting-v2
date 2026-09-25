/** Callout cards pinned above a chart, the way the team's deck lays them out: each card in a band
 *  above the plot, joined by a line down to its day's dot. */
export const PIN_CARD_WIDTH = 280
export const PIN_CARD_HEIGHT = 80
/** The team's cards carry their buttons on a row of their own under the picture and the text.
 *  Measured in Chromium with the app's CSS (Task 10 review): the tallest team card, with two
 *  pictures, a two-line label, a two-line note, a draft line, the hidden line and five buttons
 *  (which wrap to two rows at 280px), needs 170px of content plus a 1px border each side. */
export const PIN_TEAM_CARD_HEIGHT = 172
export const PIN_GAP = 8
/** The connecting line: red, as in the approved sketch and the team's deck. */
export const PIN_LINE_COLOR = '#E24B4A'

/** Where one card goes: its left edge, and its row in the band (0 is the top row). */
export interface PinPlace { x: string; left: number; tier: number }

/** Left to right by dot, each card centred on its dot and kept inside the plot, on the first row
 *  where it overlaps no card already placed. Clamping keeps the lefts in order, so each row only
 *  needs its last card's right edge. Pure, so it is tested without a chart. */
export function layoutPins(
  dots: { x: string; px: number }[],
  plot: { x: number; width: number },
  width = PIN_CARD_WIDTH,
  gap = PIN_GAP,
): PinPlace[] {
  const minLeft = plot.x
  const maxLeft = Math.max(plot.x, plot.x + plot.width - width)
  const rowEnds: number[] = []
  return [...dots].sort((a, b) => a.px - b.px).map((d) => {
    const left = Math.min(Math.max(d.px - width / 2, minLeft), maxLeft)
    let tier = rowEnds.findIndex((end) => left >= end + gap)
    if (tier === -1) tier = rowEnds.length
    rowEnds[tier] = left + width
    return { x: d.x, left, tier }
  })
}

/** The height of the band above the plot for this many rows of cards of this height. */
export function pinBand(tiers: number, height = PIN_CARD_HEIGHT): number {
  return tiers * (height + PIN_GAP)
}
