export type ClientRole =
  | 'INTERNAL_ADMIN'
  | 'INTERNAL_ANALYST'
  | 'CLIENT_ADMIN'
  | 'CLIENT_VIEWER'

export type ReportSlug =
  | 'exec-summary'
  | 'ga4'
  | 'meta-ads'
  | 'google-ads'
  | 'email-marketing'
  | 'blended-performance'
  | 'linkedin-ads'
  | 'snapchat-ads'
  | 'tiktok-ads'
  | 'shopify-performance'
  | 'hubspot-performance'
  | 'inbound-funnel'
  | 'reddit-ads'
  | 'bing-ads'
  | 'ffci'
  | 'tiktok-shop'
  | 'pr-placements'
  | 'google-search-console'
  | 'salesforce'
  | 'gohighlevel'
  | 'ticket-sales'
  | 'peec-ai'
  | 'profound-ai'
  | 'demand-overview'
  | 'ai-summaries'
  | 'report-generator'
  | 'request-a-report'

export interface PRConfig {
  keywords: string[]
  excludeKeywords?: string[]
  sourceLocationUri?: string[]
  language?: string
  dataTypes?: ('news' | 'pr' | 'blog')[]
  lookbackDays?: number // 7 or 31 (API constraint)
}

export interface ClientConfig {
  slug: string
  name: string
  logoUrl?: string
  /**
   * Name of the env var holding this client's GA4 property ID.
   * e.g. 'GA4_PROPERTY_ID_AVENUE_Z' → process.env.GA4_PROPERTY_ID_AVENUE_Z = 'properties/123456789'
   * Auth is via the shared GOOGLE_SERVICE_ACCOUNT_KEY service account.
   */
  ga4PropertyId?: string
  /**
   * Name of the env var holding this client's GSC site URL.
   * e.g. 'GSC_SITE_URL_AVENUE_Z' → process.env.GSC_SITE_URL_AVENUE_Z = 'https://avenuez.com/'
   * Use 'sc-domain:avenuez.com' for a domain property, 'https://avenuez.com/' for URL-prefix.
   */
  gscSiteUrl?: string
  /**
   * Name of the env var holding this client's HubSpot Private App access token.
   * e.g. 'HUBSPOT_ACCESS_TOKEN_AVENUE_Z' → process.env.HUBSPOT_ACCESS_TOKEN_AVENUE_Z = 'pat-na1-...'
   */
  hubspotToken?: string
  enabledReports: ReportSlug[]
  hiddenReports?: ReportSlug[]
  prConfig?: PRConfig
  users: {
    email: string
    role: ClientRole
  }[]
}

export const clients: ClientConfig[] = [
  {
    slug: 'avenue-z',
    name: 'Avenue Z',
    logoUrl: '/logos/AvenueZ_White.png',
    // Set these env vars in .env.local (dev) and Vercel (prod)
    ga4PropertyId: 'GA4_PROPERTY_ID_AVENUE_Z',       // e.g. "properties/123456789"
    gscSiteUrl: 'GSC_SITE_URL_AVENUE_Z',             // e.g. "https://avenuez.com/" or "sc-domain:avenuez.com"
    hubspotToken: 'HUBSPOT_ACCESS_TOKEN_AVENUE_Z',    // HubSpot Private App token
    enabledReports: [
      'demand-overview',
      'ga4',
      'hubspot-performance',
      'inbound-funnel',
      'peec-ai',
      'request-a-report',
    ],
    hiddenReports: ['exec-summary'],
    prConfig: {
      keywords: ['"Avenue Z"', '"Avenue Z Agency"', '"Avenue Z marketing"', 'avenuez.com'],
      excludeKeywords: ['"avenue z-line"', '"avenue zone"', '"avenue zip"'],
      sourceLocationUri: ['http://en.wikipedia.org/wiki/United_States'],
      language: 'eng',
      dataTypes: ['news', 'pr', 'blog'],
      lookbackDays: 31,
    },
    users: [
      { email: 'nick@avenuez.com',  role: 'INTERNAL_ADMIN' },
      { email: 'demo@avenuez.com',  role: 'INTERNAL_ANALYST' },
    ],
  },
]

// --- Helpers ---

export const getClientBySlug = (slug: string) =>
  clients.find((c) => c.slug === slug)

export const getClientByEmail = (email?: string | null) =>
  email
    ? clients
        .flatMap((c) => c.users.map((u) => ({ ...u, slug: c.slug })))
        .find((u) => u.email === email)
    : null

export const getAllClients = () => clients
