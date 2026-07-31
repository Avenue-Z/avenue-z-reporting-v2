import type { DashChannel } from './metrics'
import type { SourceType } from './types'

// The raw CONTENT payload shapes live with the other Dash payloads (MediaV2 etc.)
// in the HTTP client's type module; re-exported here so the organic-social data
// layer has one import surface (./content-types) for everything CONTENT-related.
export type { DashContentPost, ContentResponse } from '@/lib/dash-social/types'

/** A renderable creative resolved from the post's top-level image/video (S2-C). */
export type Creative =
  | { kind: 'image'; thumb: string; full: string }
  | { kind: 'video'; src: string; poster: string | null } // poster optional — a playable src is enough

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
  // All reconciled against Dash's per-post "– Organic" insights (2026-07-28):
  //  - Instagram: sum_total_engagements = Dash (INCLUDES reposts; post 700541683 = 4 not 3);
  //    engagements_public excludes reposts and undercounts.
  //  - Facebook: total_engagements_public = Dash 7 (excludes the 10 post-clicks).
  //  - LinkedIn: engagements = Dash 1579 (Dash counts clicks; there is no clicks-excluded field).
  //  - X: engagements = Dash 13 (organic == total for these organic accounts).
  INSTAGRAM: 'sum_total_engagements',
  FACEBOOK: 'total_engagements_public',
  LINKEDIN: 'engagements',
  TWITTER: 'engagements',
}

/**
 * The Views / Impressions field per channel on CONTENT. Per-channel — like CONTENT_ENGAGEMENT_FIELD —
 * so each reads the field Dash actually populates without touching normalizePost.
 * ⚠️ The earlier uniform `impressions` was WRONG for organic IG/FB: a live CONTENT probe
 * (brand 26952, 2026-07-31) confirmed `impressions` is 0 on every organic Instagram AND Facebook
 * post — the same deprecated-organic-impressions trap the profile KPI avoids by using VIEWS
 * (see metrics.ts header). Reading it blanked the column to 0 for all IG/FB posts. Fixed to the
 * populated exposure field per channel:
 *  - Instagram: `views`        (impressions 0; e.g. captured fixture posts show views 20/88/54).
 *  - Facebook:  `organic_views` (impressions 0; organic_reach is also unreliable — 0 on videos).
 *  - LinkedIn / X: `impressions` is genuinely populated (253/420, 2/17) — left unchanged.
 * These accounts run little/no paid, so `views` / `organic_views` ≈ organic exposure. Dash's own
 * Top Performing Posts card doesn't display this metric, so there is no card value to reconcile
 * against; the exact "views vs impressions vs reach" definition remains a proposal for Tina
 * (requirements Change 3 metric breakdown).
 *
 * ⚠️ KNOWN CAVEAT — "Views" means two things on the Facebook page. This Top Content column
 * ("Views / Impr.") uses `organic_views` (organic only), while the Facebook profile KPI card
 * uses `PAID_AND_ORGANIC_VIEWS_BY_POST` (paid + organic — metrics.ts FACEBOOK.exposure). Both
 * are post-scoped, so summing this column and comparing it to the card differs by exactly paid
 * views. That is ≈ 0 today because these accounts run ≈ no paid, but the day Facebook paid is
 * non-zero the two diverge with no on-screen signal that they were ever different measures. The
 * divergence is with the profile KPI, not with this line — pointing Facebook Top Content at
 * `organic_views` is correct here (`impressions` is 0). Recorded alongside the decision-6
 * Facebook footnote (metrics.ts FACEBOOK engagements). If reader-facing surfacing is wanted, add
 * it as a "Views / Impr." column-header tooltip.
 */
export const CONTENT_IMPRESSIONS_FIELD: Record<DashChannel, string> = {
  INSTAGRAM: 'views',
  FACEBOOK: 'organic_views',
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
  // All reconciled against Dash's per-post "– Organic" insights (2026-07-28). Stored as a
  // fraction; the card ×100 for display.
  //  - Instagram: `engagement` = Dash "(F)" on both a repost-free and reposted post
  //    (0.667=66.67%, 0.125=12.50%); engagement_rate_public matched only without reposts.
  //  - Facebook: organic_engagement_rate_v2 = Dash 6.6% (engagement_rate_public gave 0.14%).
  //  - LinkedIn / X: the single engagement_rate field = Dash (48.86% / 92.86%).
  INSTAGRAM: 'engagement',
  FACEBOOK: 'organic_engagement_rate_v2',
  LINKEDIN: 'engagement_rate',
  TWITTER: 'engagement_rate',
}

/**
 * Effectiveness field per channel on CONTENT — a FRACTION (the card ×100 for %).
 * Instagram: `effectiveness_engagements` matches Dash's "Effectiveness – Organic" exactly
 * (2026-07-28: 0.2=20.00% and 0.031=3.10%). The old `effectiveness` field was a different,
 * larger score and, shown without ×100, produced a nonsense ~1% on the card.
 * Facebook: `organic_effectiveness_v2` = Dash 11.86% (field 12.07%; = engagements/viewers, the
 * ~0.2pt gap is a viewers snapshot timing diff). Plain `effectiveness` gave 29.3% — wrong.
 * LinkedIn/X expose no effectiveness field → resolves to null → the card shows "—".
 */
export const CONTENT_EFFECTIVENESS_FIELD: Record<DashChannel, string> = {
  INSTAGRAM: 'effectiveness_engagements',
  FACEBOOK: 'organic_effectiveness_v2',
  LINKEDIN: 'effectiveness',
  TWITTER: 'effectiveness',
}
