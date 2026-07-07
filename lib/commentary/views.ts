/** Canonical identity for an in-scope commentary view. Stable across the four
 *  report route files, which address the same report under inconsistent
 *  (slug, subsection) coordinates. */
export type CommentaryViewKey =
  | 'peec-ai'
  | 'peec-ai:pr-influence'
  | 'peec-ai:content-impact'
  | 'paid-search'
  | 'meta-ads'
  | 'linkedin-ads'
  | 'organic-social'

/**
 * Map a route's (slug, subsection) to the canonical commentary view key, or null
 * when the view is not in scope (→ no commentary block).
 *
 * Alias sources (verified in the route files):
 *   Paid Search : 'google-ads' (deep-link)      | 'paid-media' no-sub (SPA)
 *   Meta        : 'meta-ads' (deep-link/portal)  | 'paid-media'+'meta'
 *   LinkedIn    : 'linkedin-ads' (deep-link/portal) | 'paid-media'+'linkedin'
 */
export function resolveCommentaryView(slug: string, subsection?: string | null): CommentaryViewKey | null {
  switch (slug) {
    case 'peec-ai':
      if (!subsection) return 'peec-ai'
      if (subsection === 'pr-influence') return 'peec-ai:pr-influence'
      if (subsection === 'content-impact') return 'peec-ai:content-impact'
      return null // technical-audit and any other AEO sub-tab: out of scope
    case 'organic-social':
      return 'organic-social'
    case 'meta-ads':
      return 'meta-ads'
    case 'linkedin-ads':
      return 'linkedin-ads'
    case 'google-ads':
      return 'paid-search'
    case 'paid-media':
      if (!subsection) return 'paid-search'
      if (subsection === 'meta') return 'meta-ads'
      if (subsection === 'linkedin') return 'linkedin-ads'
      return null
    default:
      return null
  }
}

/** Display label + service owner per view (owners per the PRD). */
export const COMMENTARY_VIEWS: Record<CommentaryViewKey, { label: string; owner: string }> = {
  'peec-ai': { label: 'AEO Overview', owner: 'Melena' },
  'peec-ai:pr-influence': { label: 'AEO PR Influence', owner: 'Alyssa' },
  'peec-ai:content-impact': { label: 'AEO Content Impact', owner: 'Danielle' },
  'paid-search': { label: 'Paid Search', owner: 'Amir' },
  'meta-ads': { label: 'Meta Advertising', owner: 'Greg' },
  'linkedin-ads': { label: 'LinkedIn Advertising', owner: 'Greg' },
  'organic-social': { label: 'Organic Social', owner: 'Jasmine / Kyleah' },
}
