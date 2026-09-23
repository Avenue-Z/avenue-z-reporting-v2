import { expect, test } from 'vitest'
import { applyHides, hideKey } from './apply'
import type { Annotation } from '../annotations'

const A = (date: string, value: number): Annotation => ({ date, value, label: `${date} | ${value}`, post: null })
const ITEMS = [A('2026-08-05', 30), A('2026-08-10', 50), A('2026-08-20', 40)]
const HIDDEN = new Set([hideKey('engagements', '2026-08-10')])

test('a client never receives a hidden annotation, and the next day down does not take its place', () => {
  expect(applyHides(ITEMS, HIDDEN, 'engagements', 'client').map((a) => a.date)).toEqual(['2026-08-05', '2026-08-20'])
})

test('staff receive every annotation, the hidden one marked', () => {
  expect(applyHides(ITEMS, HIDDEN, 'engagements', 'staff').map((a) => [a.date, a.hidden])).toEqual([
    ['2026-08-05', false], ['2026-08-10', true], ['2026-08-20', false],
  ])
})

test("a hide on one chart does not hide the other chart's annotation for the same day", () => {
  expect(applyHides(ITEMS, HIDDEN, 'followers', 'client')).toHaveLength(3)
})

test('with nothing hidden, everyone sees every annotation', () => {
  expect(applyHides(ITEMS, new Set(), 'engagements', 'client').every((a) => a.hidden === false)).toBe(true)
})
