export type SourceType = 'organic' | 'influencer'

/** Headline KPIs for a single platform (channel). */
export interface PlatformHeadline {
  channel: string            // Dash channel key, e.g. 'INSTAGRAM'
  label: string              // display: 'Instagram'
  exposureLabel: string      // 'Views' | 'Impressions'
  followers: number
  netNewFollowers: number
  exposure: number           // views or impressions
  engagements: number
  engagementRate: number     // percent (0..100)
  /** Prior-period percent-change deltas, where Dash returned a comparison context. */
  deltas?: {
    followers?: number
    netNewFollowers?: number
    exposure?: number
    engagements?: number
    engagementRate?: number
  }
}

/** A daily point for a single channel in a trend series. */
export interface TrendPoint { date: string; [channel: string]: string | number }
export interface TrendSeries {
  points: TrendPoint[]       // recharts-ready: one row per date, a key per channel
  channels: string[]         // display names, in legend order
}

export interface TopContentRow {
  id: number
  caption: string
  platform: string           // display: 'Instagram'
  sourceType: SourceType
  publishDate: string        // ISO date
  views: number              // views/impressions
  engagements: number
}
