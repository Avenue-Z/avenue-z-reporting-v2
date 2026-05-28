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

  // ── Technical Audit data connectors ──────────────────────────────────────

  /**
   * Google Drive file ID for the current Screaming Frog "Internal All" CSV export.
   * e.g. '1ddlYbe_0wqadeqbIQVAsCt0F_9AOXSe9'
   * Auth: shared GOOGLE_SERVICE_ACCOUNT_KEY service account (Drive readonly scope).
   */
  sfCsvFileId?: string

  /**
   * Google Drive file ID for the PREVIOUS Screaming Frog "Internal All" CSV export.
   * Optional — enables delta/trend computation between two crawl snapshots.
   */
  sfPrevCsvFileId?: string

  /**
   * Google Sheets ID for the Sitebulb "Historical Hint Data" sheet.
   * Wide format: row 0 = hint names, rows 1+ = crawl date + URL counts per hint.
   * Auth: shared GOOGLE_SERVICE_ACCOUNT_KEY (Sheets readonly scope).
   */
  sitebulbSheetId?: string

  /**
   * Peec customer project ID for Agent Analytics (AI bot crawl data).
   * Stored directly here (not secret — just an org identifier like "or_043ae735-...").
   * Only clients with status=CUSTOMER in the Peec workspace have live data.
   * Verified CUSTOMER clients (2026-05-22):
   *   Avenue Z, Prometeo, Renaissance, Barilla, CS3, Core Scientific,
   *   Open Farm Pet, Ualett, HR Performance Solutions
   * Used with shared env var PEEC_AI_CUSTOMER_TOKEN (skc- key).
   */
  peecCustomerProjectId?: string

  /**
   * The client's primary domain (no protocol, no trailing slash).
   * Used for URL matching in technical audit cross-referencing.
   * e.g. 'avenuez.com', 'corescientific.com'
   */
  domain?: string

  /**
   * Google Sheets ID for the PR Proof Library (PR Placement Log).
   * Each row: Client, Outlet, Headline, Publication Date, Link, Impact, Date Added.
   * Auth: shared GOOGLE_SERVICE_ACCOUNT_KEY (Sheets readonly scope).
   */
  prProofSheetId?: string

  /**
   * Google Sheets ID for the Content Calendar tracker sheet.
   * Governs the Content Impact Tracker dashboard (PRD FR2).
   * Required columns (detected case-insensitively): Topic, URL, Content Type,
   *   Status, Content Action, Publish Date, Update Date.
   * Auth: shared GOOGLE_SERVICE_ACCOUNT_KEY (Sheets readonly scope).
   * Sheet must be shared with avenue-z-reporting@avenue-z-reporting.iam.gserviceaccount.com (Viewer).
   */
  contentCalendarSheetId?: string

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

    // Technical Audit connectors
    domain:                'avenuez.com',
    sfCsvFileId:           '1ddlYbe_0wqadeqbIQVAsCt0F_9AOXSe9',             // May 21 2026 SF Internal All CSV
    // sfPrevCsvFileId:    '<May 08 file ID>',                               // TODO: add prior crawl file ID once confirmed
    sitebulbSheetId:       '1cKW5k0aqeWEk3HVakIDpiCrSP_mMf5oxQW7HJOxqsiw', // Sitebulb Historical Hint Data
    peecCustomerProjectId: 'or_043ae735-9397-48cf-a754-6e346a55f394',        // Peec agent analytics project
    prProofSheetId:        '1tcZZ3p0Syy_525xnyW0V8fXnB8No7jBFVoqjIzT1F8M', // PR Proof Library

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
      { email: 'nick@avenuez.com',   role: 'INTERNAL_ADMIN' },
      { email: 'demo@avenuez.com',   role: 'INTERNAL_ANALYST' },
    ],
  },

  // ─── Renaissance ──────────────────────────────────────────────────────────
  {
    slug: 'renaissance',
    name: 'Renaissance',
    domain: 'renaissancebenefits.com',

    // Technical Audit connectors (all three live data sources confirmed)
    sfCsvFileId:           '10zM21GXKKfkQTLoZg8Q99YC38oioRFEs', // May 2026 SF Internal All CSV
    sitebulbSheetId:       '1a-kMXV3VQg2_wo9r4xkSf3BRqw4ZLT8qBzdocrveNGs',
    peecCustomerProjectId: 'or_60dbe88c-7e3e-4cbc-b014-a8ae16912c86',

    // PR Proof Library (shared sheet -- filtered to 'Renaissance' rows)
    prProofSheetId: '1tcZZ3p0Syy_525xnyW0V8fXnB8No7jBFVoqjIzT1F8M',

    // Content Impact Tracker -- content calendar unlocks Sections B-E
    // Sheet must be shared with avenue-z-reporting@avenue-z-reporting.iam.gserviceaccount.com (Viewer)
    contentCalendarSheetId: '1IkMw_7WUX5KBDVnHjPCLfTGRTqJBhVckvupVBIE240o',

    ga4PropertyId: 'GA4_PROPERTY_ID_RENAISSANCE',
    gscSiteUrl:    'GSC_SITE_URL_RENAISSANCE',

    enabledReports: [
      'peec-ai',
      'request-a-report',
    ],
    users: [
      { email: 'thomas.chang@avenuez.com', role: 'INTERNAL_ADMIN' },
      { email: 'nick@avenuez.com',         role: 'INTERNAL_ADMIN' },
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
