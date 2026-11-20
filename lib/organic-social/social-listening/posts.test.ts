import { describe, expect, test } from 'vitest'
import { checkImage, jpegSize, MAX_IMAGES, MAX_POSTS, validatePostInput } from './posts'

// Made-up post fields only.
const GOOD = {
  group: 'social', platform: 'Facebook', author: 'Made-up author', url: 'https://example.com/p/1',
  engagements: 12, sentiment: 'Positive', note: 'A made-up note.', position: 0,
}

/** A minimal JPEG: SOI, an APP0 segment, a SOF0 segment with the size, then EOI. `pad` grows the file. */
function jpeg(width: number, height: number, opts: { sof?: number; pad?: number } = {}): Uint8Array {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]
  const sof = [0xff, opts.sof ?? 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]
  const pad = opts.pad ? [0xff, 0xfe, ...[(opts.pad + 2) >> 8, (opts.pad + 2) & 0xff], ...new Array(opts.pad).fill(0x20)] : []
  return new Uint8Array([0xff, 0xd8, ...app0, ...pad, ...sof, 0xff, 0xd9])
}

describe('validatePostInput', () => {
  test('a good post, trimmed', () => {
    const r = validatePostInput({ ...GOOD, platform: ' Facebook ', author: ' Made-up author ', note: ' A made-up note. ' })
    expect(r).toEqual({ ok: true, post: { ...GOOD, note: 'A made-up note.' } })
  })

  test('note is stored and rendered as text: markup is kept as typed, never cleaned or run', () => {
    const note = '<script>alert(1)</script> <b>bold</b>'
    expect(validatePostInput({ ...GOOD, note })).toEqual({ ok: true, post: { ...GOOD, note } })
  })

  test('url: https only, empty means none, no user name or password, at most 2,048 characters', () => {
    expect(validatePostInput({ ...GOOD, url: '' })).toMatchObject({ ok: true, post: { url: null } })
    expect(validatePostInput({ ...GOOD, url: null })).toMatchObject({ ok: true, post: { url: null } })
    expect(validatePostInput({ ...GOOD, url: 'http://example.com' })).toEqual({ ok: false, error: 'The link must start with https://.' })
    expect(validatePostInput({ ...GOOD, url: 'javascript:alert(1)' })).toEqual({ ok: false, error: 'The link must start with https://.' })
    expect(validatePostInput({ ...GOOD, url: 'not a url' })).toEqual({ ok: false, error: 'The link must start with https://.' })
    expect(validatePostInput({ ...GOOD, url: 'https://u:p@example.com' })).toEqual({ ok: false, error: 'The link must not hold a user name or password.' })
    expect(validatePostInput({ ...GOOD, url: `https://example.com/${'a'.repeat(2048)}` })).toEqual({ ok: false, error: 'The link is too long.' })
  })

  test('note: at most 1,000 characters, may be empty, no NUL', () => {
    expect(validatePostInput({ ...GOOD, note: 'a'.repeat(1000) }).ok).toBe(true)
    expect(validatePostInput({ ...GOOD, note: 'a'.repeat(1001) })).toEqual({ ok: false, error: 'The note is over 1,000 characters.' })
    expect(validatePostInput({ ...GOOD, note: '' }).ok).toBe(true)
    expect(validatePostInput({ ...GOOD, note: 'line one\nline two' }).ok).toBe(true)
    expect(validatePostInput({ ...GOOD, note: 'a\u0000b' })).toEqual({ ok: false, error: 'The note holds a character that cannot be saved.' })
  })

  test('engagements: a whole number at least 0, or empty', () => {
    expect(validatePostInput({ ...GOOD, engagements: null })).toMatchObject({ ok: true, post: { engagements: null } })
    expect(validatePostInput({ ...GOOD, engagements: 0 }).ok).toBe(true)
    for (const engagements of [-1, 1.5, '12', Number.NaN, 2 ** 31]) {
      expect(validatePostInput({ ...GOOD, engagements })).toEqual({ ok: false, error: 'Engagements must be a whole number, 0 or more, or empty.' })
    }
  })

  test('group and sentiment come from the fixed lists', () => {
    expect(validatePostInput({ ...GOOD, group: 'paid' })).toEqual({ ok: false, error: 'invalid group' })
    expect(validatePostInput({ ...GOOD, sentiment: 'positive' })).toEqual({ ok: false, error: 'invalid sentiment' })
    for (const group of ['social', 'forum', 'web']) expect(validatePostInput({ ...GOOD, group }).ok).toBe(true)
    for (const sentiment of ['Positive', 'Neutral', 'Negative']) expect(validatePostInput({ ...GOOD, sentiment }).ok).toBe(true)
  })

  test('platform and author: one line of text, not empty, bounded', () => {
    expect(validatePostInput({ ...GOOD, platform: '  ' })).toEqual({ ok: false, error: 'Add the platform.' })
    expect(validatePostInput({ ...GOOD, author: '' })).toEqual({ ok: false, error: 'Add the author.' })
    expect(validatePostInput({ ...GOOD, platform: 'a'.repeat(61) })).toEqual({ ok: false, error: 'The platform is over 60 characters.' })
    expect(validatePostInput({ ...GOOD, author: 'a'.repeat(201) })).toEqual({ ok: false, error: 'The author is over 200 characters.' })
    expect(validatePostInput({ ...GOOD, author: 'two\nlines' })).toEqual({ ok: false, error: 'The author must be one line.' })
  })

  test('position: a whole number from 0 to 99', () => {
    expect(validatePostInput({ ...GOOD, position: 99 }).ok).toBe(true)
    for (const position of [-1, 100, 1.5, '1']) expect(validatePostInput({ ...GOOD, position })).toEqual({ ok: false, error: 'invalid position' })
  })

  test('anything that is not an object, or a field of the wrong type, is refused', () => {
    expect(validatePostInput(null)).toEqual({ ok: false, error: 'invalid post' })
    expect(validatePostInput('x')).toEqual({ ok: false, error: 'invalid post' })
    expect(validatePostInput({ ...GOOD, note: 5 })).toEqual({ ok: false, error: 'invalid post' })
  })
})

describe('the limits', () => {
  test('12 posts a month, 4 images a post (spec section 8)', () => {
    expect([MAX_POSTS, MAX_IMAGES]).toEqual([12, 4])
  })
})

describe('jpegSize', () => {
  test('reads the size from the frame header, after other segments', () => {
    expect(jpegSize(jpeg(1200, 600))).toEqual({ width: 1200, height: 600 })
    expect(jpegSize(jpeg(10, 20, { sof: 0xc2, pad: 30 }))).toEqual({ width: 10, height: 20 })
  })
  test('not a JPEG, cut short, or no frame header: null', () => {
    expect(jpegSize(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull()
    expect(jpegSize(jpeg(10, 10).slice(0, 25))).toBeNull()
    expect(jpegSize(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toBeNull()
    expect(jpegSize(jpeg(0, 10))).toBeNull()
    expect(jpegSize(new Uint8Array(0))).toBeNull()
  })
  test('a broken segment length never loops forever', () => {
    expect(jpegSize(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, 0xff, 0xc0]))).toBeNull()
  })
})

describe('checkImage (R2-12: both copies checked)', () => {
  test('a screen copy up to 300 KB and 1,200 px and a print copy up to 60 KB and 600 px', () => {
    expect(checkImage(jpeg(1200, 900), jpeg(600, 450))).toEqual({ ok: true, width: 1200, height: 900 })
  })
  test('sizes over the limits are refused, each copy on its own', () => {
    expect(checkImage(jpeg(10, 10, { pad: 300 * 1024 }), jpeg(10, 10))).toEqual({ ok: false, error: 'The image is over 300 KB.' })
    expect(checkImage(jpeg(10, 10), jpeg(10, 10, { pad: 60 * 1024 }))).toEqual({ ok: false, error: 'The print copy is over 60 KB.' })
    expect(checkImage(jpeg(1201, 10), jpeg(10, 10))).toEqual({ ok: false, error: 'The image is wider or taller than 1,200 px.' })
    expect(checkImage(jpeg(10, 10), jpeg(10, 601))).toEqual({ ok: false, error: 'The print copy is wider or taller than 600 px.' })
  })
  test('anything that is not a JPEG is refused, the print copy too', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(checkImage(png, jpeg(10, 10))).toEqual({ ok: false, error: 'The image must be a JPEG.' })
    expect(checkImage(jpeg(10, 10), png)).toEqual({ ok: false, error: 'The print copy must be a JPEG.' })
    expect(checkImage(new Uint8Array(0), jpeg(10, 10))).toEqual({ ok: false, error: 'The image must be a JPEG.' })
  })
})
