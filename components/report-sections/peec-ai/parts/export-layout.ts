// How each AEO Overview part pages in the PDF export (spec 2026-10-08-pdf-export-all-reports-design §6), as Organic
// Social's parts/export-layout.ts. 'own': the part marks its own blocks (a table that can run past a page splits between
// rows). 'block': the Overview wraps it whole. export-layout.test.ts holds this map to the registry.
export const PEEC_EXPORT_LAYOUT: Record<string, 'own' | 'block'> = {
  'overview-synopsis@1': 'block',
  'kpi-cards@1': 'block',
  'visibility-chart@1': 'own',   // the chart card is its own block (visibility-chart.tsx)
  'llm-breakdown@1': 'own',      // a table
  'winners-losers@1': 'own',     // each card a block (winners-losers-cards.tsx)
  'brand-rankings@1': 'own',     // a table
  'domains-row@1': 'own',        // a table, then the domain-types chart block
  'footer@1': 'block',
}

/** Whether the Overview wraps this part as one unbreakable block in the export. An unknown part is wrapped (fail safe). */
export function peecWrapsAsBlock(id: string, version: number): boolean {
  return PEEC_EXPORT_LAYOUT[`${id}@${version}`] !== 'own'
}
