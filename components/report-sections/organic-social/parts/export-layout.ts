// How each registered Organic Social part pages in the PDF export (spec 2026-10-06-organic-social-pdf-export-v2 §6, §11).
// 'own': the part marks its own unbreakable blocks (it is taller than a page, so it must split between them).
// 'block': the part has no export form of its own, so the report wraps the whole part as one unbreakable block.
// export-layout.test.ts holds this map to the registry: a new part cannot be registered without a decision here.
// The design kit's versions keep their decisions in `kit/<name>.layout.ts`, beside their registration (kit/slots.test.ts).
import { KIT_TILES_LAYOUT } from './kit/tiles.layout'
import { KIT_TRENDS_LAYOUT } from './kit/trends.layout'
import { KIT_YTD_LAYOUT } from './kit/ytd.layout'
import { KIT_POSTS_LAYOUT } from './kit/posts.layout'
import { KIT_KPI_CHECK_IN_LAYOUT } from './kit/kpi-check-in.layout'

export const EXPORT_LAYOUT: Record<string, 'own' | 'block'> = {
  'platform-headlines@1': 'own',   // each platform's label + KPI row (platform-headlines.tsx)
  'platform-headlines@2': 'own',   // the outline Data block (outline-tiles.tsx)
  'platform-headlines@3': 'own',
  'engagement-trend@1': 'own',     // title + legend + chart, then each annotation (trends.tsx)
  'engagement-trend@2': 'own',
  'follower-graph@1': 'own',
  'follower-graph@2': 'own',
  'top-content@1': 'block',        // the v1 table has no export form
  'top-content@2': 'own',          // rows of five cards (sortable-top-content.tsx)
  'top-content@3': 'own',
  'ytd-review@1': 'own',           // title kept with the first card, each card a block (ytd-review*.tsx)
  'ytd-review@2': 'own',
  'ytd-review@3': 'own',
  'ytd-review@4': 'own',
  'engagement-breakdown@1': 'block', // one row of tiles
  'influencer-posts@1': 'own',     // heading and totals with the first row, rows of two cards (influencer-grid.tsx)
  'kpi-check-in@1': 'own',         // each platform card a block, the heading in the first (kpi-check-in.tsx)
  ...KIT_TILES_LAYOUT,
  ...KIT_TRENDS_LAYOUT,
  ...KIT_YTD_LAYOUT,
  ...KIT_POSTS_LAYOUT,
  ...KIT_KPI_CHECK_IN_LAYOUT,
}

/** Whether the report wraps this part as one unbreakable block in the export. An unknown part is wrapped (fail safe). */
export function wrapsAsBlock(id: string, version: number): boolean {
  return EXPORT_LAYOUT[`${id}@${version}`] !== 'own'
}
