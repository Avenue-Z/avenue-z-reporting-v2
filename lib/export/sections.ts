// Which report sections the PDF export renders on the server (spec 2026-10-08-pdf-export-all-reports-design §4).
// A section joins SERVER_EXPORT_SECTIONS only once its components have export forms: PR 2 adds 'peec-ai', PR 3
// 'paid-media'. Until then its Export PDF button prints in the browser, and the route and export page refuse it.

export type ServerExportSection = 'organic-social' | 'peec-ai' | 'paid-media'

export const SERVER_EXPORT_SECTIONS: readonly ServerExportSection[] = ['organic-social', 'peec-ai']

export function isServerExportSection(s: unknown): s is ServerExportSection {
  return typeof s === 'string' && (SERVER_EXPORT_SECTIONS as readonly string[]).includes(s)
}
