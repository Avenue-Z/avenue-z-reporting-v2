import { getAllClients } from '@/lib/clients.config'
import { Header } from '@/components/layout/header'
import { PLATFORM_IDS } from '@/lib/platforms/constants'
import type { PlatformId } from '@/lib/platforms/constants'
import { ClientConnectionRow } from './client-connection-row'

/**
 * Only the platforms we currently support via direct API.
 * Add more here as integrations are built out.
 */
const ACTIVE_PLATFORMS: PlatformId[] = [
  PLATFORM_IDS.GA4,
  PLATFORM_IDS.HUBSPOT,
]

export default function ConnectionsPage() {
  const clients = getAllClients()

  return (
    <>
      <Header title="Connections" subtitle="Avenue Z" />

      <p className="mb-6 text-sm text-text-muted">
        Integrations are configured via environment variables. Set the relevant
        env vars in Vercel (or <code className="text-white">.env.local</code> for
        local dev) to enable each platform.
      </p>

      <div className="flex flex-col gap-3">
        {clients.map((client) => {
          // Resolve connection status server-side by checking env vars
          const connectionMap: Record<PlatformId, boolean> = {
            [PLATFORM_IDS.GA4]: !!(
              client.ga4PropertyId && process.env[client.ga4PropertyId]
            ),
            [PLATFORM_IDS.HUBSPOT]: !!(
              client.hubspotToken && process.env[client.hubspotToken]
            ),
            // Remaining platforms — not yet integrated
            [PLATFORM_IDS.META]: false,
            [PLATFORM_IDS.GOOGLE_ADS]: false,
            [PLATFORM_IDS.MAILCHIMP]: false,
            [PLATFORM_IDS.KLAVIYO]: false,
            [PLATFORM_IDS.LINKEDIN]: false,
            [PLATFORM_IDS.TIKTOK]: false,
            [PLATFORM_IDS.SNAPCHAT]: false,
            [PLATFORM_IDS.REDDIT]: false,
            [PLATFORM_IDS.BING_ADS]: false,
            [PLATFORM_IDS.SHOPIFY]: false,
            [PLATFORM_IDS.TIKTOK_SHOP]: false,
            [PLATFORM_IDS.LINKEDIN_PAGES]: false,
            [PLATFORM_IDS.FACEBOOK_INSIGHTS]: false,
            [PLATFORM_IDS.INSTAGRAM_INSIGHTS]: false,
            [PLATFORM_IDS.TIKTOK_INSIGHTS]: false,
            [PLATFORM_IDS.SALESFORCE]: false,
            [PLATFORM_IDS.X_ADS]: false,
            [PLATFORM_IDS.X_INSIGHTS]: false,
            [PLATFORM_IDS.WOOCOMMERCE]: false,
            [PLATFORM_IDS.APPLOVIN]: false,
            [PLATFORM_IDS.AHREFS]: false,
            [PLATFORM_IDS.GOOGLE_SEARCH_CONSOLE]: false,
          }

          const configuredCount = ACTIVE_PLATFORMS.filter(
            (p) => connectionMap[p]
          ).length

          return (
            <ClientConnectionRow
              key={client.slug}
              clientSlug={client.slug}
              clientName={client.name}
              platforms={ACTIVE_PLATFORMS}
              connectionMap={connectionMap}
              configuredCount={configuredCount}
              totalCount={ACTIVE_PLATFORMS.length}
            />
          )
        })}
      </div>
    </>
  )
}
