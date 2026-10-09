// Which view an export is of, resolved exactly as the report pages resolve it (app/{portal,dashboard}/[clientSlug]/
// reports/page.tsx; pinned by components/export/report-views.pages.test.tsx). Pure: the route uses it without
// importing any report component. An unknown or hidden tab is the section's Overview, as on the page.
import { AEO_SUBSECTIONS, PAID_MEDIA_SUBSECTIONS, REPORT_NAMES, resolveOrganicSubsection, type OrganicTabsClient, type OrganicView } from '@/lib/constants'
import type { DashChannel } from '@/lib/organic-social/metrics'
import type { ServerExportSection } from './sections'

export type ExportViewClient = OrganicTabsClient

export interface ExportView {
  section: ServerExportSection
  /** The resolved tab id, or null for the section's Overview. */
  subsectionId: string | null
  /** The page title, as the report page's header and Export PDF button show it. */
  pageTitle: string
  /** Organic Social's platform tab channel; null otherwise. */
  channel: DashChannel | null
  /** Organic Social's Influencer tab ('influencer'), which has no channel; null otherwise. */
  view: OrganicView
}

/** A tab from `subs` the client hasn't hidden, or null (Overview). */
function visibleTab(subs: readonly { id: string | null; label: string }[], client: ExportViewClient, subsection: string | null) {
  if (!subsection || client.hiddenReports?.includes(subsection)) return null
  return subs.find((s) => s.id === subsection) ?? null
}

export function resolveExportView(client: ExportViewClient, section: ServerExportSection, subsection: string | null): ExportView {
  if (section === 'organic-social') {
    const entry = resolveOrganicSubsection(client, subsection)
    return {
      section,
      subsectionId: entry.id,
      channel: entry.channel,
      view: entry.view ?? null,
      pageTitle: entry.view === 'influencer' ? entry.label : entry.channel == null ? (REPORT_NAMES['organic-social'] ?? 'Organic Social') : entry.label,
    }
  }
  if (section === 'peec-ai') {
    const tab = visibleTab(AEO_SUBSECTIONS, client, subsection)
    return { section, subsectionId: tab?.id ?? null, channel: null, view: null, pageTitle: tab ? tab.label : (REPORT_NAMES['peec-ai'] ?? 'peec-ai') }
  }
  // One page, no tabs (spec 2026-10-09 §4).
  if (section === 'executive-overview') {
    return { section, subsectionId: null, channel: null, view: null, pageTitle: REPORT_NAMES['executive-overview'] ?? 'Executive Overview' }
  }
  const tab = visibleTab(PAID_MEDIA_SUBSECTIONS, client, subsection)
  // The page titles Paid Media's Overview "Overview", not the section name.
  return { section, subsectionId: tab?.id ?? null, channel: null, view: null, pageTitle: tab ? tab.label : 'Overview' }
}
