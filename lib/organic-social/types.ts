export type SourceType = 'organic' | 'influencer'

/** One KPI on a platform headline. */
export interface HeadlineKpi {
  key: string
  label: string
  value: number
  format: 'number' | 'percent'
  delta?: number            // prior-period % change, when Dash returned a context
  footnote?: string         // caveat under the card (decision 6, Facebook)
}

/** Headline KPIs for a single platform (channel) — Overview shows 5, subpages 10–11. */
export interface PlatformHeadline {
  channel: string           // Dash channel key, e.g. 'INSTAGRAM'
  label: string             // display: 'Instagram'
  kpis: HeadlineKpi[]
  noData: boolean           // every requested metric came back null (no data for the window)
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
  url: string | null         // permalink to the live post, when Dash returns one
}

/** Top content for one platform — rendered as its own section. */
export interface PlatformTopContent {
  platform: string           // display: 'Instagram'
  rows: TopContentRow[]
}
