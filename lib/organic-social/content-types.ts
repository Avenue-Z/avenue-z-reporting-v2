import type { DashChannel } from './metrics'
import type { SourceType } from './types'

// The raw CONTENT payload shapes live with the other Dash payloads (MediaV2 etc.)
// in the HTTP client's type module; re-exported here so the organic-social data
// layer has one import surface (./content-types) for everything CONTENT-related.
export type { DashContentPost, ContentResponse } from '@/lib/dash-social/types'

/** The one normalized shape produced by fetchTopContent and consumed downstream. */
export interface TopContentPost {
  id: number                 // Dash post id — stable, unique; the designation key (S2-B)
  channel: DashChannel
  platform: string           // display label
  publishedAt: string        // ISO date (yyyy-mm-dd)
  caption: string
  url: string | null
  mediaType: 'IMAGE' | 'VIDEO' | 'CAROUSEL'
  mediaGroup: number | null
  creative: null             // resolved in S2-C; always null in S2-A/S2-B
  metrics: { effectiveness: number | null; engagementRate: number | null; engagements: number }
  sourceType: SourceType     // hardcoded 'organic' here; the designation table sets it in S2-B
}

/**
 * CONTENT-valid engagement metric per channel. Traps (findings §6.1, spec 2 §2.4):
 *  - Facebook: the KPI's TOTAL_ENGAGEMENTS_POSTS_V2 returns 400 on CONTENT — use TOTAL_ENGAGEMENTS.
 *  - LinkedIn: ENGAGEMENTS returns 403 "You do not have access to the topics required" (misleading —
 *    NOT an entitlement problem) — use ENGAGEMENTS_BY_POST.
 */
export const CONTENT_METRIC: Record<DashChannel, string> = {
  INSTAGRAM: 'TOTAL_ENGAGEMENTS',
  FACEBOOK: 'TOTAL_ENGAGEMENTS',
  TWITTER: 'TOTAL_ENGAGEMENTS',
  LINKEDIN: 'ENGAGEMENTS_BY_POST',
}
