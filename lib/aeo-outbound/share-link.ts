// The public link's path (spec v1.1 §16.2): the brand slug, the token, and the rule the route reads back. Client-safe:
// no Node imports, so the hub and editor build links with it. The origin comes from share-origin.ts on the server.

export const SLUG_MAX = 40
export const TEST_LINK_NOTE = 'Test link: it works on this environment only.'
/** Combining marks left by NFKD in the Latin, extended and symbol mark blocks. ES2017 has no \p{M}. */
const MARKS = /[̀-ͯ᪰-᫿᷀-᷿⃐-⃿︠-︯]/g
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const isShareTokenShape = (t: string): boolean => /^[A-Za-z0-9_-]{24}$/.test(t)

/** The brand part of the path: NFKD, marks removed, lowercase, each run outside a-z0-9 one "-", trimmed, at most 40. */
export function brandSlug(brandName: string | null): string {
  if (!brandName) return ''
  const s = brandName.normalize('NFKD').replace(MARKS, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return s.slice(0, SLUG_MAX).replace(/-+$/, '')
}

export function sharePath(brandName: string | null, token: string): string {
  const slug = brandSlug(brandName)
  return `/snapshot/${slug ? `${slug}-` : ''}${token}`
}

export const shareUrl = (origin: string, brandName: string | null, token: string): string => `${origin}${sharePath(brandName, token)}`

/** The token a /snapshot segment names, or null: a bare token, else a well-formed slug, "-", then a token. */
export function tokenFromSegment(segment: string): string | null {
  if (isShareTokenShape(segment)) return segment
  if (segment.length < 26 || segment[segment.length - 25] !== '-') return null
  const slug = segment.slice(0, -25)
  const token = segment.slice(-24)
  return slug.length <= SLUG_MAX && SLUG.test(slug) && isShareTokenShape(token) ? token : null
}
