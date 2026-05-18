import { notFound } from 'next/navigation'
import { getClientBySlug } from '@/lib/clients.config'
import { Header } from '@/components/layout/header'
import { PlatformCard } from '@/components/auth-hub/platform-card'
import { PLATFORM_IDS } from '@/lib/platforms/constants'
import type { PlatformId } from '@/lib/platforms/constants'

/** Platforms currently integrated via direct API */
const ACTIVE_PLATFORMS: PlatformId[] = [
  PLATFORM_IDS.GA4,
  PLATFORM_IDS.HUBSPOT,
]

export default async function AuthHubPage({
  params,
}: {
  params: Promise<{ clientSlug: string }>
}) {
  const { clientSlug } = await params
  const client = getClientBySlug(clientSlug)
  if (!client) notFound()

  // Resolve env-var-based connection status server-side
  const connectionMap: Record<PlatformId, boolean> = {
    [PLATFORM_IDS.GA4]: !!(client.ga4PropertyId && process.env[client.ga4PropertyId]),
    [PLATFORM_IDS.HUBSPOT]: !!(client.hubspotToken && process.env[client.hubspotToken]),
    // Remaining — not yet integrated
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

  return (
    <>
      <Header title="Auth Hub" subtitle={client.name}>
        <span className="text-sm text-text-muted">
          Platform integrations are managed via environment variables
        </span>
      </Header>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {ACTIVE_PLATFORMS.map((platformId) => (
          <PlatformCard
            key={platformId}
            platformId={platformId}
            status={connectionMap[platformId] ? 'CONNECTED' : 'NOT_CONFIGURED'}
          />
        ))}
      </div>
    </>
  )
}
