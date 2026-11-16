// The pages a bulk export offers (spec 2026-10-14-bulk-pdf-export-design B2): the client's server-exportable reports in
// sidebar order (ALL_REPORT_SLUGS), enabled and not hidden, each with the tabs its sidebar shows. A hidden tab is left
// out: the page and resolveExportView show it as the section's Overview, so it would export the Overview twice.
// Paid Media's sidebar lists every tab, but the page renders a hidden one as its Overview, so the same rule applies.
import { AEO_SUBSECTIONS, ALL_REPORT_SLUGS, PAID_MEDIA_SUBSECTIONS, REPORT_NAMES, organicSocialSubsections, visibleSubsections } from '@/lib/constants'
import type { ExportViewClient } from './report-view'
import { isServerExportSection, type ServerExportSection } from './sections'

export interface ExportPage {
  /** `${section}:${subsection ?? ''}`: unique per page. */
  key: string
  section: ServerExportSection
  /** The tab id, or null for the section's Overview (and the Executive Overview). */
  subsection: string | null
  /** The report's name, the popover's group heading. */
  reportTitle: string
  /** The tab's sidebar label, the popover's checkbox label. */
  label: string
}

export type ExportPagesClient = ExportViewClient & { enabledReports: readonly string[] }

function tabs(client: ExportPagesClient, section: ServerExportSection): { id: string | null; label: string }[] {
  if (section === 'peec-ai') return visibleSubsections(AEO_SUBSECTIONS, client.hiddenReports)
  if (section === 'paid-media') return visibleSubsections(PAID_MEDIA_SUBSECTIONS, client.hiddenReports)
  if (section === 'organic-social') return organicSocialSubsections(client)
  return [{ id: null, label: REPORT_NAMES[section] ?? section }]
}

export function exportablePages(client: ExportPagesClient): ExportPage[] {
  return ALL_REPORT_SLUGS.filter(
    (slug): slug is ServerExportSection => isServerExportSection(slug) && client.enabledReports.includes(slug) && !client.hiddenReports?.includes(slug),
  ).flatMap((section) =>
    tabs(client, section).map((tab) => ({
      key: `${section}:${tab.id ?? ''}`,
      section,
      subsection: tab.id,
      reportTitle: REPORT_NAMES[section] ?? section,
      label: tab.label,
    })),
  )
}
