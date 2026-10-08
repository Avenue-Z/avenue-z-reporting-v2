import { expect, test } from 'vitest'
import { ORGANIC_SOCIAL_PARTS } from './registry'
import { EXPORT_LAYOUT, wrapsAsBlock } from './export-layout'

// Every registered Organic Social part says how it pages in the PDF export (spec 2026-10-06 §6, §11): either it lays
// out its own unbreakable blocks, or the report wraps the whole part as one. A part registered without a decision fails
// here, so a new part can never print a title alone or a card split across pages by default (Thomas, #332 round 2, item 2).
const registered = Object.entries(ORGANIC_SOCIAL_PARTS).flatMap(([id, versions]) => Object.keys(versions).map((v) => `${id}@${v}`)).sort()

test('every registered part has an export layout, and nothing else does', () => {
  expect(Object.keys(EXPORT_LAYOUT).sort()).toEqual(registered)
})

test('parts with no export form of their own are wrapped whole', () => {
  expect(wrapsAsBlock('engagement-breakdown', 1)).toBe(true)
  expect(wrapsAsBlock('top-content', 1)).toBe(true)
})

test('parts that lay out their own blocks are not wrapped (they are taller than a page)', () => {
  for (const key of ['platform-headlines@1', 'engagement-trend@2', 'follower-graph@2', 'top-content@2', 'top-content@3', 'ytd-review@1', 'ytd-review@2', 'ytd-review@3']) {
    const [id, v] = key.split('@')
    expect(wrapsAsBlock(id, Number(v)), key).toBe(false)
  }
})

test('an unknown part is wrapped (fail safe)', () => {
  expect(wrapsAsBlock('not-a-part', 1)).toBe(true)
})
