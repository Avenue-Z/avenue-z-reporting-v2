import type { DashContentPost } from '@/lib/dash-social/types'
import type { DashChannel } from './metrics'

/** The account that published a post, lowercased, without '@'. Instagram only: probed 2026-09-21 on
 *  CONTENT (`instagram_user.handle`, else `.username`). Read through a narrow cast so the shared
 *  DashContentPost type (edited by PR 247) is not touched. */
export function authorOf(raw: DashContentPost, channel: DashChannel): string | null {
  if (channel !== 'INSTAGRAM') return null
  const u = (raw as unknown as { instagram_user?: { handle?: unknown; username?: unknown } | null }).instagram_user
  const h = typeof u?.handle === 'string' ? u.handle : typeof u?.username === 'string' ? u.username : null
  return h ? h.replace(/^@/, '').toLowerCase() : null
}
