import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createElement, type ReactElement } from 'react'
import { auth } from '@/auth'
import type { OrganicSocialCtx } from './ctx'
import type { ResolvedPart, SectionOverride } from '@/lib/report-sections/types'

// Option B (docs/superpowers/specs/2026-11-24-os-design-past-months.md): the body draws each kit part as the version it
// wraps for a month before the client's designFrom. Harness as index.test.tsx: the two DB reads mocked, `lookup` spied.
vi.mock('@/lib/organic-social/headlines', () => import('./parts/__mocks__/headlines'))
vi.mock('@/lib/organic-social/trends', () => import('./parts/__mocks__/trends'))
vi.mock('@/lib/organic-social/top-content', () => import('./parts/__mocks__/top-content'))
vi.mock('./aeo-informed/section', () => ({ AeoInformedSection: function AeoInformedSection() { return null } }))
const { getSectionTemplate, getClientBySlug } = vi.hoisted(() => ({ getSectionTemplate: vi.fn(), getClientBySlug: vi.fn() }))
vi.mock('@/lib/db/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/queries')>()),
  getSectionTemplate,
  getClientBySlug,
}))

import { OrganicSocialBody } from './index'
import { NoMonths } from './no-months'
import { buildOrganicSocialCtx } from './ctx'
import { elementTree } from '@/lib/test-utils/element-tree'
import { DESIGN_FROM_ROWS, rowConfig } from '@/lib/organic-social/design-from.rows'

const SEP = 'custom:2026-09-01,2026-09-30'
const OCT = 'custom:2026-10-01,2026-10-31'
const NOV = 'custom:2026-11-01,2026-11-23'
const MONTHS = { reportingMonths: { firstMonth: '2026-08' } }

// KIT: every round 2 kit pin. BEFORE: the same client with every pin at the version its kit version wraps.
const KIT_CONFIG: Record<string, SectionOverride> = {
  'organic-social': { versions: { 'platform-headlines': 4, 'engagement-trend': 3, 'top-content': 4 }, extraParts: [{ id: 'kpi-check-in', version: 2 }] },
  'organic-social:platform': {
    versions: { 'platform-headlines': 4, 'follower-graph': 3, 'engagement-trend': 3, 'top-content': 4 },
    extraParts: [{ id: 'engagement-breakdown', version: 2 }, { id: 'ytd-review', version: 5 }],
  },
  'organic-social:influencer': { versions: { 'influencer-posts': 2 } },
}
const BEFORE_CONFIG: Record<string, SectionOverride> = {
  'organic-social': { versions: { 'platform-headlines': 2, 'engagement-trend': 2, 'top-content': 3 }, extraParts: [{ id: 'kpi-check-in', version: 1 }] },
  'organic-social:platform': {
    versions: { 'platform-headlines': 2, 'follower-graph': 2, 'engagement-trend': 2, 'top-content': 3 },
    extraParts: [{ id: 'engagement-breakdown', version: 1 }, { id: 'ytd-review', version: 2 }],
  },
  'organic-social:influencer': { versions: { 'influencer-posts': 1 } },
}
const KIT_OF: Record<string, number> = {
  'platform-headlines@2': 4, 'engagement-trend@2': 3, 'top-content@3': 4, 'kpi-check-in@1': 2,
  'follower-graph@2': 3, 'engagement-breakdown@1': 2, 'ytd-review@2': 5, 'influencer-posts@1': 2,
}

const client = (reportSectionConfig: Record<string, SectionOverride>, dsc: Record<string, unknown>) => ({ slug: 'c', dashSocialConfig: { brandId: 1, ...dsc }, reportSectionConfig })
const KIT = client(KIT_CONFIG, { ...MONTHS, designFrom: '2026-11' })
const BEFORE = client(BEFORE_CONFIG, { ...MONTHS })

type Call = { pin: string; ctx: OrganicSocialCtx; part: ResolvedPart }
let calls: Call[] = []
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-24T15:00:00Z'))
  calls = []
  const registry = await import('@/lib/report-sections/registry')
  vi.spyOn(registry, 'lookup').mockImplementation(((_reg: unknown, id: string, version: number) => ({
    render: (c: OrganicSocialCtx, part: ResolvedPart) => { calls.push({ pin: `${id}@${version}`, ctx: c, part }); return createElement('i', { 'data-part': `${part.id}@${part.version}` }) },
  })) as never)
  getSectionTemplate.mockResolvedValue(null)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => { vi.useRealTimers(); vi.mocked(auth).mockReset(); vi.restoreAllMocks() })

const as = (role: string) => vi.mocked(auth).mockResolvedValue({ user: { role } } as never)
type Tab = 'overview' | 'instagram' | 'influencer'
const ctxFor = (tab: Tab, dateRange: string) => buildOrganicSocialCtx({
  clientSlug: 'c', dateRange, compareRange: 'previous_year',
  channel: tab === 'instagram' ? 'INSTAGRAM' : null, view: tab === 'influencer' ? 'influencer' : null,
})
async function run(c: unknown, role: string, tab: Tab, dateRange: string): Promise<Call[]> {
  as(role); getClientBySlug.mockResolvedValue(c); calls = []
  await OrganicSocialBody({ ctx: ctxFor(tab, dateRange) })
  return calls
}
const pins = (cs: Call[]) => cs.map((c) => c.pin)
const toKit = (cs: Call[]) => cs.map((c) => {
  const v = KIT_OF[c.pin]
  return v === undefined ? c : { pin: `${c.pin.split('@')[0]}@${v}`, ctx: c.ctx, part: { ...c.part, version: v } }
})
const TABS: Tab[] = ['overview', 'instagram', 'influencer']

test('a month before designFrom asks for exactly what the client drew before its pin, with the same ctx and part', async () => {
  for (const role of ['INTERNAL_ADMIN', 'CLIENT_VIEWER']) {
    for (const tab of TABS) {
      const before = await run(BEFORE, role, tab, SEP)
      expect(before.length).toBeGreaterThan(0)
      expect(await run(KIT, role, tab, SEP)).toEqual(before)
    }
  }
})

test('from designFrom the kit versions, with the same ctx (the new-month half of spec test 8)', async () => {
  for (const tab of TABS) {
    const before = await run(BEFORE, 'INTERNAL_ADMIN', tab, NOV)
    expect(before[0].ctx.dateRange).toBe(NOV)
    expect(await run(KIT, 'INTERNAL_ADMIN', tab, NOV)).toEqual(toKit(before))
  }
})

test('from designFrom: the platform tab asks the kit versions', async () => {
  expect(pins(await run(KIT, 'INTERNAL_ADMIN', 'instagram', NOV)).sort()).toEqual(
    ['engagement-breakdown@2', 'engagement-trend@3', 'follower-graph@3', 'platform-headlines@4', 'top-content@4', 'ytd-review@5'])
})

test('staff and a client on the same day: staff on November get the kit, a client is served October in the old look', async () => {
  const staff = await run(KIT, 'INTERNAL_ADMIN', 'instagram', NOV)
  expect(pins(staff)).toContain('top-content@4')
  const clientCalls = await run(KIT, 'CLIENT_VIEWER', 'instagram', NOV)
  expect(clientCalls[0].ctx.dateRange).toBe(OCT)
  expect(pins(clientCalls)).toEqual(pins(await run(BEFORE, 'CLIENT_VIEWER', 'instagram', NOV)))
})

test("a past month's returned tree equals the old composition's (same keys, same data-export-block)", async () => {
  for (const tab of TABS) {
    as('INTERNAL_ADMIN')
    getClientBySlug.mockResolvedValue(KIT)
    const kit = elementTree(await OrganicSocialBody({ ctx: ctxFor(tab, SEP) }))
    getClientBySlug.mockResolvedValue(BEFORE)
    const before = elementTree(await OrganicSocialBody({ ctx: ctxFor(tab, SEP) }))
    expect(kit).toEqual(before)
  }
})

test('no designFrom: the wrapped versions on every month (Paul, #504)', async () => {
  const noFrom = client(KIT_CONFIG, { ...MONTHS })
  for (const range of [SEP, NOV]) {
    expect(pins(await run(noFrom, 'INTERNAL_ADMIN', 'instagram', range))).toEqual(pins(await run(BEFORE, 'INTERNAL_ADMIN', 'instagram', range)))
  }
  const beforeWithFrom = client(BEFORE_CONFIG, { ...MONTHS, designFrom: '2026-11' })
  expect(pins(await run(beforeWithFrom, 'INTERNAL_ADMIN', 'instagram', NOV))).toEqual(pins(await run(BEFORE, 'INTERNAL_ADMIN', 'instagram', NOV)))
})

test('malformed: the old versions on every month, logged once per render', async () => {
  const bad = client(KIT_CONFIG, { ...MONTHS, designFrom: '2026-13' })
  for (const range of [SEP, NOV]) {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(pins(await run(bad, 'INTERNAL_ADMIN', 'instagram', range))).toEqual(pins(await run(BEFORE, 'INTERNAL_ADMIN', 'instagram', range)))
    const lines = err.mock.calls.filter(([m]) => String(m).includes('designFrom setting is invalid'))
    expect(lines).toEqual([['[organic-social] designFrom setting is invalid slug=c value="2026-13"']])
    err.mockRestore()
  }
})

test('no reporting months: the old versions, with a valid designFrom or none', async () => {
  const before = pins(await run(client(BEFORE_CONFIG, {}), 'INTERNAL_ADMIN', 'instagram', 'last_30_days'))
  for (const dsc of [{}, { designFrom: '2026-11' }, { designFrom: '2026-01' }]) {
    expect(pins(await run(client(KIT_CONFIG, dsc), 'INTERNAL_ADMIN', 'instagram', 'last_30_days'))).toEqual(before)
  }
})

test('malformed with no months to serve: logged once, then the no-months line', async () => {
  const err = vi.spyOn(console, 'error').mockImplementation(() => {})
  as('INTERNAL_ADMIN')
  getClientBySlug.mockResolvedValue(client(KIT_CONFIG, { reportingMonths: { firstMonth: '2027-01' }, designFrom: '2026-13' }))
  const out = await OrganicSocialBody({ ctx: ctxFor('instagram', NOV) }) as ReactElement
  expect(out.type).toBe(NoMonths)
  expect(err.mock.calls.filter(([m]) => String(m).includes('designFrom setting is invalid'))).toHaveLength(1)
})

test('a frozen snapshot is mapped too', async () => {
  const frozen: SectionOverride = { frozen: { order: [{ id: 'platform-headlines', version: 4 }, { id: 'top-content', version: 4 }], labels: {}, thresholds: {} } }
  const base = { slug: 'c', reportSectionConfig: { 'organic-social:platform': frozen } }
  expect(pins(await run({ ...base, dashSocialConfig: { brandId: 1, ...MONTHS, designFrom: '2026-11' } }, 'INTERNAL_ADMIN', 'instagram', SEP))).toEqual(['platform-headlines@2', 'top-content@3'])
  expect(pins(await run({ ...base, dashSocialConfig: { brandId: 1, ...MONTHS, designFrom: '2026-11' } }, 'INTERNAL_ADMIN', 'instagram', NOV))).toEqual(['platform-headlines@4', 'top-content@4'])
})

describe('the rule, row by row, on the Instagram tab (spec test 9)', () => {
  test.each(DESIGN_FROM_ROWS)('$name', async (row) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const dsc = rowConfig(row, row.month === null ? {} : MONTHS)
    const request = row.month === null ? 'last_30_days' : row.month === '2026-11' ? NOV : `custom:${row.month}-01,${row.month}-31`
    const cs = await run({ slug: 'c', dashSocialConfig: dsc, reportSectionConfig: KIT_CONFIG }, 'INTERNAL_ADMIN', 'instagram', request)
    if (row.month === null) expect(cs[0].ctx.dateRange).toBe(request)
    else expect(cs[0].ctx.dateRange.startsWith(`custom:${row.month}-01,`)).toBe(true)
    expect(pins(cs)).toContain(row.kit ? 'top-content@4' : 'top-content@3')
  })
})
