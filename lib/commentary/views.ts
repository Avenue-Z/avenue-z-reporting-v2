import { CHANNELS, CHANNEL_LABEL, type DashChannel } from '@/lib/organic-social/metrics'
import { SL_BOX_IDS, SL_BOX_SECTION, slBoxViewKey, type SlBoxId } from '@/lib/organic-social/social-listening/boxes'

/** Per-channel Organic Social commentary key, e.g. 'organic-social:instagram'. The Overview
 *  (all channels) keeps the bare 'organic-social' key; each platform subpage gets its own. */
export type OrgSocialChannelViewKey = `organic-social:${Lowercase<DashChannel>}`

/** The Recommendations box of an Organic Social view: the view's own key plus ':recommendations',
 *  so its rows share the table with Insights and never mix (separate view_key). */
export type OrgSocialRecommendationsViewKey =
  | 'organic-social:recommendations'
  | `organic-social:${Lowercase<DashChannel>}:recommendations`

/** One analysis box of the Social Listening tab (spec 2026-11-19, section 9), e.g.
 *  'organic-social:social-listening:b-kpis'. The ids are the fixed list in social-listening/boxes.ts. */
export type SocialListeningViewKey = `organic-social:social-listening:${SlBoxId}`

/** Canonical identity for an in-scope commentary view. Stable across the four
 *  report route files, which address the same report under inconsistent
 *  (slug, subsection) coordinates. */
export type CommentaryViewKey =
  | 'peec-ai'
  | 'peec-ai:pr-influence'
  | 'peec-ai:content-impact'
  | 'peec-ai:technical-audit'
  | 'paid-search'
  | 'meta-ads'
  | 'linkedin-ads'
  | 'organic-social'
  | OrgSocialChannelViewKey
  | OrgSocialRecommendationsViewKey
  | 'organic-social:influencer'
  | 'organic-social:aeo-informed'
  | SocialListeningViewKey

/** The commentary key for a single Organic Social platform subpage. */
export function orgSocialChannelViewKey(channel: DashChannel): OrgSocialChannelViewKey {
  return `organic-social:${channel.toLowerCase() as Lowercase<DashChannel>}`
}

const RECOMMENDATIONS_SUFFIX = ':recommendations'
/** The Recommendations key for an Organic Social box key, or null for any other section's key
 *  (and for a key that already is a Recommendations key). */
export function recommendationsViewKeyFor(key: CommentaryViewKey): CommentaryViewKey | null {
  // The registry decides (Paul, #358 review): a box gets a Recommendations key only when COMMENTARY_VIEWS lists one, so
  // removing a key there (the Influencer tab's, Jasmine 10/9) is the only change needed, and no box can render under a
  // key the write path would refuse (app/actions/commentary.ts:59). Other sections and Recommendations keys have none.
  const k = `${key}${RECOMMENDATIONS_SUFFIX}`
  return isCommentaryViewKey(k) ? k : null
}

/**
 * Map a route's (slug, subsection) to the canonical commentary view key, or null
 * when the view is not in scope (→ no commentary block).
 *
 * Alias sources (verified in the route files):
 *   Overview    : 'paid-media' no-sub (SPA) → no commentary (item 6)
 *   Paid Search : 'google-ads' (deep-link)      | 'paid-media'+'paid-search'
 *   Meta        : 'meta-ads' (deep-link/portal)  | 'paid-media'+'meta'
 *   LinkedIn    : 'linkedin-ads' (deep-link/portal) | 'paid-media'+'linkedin'
 */
export function resolveCommentaryView(slug: string, subsection?: string | null): CommentaryViewKey | null {
  switch (slug) {
    case 'peec-ai':
      if (!subsection) return 'peec-ai'
      if (subsection === 'pr-influence') return 'peec-ai:pr-influence'
      if (subsection === 'content-impact') return 'peec-ai:content-impact'
      return null // other AEO sub-tabs: out of scope (technical-audit reads its own view key directly)
    case 'organic-social':
      return 'organic-social'
    case 'meta-ads':
      return 'meta-ads'
    case 'linkedin-ads':
      return 'linkedin-ads'
    case 'google-ads':
      return 'paid-search'
    case 'paid-media':
      // No subsection = the Overview (default landing, item 5). It has no
      // commentary box (item 6). Paid Search now has its own subsection id.
      if (!subsection) return null
      if (subsection === 'paid-search') return 'paid-search'
      if (subsection === 'meta') return 'meta-ads'
      if (subsection === 'linkedin') return 'linkedin-ads'
      return null
    default:
      return null
  }
}

/** Per-channel Organic Social entries, derived from the canonical channel list so a new
 *  Dash channel gets its commentary view for free. Same owner as the Overview. */
const ORG_SOCIAL_CHANNEL_VIEWS = Object.fromEntries(
  CHANNELS.map((c) => [
    orgSocialChannelViewKey(c),
    { label: `Organic Social — ${CHANNEL_LABEL[c]}`, owner: 'Jasmine / Kyleah' },
  ]),
) as Record<OrgSocialChannelViewKey, { label: string; owner: string }>

/** The Recommendations entries: Overview's and one per channel, same owner. */
const ORG_SOCIAL_RECOMMENDATION_VIEWS = Object.fromEntries([
  ['organic-social:recommendations', { label: 'Organic Social — Recommendations', owner: 'Jasmine / Kyleah' }],
  ...CHANNELS.map((c) => [
    `${orgSocialChannelViewKey(c)}:recommendations`,
    { label: `Organic Social — ${CHANNEL_LABEL[c]} — Recommendations`, owner: 'Jasmine / Kyleah' },
  ]),
]) as Record<OrgSocialRecommendationsViewKey, { label: string; owner: string }>

/** The Social Listening analysis boxes: one entry per box, so the write path accepts exactly these keys. No
 *  Recommendations keys (recommendationsViewKeyFor returns null for every box). */
const SOCIAL_LISTENING_VIEWS = Object.fromEntries(
  SL_BOX_IDS.map((id) => [slBoxViewKey(id), { label: `Social Listening, ${SL_BOX_SECTION[id]}`, owner: 'Savannah / Jasmine' }]),
) as Record<SocialListeningViewKey, { label: string; owner: string }>

/** Display label + service owner per view (owners per the PRD). */
export const COMMENTARY_VIEWS: Record<CommentaryViewKey, { label: string; owner: string }> = {
  'peec-ai': { label: 'AEO Overview', owner: 'Melena' },
  'peec-ai:pr-influence': { label: 'AEO PR Influence', owner: 'Alyssa' },
  'peec-ai:content-impact': { label: 'AEO Content Impact', owner: 'Danielle' },
  // The monthly Technical Audit snapshot page: one entry per snapshot (period start = end = the snapshot date).
  'peec-ai:technical-audit': { label: 'AEO Technical Audit', owner: 'AEO' },
  'paid-search': { label: 'Paid Search', owner: 'Amir' },
  'meta-ads': { label: 'Meta Advertising', owner: 'Greg' },
  'linkedin-ads': { label: 'LinkedIn Advertising', owner: 'Greg' },
  'organic-social': { label: 'Organic Social', owner: 'Jasmine / Kyleah' },
  ...ORG_SOCIAL_CHANNEL_VIEWS,
  ...ORG_SOCIAL_RECOMMENDATION_VIEWS,
  // The Influencer tab (10/6 calls): its own Insights stream. No Recommendations (Jasmine, 10/9: we don't manage their
  // influencer marketing).
  'organic-social:influencer': { label: 'Organic Social — Influencer', owner: 'Jasmine / Kyleah' },
  // The AEO Informed Social tab (spec 2026-11-12): its own Insights. The outline lists Insights only, so no Recommendations key.
  'organic-social:aeo-informed': { label: 'Organic Social, AEO Informed Social', owner: 'Jasmine / Kyleah' },
  // The Social Listening tab (spec 2026-11-19, section 9): one Analysis box per chart and section.
  ...SOCIAL_LISTENING_VIEWS,
}

/** Runtime guard: is this string one of the canonical view keys? Used to reject
 *  an unvalidated viewKey on the commentary write path (types are erased at runtime). */
export function isCommentaryViewKey(v: string): v is CommentaryViewKey {
  return Object.prototype.hasOwnProperty.call(COMMENTARY_VIEWS, v)
}
