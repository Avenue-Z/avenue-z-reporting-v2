import type { AEOModel } from '@/lib/peec/models'

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
  organicSocial: '#FF8A3D', // orange — organic social
  blended: '#FFFFFF', // white — blended/total lines

  // Positive / negative deltas
  positive: '#60FF80', // green
  negative: '#FF4444', // red
  neutral: '#8A8A8A', // grey
} as const

/** Format a chart axis/tooltip number: thousands-separated, capped at 2 decimals.
 *  Non-numbers (category labels) pass through unchanged. */
export function formatChartNumber(v: number | string): string {
  return typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(v)
}

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

/** Maps a known AI referrer domain to the AEO model it represents. Generic AI
 *  search engines (you.com, phind, poe, mistral, kagi, brave) and Google AI
 *  Overview have no clean GA4 referrer signal and are intentionally unmapped. */
export const AI_SOURCE_TO_MODEL: { domain: string; model: AEOModel }[] = [
  { domain: 'chat.openai.com',       model: 'ChatGPT'    },
  { domain: 'chatgpt.com',           model: 'ChatGPT'    },
  { domain: 'perplexity.ai',         model: 'Perplexity' },
  { domain: 'claude.ai',             model: 'Claude'     },
  { domain: 'gemini.google.com',     model: 'Gemini'     },
  { domain: 'bard.google.com',       model: 'Gemini'     },
  { domain: 'copilot.microsoft.com', model: 'Copilot'    },
  { domain: 'bing.com',              model: 'Copilot'    },
]

/** Map a GA4 sessionSource to its AEO model, or null when the source is not a
 *  model-attributable AI referrer. First match wins. */
export function aiSourceModel(source: unknown): AEOModel | null {
  const s = String(source ?? '').toLowerCase()
  for (const { domain, model } of AI_SOURCE_TO_MODEL) {
    if (s.includes(domain)) return model
  }
  return null
}

/** Report display names */
export const REPORT_NAMES: Record<string, string> = {
  'demand-overview': 'Overview',
  'exec-summary': 'Executive Summary',
  ga4: 'Web Analytics',
  'meta-ads': 'Meta Advertising',
  'google-ads': 'Paid Search',
  'email-marketing': 'Email Marketing',
  'blended-performance': 'Blended Performance',
  'linkedin-ads': 'LinkedIn Advertising',
  'paid-media': 'Paid Media',
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
  'organic-social': 'Organic Social',
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
    slugs: ['peec-ai', 'ga4', 'paid-media', 'organic-social', 'inbound-funnel', 'hubspot-performance'],
  },
  {
    label: 'Tools',
    slugs: ['request-a-report'],
  },
]

/** Report slugs in sidebar display order (flattened from NAV_GROUPS). Used to
 *  pick the default landing section so it matches the first visible nav item
 *  rather than the client's raw enabledReports order (which can lead with a
 *  legacy/empty slug). */
export const NAV_SLUG_ORDER: string[] = NAV_GROUPS.flatMap((g) => g.slugs)

/** Drop nav sub-tabs whose id is listed in a client's hiddenReports. The Overview
 *  item (id null) is always kept. Used to disable individual subsections per client. */
export function visibleSubsections<T extends { id: string | null }>(
  subs: readonly T[],
  hiddenReports?: readonly string[] | null,
): T[] {
  const hidden = new Set(hiddenReports ?? [])
  return subs.filter((s) => s.id == null || !hidden.has(s.id))
}

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

/** Sub-items shown under the Paid Media parent nav item */
export const PAID_MEDIA_SUBSECTIONS: { id: string | null; label: string; comingSoon?: boolean }[] = [
  { id: null,       label: 'Paid Search'          },
  { id: 'meta',     label: 'Meta Advertising'     },
  { id: 'linkedin', label: 'LinkedIn Advertising' },
]

/** Slugs that should render as "Soon" in the portal sidebar (not locked, not enabled) */
export const SOON_REPORT_SLUGS = new Set<string>([])

/**
 * Show greyed, lock-icon "upsell" teasers in the portal sidebar for reports a
 * client is NOT enabled for. Currently OFF — clients see only their enabled
 * reports. Flip to `true` to bring the upsell teasers back; no other change needed.
 */
export const SHOW_LOCKED_REPORT_TEASERS = false

/**
 * Show AI-generated narrative across the site: the per-section synopsis blocks
 * (AEO Overview / Content Impact / PR Influence / Organic Social), the AI
 * Summaries section, and the conversational DataChat widget. Currently OFF.
 * Flip to `true` to bring all of it back at once.
 */
export const SHOW_AI_NARRATIVE = false

/** All report slugs shown in the portal sidebar (excludes Soon sub-items like google-search-console) */
export const ALL_REPORT_SLUGS: string[] = [
  'demand-overview',
  'peec-ai',
  'ga4',
  'paid-media',
  'inbound-funnel',
  'hubspot-performance',
  'organic-social',
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
  {
    slug: 'reporting',
    name: 'Reporting',
    tools: [
      {
        // Internal route (leading '/') — rendered as an in-app link, not an
        // external launch. Pilot: the Kind Patches configurable dashboard.
        slug: 'kind-patches-paid-media',
        name: 'Kind Patches — Paid Media',
        url: '/dashboard/kind-patches/configurable-dashboard',
        description: 'Paid media mix overview',
      },
    ],
  },
]
