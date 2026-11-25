// lib/organic-social/social-listening/tooltips.ts
// The definitions behind the "?" on every Social Listening tile and chart card (plan
// docs/superpowers/plans/2026-11-24-social-listening-feedback.md, Unit B; spec F2: "tool tips in the data pills", "for all
// these"). The text comes from the team's definitions, which Savannah is adding to the appendix doc; until it arrives the
// table is empty and nothing draws, exactly as before. No text is invented: each entry is quoted word for word from that
// doc in one commit. Plain data, safe in server and client code.
import type { SlBoxId } from './boxes'
import type { SlTopic } from './types'

/** A tile is keyed by its topic and its title as the page prints it ("brand:Results"); a chart card by its analysis box id
 *  ("b-daily"), which is fixed (boxes.ts). */
export type SlTooltipTable = { tiles: ReadonlyMap<string, string>; cards: ReadonlyMap<SlBoxId, string> }

export const SL_TOOLTIPS: SlTooltipTable = {
  tiles: new Map<string, string>([]),
  cards: new Map<SlBoxId, string>([]),
}

/** The text for a tile, or undefined (no hint). */
export function slTileTooltip(topic: SlTopic, title: string, table: SlTooltipTable = SL_TOOLTIPS): string | undefined {
  return table.tiles.get(`${topic}:${title}`)
}

/** The text for a chart card, or undefined (no hint). */
export function slCardTooltip(box: SlBoxId, table: SlTooltipTable = SL_TOOLTIPS): string | undefined {
  return table.cards.get(box)
}
