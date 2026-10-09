// Which report sections the PDF export renders on the server (specs 2026-10-08-pdf-export-all-reports-design §4,
// 2026-10-09-pdf-export-executive-overview-design §4).
// Every planned section is on. A new section joins the union and SERVER_EXPORT_SECTIONS only once its components have
// export forms; until then its Export PDF button prints in the browser, and the route and export page refuse it.

export type ServerExportSection = 'organic-social' | 'peec-ai' | 'paid-media' | 'executive-overview'

export const SERVER_EXPORT_SECTIONS: readonly ServerExportSection[] = ['organic-social', 'peec-ai', 'paid-media', 'executive-overview']

export function isServerExportSection(s: unknown): s is ServerExportSection {
  return typeof s === 'string' && (SERVER_EXPORT_SECTIONS as readonly string[]).includes(s)
}
