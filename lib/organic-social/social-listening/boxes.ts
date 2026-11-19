// lib/organic-social/social-listening/boxes.ts
// The Social Listening tab's analysis boxes (spec docs/superpowers/specs/2026-11-19-social-listening-tab-design.md,
// section 9). Each chart and section has one optional box, stored as commentary under its own view key so it gets
// draft, approve and history for free. The list is fixed: a box id is part of a stored view key, so renaming one
// orphans its rows. Plain data, safe to import from server and client code.
import { ANALYSIS_LABELS, KEYWORD_LABELS, type CommentaryLabels } from '@/lib/commentary/labels'

/** Brand boxes, in page order. */
export const SL_BRAND_BOX_IDS = [
  'b-kpis', 'b-daily', 'b-sent', 'b-owned', 'b-cross', 'b-ytd', 'b-posneu', 'b-reddit', 'b-media', 'b-themes',
  'b-trends', 'b-conv', 'b-authors', 'b-posts', 'b-takeaways', 'b-keywords',
] as const

/** Industry boxes, in page order. */
export const SL_INDUSTRY_BOX_IDS = [
  'i-kpis', 'i-daily', 'i-sent', 'i-ytd', 'i-sentday', 'i-cross', 'i-themes', 'i-conv', 'i-takeaways', 'i-keywords',
] as const

/** All 26 box ids, brand then industry. */
export const SL_BOX_IDS = [...SL_BRAND_BOX_IDS, ...SL_INDUSTRY_BOX_IDS] as const

export type SlBoxId = (typeof SL_BOX_IDS)[number]

/** Every box's view key starts with this; the page reads all of them in one query with it. */
export const SL_VIEW_PREFIX = 'organic-social:social-listening:' as const

/** The commentary view key of one box. */
export function slBoxViewKey<I extends SlBoxId>(id: I): `${typeof SL_VIEW_PREFIX}${I}` {
  return `${SL_VIEW_PREFIX}${id}`
}

/** The section each box sits in, for the commentary registry label ("Social Listening, <section>"). The topic is part
 *  of the section, so the brand and industry boxes of the same chart stay apart in the history log. */
export const SL_BOX_SECTION: Record<SlBoxId, string> = {
  'b-kpis': 'Brand data tiles',
  'b-daily': 'Brand results over time',
  'b-sent': 'Brand share of sentiment',
  'b-owned': 'Brand without brand-owned channels',
  'b-cross': 'Brand sentiment by media type',
  'b-ytd': 'Brand sentiment, year to date',
  'b-posneu': 'Brand positive and neutral with negative, year to date',
  'b-reddit': 'Brand Reddit sentiment, year to date',
  'b-media': 'Brand share of media types',
  'b-themes': 'Brand keyword themes',
  'b-trends': 'Brand trends in keyword themes',
  'b-conv': 'Brand top conversation themes',
  'b-authors': 'Brand top authors',
  'b-posts': 'Brand most relevant posts',
  'b-takeaways': 'Brand key takeaways',
  'b-keywords': 'Brand keyword appendix',
  'i-kpis': 'Industry data tiles',
  'i-daily': 'Industry results over time',
  'i-sent': 'Industry share of sentiment',
  'i-ytd': 'Industry sentiment, year to date',
  'i-sentday': 'Industry sentiment over time',
  'i-cross': 'Industry sentiment by media type',
  'i-themes': 'Industry keyword themes',
  'i-conv': 'Industry top conversation themes',
  'i-takeaways': 'Industry key takeaways',
  'i-keywords': 'Industry keyword appendix',
}

/** The words a box shows: the keyword appendix boxes their own, every other box the shared analysis wording. */
export function slBoxLabels(id: SlBoxId): CommentaryLabels {
  return id === 'b-keywords' || id === 'i-keywords' ? KEYWORD_LABELS : ANALYSIS_LABELS
}
