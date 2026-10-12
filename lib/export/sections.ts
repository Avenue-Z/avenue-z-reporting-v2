// Which report sections the PDF export renders on the server (specs 2026-10-08-pdf-export-all-reports-design §4,
// 2026-10-09-pdf-export-executive-overview-design §4).
// Every planned section is on. A new section joins the union and SERVER_EXPORT_SECTIONS only once its components have
// export forms; until then its Export PDF button prints in the browser, and the route and export page refuse it.
// Portal-rendered sections only: the route and the export page authorise with the portal's rule (canOpenPortal,
// requirePortalAccess), so a dashboard-only report here would let a client export a page its portal never shows.
// components/export/report-views.pages.test.tsx fails if one is added.

export type ServerExportSection = 'organic-social' | 'peec-ai' | 'paid-media' | 'executive-overview'

export const SERVER_EXPORT_SECTIONS: readonly ServerExportSection[] = ['organic-social', 'peec-ai', 'paid-media', 'executive-overview']

export function isServerExportSection(s: unknown): s is ServerExportSection {
  return typeof s === 'string' && (SERVER_EXPORT_SECTIONS as readonly string[]).includes(s)
}
