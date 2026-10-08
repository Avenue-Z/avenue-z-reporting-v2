// How each registered Organic Social part pages in the PDF export (spec 2026-10-06-organic-social-pdf-export-v2 §6, §11).
// 'own': the part marks its own unbreakable blocks (it is taller than a page, so it must split between them).
// 'block': the part has no export form of its own, so the report wraps the whole part as one unbreakable block.
// export-layout.test.ts holds this map to the registry: a new part cannot be registered without a decision here.
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
  'engagement-breakdown@1': 'block', // one row of tiles
}

/** Whether the report wraps this part as one unbreakable block in the export. An unknown part is wrapped (fail safe). */
export function wrapsAsBlock(id: string, version: number): boolean {
  return EXPORT_LAYOUT[`${id}@${version}`] !== 'own'
}
