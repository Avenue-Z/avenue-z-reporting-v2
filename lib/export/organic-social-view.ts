import { REPORT_NAMES, resolveOrganicSubsection, type OrganicTabsClient } from '@/lib/constants'
import type { DashChannel } from '@/lib/organic-social/metrics'

/** Which Organic Social view an export is of, and its title, resolved exactly as the report pages
 *  resolve them (app/{portal,dashboard}/[clientSlug]/reports/page.tsx; pinned by
 *  organic-social-view.pages.test.tsx). An unknown or hidden tab is Overview, as on the page. */
export function organicSocialExportView(client: OrganicTabsClient, subsection: string | null): { subsectionId: string | null; channel: DashChannel | null; pageTitle: string } {
  const entry = resolveOrganicSubsection(client, subsection)
  return {
    subsectionId: entry.id,
    channel: entry.channel,
    pageTitle: entry.channel == null ? (REPORT_NAMES['organic-social'] ?? 'Organic Social') : entry.label,
  }
}
