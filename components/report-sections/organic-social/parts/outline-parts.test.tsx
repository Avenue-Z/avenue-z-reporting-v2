import { expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock('@/lib/organic-social/headlines', () => import('./__mocks__/headlines'))
vi.mock('@/lib/organic-social/trends', () => import('./__mocks__/trends'))
vi.mock('@/lib/organic-social/top-content', () => import('./__mocks__/top-content'))
const { getOutlineKpis } = vi.hoisted(() => ({ getOutlineKpis: vi.fn() }))
vi.mock('@/lib/organic-social/outline-headlines', async () => ({
  ...(await vi.importActual<typeof import('@/lib/organic-social/outline-headlines')>('@/lib/organic-social/outline-headlines')),
  getOutlineKpis,
}))

import { ORGANIC_SOCIAL_PARTS } from './registry'
import { platformHeadlinesV1 } from './platform-headlines'
import { OutlineDataSection } from './outline-data'
import { BreakdownSection } from './engagement-breakdown'
import { buildOutlineKpis } from '@/lib/organic-social/outline-headlines'
import { outlineSpecsFor, OUTLINE_DATA_ROWS, OUTLINE_BREAKDOWN_ROWS } from '@/lib/organic-social/outline-layout'
import { metricFor } from '@/lib/organic-social/metrics'
import { DashTimeoutError } from '@/lib/dash-social/client'
import { FIXTURE_ORGANIC_SOCIAL_CTX } from './__fixtures__/organic-social-ctx'

const IG = { ...FIXTURE_ORGANIC_SOCIAL_CTX, channel: 'INSTAGRAM' as const }
const built = (value: number | null) => buildOutlineKpis('INSTAGRAM',
  Object.fromEntries(outlineSpecsFor('INSTAGRAM').map((s) => [metricFor(s), { value, context: null, context_change: null }])),
  outlineSpecsFor('INSTAGRAM'))
const text = async (node: Promise<ReactNode>) => render(<>{await node}</>).container

test('the registry adds three unpublished versions and leaves v1 as it was', () => {
  expect(Object.keys(ORGANIC_SOCIAL_PARTS['platform-headlines'])).toEqual(['1', '2', '3'])
  expect(ORGANIC_SOCIAL_PARTS['platform-headlines'][1]).toBe(platformHeadlinesV1)
  expect(ORGANIC_SOCIAL_PARTS['engagement-breakdown'][1].published).toBe(false)
  expect(ORGANIC_SOCIAL_PARTS['platform-headlines'][2].published).toBe(false)
  expect(ORGANIC_SOCIAL_PARTS['platform-headlines'][3].published).toBe(false)
})

test('the Data part shows the outline rows and none of the breakdown', async () => {
  getOutlineKpis.mockResolvedValueOnce(built(10))
  const c = await text(OutlineDataSection({ ctx: IG, channel: 'INSTAGRAM', rows: OUTLINE_DATA_ROWS.standard.INSTAGRAM! }))
  expect([...c.querySelectorAll('h3')].map((h) => h.textContent)).toEqual(['Instagram'])
  expect(c.textContent).toContain('Total Engagements')
  expect(c.textContent).toContain('Profile Views')
  for (const gone of ['Likes', 'Saves', 'Reposts', 'Video Views']) expect(c.textContent).not.toContain(gone)
})

test('the breakdown shows its rows in order with no heading', async () => {
  getOutlineKpis.mockResolvedValueOnce(built(10))
  const c = await text(BreakdownSection({ ctx: IG, channel: 'INSTAGRAM', rows: OUTLINE_BREAKDOWN_ROWS.INSTAGRAM! }))
  expect(c.querySelectorAll('h3')).toHaveLength(0)
  const t = c.textContent ?? ''
  const at = ['Likes', 'Comments', 'Shares', 'Saves', 'Reposts'].map((l) => t.indexOf(l))
  expect(at.every((i) => i >= 0)).toBe(true)
  expect([...at].sort((a, b) => a - b)).toEqual(at)
})

test('with no data the breakdown renders nothing; the Data block above says so once', async () => {
  getOutlineKpis.mockResolvedValueOnce(built(null))
  const c = await text(BreakdownSection({ ctx: IG, channel: 'INSTAGRAM', rows: OUTLINE_BREAKDOWN_ROWS.INSTAGRAM! }))
  expect(c.innerHTML).toBe('')
})

test('a Dash failure shows the same fallback card as the v1 tiles', async () => {
  getOutlineKpis.mockRejectedValueOnce(new Error('boom'))
  const c = await text(OutlineDataSection({ ctx: IG, channel: 'INSTAGRAM', rows: OUTLINE_DATA_ROWS.standard.INSTAGRAM! }))
  expect(c.textContent).toContain("Couldn't load this section.")
  getOutlineKpis.mockRejectedValueOnce(new DashTimeoutError())
  const d = await text(BreakdownSection({ ctx: IG, channel: 'INSTAGRAM', rows: OUTLINE_BREAKDOWN_ROWS.INSTAGRAM! }))
  expect(d.textContent).toContain('Taking longer than usual')
})

test('on Overview or an uncovered channel the Data part is v1, and the breakdown is nothing', () => {
  const v2 = ORGANIC_SOCIAL_PARTS['platform-headlines'][2]
  const brk = ORGANIC_SOCIAL_PARTS['engagement-breakdown'][1]
  const r = { id: 'platform-headlines', version: 2, label: 'x' }
  for (const ctx of [FIXTURE_ORGANIC_SOCIAL_CTX, { ...FIXTURE_ORGANIC_SOCIAL_CTX, channel: 'TWITTER' as const }]) {
    expect(v2.render(ctx, r)).toEqual(platformHeadlinesV1.render(ctx, r))
    expect(brk.render(ctx, { id: 'engagement-breakdown', version: 1, label: 'x' })).toBeNull()
  }
})

test('v3 is v2 with Profile Clicks on Instagram', async () => {
  getOutlineKpis.mockResolvedValueOnce(built(10))
  const c = await text(OutlineDataSection({ ctx: IG, channel: 'INSTAGRAM', rows: OUTLINE_DATA_ROWS.profileClicks.INSTAGRAM! }))
  expect(c.textContent).toContain('Profile Clicks')
})
