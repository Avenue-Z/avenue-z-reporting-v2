// lib/organic-social/social-listening/posts.ts
// Featured posts and their screenshots: validation only (spec docs/superpowers/specs/2026-11-19-social-listening-tab-design.md,
// section 8). Pure, safe on the server and in the browser (the editor can show the same messages before sending).
// Text is stored as typed and rendered as text by React, never as markup.
import type { PostFields } from './store'

/** At most 12 posts a month (approved, not replaced, not deleted) and 4 images a post (section 8). */
export const MAX_POSTS = 12
export const MAX_IMAGES = 4
export const MAX_NOTE = 1000
/** The screen copy: JPEG, at most 300 KB and 1,200 px on its longer side. The print copy: at most 60 KB and 600 px. */
export const MAX_IMAGE_BYTES = 300 * 1024
export const MAX_PRINT_BYTES = 60 * 1024
const MAX_IMAGE_PX = 1200
const MAX_PRINT_PX = 600
// Bounds of my own, not from the spec: a platform name and an author fit easily; a link longer than this is not a post.
const MAX_PLATFORM = 60
const MAX_AUTHOR = 200
const MAX_URL = 2048
// The Postgres int column.
const MAX_INT = 2 ** 31 - 1

const GROUPS = new Set(['social', 'forum', 'web'])
const SENTIMENTS = new Set(['Positive', 'Neutral', 'Negative'])
// Control characters: none in a one-line field; a note keeps its line breaks and tabs. NUL can never be stored in text.
const CONTROL = /[\u0000-\u001f\u007f]/
const NUL = /\u0000/

type Check<T> = { ok: true; post: T } | { ok: false; error: string }
const bad = (error: string) => ({ ok: false as const, error })

function oneLine(v: string, name: string, max: number): string | { error: string } {
  const s = v.trim()
  if (!s) return { error: `Add the ${name}.` }
  if (s.length > max) return { error: `The ${name} is over ${max} characters.` }
  if (CONTROL.test(s)) return { error: `The ${name} must be one line.` }
  return s
}

/** A post's editable fields from the editor, checked and trimmed. Every field is required in the input; `url` and
 *  `engagements` may be null (and an empty url is none). */
export function validatePostInput(input: unknown): Check<PostFields> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return bad('invalid post')
  const i = input as Record<string, unknown>
  if (typeof i.platform !== 'string' || typeof i.author !== 'string' || typeof i.note !== 'string') return bad('invalid post')
  if (typeof i.group !== 'string' || !GROUPS.has(i.group)) return bad('invalid group')
  if (typeof i.sentiment !== 'string' || !SENTIMENTS.has(i.sentiment)) return bad('invalid sentiment')

  const platform = oneLine(i.platform, 'platform', MAX_PLATFORM)
  if (typeof platform !== 'string') return bad(platform.error)
  const author = oneLine(i.author, 'author', MAX_AUTHOR)
  if (typeof author !== 'string') return bad(author.error)

  let url: string | null = null
  if (i.url !== null && i.url !== undefined && !(typeof i.url === 'string' && i.url.trim() === '')) {
    if (typeof i.url !== 'string') return bad('invalid post')
    const raw = i.url.trim()
    if (raw.length > MAX_URL) return bad('The link is too long.')
    let parsed: URL
    try { parsed = new URL(raw) } catch { return bad('The link must start with https://.') }
    if (parsed.protocol !== 'https:') return bad('The link must start with https://.')
    if (parsed.username || parsed.password) return bad('The link must not hold a user name or password.')
    url = raw
  }

  const e = i.engagements
  let engagements: number | null = null
  if (e !== null && e !== undefined) {
    if (typeof e !== 'number' || !Number.isInteger(e) || e < 0 || e > MAX_INT) return bad('Engagements must be a whole number, 0 or more, or empty.')
    engagements = e
  }

  const note = i.note.trim()
  if (note.length > MAX_NOTE) return bad('The note is over 1,000 characters.')
  if (NUL.test(note)) return bad('The note holds a character that cannot be saved.')

  const p = i.position
  if (typeof p !== 'number' || !Number.isInteger(p) || p < 0 || p > 99) return bad('invalid position')

  return {
    ok: true,
    post: {
      group: i.group as PostFields['group'], platform, author, url, engagements,
      sentiment: i.sentiment as PostFields['sentiment'], note, position: p,
    },
  }
}

/** The width and height in a JPEG's frame header, or null when the bytes are not a JPEG this can read. Walks the
 *  segments from the start-of-image marker to the first frame header (SOF0 to SOF15, not DHT, JPG or DAC). Every step
 *  moves forward, so a broken length can never loop. */
export function jpegSize(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null
  let i = 2
  while (i + 1 < b.length) {
    if (b[i] !== 0xff) return null
    const marker = b[i + 1]
    if (marker === 0xff) { i += 1; continue } // a fill byte
    i += 2
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue // markers with no length
    if (marker === 0xd9 || marker === 0xda) return null // end of image, or scan data, before any frame header
    if (i + 1 >= b.length) return null
    const len = (b[i] << 8) | b[i + 1]
    if (len < 2) return null
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isFrame) {
      if (len < 7 || i + 6 >= b.length) return null
      const height = (b[i + 3] << 8) | b[i + 4]
      const width = (b[i + 5] << 8) | b[i + 6]
      return width > 0 && height > 0 ? { width, height } : null
    }
    i += len
  }
  return null
}

/** One screenshot as the browser sends it: a screen copy and a print copy, both JPEG, both checked by size, by their
 *  JPEG frame header and by their pixel size (R2-12). The width and height stored are the screen copy's own. */
export function checkImage(bytes: Uint8Array, print: Uint8Array): { ok: true; width: number; height: number } | { ok: false; error: string } {
  if (bytes.length > MAX_IMAGE_BYTES) return bad('The image is over 300 KB.')
  if (print.length > MAX_PRINT_BYTES) return bad('The print copy is over 60 KB.')
  const screen = jpegSize(bytes)
  if (!screen) return bad('The image must be a JPEG.')
  const small = jpegSize(print)
  if (!small) return bad('The print copy must be a JPEG.')
  if (Math.max(screen.width, screen.height) > MAX_IMAGE_PX) return bad('The image is wider or taller than 1,200 px.')
  if (Math.max(small.width, small.height) > MAX_PRINT_PX) return bad('The print copy is wider or taller than 600 px.')
  return { ok: true, width: screen.width, height: screen.height }
}
