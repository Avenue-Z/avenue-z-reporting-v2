export type SourceType = 'organic' | 'influencer'

export interface OrganicKpi {
  key: string; label: string; value: number
  prefix?: string; suffix?: string; delta?: number; tooltip?: string
}

/** One row of the per-channel contribution table. */
export interface ChannelRow {
  channel: string            // display: 'Instagram'
  followers: number
  netNewFollowers: number
  engagements: number
  engagementRate: number     // percent
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
