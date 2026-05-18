import { BigQuery } from '@google-cloud/bigquery'

const PROJECT_ID = process.env.BQ_PROJECT_ID!
const DATASET = process.env.BQ_DATASET!

let _client: BigQuery | null = null

function getClient(): BigQuery {
  if (!_client) {
    _client = new BigQuery({
      projectId: PROJECT_ID,
      // Uses GOOGLE_APPLICATION_CREDENTIALS env var automatically
    })
  }
  return _client
}

export interface DateRange {
  startDate: string // YYYY-MM-DD
  endDate: string   // YYYY-MM-DD
}

/**
 * Parse the app's dateRange param into start/end dates for BQ queries.
 * Supports: "last_30_days", "last_7_days", "last_90_days", "custom:YYYY-MM-DD,YYYY-MM-DD"
 */
export function parseDateRange(dateRange: string): DateRange {
  const now = new Date()

  if (dateRange.startsWith('custom:')) {
    const [start, end] = dateRange.replace('custom:', '').split(',')
    return { startDate: start, endDate: end }
  }

  const daysMap: Record<string, number> = {
    last_7_days: 7,
    last_14_days: 14,
    last_30_days: 30,
    last_60_days: 60,
    last_90_days: 90,
    last_180_days: 180,
    last_365_days: 365,
  }

  const days = daysMap[dateRange] ?? 30
  const endDate = now.toISOString().split('T')[0]
  const startDate = new Date(now.getTime() - days * 86400000).toISOString().split('T')[0]

  return { startDate, endDate }
}

export interface ChannelSummary {
  channel: string
  impressions: number
  clicks: number
  spend: number
  conversions: number
  conversionValue: number
}

export interface GA4Summary {
  sessions: number
  totalUsers: number
  newUsers: number
  conversions: number
  ecommercePurchases: number
  totalRevenue: number
  engagedSessions: number
  topChannels: { channel: string; sessions: number; users: number; conversions: number }[]
}

export interface FunSpotData {
  dateRange: DateRange
  metaAds: ChannelSummary
  ga4: GA4Summary
}

export interface DailySessions {
  date: string // YYYY-MM-DD
  sessions: number
  users: number
  conversions: number
  revenue: number
}

// Account name filters — must match exactly what's in BigQuery
const ACCOUNT_FILTERS = {
  metaAds: 'Fun Spot America FL',
  ga4: 'Fun Spot America - GA4',
} as const

/**
 * Fetch aggregated Fun Spot data from BigQuery tables for the given date range.
 * Filters by account name to ensure only Fun Spot data is returned.
 */
export async function fetchFunSpotData(dateRange: string): Promise<FunSpotData> {
  const bq = getClient()
  const { startDate, endDate } = parseDateRange(dateRange)
  const table = (name: string) => `\`${PROJECT_ID}.${DATASET}.${name}\``

  const [metaRows, ga4Rows, ga4ChannelRows] = await Promise.all([
    // Meta Ads aggregated — filtered to Fun Spot America FL
    bq.query({
      query: `
        SELECT
          'Meta Ads' AS channel,
          COALESCE(SUM(IMPRESSIONS), 0) AS impressions,
          COALESCE(SUM(CLICKS), 0) AS clicks,
          COALESCE(SUM(COST_USD), 0) AS spend,
          COALESCE(SUM(OFFSITE_CONVERSIONS), 0) AS conversions,
          COALESCE(SUM(CONVERSION_VALUE), 0) AS conversion_value
        FROM ${table('FBADS_AD')}
        WHERE DATE BETWEEN @startDate AND @endDate
          AND ACCOUNT_NAME = @metaAccount
      `,
      params: { startDate, endDate, metaAccount: ACCOUNT_FILTERS.metaAds },
    }),

    // GA4 totals — filtered to Fun Spot America - GA4
    bq.query({
      query: `
        SELECT
          COALESCE(SUM(SESSIONS), 0) AS sessions,
          COALESCE(SUM(TOTAL_USERS), 0) AS total_users,
          COALESCE(SUM(NEW_USERS), 0) AS new_users,
          COALESCE(SUM(CONVERSIONS), 0) AS conversions,
          COALESCE(SUM(ECOMMERCE_PURCHASES), 0) AS ecommerce_purchases,
          COALESCE(SUM(TOTAL_REVENUE), 0) AS total_revenue,
          COALESCE(SUM(ENGAGED_SESSION_S), 0) AS engaged_sessions
        FROM ${table('GAWA_GA4_TRAFFIC_ACQUISITION')}
        WHERE DATE BETWEEN @startDate AND @endDate
          AND PROPERTY_NAME = @ga4Account
      `,
      params: { startDate, endDate, ga4Account: ACCOUNT_FILTERS.ga4 },
    }),

    // GA4 by channel — filtered to Fun Spot America - GA4
    bq.query({
      query: `
        SELECT
          SESSION_DEFAULT_CHANNEL_GROUPING AS channel,
          COALESCE(SUM(SESSIONS), 0) AS sessions,
          COALESCE(SUM(TOTAL_USERS), 0) AS users,
          COALESCE(SUM(CONVERSIONS), 0) AS conversions
        FROM ${table('GAWA_GA4_TRAFFIC_ACQUISITION')}
        WHERE DATE BETWEEN @startDate AND @endDate
          AND PROPERTY_NAME = @ga4Account
          AND SESSION_DEFAULT_CHANNEL_GROUPING IS NOT NULL
        GROUP BY SESSION_DEFAULT_CHANNEL_GROUPING
        ORDER BY sessions DESC
        LIMIT 8
      `,
      params: { startDate, endDate, ga4Account: ACCOUNT_FILTERS.ga4 },
    }),
  ])

  const meta = metaRows[0]?.[0] ?? {}
  const ga4 = ga4Rows[0]?.[0] ?? {}
  const ga4Channels = ga4ChannelRows[0] ?? []

  return {
    dateRange: { startDate, endDate },
    metaAds: {
      channel: 'Meta Ads',
      impressions: Number(meta.impressions ?? 0),
      clicks: Number(meta.clicks ?? 0),
      spend: Number(meta.spend ?? 0),
      conversions: Number(meta.conversions ?? 0),
      conversionValue: Number(meta.conversion_value ?? 0),
    },
    ga4: {
      sessions: Number(ga4.sessions ?? 0),
      totalUsers: Number(ga4.total_users ?? 0),
      newUsers: Number(ga4.new_users ?? 0),
      conversions: Number(ga4.conversions ?? 0),
      ecommercePurchases: Number(ga4.ecommerce_purchases ?? 0),
      totalRevenue: Number(ga4.total_revenue ?? 0),
      engagedSessions: Number(ga4.engaged_sessions ?? 0),
      topChannels: ga4Channels.map((r: Record<string, unknown>) => ({
        channel: String(r.channel ?? 'Unknown'),
        sessions: Number(r.sessions ?? 0),
        users: Number(r.users ?? 0),
        conversions: Number(r.conversions ?? 0),
      })),
    },
  }
}

/**
 * Fetch daily GA4 sessions for a client over a date range.
 * Used by the FFCI report to correlate PR hits with traffic.
 */
export async function fetchDailySessions(
  ga4Account: string,
  dateRange: string
): Promise<DailySessions[]> {
  const bq = getClient()
  const { startDate, endDate } = parseDateRange(dateRange)
  const table = `\`${PROJECT_ID}.${DATASET}.GAWA_GA4_TRAFFIC_ACQUISITION\``

  const [rows] = await bq.query({
    query: `
      SELECT
        DATE AS date,
        COALESCE(SUM(SESSIONS), 0) AS sessions,
        COALESCE(SUM(TOTAL_USERS), 0) AS users,
        COALESCE(SUM(CONVERSIONS), 0) AS conversions,
        COALESCE(SUM(TOTAL_REVENUE), 0) AS revenue
      FROM ${table}
      WHERE DATE BETWEEN @startDate AND @endDate
        AND PROPERTY_NAME = @ga4Account
      GROUP BY DATE
      ORDER BY DATE ASC
    `,
    params: { startDate, endDate, ga4Account },
  })

  return (rows as Record<string, unknown>[]).map((r) => ({
    date: String(r.date).split('T')[0],
    sessions: Number(r.sessions ?? 0),
    users: Number(r.users ?? 0),
    conversions: Number(r.conversions ?? 0),
    revenue: Number(r.revenue ?? 0),
  }))
}
