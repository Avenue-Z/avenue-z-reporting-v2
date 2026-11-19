// lib/organic-social/social-listening/image-access.ts
// Who may load a featured post's screenshot (spec docs/superpowers/specs/2026-11-19-social-listening-tab-design.md,
// section 8, and R2-12). `/api` is outside the proxy's matcher, so the image route does every check itself with this.
// Pure: the clock is an argument.
import { canOpenPortal, isStaff } from '@/lib/auth/route-access'
import { lockedRangeFor } from '../locked-range'
import type { Clock } from '../reporting-months'
import { hasSocialListeningTab, type SocialListeningTabClient } from './setting'
import type { ImageClient, PostState } from './store'

export type ImageForAccess = { post: Omit<PostState, 'replacesId'>; client: Omit<ImageClient, 'id'> & { id?: string } }
type Who = { role?: string | null; clientSlug?: string | null }

/** Staff see every image. A client role sees an image only when all hold: it may open this client's portal; the
 *  client has Organic Social enabled and the Social Listening tab on (not hidden); the post is approved, not replaced
 *  and not deleted; and the post's month is one the client may open now (finished and opened, within its months). */
export function imageAccess(who: Who, img: ImageForAccess, clock: Clock): boolean {
  if (isStaff(who)) return true
  const { post, client } = img
  if (!canOpenPortal(client.slug, who)) return false
  if (!client.enabledReports.includes('organic-social')) return false
  if (!hasSocialListeningTab({ dashSocialConfig: client.dashSocialConfig as SocialListeningTabClient['dashSocialConfig'], hiddenReports: client.hiddenReports })) return false
  if (post.status !== 'approved' || post.replacedAt !== null || post.deletedAt !== null) return false
  const months = lockedRangeFor(client, who.role, undefined, clock)?.months ?? []
  return months.some((m) => m.key === post.month)
}
