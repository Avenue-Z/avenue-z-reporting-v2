import type { Client } from '@/lib/db/schema'

/** The only client fields the portal sidebar reads. The sidebar is a client component, so its
 *  props are sent to the browser of whoever is logged in, client users included. Nothing
 *  secret and no other client may be in them: no brand id, account id, env var name, password
 *  hash or user email. */
export type PortalSidebarClient = Pick<Client, 'slug' | 'name' | 'logoUrl' | 'enabledReports' | 'hiddenReports'> & {
  /** Only the channel allowlist and the per-channel influencer section setting (hidden, or a label; nothing
   *  secret), which together decide the Organic Social tabs. The brand id stays on the server. */
  dashSocialConfig: { channels?: string[]; influencerSection?: unknown } | null
}

/** The one place that decides what of a client record reaches the portal's browser. */
export function toPortalSidebarClient(client: Client): PortalSidebarClient {
  return {
    slug: client.slug,
    name: client.name,
    logoUrl: client.logoUrl,
    enabledReports: client.enabledReports,
    hiddenReports: client.hiddenReports,
    dashSocialConfig: client.dashSocialConfig
      ? {
          channels: client.dashSocialConfig.channels,
          ...(client.dashSocialConfig.influencerSection === undefined ? {} : { influencerSection: client.dashSocialConfig.influencerSection }),
        }
      : null,
  }
}
