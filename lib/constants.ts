/** Chart color mapping — consistent across all charts */
export const CHART_COLORS = {
  // Single-series or primary line
  primary: '#60FDFF', // cyan

  // Multi-channel series
  ga4: '#39A0FF', // blue — web/organic
  metaAds: '#6034FF', // purple — Meta paid
  googleAds: '#60FF80', // green — Google paid
  email: '#FFFC60', // yellow — email
  linkedin: '#60FDFF', // cyan — LinkedIn
  tiktok: '#FF6B8A', // pink — TikTok
  snapchat: '#FFFC60', // yellow — Snapchat
  reddit: '#FF4500', // orange-red — Reddit
  bingAds: '#00A4EF', // Microsoft blue — Bing/Microsoft Ads
  shopify: '#96BF48', // Shopify green
  hubspot: '#FF7A59', // HubSpot orange
  blended: '#FFFFFF', // white — blended/total lines

  // Positive / negative deltas
  positive: '#60FF80', // green
  negative: '#FF4444', // red
  neutral: '#8A8A8A', // grey
} as const

/** Known AI assistant referrer domains (matched against GA4 sessionSource) */
export const AI_REFERRER_DOMAINS = [
  'chat.openai.com',
  'chatgpt.com',
  'perplexity.ai',
  'claude.ai',
  'gemini.google.com',
  'bard.google.com',
  'copilot.microsoft.com',
  'bing.com',
  'you.com',
  'phind.com',
  'poe.com',
  'chat.mistral.ai',
  'kagi.com',
  'search.brave.com',
] as const

/** True when a GA4 sessionSource matches a known AI assistant referrer. */
export function isAiSource(source: unknown): boolean {
  const s = String(source ?? '').toLowerCase()
  return (AI_REFERRER_DOMAINS as readonly string[]).some((d) => s.includes(d))
}

/** Report display names */
export const REPORT_NAMES: Record<string, string> = {
  'demand-overview': 'Overview',
  'exec-summary': 'Executive Summary',
  ga4: 'Web Analytics',
  'meta-ads': 'Meta Ads',
  'google-ads': 'Google Ads',
  'email-marketing': 'Email Marketing',
  'blended-performance': 'Blended Performance',
  'linkedin-ads': 'LinkedIn Ads',
  'snapchat-ads': 'Snapchat Ads',
  'tiktok-ads': 'TikTok Ads',
  'shopify-performance': 'Shopify Performance',
  'hubspot-performance': 'Pipeline Performance',
  'inbound-funnel': 'Inbound Funnel',
  'peec-ai': 'Answer Engine Optimization',
  'profound-ai': 'Profound',
  'ai-summaries': 'AI Summaries',
  'report-generator': 'Report Generator',
  'reddit-ads': 'Reddit Ads',
  'bing-ads': 'Microsoft Ads',
  ffci: 'FFCI',
  'tiktok-shop': 'TikTok Shop',
  'pr-placements': 'PR Placements',
  'google-search-console': 'Search Console',
  salesforce: 'Salesforce',
  gohighlevel: 'GoHighLevel',
  'ticket-sales': 'Ticket Sales',
  'request-a-report': 'Request a Report',
}

/** Sidebar nav groups in display order */
export const NAV_GROUPS: { label?: string; slugs: string[]; comingSoon?: boolean }[] = [
  {
    // No label — demand-overview sits above the Reports section
    slugs: ['demand-overview'],
  },
  {
    label: 'Reports',
    // peec-ai renders as the "Answer Engine Optimization" expandable group;
    // profound-ai and google-search-console are handled as Soon sub-items inside their parents.
    slugs: ['peec-ai', 'ga4', 'inbound-funnel', 'hubspot-performance'],
  },
  {
    label: 'Tools',
    slugs: ['request-a-report'],
  },
]

/** Sub-items shown under the Answer Engine Optimization parent nav item */
export const AEO_SUBSECTIONS: { id: string | null; label: string; comingSoon?: boolean }[] = [
  { id: null,             label: 'Overview'            },
  { id: 'pr-influence',   label: 'PR Influence'        },
  { id: 'content-impact', label: 'Content Impact'      },
  { id: 'technical-audit',label: 'Technical Performance'},
]

/** Sub-items shown under the Web Analytics (ga4) parent nav item */
export const GA4_SUBSECTIONS: { id: string | null; label: string; comingSoon?: boolean }[] = [
  { id: null,                 label: 'Overview'           },
  { id: 'conversion-journey', label: 'Conversion Journey' },
  { id: 'search-console',     label: 'Search Console' },
]

/** Slugs that should render as "Soon" in the portal sidebar (not locked, not enabled) */
export const SOON_REPORT_SLUGS = new Set<string>([])

/** All report slugs shown in the portal sidebar (excludes Soon sub-items like google-search-console) */
export const ALL_REPORT_SLUGS: string[] = [
  'demand-overview',
  'peec-ai',
  'ga4',
  'inbound-funnel',
  'hubspot-performance',
  'request-a-report',
]

/**
 * Internal team-tools registry for the /tools area.
 *
 * Hardcoded for now (single team). Forward path to make teams dynamic: promote
 * this to a `teams` table + Drizzle query helper mirroring `clients` in lib/db/,
 * keeping the TeamDef/ToolDef shape so page and sidebar code need not change.
 */
export interface ToolDef {
  slug: string
  name: string
  url: string
  description?: string
}

export interface TeamDef {
  slug: string
  name: string
  tools: ToolDef[]
}

export const TEAMS: TeamDef[] = [
  {
    slug: 'aeo',
    name: 'AEO',
    tools: [
      {
        slug: 'seo-to-aeo-converter',
        name: 'SEO → AEO Converter',
        url: 'https://seo-to-aeo-converter.vercel.app/',
      },
      {
        slug: 'prompt-demand-navigator',
        name: 'Prompt Demand Navigator',
        url: 'https://prompt-demand-navigator.vercel.app/',
      },
    ],
  },
]
