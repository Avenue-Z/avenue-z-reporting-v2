import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vitest'
import { transformTopContent } from './top-content'
import type { MediaV2Response } from '@/lib/dash-social/types'

const fixture = JSON.parse(
  readFileSync(path.join(import.meta.dirname, '__fixtures__/media-v2.json'), 'utf8'),
) as MediaV2Response
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
