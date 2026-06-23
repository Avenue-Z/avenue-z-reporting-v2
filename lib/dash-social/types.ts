// Shapes CONFIRMED against Task 1 fixtures (Renaissance brand 26952, 2026-06-23).
export interface ReportsDataParams {
  brandId: number
  channels: string[]          // e.g. ['INSTAGRAM','FACEBOOK','TWITTER']
  metrics: string[]           // UPPER_SNAKE ids from lib/organic-social/metrics.ts
  startDate: string           // ISO yyyy-mm-dd
  endDate: string
  reportType?: 'GRAPH' | 'TOTAL_METRIC'
  timeScale?: 'DAILY' | 'MONTHLY'
  contextStartDate?: string   // TOTAL_METRIC delta window
  contextEndDate?: string
}

// /reports/data is keyed by channel name AND a brand-id entry (data_type:'BRAND')
// that callers MUST skip. Each channel entry carries a `metrics` object whose
// value shape depends on report_type — hence the generic M.
export interface ReportsChannelEntry<M> {
  data_type: string           // 'CHANNEL' | 'BRAND'
  name?: string               // display, e.g. 'Instagram'
  metrics?: Record<string, M>
}
export interface ReportsDataResponse<M = unknown> {
  data: Record<string, ReportsChannelEntry<M>>
}
// TOTAL_METRIC: metrics[METRIC] = { value, context, context_change }.
// context_change is the prior-period delta as a FRACTION (e.g. -0.36 = -36%).
export interface TotalMetric { value: number | null; context: number | null; context_change: number | null }
// GRAPH: metrics[METRIC] = { [channelKey]: { [date]: value|null } } — doubly nested,
// inner key repeats the channel (e.g. metrics.TOTAL_FOLLOWERS.INSTAGRAM['2026-05-24']).
export type GraphMetric = Record<string, Record<string, number | null>>

// media/v2: { data: [...posts], paging }. Only the active per-platform sub-object
// is populated; stories/empties may have none.
export interface MediaV2Post {
  id: number
  source: string              // 'INSTAGRAM' | 'INSTAGRAM_STORY' | 'FACEBOOK' | 'LINKEDIN' | 'TWITTER' | ...
  type: string                // 'IMAGE' | 'VIDEO' | 'CAROUSEL' | ...
  source_created_at: string
  instagram?: Record<string, number | string | null> | null
  facebook?: Record<string, number | string | null> | null
  linkedin?: Record<string, number | string | null> | null
  twitter?: Record<string, number | string | null> | null
}
export interface MediaV2Response { data: MediaV2Post[]; paging?: { count: number; next: string | null; previous: string | null } }
