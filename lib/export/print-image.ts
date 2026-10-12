// Post images for the PDF export. Dash Social serves them as WebP from its own resizing service, and Chromium
// stores a WebP losslessly in a PDF: a 640px post image cost ~470 KB, and Renaissance's Overview came to 31 MB,
// over Vercel's 4.5 MB response limit. A JPEG is embedded as it is, so the export asks the same service for a
// JPEG at the printed size (~25 KB). The service needs `quality` alongside `format`, or it answers 301.

const DASH_IMAGES = 'images.dashsocial.com'

/** `src` as a `w`×`h` cover-cropped JPEG when it is a Dash Social image; any other URL unchanged. */
export function printImageUrl(src: string, w: number, h: number): string {
  let u: URL
  try { u = new URL(src) } catch { return src }
  if (u.protocol !== 'https:' || u.hostname !== DASH_IMAGES) return src
  u.search = new URLSearchParams({ w: String(w), h: String(h), fit: 'cover', format: 'jpeg', quality: '70' }).toString()
  return u.toString()
}
