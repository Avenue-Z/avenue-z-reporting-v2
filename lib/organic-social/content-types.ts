import type { DashChannel } from './metrics'
import type { SourceType } from './types'

// The raw CONTENT payload shapes live with the other Dash payloads (MediaV2 etc.)
// in the HTTP client's type module; re-exported here so the organic-social data
// layer has one import surface (./content-types) for everything CONTENT-related.
export type { DashContentPost, ContentResponse } from '@/lib/dash-social/types'

/** A renderable creative resolved from the post's top-level image/video (S2-C). */
export type Creative =
  | { kind: 'image'; thumb: string; full: string }
  | { kind: 'video'; src: string; poster: string }

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
  creative: Creative | null  // resolved by resolveCreative (S2-C); null only on genuine failure
  metrics: { effectiveness: number | null; engagementRate: number | null; engagements: number; impressions: number }
  sourceType: SourceType     // hardcoded 'organic' here; the designation table sets it in S2-B
}

/** The frozen Dash-sourced facts for one Top-Content card. Everything on TopContentPost
 *  EXCEPT sourceType (that stays live — snapshot §4). creative holds CDN URLs, not bytes.
 *  Defined here (not in snapshot.ts) so lib/db/schema.ts can $type it without a schema→feature cycle. */
export type SnapshotPayload = Omit<TopContentPost, 'sourceType'>

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

/**
 * The engagement value on a CONTENT post is keyed under a DIFFERENT field name per channel —
 * only Facebook uses `total_engagements_public`. Confirmed via a live CONTENT probe
 * (brand 26952, window 2026-04-01..2026-07-24, 2026-07-24):
 *  - Instagram: `engagements_public`      (no `total_engagements_public` field exists)
 *  - Facebook:  `total_engagements_public` (excludes post clicks; = card value)
 *  - LinkedIn:  `engagements`             (no `*_public` variant is returned)
 *  - X:         `engagements`             (= `engagements_organic` when no paid; excludes promoted-only via _organic)
 * Reading a single uniform key silently returned 0 for Instagram/LinkedIn/X (the `n()` falsy
 * fallback), which is the bug this map fixes. A5 reconciles each against Dash's card value.
 */
export const CONTENT_ENGAGEMENT_FIELD: Record<DashChannel, string> = {
  INSTAGRAM: 'engagements_public',
  FACEBOOK: 'total_engagements_public',
  LINKEDIN: 'engagements',
  TWITTER: 'engagements',
}

/**
 * The Views / Impressions field per channel on CONTENT. Confirmed present on all four in the
 * same live probe: every channel exposes `impressions` (total impressions; ≈ organic for these
 * organic-social accounts, which run little/no paid). Kept as a per-channel map — like
 * CONTENT_ENGAGEMENT_FIELD — so it can be narrowed later (e.g. FB `organic_impressions`,
 * X `impressions_organic`) without touching normalizePost. NOTE: Dash's own Top Performing
 * Posts card does not display impressions, so there is no Dash-card value to reconcile against —
 * A5 sanity-checks magnitude only, and the exact "views vs impressions vs reach" definition is a
 * proposal for Tina (requirements Change 3 metric breakdown).
 */
export const CONTENT_IMPRESSIONS_FIELD: Record<DashChannel, string> = {
  INSTAGRAM: 'impressions',
  FACEBOOK: 'impressions',
  LINKEDIN: 'impressions',
  TWITTER: 'impressions',
}

/**
 * Engagement-RATE field per channel on CONTENT. Also per-channel (like engagement): Instagram
 * exposes THREE (engagement_rate_public / _impressions / _views) and Facebook has
 * engagement_rate_public, while LinkedIn and X expose only a plain `engagement_rate` (confirmed
 * via the same live probe). ⚠️ GATE (spec 2 §3.2 / task C1): which Instagram variant matches
 * Dash's own card is NOT yet visually confirmed — `_public` is the documented default here (for
 * symmetry with the public engagement count), pending the A5/C1 Dash-UI comparison. If the card
 * value differs, change only the INSTAGRAM entry.
 */
export const CONTENT_ENGAGEMENT_RATE_FIELD: Record<DashChannel, string> = {
  INSTAGRAM: 'engagement_rate_public',
  FACEBOOK: 'engagement_rate_public',
  LINKEDIN: 'engagement_rate',
  TWITTER: 'engagement_rate',
}
