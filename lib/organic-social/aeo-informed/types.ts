// lib/organic-social/aeo-informed/types.ts
// Shapes of what Peec returns (after runtime checks in shape.ts) and of what the adapter hands back.
// Field names for Peec rows are Peec's own (snake_case); our output fields are camelCase.

export type PeecUrlRow = {
  url: string
  classification: string | null
  title: string | null
  channel_title: string | null
  date?: string
  chat?: { id: string }
  citation_count: number
  retrieval_count: number
  citation_position: number | null
  citation_position_sum: number
  citation_position_count: number
  mentioned_brands: { id: string }[]
}

export type PeecBrand = { id: string; name: string; is_own: boolean }
export type PeecSocialChannel = { brand_id: string; platform: string; channel_handle: string }
export type PeecBrandDayRow = { date: string; visibility_total: number }

/** One URL after summing every row Peec returned for it (across days, models, chats). */
export type UrlAgg = {
  url: string
  title: string | null
  channelTitle: string | null
  classification: string | null
  retrievals: number
  citations: number
  positionSum: number
  positionCount: number
  brandIds: string[]
}
