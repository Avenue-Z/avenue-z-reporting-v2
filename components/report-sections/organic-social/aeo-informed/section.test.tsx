import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { AeoTabResult } from '@/lib/organic-social/aeo-tab/load'

const { getClientBySlug, getAeoTabData, clock } = vi.hoisted(() => ({
  getClientBySlug: vi.fn(), getAeoTabData: vi.fn(),
  clock: { value: { today: '2026-11-12', lastCompleteUtcDay: '2026-11-11', liveDayInProgress: false } },
}))
vi.mock('@/lib/db/queries', async (orig) => ({ ...(await orig<object>()), getClientBySlug }))
vi.mock('@/lib/organic-social/aeo-tab/data', () => ({ getAeoTabData }))
vi.mock('@/lib/organic-social/locked-range', async (orig) => ({ ...(await orig<object>()), requestClock: () => clock.value }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/x', useSearchParams: () => new URLSearchParams() }))

import { world, input } from '@/lib/organic-social/aeo-informed/test-world'
import { toTabResult } from '@/lib/organic-social/aeo-tab/load'
import { AeoInformedSection } from './section'
import { NO_DATA_FOR_WINDOW, TIMEOUT_TEXT } from './copy'

let RESULT: AeoTabResult
beforeAll(async () => {
  const actual = await vi.importActual<typeof import('@/lib/organic-social/aeo-informed')>('@/lib/organic-social/aeo-informed')
  RESULT = toTabResult(await actual.getAeoInformedSocial(input(world().reader)))
})

const CLIENT = {
  id: 'client-uuid', slug: 'a-client', peecCustomerProjectId: 'or_TEST_PROJECT',
  dashSocialConfig: { brandId: 1, aeoInformedSocial: { enabled: true, allTimeFrom: '2026-01-22' } },
}
const OCT = 'custom:2026-10-01,2026-10-31'
const props = (o: Partial<Parameters<typeof AeoInformedSection>[0]> = {}) => ({ clientSlug: 'a-client', servedRange: OCT, aeo: 'month' as const, aeoMin: 2, role: 'INTERNAL_ADMIN', deadlineMs: 120_000, ...o })
const show = async (o: Partial<Parameters<typeof AeoInformedSection>[0]> = {}) => render(<>{await AeoInformedSection(props(o))}</>)

beforeEach(() => {
  getClientBySlug.mockReset(); getAeoTabData.mockReset()
  getClientBySlug.mockResolvedValue(CLIENT)
  getAeoTabData.mockResolvedValue({ kind: 'ok', result: RESULT, locked: false })
  clock.value = { today: '2026-11-12', lastCompleteUtcDay: '2026-11-11', liveDayInProgress: false }
})
afterEach(() => vi.restoreAllMocks())

describe('the read', () => {
  it('asks for the served month\'s window, with the min, the range, the deadline and the New York date for the lock', async () => {
    await show()
    expect(getAeoTabData).toHaveBeenCalledWith({
      client: { id: 'client-uuid', slug: 'a-client', dashSocialConfig: CLIENT.dashSocialConfig }, projectId: 'or_TEST_PROJECT',
      setting: { allTimeFrom: '2026-01-22', selector: 'Organic Social', fourthGraph: 'instagram' },
      window: { start: '2026-10-01', end: '2026-10-31' }, asOf: '2026-10-31', min: 2, range: 'month', deadlineMs: 120_000, today: '2026-11-12',
    })
  })
  it('YTD and All time ask for their own windows', async () => {
    await show({ aeo: 'ytd' })
    await show({ aeo: 'all', aeoMin: 4 })
    expect(getAeoTabData.mock.calls.map((c) => [c[0].window, c[0].range, c[0].min])).toEqual([
      [{ start: '2026-01-01', end: '2026-10-31' }, 'ytd', 2], [{ start: '2026-01-22', end: '2026-10-31' }, 'all', 4],
    ])
  })
})

describe('what it shows', () => {
  it('in order: the controls, the graphs, the tiles, the own table, the competitor table, URL Gaps', async () => {
    const { container } = await show()
    expect([...container.querySelectorAll('[data-aeo-block]')].map((e) => e.getAttribute('data-aeo-block'))).toEqual(['controls', 'graphs', 'tiles', 'own', 'competitor', 'gaps'])
    expect(screen.getByRole('heading', { name: 'Example Only Socials' })).toBeTruthy()
    expect(screen.getByText('Oct 1 to Oct 31, 2026, compared with the 31 days before')).toBeTruthy()
  })
  it('the graphs, tiles and each table are unbreakable blocks in the PDF export', async () => {
    const { container } = await show()
    for (const b of ['graphs', 'tiles', 'own', 'competitor', 'gaps']) expect(container.querySelector(`[data-aeo-block="${b}"]`)?.hasAttribute('data-export-block'), b).toBe(true)
  })
  it('the own table holds exactly the own rows, with no switch to all tagged URLs', async () => {
    const { container } = await show()
    expect(container.querySelectorAll('[data-aeo-block="own"] [data-testid="aeo-row"]')).toHaveLength(RESULT.socialsOwn.length)
    expect(container.querySelectorAll('[data-aeo-block="competitor"] [data-testid="aeo-row"]')).toHaveLength(RESULT.socialsCompetitor.length)
    expect(screen.queryByText(/All tagged/i)).toBeNull()
  })
  it('Month shows changes; YTD and All time show none, on tiles or tables', async () => {
    const month = await show()
    expect(month.container.textContent).toContain('vs previous 31 days')
    month.unmount()
    for (const aeo of ['ytd', 'all'] as const) {
      const v = await show({ aeo })
      expect(v.container.textContent).not.toContain('vs previous')
      expect(v.container.querySelectorAll('[data-testid="aeo-change"]')).toHaveLength(0)
      v.unmount()
    }
  })
  it('a locked and a live result render the same way, with no extra line', async () => {
    // React's generated ids (useId, for the tooltips) differ per render, so they are blanked before comparing
    const html = (c: HTMLElement) => c.innerHTML.replace(/_r_[0-9a-z]+_|«[^»]*»|:r[0-9a-z]+:/g, 'ID')
    const live = html((await show()).container)
    getAeoTabData.mockResolvedValue({ kind: 'ok', result: RESULT, locked: true })
    const locked = html((await show()).container)
    expect(locked).toBe(live)
  })
})

describe('when there is nothing to show', () => {
  it('the first day of a month: the day-1 line, and no read', async () => {
    clock.value = { today: '2026-11-01', lastCompleteUtcDay: '2026-10-31', liveDayInProgress: false }
    await show({ servedRange: 'custom:2026-11-01,2026-11-30' })
    expect(screen.getByText('No data for November 2026 yet.')).toBeTruthy()
    expect(getAeoTabData).not.toHaveBeenCalled()
  })
  it('All time for a month before the client\'s first data day: no data for this window, and no read', async () => {
    await show({ aeo: 'all', servedRange: 'custom:2025-12-01,2025-12-31' })
    expect(screen.getByText(NO_DATA_FOR_WINDOW)).toBeTruthy()
    expect(getAeoTabData).not.toHaveBeenCalled()
  })
  it('a window with no chats: no data for this window', async () => {
    getAeoTabData.mockResolvedValue({ kind: 'no-chats' })
    await show()
    expect(screen.getByText(NO_DATA_FOR_WINDOW)).toBeTruthy()
  })
  it('a timeout shows the timeout line; any other failure the section\'s error card', async () => {
    getAeoTabData.mockResolvedValue({ kind: 'error', reason: 'timeout' })
    const t = await show()
    expect(screen.getByText(TIMEOUT_TEXT)).toBeTruthy()
    t.unmount()
    getAeoTabData.mockResolvedValue({ kind: 'error', reason: 'error' })
    await show()
    expect(screen.getByText("Couldn't load this section.")).toBeTruthy()
  })
  it('a served range that cannot be read is the error card and one log line, and no read', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await show({ servedRange: 'custom:nonsense,more' })
    expect(screen.getByText("Couldn't load this section.")).toBeTruthy()
    expect(getAeoTabData).not.toHaveBeenCalled()
    expect(String(err.mock.calls[0][0])).toBe('[aeo-informed] window failed slug=a-client range=month error=RangeError')
  })
  it('a client without the setting, or without a Peec project, renders nothing and reads nothing', async () => {
    getClientBySlug.mockResolvedValue({ ...CLIENT, dashSocialConfig: { brandId: 1 } })
    expect(await AeoInformedSection(props())).toBeNull()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    getClientBySlug.mockResolvedValue({ ...CLIENT, peecCustomerProjectId: null })
    expect(await AeoInformedSection(props())).toBeNull()
    expect(getAeoTabData).not.toHaveBeenCalled()
  })
  it('a malformed setting renders nothing and logs the reason', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    getClientBySlug.mockResolvedValue({ ...CLIENT, dashSocialConfig: { brandId: 1, aeoInformedSocial: { enabled: true, allTimeFrom: 'soon' } } })
    expect(await AeoInformedSection(props())).toBeNull()
    expect(String(warn.mock.calls[0][0])).toMatch(/^\[aeo-informed\] .*slug=a-client: allTimeFrom/)
  })
  it('a client that is not found renders nothing', async () => {
    getClientBySlug.mockResolvedValue(null)
    expect(await AeoInformedSection(props())).toBeNull()
  })
})
