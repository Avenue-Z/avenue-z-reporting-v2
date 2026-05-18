import { notFound } from 'next/navigation'
import { getClientBySlug } from '@/lib/clients.config'
import { PlatformCard } from '@/components/auth-hub/platform-card'
import { PLATFORM_IDS } from '@/lib/platforms/constants'
import type { PlatformId } from '@/lib/platforms/constants'

/** Platforms currently integrated via direct API */
const ACTIVE_PLATFORMS: PlatformId[] = [
  PLATFORM_IDS.GA4,
  PLATFORM_IDS.HUBSPOT,
]

export default async function ClientAuthPage({
  params,
}: {
  params: Promise<{ clientSlug: string }>
}) {
  const { clientSlug } = await params
  const client = getClientBySlug(clientSlug)
  if (!client) notFound()

  const connectionMap: Record<PlatformId, boolean> = {
    [PLATFORM_IDS.GA4]: !!(client.ga4PropertyId && process.env[client.ga4PropertyId]),
    [PLATFORM_IDS.HUBSPOT]: !!(client.hubspotToken && process.env[client.hubspotToken]),
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
    <div className="mx-auto max-w-5xl px-8 py-12">
      <div className="mb-8">
        <p className="text-sm font-bold uppercase tracking-widest text-text-muted">
          {client.name}
        </p>
        <h1 className="text-3xl font-extrabold text-white">
          Connected{' '}
          <span className="gradient-text-full">Platforms</span>
        </h1>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {ACTIVE_PLATFORMS.map((platformId) => (
          <PlatformCard
            key={platformId}
            platformId={platformId}
            status={connectionMap[platformId] ? 'CONNECTED' : 'NOT_CONFIGURED'}
          />
        ))}
      </div>
    </div>
  )
}
