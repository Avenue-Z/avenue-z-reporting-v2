import { afterEach, beforeEach, expect, test, vi } from 'vitest'

const { getClientBySlug, readYtdTab } = vi.hoisted(() => ({ getClientBySlug: vi.fn(), readYtdTab: vi.fn() }))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug }))
vi.mock('./ytd-sheet', async () => ({ ...(await vi.importActual<typeof import('./ytd-sheet')>('./ytd-sheet')), readYtdTab }))

import { loadTileSheets } from './tile-sheets'
import { YtdSheetReadError } from './ytd-sheet'

// Made-up sheet ids, tab names and numbers only.
const ID = 'TESTSHEETID_abcdefghij0123'
const ID25 = 'TESTSHEETID_abcdefghij2025'
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const GRID = [['CLIENT: Test Co'], ['FOLLOWER GROWTH'], ['', 'Instagram'], ...MONTHS.map((m, i) => [m, String(100 + i)]),
  [], ['VIEWS'], ['', 'Instagram'], ...MONTHS.map((m, i) => [m, String(10 + i)])]
const client = (dsc: Record<string, unknown>) => ({ id: 'c1', dashSocialConfig: { brandId: 1, ...dsc } })
const LOCKED = { reportingMonths: { firstMonth: '2026-08' } }
const SEPT = 'custom:2026-09-01,2026-09-30'
const logs = () => [...vi.mocked(console.warn).mock.calls, ...vi.mocked(console.error).mock.calls].map((c) => c.join(' '))

beforeEach(() => {
  vi.restoreAllMocks()
  getClientBySlug.mockReset(); readYtdTab.mockReset()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-15T12:00:00Z'))
  vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.useRealTimers())

test('a rolling range or the live month reads nothing, not even the client row', async () => {
  expect(await loadTileSheets('c', 'last_30_days')).toBeNull()
  expect(await loadTileSheets('c', 'custom:2026-10-01,2026-10-14')).toBeNull()
  expect(getClientBySlug).not.toHaveBeenCalled()
})

test('a client not on locked months (Renaissance) never reads the sheet', async () => {
  getClientBySlug.mockResolvedValue(client({ ytdSheets: { 2026: { sheetId: ID, tab: 'Test Co' } } }))
  expect(await loadTileSheets('c', SEPT)).toBeNull()
  expect(readYtdTab).not.toHaveBeenCalled()
})

test('no sheet for the year: null, no read, no log', async () => {
  getClientBySlug.mockResolvedValue(client(LOCKED))
  expect(await loadTileSheets('c', SEPT)).toBeNull()
  expect(readYtdTab).not.toHaveBeenCalled()
  expect(logs()).toEqual([])
})

test('September with a sheet: one read; the comparison month is August in the same tab', async () => {
  getClientBySlug.mockResolvedValue(client({ ...LOCKED, ytdSheets: { 2026: { sheetId: ID, tab: 'Test Co' } } }))
  readYtdTab.mockResolvedValue(GRID)
  const plan = await loadTileSheets('c', SEPT)
  expect(readYtdTab.mock.calls).toEqual([[ID, 'Test Co']])
  expect(plan?.key).toBe('2026-09')
  expect(plan?.compareKey).toBe('2026-08')
  expect(plan?.sheets.prior).toBeNull()
  expect(plan?.sheets.current.followers.INSTAGRAM?.[8]).toEqual({ kind: 'number', value: 108 })
})

test('an invalid entry: null and one warning with the slug and year, never the entry', async () => {
  getClientBySlug.mockResolvedValue(client({ ...LOCKED, ytdSheets: { 2026: { sheetId: 'bad', tab: 'Test Co' } } }))
  expect(await loadTileSheets('c', SEPT)).toBeNull()
  expect(logs()).toEqual(['[organic-social] ytd sheet config invalid (tiles) slug=c year=2026'])
})

test('a read failure or a layout error: null, logged with slug, year and status, never the sheet id or tab', async () => {
  getClientBySlug.mockResolvedValue(client({ ...LOCKED, ytdSheets: { 2026: { sheetId: ID, tab: 'Test Co' } } }))
  readYtdTab.mockRejectedValueOnce(new YtdSheetReadError('429'))
  expect(await loadTileSheets('c', SEPT)).toBeNull()
  readYtdTab.mockResolvedValueOnce(GRID.map((r) => (r[0] === 'September' ? ['Sept', '1'] : r)))
  expect(await loadTileSheets('c', SEPT)).toBeNull()
  readYtdTab.mockRejectedValueOnce(new Error('boom'))
  expect(await loadTileSheets('c', SEPT)).toBeNull()
  expect(logs()).toEqual([
    '[organic-social] ytd sheet read failed (tiles) slug=c year=2026 status=429',
    '[organic-social] ytd sheet layout not found (tiles) slug=c year=2026 missing=followers september',
    '[organic-social] ytd sheet read failed (tiles) slug=c year=2026 status=error',
  ])
  expect(logs().join('\n')).not.toContain(ID)
  expect(logs().join('\n')).not.toContain('Test Co')
})

test('January: the prior year\'s tab is read for the arrow; its failure is logged with its year and the current tab still applies', async () => {
  vi.setSystemTime(new Date('2026-02-10T12:00:00Z'))
  getClientBySlug.mockResolvedValue(client({ ...LOCKED, ytdSheets: { 2026: { sheetId: ID, tab: 'Test Co' }, 2025: { sheetId: ID25, tab: 'Test Co 25' } } }))
  readYtdTab.mockResolvedValue(GRID)
  let plan = await loadTileSheets('c', 'custom:2026-01-01,2026-01-31')
  expect(readYtdTab.mock.calls).toEqual([[ID, 'Test Co'], [ID25, 'Test Co 25']])
  expect(plan?.compareKey).toBe('2025-12')
  expect(plan?.sheets.prior).not.toBeNull()
  readYtdTab.mockReset()
  readYtdTab.mockImplementation(async (id: string) => { if (id === ID25) throw new YtdSheetReadError('timeout'); return GRID })
  plan = await loadTileSheets('c', 'custom:2026-01-01,2026-01-31')
  expect(plan?.sheets.prior).toBeNull()
  expect(plan?.sheets.current).toBeTruthy()
  expect(logs()).toContain('[organic-social] ytd sheet read failed (tiles) slug=c year=2025 status=timeout')
})

test('previous-year compares with the same month a year back, from that year\'s tab', async () => {
  getClientBySlug.mockResolvedValue(client({ reportingMonths: { firstMonth: '2026-08', comparison: 'previous-year' }, ytdSheets: { 2026: { sheetId: ID, tab: 'Test Co' } } }))
  readYtdTab.mockResolvedValue(GRID)
  const plan = await loadTileSheets('c', SEPT)
  expect(plan?.compareKey).toBe('2025-09')
  expect(readYtdTab).toHaveBeenCalledTimes(1) // no 2025 entry: no second read, no log
  expect(plan?.sheets.prior).toBeNull()
  expect(logs()).toEqual([])
})

test('a failed client read is null, not a thrown error', async () => {
  getClientBySlug.mockRejectedValue(new Error('db down'))
  await expect(loadTileSheets('c', SEPT)).resolves.toBeNull()
})
