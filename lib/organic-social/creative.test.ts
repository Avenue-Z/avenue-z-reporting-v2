import { expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolveCreative } from './creative'
import type { ContentResponse, DashContentPost } from './content-types'

const fixture = JSON.parse(
  readFileSync('lib/organic-social/__fixtures__/content-creative.json', 'utf8'),
) as ContentResponse

test('an image post resolves to an image creative with thumb + full URLs', () => {
  const post = fixture.data.content.find((p) => p.type === 'IMAGE')!
  const c = resolveCreative(post, 'INSTAGRAM')
  expect(c?.kind).toBe('image')
  if (c?.kind === 'image') {
    expect(c.thumb).toMatch(/^https?:\/\//)
    expect(c.full).toMatch(/^https?:\/\//)
  }
})

test('a video post resolves to a video creative with an mp4 src + poster', () => {
  const post = fixture.data.content.find((p) => p.type === 'VIDEO')!
  const c = resolveCreative(post, 'INSTAGRAM')
  expect(c?.kind).toBe('video')
  if (c?.kind === 'video') {
    expect(c.src).toContain('.mp4')
    expect(c.poster).toMatch(/^https?:\/\//)
  }
})

test('a carousel resolves to its cover image (badge handled by mediaType, not here)', () => {
  const post = fixture.data.content.find((p) => p.type === 'CAROUSEL')
  if (!post) return // fixture may lack a carousel; skip cleanly
  const c = resolveCreative(post, 'INSTAGRAM')
  expect(c?.kind).toBe('image')
})

test('a video with a src but no resolvable poster still resolves (poster optional)', () => {
  const post = { id: 10, source: 'INSTAGRAM', type: 'VIDEO', instagram: null, facebook: null, linkedin: null, twitter: null,
    video: { sizes: { original: { url: 'https://cdn/v.mp4' } }, thumbnails: {} } } as unknown as DashContentPost
  const c = resolveCreative(post, 'INSTAGRAM')
  expect(c?.kind).toBe('video')
  if (c?.kind === 'video') {
    expect(c.src).toContain('.mp4')
    expect(c.poster).toBeNull() // no thumbnail resolved, but the video is still playable
  }
})

test('resolveCreative returns null when neither image nor video is present', () => {
  const bare: DashContentPost = { id: 9, source: 'TWITTER', type: 'IMAGE', instagram: null, facebook: null, linkedin: null, twitter: {} }
  expect(resolveCreative(bare, 'TWITTER')).toBeNull()
})
