import type { Creative, DashContentPost } from './content-types'
import type { DashChannel } from './metrics'

const asObj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : null
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null)

/** Read a URL from a Dash `sizes`/`thumbnails` map: sizes[key] is `{ url, width, height }`. */
function sizeUrl(sizes: Record<string, unknown> | null, key: string): string | null {
  const entry = asObj(sizes?.[key])
  return str(entry?.url)
}

/**
 * Renderable creative from the post's TOP-LEVEL image/video (confirmed via live fixture —
 * NOT the channel sub-object). Image → medium_square thumb + original full; video → the
 * .mp4 src + a medium_square poster; a carousel carries its cover frame under `image`, so it
 * resolves to an image (the carousel badge is driven by mediaType, in the card). Returns null
 * only on genuine failure (the view then shows a placeholder, never a hidden card). The CDN is
 * publicly fetchable, so no proxy/signing.
 */
export function resolveCreative(post: DashContentPost, _channel: DashChannel): Creative | null {
  const video = asObj(post.video)
  if (video) {
    const sizes = asObj(video.sizes)
    const thumbs = asObj(video.thumbnails)
    const src = sizeUrl(sizes, 'original') ?? sizeUrl(sizes, 'original_converted')
    const poster = sizeUrl(thumbs, 'medium_square') ?? sizeUrl(thumbs, 'original_converted') ?? sizeUrl(thumbs, 'small_square')
    // A playable src is enough — poster is optional in HTML <video>; don't drop a good video to
    // the placeholder just because no thumbnail resolved.
    if (src) return { kind: 'video', src, poster }
  }
  const image = asObj(post.image)
  if (image) {
    const sizes = asObj(image.sizes)
    const thumb = sizeUrl(sizes, 'medium_square') ?? sizeUrl(sizes, 'small_square')
    const full = sizeUrl(sizes, 'original') ?? sizeUrl(sizes, 'original_converted') ?? thumb
    if (thumb && full) return { kind: 'image', thumb, full }
  }
  return null
}
