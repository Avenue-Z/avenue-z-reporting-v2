// lib/organic-social/social-listening/types.ts
// The shared shapes of the Social Listening tab (spec docs/superpowers/specs/2026-11-19-social-listening-tab-design.md,
// sections 6 to 8). Every part of the build codes against these, so they change only by a reviewed PR. Types only:
// no runtime code, safe to import from server and client code alike.

/** Which Talkwalker topic an export or a section belongs to. */
export type SlTopic = 'brand' | 'industry'

/** A month key, `YYYY-MM`. */
export type SlMonth = string

/** One day's results. `day` is `YYYY-MM-DD`, parsed from the export's own `MM/DD/YY` text. */
export type SlDay = { day: string; results: number }

/** Sentiment counts (never percents). */
export type SlSentimentCounts = { pos: number; neu: number; neg: number }

/** The parsed export as stored in `social_listening_uploads.data` (spec section 6). Counts are integers; reach,
 *  engagement and share are numbers as exported; `share` is the export's fraction 0..1. */
export type SlExport = {
  version: 1
  topic: SlTopic
  month: SlMonth
  results: number
  /** Brand only. */
  uniqueAuthors?: number
  engagement?: number
  potentialReach?: number
  daily: SlDay[]
  /** Industry only. */
  dailyBySentiment?: ({ day: string } & SlSentimentCounts)[]
  sentiment: SlSentimentCounts
  sentimentByMedia: ({ media: string } & SlSentimentCounts)[]
  /** Brand, when the optional "Without Brand Owned Channels" widget is present. */
  ownedExcluded?: SlSentimentCounts
  themes: { theme: string; share: number; color: string }[]
  /** Brand, up to 5. */
  influencers?: ({ authorId: string; name: string; network: string; posts: number; reach: number; engagement: number } & SlSentimentCounts)[]
  /** Brand, 4 cards. */
  overview?: { label: string; who: string; network: string; value: number; unit: string }[]
}

/** The contract's rules (spec section 6 table). */
export type SlRuleId = 'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'V6' | 'V7' | 'V8' | 'V9'

export type SlParseResult =
  | { ok: true; data: SlExport }
  | { ok: false; failed: { rule: SlRuleId; message: string }[] }

/** An upload as the pure modules see it (the store maps DB rows to this; `raw` is never read by the page). */
export type SlUpload = {
  id: string
  month: SlMonth
  topic: SlTopic
  data: SlExport
  /** Set once at upload: made before the month opened to the client (spec section 7). */
  beforeOpen: boolean
  uploadedAt: Date
}

/** A history row: what a report already delivered showed (spec section 8). Percents are whole numbers. */
export type SlHistory = {
  month: SlMonth
  topic: SlTopic
  results: number | null
  uniqueAuthors: number | null
  engagement: number | null
  potentialReach: number | null
  pos: number
  neu: number
  neg: number
  redditPos: number | null
  redditNeu: number | null
  redditNeg: number | null
  source: string
}

/** A featured post as the page sees it (spec section 8). */
export type SlPostGroup = 'social' | 'forum' | 'web'
export type SlSentiment = 'Positive' | 'Neutral' | 'Negative'
export type SlPost = {
  id: string
  month: SlMonth
  group: SlPostGroup
  platform: string
  author: string
  url: string | null
  engagements: number | null
  sentiment: SlSentiment
  note: string
  position: number
  status: 'draft' | 'approved'
  replacesId: string | null
  imageIds: string[]
}

/** A theme trend line, typed by staff (spec section 7, 8). */
export type SlTrend = { theme: string; change: string | null }
export type SlTrendLists = { emerging: SlTrend[]; decreasing: SlTrend[]; newThemes: SlTrend[] }
export type SlTrends = {
  month: SlMonth
  draft: SlTrendLists
  /** What clients see; null until the first approval. */
  approved: SlTrendLists | null
  status: 'draft' | 'approved'
}

/** Everything the page reads for one served month (one store call). */
export type SlMonthData = {
  uploads: SlUpload[]
  history: SlHistory[]
  posts: SlPost[]
  trends: SlTrends | null
}
