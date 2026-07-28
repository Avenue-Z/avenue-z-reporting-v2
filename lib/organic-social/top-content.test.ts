import { expect, test } from 'vitest'
import { transformTopContent, groupByPlatform } from './top-content'
import type { MediaV2Response } from '@/lib/dash-social/types'
import type { DashChannel } from './metrics'
import type { TopContentRow } from './types'
// Direct JSON import (resolveJsonModule): portable across every Node 20 and works under Vitest.
// Avoids both `import.meta.dirname` (needs Node ≥20.11) and `new URL(import.meta.url)` +
// readFileSync (Vitest's import.meta.url isn't a file: URL → "URL must be of scheme file").
import mediaV2 from './__fixtures__/media-v2.json'

const fixture = mediaV2 as unknown as MediaV2Response
const rows = transformTopContent(fixture, 10)

test('respects limit', () => {
  expect(rows.length <= 10).toBe(true)
})

test('all organic in v1', () => {
  expect(rows.every((r) => r.sourceType === 'organic')).toBe(true)
})

test('numeric engagements', () => {
  expect(rows.every((r) => typeof r.engagements === 'number')).toBe(true)
})

test('desc by engagements', () => {
  for (let i = 1; i < rows.length; i++) {
    expect(rows[i - 1].engagements >= rows[i].engagements).toBe(true)
  }
})

// URL extraction: every row exposes a `url` field; at least one Instagram
// post in the fixture carries its permalink.
test('row exposes url field', () => {
  expect('url' in rows[0]).toBe(true)
})

test('instagram permalink extracted', () => {
  const ig = rows.find((r) => r.platform === 'Instagram' && r.url)
  expect(Boolean(ig && ig.url!.startsWith('https://www.instagram.com/'))).toBe(true)
})

test('url is string | null', () => {
  expect(rows.every((r) => r.url === null || typeof r.url === 'string')).toBe(true)
})

const row = (platform: string, engagements: number): TopContentRow => ({
  id: engagements, caption: '', platform, sourceType: 'organic',
  publishDate: '2026-07-01', views: 0, engagements, url: null,
})

test('groupByPlatform: allowed=[TWITTER] yields the "X" group (label-space bridge)', () => {
  const rows = [row('Instagram', 5), row('X', 9)]
  const groups = groupByPlatform(rows, 25, ['TWITTER'] as DashChannel[])
  expect(groups.map((g) => g.platform)).toEqual(['X'])
  expect(groups[0].rows).toHaveLength(1)
})

test('groupByPlatform: allowed=[INSTAGRAM] keeps INSTAGRAM_STORY folded to Instagram', () => {
  // transformTopContent maps INSTAGRAM_STORY.source → displayChannel → 'Instagram'
  const rows = [row('Instagram', 3), row('Facebook', 4)]
  const groups = groupByPlatform(rows, 25, ['INSTAGRAM'] as DashChannel[])
  expect(groups.map((g) => g.platform)).toEqual(['Instagram'])
})

test('groupByPlatform: all four allowed preserves CHANNELS order and still skips UPLOAD', () => {
  const rows = [row('LinkedIn', 1), row('UPLOAD', 99), row('Instagram', 2)]
  const groups = groupByPlatform(rows, 25, ['INSTAGRAM', 'FACEBOOK', 'TWITTER', 'LINKEDIN'] as DashChannel[])
  expect(groups.map((g) => g.platform)).toEqual(['Instagram', 'LinkedIn'])
})
