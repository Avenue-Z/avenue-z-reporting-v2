// The AEO Informed Social tab with `design: "kit"` (plan docs/superpowers/plans/2026-11-23-os-design-phase1.md, Task 10;
// the setting key from #489, lib/organic-social/aeo-tab/setting.ts). The tab is not on the parts system, so the setting
// gates it. Without the setting the tab must render exactly as today: the snapshots below were recorded from the code
// before this change, for staff, a client and the PDF, on Month and YTD.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import type { AeoTabResult } from '@/lib/organic-social/aeo-tab/load'

const { getClientBySlug, getAeoTabData, clock } = vi.hoisted(() => ({
  getClientBySlug: vi.fn(), getAeoTabData: vi.fn(),
  clock: { value: { today: '2026-11-12', lastCompleteUtcDay: '2026-11-11', liveDayInProgress: false } },
}))
vi.mock('@/lib/db/queries', async (orig) => ({ ...(await orig<object>()), getClientBySlug }))
vi.mock('@/lib/organic-social/aeo-tab/data', () => ({ getAeoTabData }))
vi.mock('@/lib/organic-social/locked-range', async (orig) => ({ ...(await orig<object>()), requestClock: () => clock.value }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/x', useSearchParams: () => new URLSearchParams() }))
// Recharts draws nothing inside ResponsiveContainer in jsdom (it measures 0 by 0): give it a size, as the goldens do.
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts')
  const { cloneElement } = await import('react')
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement<{ width?: number; height?: number }> }) =>
      cloneElement(children, { width: 600, height: 220 }),
  }
})

import { world, input } from '@/lib/organic-social/aeo-informed/test-world'
import { toTabResult } from '@/lib/organic-social/aeo-tab/load'
import { ExportModeProvider } from '@/components/export/export-mode'
import { AeoInformedSection } from './section'
import { expectSameValues } from '../parts/version-parity'
import kit from '../design/kit.module.css'
import { DESIGN_FROM_ROWS, rowConfig } from '@/lib/test-utils/design-from-rows'

let RESULT: AeoTabResult
beforeAll(async () => {
  const actual = await vi.importActual<typeof import('@/lib/organic-social/aeo-informed')>('@/lib/organic-social/aeo-informed')
  RESULT = toTabResult(await actual.getAeoInformedSocial(input(world().reader)))
})

const SETTING = { enabled: true, allTimeFrom: '2026-01-22' }
// designFrom '2026-10' (option B): the kit applies to the served month October, so the cases below still prove what the
// kit draws. Without `design: "kit"` it changes nothing.
const clientWith = (aeoInformedSocial: object, dsc: Record<string, unknown> = { designFrom: '2026-10' }) => ({
  id: 'client-uuid', slug: 'a-client', peecCustomerProjectId: 'or_TEST_PROJECT', dashSocialConfig: { brandId: 1, ...dsc, aeoInformedSocial },
})
const OCT = 'custom:2026-10-01,2026-10-31'
const props = (o: Partial<Parameters<typeof AeoInformedSection>[0]> = {}) => ({ clientSlug: 'a-client', servedRange: OCT, aeo: 'month' as const, aeoMin: 2, role: 'INTERNAL_ADMIN', deadlineMs: 120_000, monthKey: '2026-10', ...o })
const draw = async (exporting: boolean, o: Partial<Parameters<typeof AeoInformedSection>[0]> = {}) => {
  const node = await AeoInformedSection(props(o))
  return render(exporting ? <ExportModeProvider>{node}</ExportModeProvider> : <>{node}</>).container
}
/** React's useId values differ per render; the markup is compared with every id as one placeholder. */
const sameIds = (html: string) => html.replace(/_r_[0-9a-z]+_/g, '<id>').replace(/aeo-fill-[\w-]+/g, 'aeo-fill-<id>')

beforeEach(() => {
  getClientBySlug.mockReset(); getAeoTabData.mockReset()
  getClientBySlug.mockResolvedValue(clientWith(SETTING))
  getAeoTabData.mockResolvedValue({ kind: 'ok', result: RESULT, locked: false })
})
afterEach(() => vi.restoreAllMocks())

const VIEWS = [
  ['staff', { role: 'INTERNAL_ADMIN' }, false],
  ['a client', { role: 'CLIENT_VIEWER' }, false],
  ['the PDF export', { role: 'CLIENT_VIEWER' }, true],
] as const

describe('without the setting, the tab is exactly as before', () => {
  describe.each(VIEWS)('for %s', (_who, view, exporting) => {
    it.each(['month', 'ytd'] as const)('on %s', async (aeo) => {
      const c = await draw(exporting, { ...view, aeo })
      expect(c.querySelectorAll('.recharts-line').length).toBeGreaterThan(0)
      expect(sameIds(c.innerHTML)).toMatchSnapshot()
    })
  })
})

describe('with design: "kit", the tab reads and plots exactly as before, on the kit', () => {
  const KIT = { ...SETTING, design: 'kit' }
  describe.each(VIEWS)('for %s', (_who, view, exporting) => {
    it.each(['month', 'ytd'] as const)('on %s', async (aeo) => {
      getClientBySlug.mockResolvedValue(clientWith(SETTING))
      const old = await draw(exporting, { ...view, aeo })
      getClientBySlug.mockResolvedValue(clientWith(KIT))
      const kitted = await draw(exporting, { ...view, aeo })
      // Deliberate: in the test world the fourth graph (Instagram citations) has three weekly points with no value, the
      // "no source" state the tab shows as an empty card; the other three graphs have values (probed 2026-11-23).
      expectSameValues(old, kitted, { allowFallback: true })
      // The same lines, point for point: each line's drawn path is identical, only the look around it changes.
      const lines = (c: HTMLElement) => [...c.querySelectorAll('.recharts-line-curve')].map((p) => p.getAttribute('d'))
      expect(lines(old).length).toBeGreaterThan(0)
      expect(lines(kitted)).toEqual(lines(old))
      // The kit really drew: its colours on the tab, kit tiles, kit graph cards, a shaded fill under every line.
      expect(kitted.querySelector(`.${kit.root}`)).not.toBeNull()
      expect(kitted.querySelectorAll(`[data-aeo-block="tiles"] .${kit.kpi}`)).toHaveLength(4)
      expect(kitted.querySelector('[data-aeo-block="tiles"] div.rounded-lg.px-6.py-5')).toBeNull()
      expect(kitted.querySelectorAll(`[data-aeo-block="graphs"] .${kit.card}`)).toHaveLength(4)
      expect(kitted.querySelector('[data-aeo-block="graphs"] div.rounded-lg.border.bg-bg-surface.p-5')).toBeNull()
      expect(kitted.querySelectorAll('.recharts-area')).toHaveLength(lines(kitted).length)
    })
  })
  it('the answers before the data (no chats, an error) are the same either way', async () => {
    for (const answer of [{ kind: 'no-chats' }, { kind: 'error', reason: 'timeout' }, { kind: 'error', reason: 'error' }]) {
      getAeoTabData.mockResolvedValue(answer)
      getClientBySlug.mockResolvedValue(clientWith(SETTING))
      const old = sameIds((await draw(false)).innerHTML)
      getClientBySlug.mockResolvedValue(clientWith(KIT))
      // The one deliberate difference (the last look fixes, L1): a kit month carries the glow's marker in every state.
      const kitted = await draw(false)
      expect(kitted.querySelectorAll(`.${kit.glowMark}`).length, JSON.stringify(answer)).toBe(1)
      kitted.querySelectorAll(`.${kit.glowMark}`).forEach((m) => m.remove())
      expect(sameIds(kitted.innerHTML), JSON.stringify(answer)).toBe(old)
    }
  })
  it('asks for exactly the same data either way, under the same lock key, so no locked month is orphaned', async () => {
    type Call = { setting: { design?: string; selector: string; fourthGraph: 'instagram' | 'tiktok' }; client: { dashSocialConfig: { aeoInformedSocial: Record<string, unknown> } }; projectId: string; window: { start: string; end: string }; asOf: string; min: number; range: 'month' | 'ytd' | 'all' }
    // The setting itself carries `design`; nothing else may differ. The lock key hashes named fields only (aeo-tab/data.ts
    // aeoLockKey), never the design or the client config, so it must come out identical.
    const strip = (c: Call) => JSON.stringify({ ...c, setting: { ...c.setting, design: undefined }, client: { ...c.client, dashSocialConfig: { ...c.client.dashSocialConfig, aeoInformedSocial: { ...c.client.dashSocialConfig.aeoInformedSocial, design: undefined } } } })
    const { aeoLockKey } = await vi.importActual<typeof import('@/lib/organic-social/aeo-tab/data')>('@/lib/organic-social/aeo-tab/data')
    const key = (c: Call) => aeoLockKey({ projectId: c.projectId, selector: c.setting.selector, window: c.window, asOf: c.asOf, min: c.min, fourthGraph: c.setting.fourthGraph, range: c.range })
    getClientBySlug.mockResolvedValue(clientWith(SETTING))
    await draw(false)
    const was = getAeoTabData.mock.calls.at(-1)![0] as Call
    getClientBySlug.mockResolvedValue(clientWith(KIT))
    await draw(false)
    const now = getAeoTabData.mock.calls.at(-1)![0] as Call
    expect(now.setting.design).toBe('kit')
    expect(strip(now)).toBe(strip(was))
    expect(key(now)).toBe(key(was))
  })
})

describe('option B: design: "kit" applies only from the client\'s designFrom (spec section 3)', () => {
  const KIT = { ...SETTING, design: 'kit' }
  // Recharts numbers its clip paths per render too (recharts259-clip, recharts271-clip): one placeholder, as sameIds does.
  const markup = (c: HTMLElement) => sameIds(c.innerHTML).replace(/recharts\d+-/g, 'recharts<id>-')
  const oldMarkup = async () => { getClientBySlug.mockResolvedValue(clientWith(SETTING, {})); return markup(await draw(false)) }
  it('a month before designFrom is drawn exactly as without the setting; the month itself takes the kit', async () => {
    const old = await oldMarkup()
    getClientBySlug.mockResolvedValue(clientWith(KIT, { designFrom: '2026-11' }))
    expect(markup(await draw(false, { monthKey: '2026-10' }))).toBe(old)
    expect((await draw(false, { monthKey: '2026-11' })).querySelector(`.${kit.root}`)).not.toBeNull()
  })
  it('a malformed designFrom, or none, or no served month: the old look', async () => {
    const old = await oldMarkup()
    for (const [dsc, monthKey] of [[{ designFrom: '2026-13' }, '2026-10'], [{}, '2026-10'], [{ designFrom: '2026-01' }, null]] as const) {
      getClientBySlug.mockResolvedValue(clientWith(KIT, dsc))
      expect(markup(await draw(false, { monthKey })), JSON.stringify([dsc, monthKey])).toBe(old)
    }
  })
  it.each(DESIGN_FROM_ROWS)('$name', async (row) => {
    getClientBySlug.mockResolvedValue({ ...clientWith(KIT), dashSocialConfig: rowConfig(row, { aeoInformedSocial: KIT }) })
    const c = await draw(false, { monthKey: row.month })
    expect(c.querySelector('[data-aeo-block="graphs"]')).not.toBeNull()
    expect(c.querySelector(`.${kit.root}`) !== null).toBe(row.kit)
  })
})

// L2: the AEO tab's kit stack takes the artifact's 40px section gap; the old look keeps space-y-8 (option B test above).
describe('the last look fixes on the AEO tab', () => {
  it('a kit month stacks its blocks 40px apart', async () => {
    getClientBySlug.mockResolvedValue(clientWith({ ...SETTING, design: 'kit' }))
    const top = (await draw(false)).firstElementChild!
    expect(top.classList.contains(kit.root)).toBe(true)
    expect(top.classList.contains('space-y-10')).toBe(true)
    expect(top.classList.contains('space-y-8')).toBe(false)
  })
})

describe('the glow marker on the AEO tab (L1)', () => {
  it('a kit month carries it, in every state; a month before designFrom never does', async () => {
    getClientBySlug.mockResolvedValue(clientWith({ ...SETTING, design: 'kit' }))
    expect((await draw(false)).querySelectorAll(`.${kit.glowMark}`).length).toBe(1)
    getAeoTabData.mockResolvedValue({ kind: 'no-chats' })
    expect((await draw(false)).querySelectorAll(`.${kit.glowMark}`).length).toBe(1)
    getAeoTabData.mockResolvedValue({ kind: 'error', reason: 'error' })
    expect((await draw(false)).querySelectorAll(`.${kit.glowMark}`).length).toBe(1)
    getClientBySlug.mockResolvedValue(clientWith({ ...SETTING, design: 'kit' }, { designFrom: '2026-11' }))
    getAeoTabData.mockResolvedValue({ kind: 'ok', result: RESULT, locked: false })
    expect((await draw(false)).querySelectorAll(`.${kit.glowMark}`).length).toBe(0)
  })
})
