// NewsAPI.ai (Event Registry) types and helpers
// API docs: https://newsapi.ai

export type DataType = 'news' | 'pr' | 'blog'

export interface PRConfig {
  keywords: string[]
  excludeKeywords?: string[]
  sourceLocationUri?: string[]
  language?: string // ISO3 code, default "eng"
  dataTypes?: DataType[]
  lookbackDays?: number // 7 or 31 (API constraint)
}

export interface RawArticle {
  uri: string
  title: string
  url: string
  date: string // "YYYY-MM-DD"
  time?: string
  sentiment?: number // -1.0 to +1.0, English only
  source: {
    uri: string
    title: string
    ranking?: {
      importanceRank?: number
      alexaGlobalRank?: number
      alexaCountryRank?: number
    }
  }
  shares?: {
    facebook?: number
    twitter?: number
    linkedIn?: number
  }
}

export interface Placement {
  uri: string
  title: string
  url: string
  date: string
  source: string
  sourceDomain: string
  tier: 1 | 2 | 3
  importanceRank: number
  socialScore: number
  shares: { facebook: number; twitter: number; linkedIn: number }
  sentiment: number | null
  dataType: DataType
}

export interface PRSummary {
  totalHits: number
  tier1Count: number
  tier2Count: number
  tier3Count: number
  totalSocialScore: number
  avgSentiment: number | null
  avgImportanceRank: number | null
}

// importanceRank is a percentile: 0 = most important sources, lower = better
export function getTier(importanceRank: number): 1 | 2 | 3 {
  if (importanceRank <= 30) return 1
  if (importanceRank <= 70) return 2
  return 3
}

export function normalizeArticle(raw: RawArticle, dataType: DataType): Placement {
  const rank = raw.source?.ranking?.importanceRank ?? 99
  const fb = raw.shares?.facebook ?? 0
  const tw = raw.shares?.twitter ?? 0
  const li = raw.shares?.linkedIn ?? 0

  return {
    uri: raw.uri,
    title: raw.title,
    url: raw.url,
    date: raw.date,
    source: raw.source?.title ?? raw.source?.uri ?? 'Unknown',
    sourceDomain: raw.source?.uri ?? '',
    tier: getTier(rank),
    importanceRank: rank,
    socialScore: fb + tw + li,
    shares: { facebook: fb, twitter: tw, linkedIn: li },
    sentiment: typeof raw.sentiment === 'number' ? raw.sentiment : null,
    dataType,
  }
}

export function calcSummary(placements: Placement[]): PRSummary {
  const withSentiment = placements.filter((p) => p.sentiment !== null)
  const withRank = placements.filter((p) => p.importanceRank < 99)

  return {
    totalHits: placements.length,
    tier1Count: placements.filter((p) => p.tier === 1).length,
    tier2Count: placements.filter((p) => p.tier === 2).length,
    tier3Count: placements.filter((p) => p.tier === 3).length,
    totalSocialScore: placements.reduce((s, p) => s + p.socialScore, 0),
    avgSentiment: withSentiment.length
      ? withSentiment.reduce((s, p) => s + p.sentiment!, 0) / withSentiment.length
      : null,
    avgImportanceRank: withRank.length
      ? withRank.reduce((s, p) => s + p.importanceRank, 0) / withRank.length
      : null,
  }
}

export function formatSocialScore(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}
