// lib/organic-social/social-listening/params.ts
// The Social Listening tab's URL param (spec docs/superpowers/specs/2026-11-19-social-listening-tab-design.md, section 4).
import type { SlTopic } from './types'

/** `sl=industry` opens the Industry pill; anything else, or nothing, is Brand (the default, which the pills leave out of
 *  the URL). The PDF ignores it and prints brand then industry (R2-5). */
export function parseSlTopic(raw: unknown): SlTopic {
  return raw === 'industry' ? 'industry' : 'brand'
}

/** `slview=client` turns on staff's "Preview as client" (the approved mockup's toggle): the page renders exactly what the
 *  client sees. Anything else is off. A client role is always shown the client view, so this changes nothing for one. */
export function parseSlPreview(raw: unknown): boolean {
  return raw === 'client'
}

/** The charts with a Line / Columns toggle (plan docs/superpowers/plans/2026-11-24-social-listening-feedback.md, Unit C), named by
 *  their analysis box ids, in page order. Every one starts on the line. Positive + neutral has one too, as Savannah's list asks
 *  (decision D2, changed 2026-11-24). */
export const SL_TOGGLE_CHARTS = ['b-ytd', 'b-posneu', 'b-reddit', 'i-ytd', 'i-sentday'] as const
export type SlToggleChart = (typeof SL_TOGGLE_CHARTS)[number]

// My own bound: five ids and their commas are well under it; anything longer is not a value the page wrote.
const MAX_SLCOLS = 200

/** `slcols` lists the charts set to columns, comma-separated. Known ids are kept once each, in page order; anything else is
 *  dropped, so an old or hand-edited link still loads. Not a string, or too long: none (every chart on the line). */
export function parseSlCols(raw: unknown): SlToggleChart[] {
  if (typeof raw !== 'string' || raw.length > MAX_SLCOLS) return []
  const asked = new Set(raw.split(','))
  return SL_TOGGLE_CHARTS.filter((id) => asked.has(id))
}

/** The param's value for these charts, in page order, or null when every chart is on the line (the param is left out). */
export function formatSlCols(cols: readonly SlToggleChart[]): string | null {
  const set = new Set(cols)
  const ordered = SL_TOGGLE_CHARTS.filter((id) => set.has(id))
  return ordered.length > 0 ? ordered.join(',') : null
}

/** An export request takes only the exact value the page writes (formatSlCols of a non-empty list): the button only ever sends
 *  what the route already cleaned, so anything else is refused, as the AEO values are (lib/export/request.ts). */
export function isSlColsValue(raw: unknown): raw is string {
  return typeof raw === 'string' && raw.length > 0 && formatSlCols(parseSlCols(raw)) === raw
}
