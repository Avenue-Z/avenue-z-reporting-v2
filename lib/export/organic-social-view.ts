import { REPORT_NAMES, resolveOrganicSubsection, type OrganicTabsClient, type OrganicView } from '@/lib/constants'
import type { DashChannel } from '@/lib/organic-social/metrics'

/** Which Organic Social view an export is of, and its title, resolved exactly as the report pages
 *  resolve them (app/{portal,dashboard}/[clientSlug]/reports/page.tsx; pinned by
 *  organic-social-view.pages.test.tsx). An unknown or hidden tab is Overview, as on the page. The Influencer tab has
 *  no channel but a view, and is titled with its label, as the pages title it. */
export function organicSocialExportView(client: OrganicTabsClient, subsection: string | null): { subsectionId: string | null; channel: DashChannel | null; view: OrganicView; pageTitle: string } {
  const entry = resolveOrganicSubsection(client, subsection)
  return {
    subsectionId: entry.id,
    channel: entry.channel,
    view: entry.view ?? null,
    pageTitle: entry.view === 'influencer' ? entry.label : entry.channel == null ? (REPORT_NAMES['organic-social'] ?? 'Organic Social') : entry.label,
  }
}
