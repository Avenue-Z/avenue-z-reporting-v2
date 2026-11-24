// The kit look reaches the panel only where it should (plan docs/superpowers/plans/2026-11-23-os-design-phase1.md, Task 11):
// CommentarySection passes `look` on to the panel on both its paths (an Organic Social view on locked months goes through
// monthlyCommentary), only for an Organic Social view key; commentary@2 and recommendations@2 ask for it; both are
// published, so a client's sharedParts pin of them saves; and Recommendations stays at the bottom.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'

let captured: Record<string, unknown> | null = null
vi.mock('./commentary-panel', () => ({ CommentaryPanel: (props: Record<string, unknown>) => { captured = props; return null } }))
const mockAuth = vi.fn()
vi.mock('@/auth', () => ({ auth: () => mockAuth() }))
const client = vi.hoisted(() => ({ value: { id: 'client-1', slug: 'acme' } as Record<string, unknown> }))
vi.mock('@/lib/db/queries', () => ({
  getClientBySlug: async () => client.value,
  getCommentaryForView: async () => [],
}))
// A fixed clock, so the served month does not depend on the real date (#507): staff may pick 2026-08 to 2026-11.
vi.mock('@/lib/organic-social/locked-range', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/organic-social/locked-range')>()
  const { clockFor } = await import('@/lib/organic-social/reporting-months')
  return { ...real, requestClock: () => clockFor(new Date('2026-11-24T15:00:00Z')) }
})

import { CommentarySection } from './index'
import { monthlyCommentary } from './monthly'
import { DESIGN_FROM_ROWS, rowConfig } from '@/lib/organic-social/design-from.rows'
import { SL_BOX_IDS, slBoxViewKey } from '@/lib/organic-social/social-listening/boxes'
import { SHARED_PARTS, SHARED_PART_PLACEMENT, commentaryPart, recommendationsPart } from '@/components/report-sections/shared/parts/registry'
import { validateSectionOverride } from '@/lib/report-sections/mutations'

const staff = { user: { email: 'writer@avenuez.com', role: 'INTERNAL_ADMIN' } }
beforeEach(() => { captured = null; mockAuth.mockResolvedValue(staff); client.value = { id: 'client-1', slug: 'acme' } })
afterEach(() => vi.unstubAllEnvs())

async function propsFor(viewKey: string, look?: 'kit', requestedRange?: string) {
  const el = await CommentarySection({ clientSlug: 'acme', viewKey: viewKey as never, ...(look ? { look } : {}), ...(requestedRange ? { requestedRange } : {}) })
  if (el) render(el as ReactElement)
  return captured
}
const OCT = 'custom:2026-10-01,2026-10-31'
const MONTHS = { reportingMonths: { firstMonth: '2026-08' } }
const rangeFor = (month: string) => month === '2026-11' ? 'custom:2026-11-01,2026-11-23' : `custom:${month}-01,${month}-31`

describe('CommentarySection', () => {
  test('passes the kit look to the panel on an Organic Social view, on a month from designFrom', async () => {
    client.value = { id: 'client-1', slug: 'acme', dashSocialConfig: { brandId: 1, ...MONTHS, designFrom: '2026-10' } }
    for (const key of ['organic-social', 'organic-social:instagram', 'organic-social:instagram:recommendations']) {
      expect((await propsFor(key, 'kit', OCT))?.look, key).toBe('kit')
    }
  })
  test('a client without reporting months never gets the kit look (absent designFrom is the old look)', async () => {
    for (const key of ['organic-social', 'organic-social:instagram', 'organic-social:instagram:recommendations']) {
      const props = await propsFor(key, 'kit')
      expect(props, key).not.toBeNull()
      expect(props, key).not.toHaveProperty('look')
    }
  })
  test('never on another report, so commentary@2 pinned on another report keeps today\'s panel', async () => {
    for (const key of ['peec-ai', 'meta-ads', 'executive-overview']) {
      const props = await propsFor(key, 'kit')
      expect(props, key).not.toBeNull()
      expect(props, key).not.toHaveProperty('look')
    }
  })
  test('without the look, the panel is handed no look key at all, on every view', async () => {
    for (const key of ['organic-social:instagram', 'peec-ai']) expect(await propsFor(key), key).not.toHaveProperty('look')
  })
  test('on locked months (monthlyCommentary), the look reaches the panel too', async () => {
    client.value = { id: 'client-1', slug: 'acme', dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2026-01' }, designFrom: '2026-10' } }
    const props = await propsFor('organic-social:instagram', 'kit', OCT)
    expect(props).not.toBeNull()
    expect(props?.look).toBe('kit')
  })
})

describe('the rule, row by row (spec test 9), on every branch of the boxes', () => {
  const monthRows = DESIGN_FROM_ROWS.filter((r) => r.month !== null)
  const nullRows = DESIGN_FROM_ROWS.filter((r) => r.month === null)
  test('every row runs on some branch', () => expect(monthRows.length + nullRows.length).toBe(DESIGN_FROM_ROWS.length))
  test.each(monthRows)('locked months, a served month: $name', async (row) => {
    client.value = { id: 'client-1', slug: 'acme', dashSocialConfig: rowConfig(row, MONTHS) }
    const props = await propsFor('organic-social:instagram', 'kit', rangeFor(row.month!))
    expect((props?.defaultPeriod as { start: string }).start).toBe(`${row.month}-01`)
    if (row.kit) expect(props?.look).toBe('kit')
    else expect(props).not.toHaveProperty('look')
  })
  test.each(nullRows)('locked months, no month to serve: $name', async (row) => {
    client.value = { id: 'client-1', slug: 'acme', dashSocialConfig: rowConfig(row, { reportingMonths: { firstMonth: '2027-01' } }) }
    const props = await propsFor('organic-social:instagram', 'kit')
    expect(props?.emptyText).toBe('No reporting months yet')
    if (row.kit) expect(props?.look).toBe('kit')
    else expect(props).not.toHaveProperty('look')
  })
  test.each(nullRows)('no reporting months: $name', async (row) => {
    client.value = { id: 'client-1', slug: 'acme', dashSocialConfig: rowConfig(row) }
    const props = await propsFor('organic-social:instagram', 'kit')
    expect(props).not.toBeNull()
    expect(props).not.toHaveProperty('defaultPeriod')
    if (row.kit) expect(props?.look).toBe('kit')
    else expect(props).not.toHaveProperty('look')
  })
  test('Social Listening keeps its own panel: no look is asked for, so none is given, whatever designFrom says', async () => {
    let got: Record<string, unknown> | null = null
    const Panel = (props: Record<string, unknown>) => { got = props; return null }
    const c = { id: 'client-1', slug: 'acme', dashSocialConfig: { brandId: 1, ...MONTHS, designFrom: '2026-12' } }
    const el = await monthlyCommentary({ client: c, role: 'INTERNAL_ADMIN', email: staff.user.email, viewKey: slBoxViewKey(SL_BOX_IDS[0]), requestedRange: OCT, labels: { title: 'x' } as never, entries: [], Panel: Panel as never })
    if (el) render(el as ReactElement)
    expect(got).not.toBeNull()
    expect(got).not.toHaveProperty('look')
  })
  test("another report keeps today's panel, whatever designFrom says", async () => {
    client.value = { id: 'client-1', slug: 'acme', dashSocialConfig: { brandId: 1, ...MONTHS, designFrom: '2026-01' } }
    const props = await propsFor('peec-ai', 'kit', OCT)
    expect(props).not.toBeNull()
    expect(props).not.toHaveProperty('look')
  })
})

describe('commentary@2 and recommendations@2', () => {
  const ctx = { slug: 'acme', viewKey: 'organic-social:instagram' as const }
  const r = { id: 'x', version: 2, label: 'x' }
  test('render the same section as @1, with the kit look, and nothing else different', () => {
    const v1 = commentaryPart.render(ctx, r) as ReactElement<Record<string, unknown>>
    const v2 = SHARED_PARTS.commentary[2].render(ctx, r) as ReactElement<Record<string, unknown>>
    expect(v2.type).toBe(v1.type)
    expect(v2.props).toEqual({ ...v1.props, look: 'kit' })
    const rv1 = recommendationsPart.render({ ...ctx, requestedRange: 'custom:2026-10-01,2026-10-31' }, r) as ReactElement<Record<string, unknown>>
    const rv2 = SHARED_PARTS.recommendations[2].render({ ...ctx, requestedRange: 'custom:2026-10-01,2026-10-31' }, r) as ReactElement<Record<string, unknown>>
    expect(rv2.props).toEqual({ ...rv1.props, look: 'kit' })
    expect(SHARED_PARTS.recommendations[2].render({ slug: 'acme', viewKey: 'peec-ai' as never }, r)).toBeNull()
  })
  test('are published with @1\'s labels, and Recommendations is still placed at the bottom', () => {
    for (const id of ['commentary', 'recommendations'] as const) {
      expect(SHARED_PARTS[id][2]).toMatchObject({ id, version: 2, published: true, defaultLabel: SHARED_PARTS[id][1].defaultLabel })
      expect(SHARED_PARTS[id][1]).toBe(id === 'commentary' ? commentaryPart : recommendationsPart)
    }
    expect(SHARED_PART_PLACEMENT).toEqual({ commentary: 'top', recommendations: 'bottom' })
  })
  test('a client\'s Organic Social config pinning both saves (shared parts must be published)', () => {
    const out = validateSectionOverride('organic-social', { sharedParts: [{ id: 'commentary', version: 2 }, { id: 'recommendations', version: 2 }] }, {}, [], SHARED_PARTS as never)
    expect(out['organic-social'].sharedParts).toEqual([{ id: 'commentary', version: 2 }, { id: 'recommendations', version: 2 }])
  })
})
