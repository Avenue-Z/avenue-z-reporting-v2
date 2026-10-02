import { beforeEach, expect, test, vi } from 'vitest'

const { getAccessToken } = vi.hoisted(() => ({ getAccessToken: vi.fn(async () => 'tok') }))
vi.mock('google-auth-library', () => ({ GoogleAuth: vi.fn(function () { return { getAccessToken } }) }))
vi.mock('@/lib/cache', () => ({ cached: (_v: string, _f: string, impl: unknown) => impl }))

import { GoogleAuth } from 'google-auth-library'
import { classifyCell, parseYtdGrid, rangeFor, readYtdTabImpl, ytdSheetFor, YtdSheetLayoutError, YtdSheetReadError } from './ytd-sheet'

// Made-up sheet id and numbers only.
const ID = 'TESTSHEETID_abcdefghij0123'
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July ', 'August', 'September', 'October', 'November', 'December']
function grid(over: { fHeader?: string[]; vHeader?: string[]; row?: (block: 'f' | 'v', i: number) => unknown[] } = {}): unknown[][] {
  const f = over.fHeader ?? ['', 'Instagram', 'Facebook', 'X']
  const v = over.vHeader ?? ['', 'Instagram', 'Facebook', 'X']
  const row = over.row ?? ((b, i) => [MONTHS[i], b === 'f' ? String(1000 + i) : '1,234', '', 'N/A'])
  return [
    ['CLIENT: Test Co'], ['FOLLOWER GROWTH'], f, ...MONTHS.map((_, i) => row('f', i)),
    [], ['VIEWS'], v, ...MONTHS.map((_, i) => row('v', i)),
  ]
}

beforeEach(() => {
  getAccessToken.mockClear(); vi.mocked(GoogleAuth).mockClear()
  process.env.GOOGLE_SERVICE_ACCOUNT_KEY = Buffer.from(JSON.stringify({ client_email: 'x@y.z', private_key: 'k' })).toString('base64')
  vi.unstubAllGlobals()
})

test('a cell is a number, N/A, blank or invalid', () => {
  expect(classifyCell('1,234')).toEqual({ kind: 'number', value: 1234 })
  expect(classifyCell('12.5')).toEqual({ kind: 'number', value: 12.5 })
  expect(classifyCell(4321)).toEqual({ kind: 'number', value: 4321 })
  expect(classifyCell(' n/a ')).toEqual({ kind: 'na' })
  for (const b of ['', '   ', undefined, null]) expect(classifyCell(b)).toEqual({ kind: 'blank' })
  for (const bad of ['12k', '-5', '1,23', '1234,567', 'TBD', '5%']) expect(classifyCell(bad)).toEqual({ kind: 'invalid' })
})

test('the layout is found by its titles, "July " included, with extra columns ignored and X read as TWITTER', () => {
  const t = parseYtdGrid(grid({ fHeader: ['', 'Instagram', 'Pinterest', 'X'], vHeader: ['', 'Instagram', 'Pinterest', 'Twitter'] }))
  expect(Object.keys(t.followers).sort()).toEqual(['INSTAGRAM', 'TWITTER'])
  expect(Object.keys(t.views).sort()).toEqual(['INSTAGRAM', 'TWITTER'])
  expect(t.followers.INSTAGRAM![6]).toEqual({ kind: 'number', value: 1006 })
  expect(t.views.INSTAGRAM![0]).toEqual({ kind: 'number', value: 1234 })
  expect(t.followers.TWITTER![0]).toEqual({ kind: 'na' })
})

test('a month row shorter than a column reads as blank there; the first of two same-name columns wins', () => {
  const t = parseYtdGrid(grid({ fHeader: ['', 'Instagram', 'Instagram'], row: (b, i) => (i === 8 ? [MONTHS[i]] : [MONTHS[i], String(i), '999']) }))
  expect(t.followers.INSTAGRAM![8]).toEqual({ kind: 'blank' })
  expect(t.followers.INSTAGRAM![0]).toEqual({ kind: 'number', value: 0 })
})

test('a missing title, header or month row is a layout error naming what is missing', () => {
  const g = grid(); g[1] = ['FOLLOWERS']
  expect(() => parseYtdGrid(g)).toThrow(new YtdSheetLayoutError('followers title'))
  expect(() => parseYtdGrid(grid({ vHeader: ['', 'Pinterest'] }))).toThrow(new YtdSheetLayoutError('views header'))
  const sept = grid({ row: (b, i) => [i === 8 ? 'Sept' : MONTHS[i], '1'] })
  expect(() => parseYtdGrid(sept)).toThrow(new YtdSheetLayoutError('followers september'))
  const short = grid().slice(0, 10)
  expect(() => parseYtdGrid(short)).toThrow(YtdSheetLayoutError)
})

test('ytdSheetFor: the entry for the year, none, or invalid', () => {
  expect(ytdSheetFor({ 2026: { sheetId: ID, tab: ' Test Co ' } }, '2026')).toEqual({ kind: 'ok', entry: { sheetId: ID, tab: 'Test Co' } })
  expect(ytdSheetFor(undefined, '2026')).toEqual({ kind: 'none' })
  expect(ytdSheetFor({ 2026: { sheetId: ID, tab: 'T' } }, '2025')).toEqual({ kind: 'none' })
  for (const bad of ['x', [], null, { 2026: 'x' }, { 2026: { sheetId: 'short', tab: 'T' } }, { 2026: { sheetId: ID, tab: '  ' } }, { 2026: { sheetId: ID, tab: 'x'.repeat(101) } }, { 2026: { sheetId: ID } }])
    expect(ytdSheetFor(bad, '2026')).toEqual({ kind: 'invalid' })
})

test("the range quotes the tab, doubles an apostrophe and is URL-encoded", () => {
  expect(rangeFor("Jo's Tab")).toBe(encodeURIComponent("'Jo''s Tab'!A1:Z40"))
})

test('one readonly GET; the grid comes back; non-200 and timeouts throw without the sheet id', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ values: [['a']] }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  expect(await readYtdTabImpl(ID, 'Test Co')).toEqual([['a']])
  expect(fetchMock).toHaveBeenCalledTimes(1)
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toBe(`https://sheets.googleapis.com/v4/spreadsheets/${ID}/values/${rangeFor('Test Co')}`)
  expect(init.method ?? 'GET').toBe('GET')
  expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  expect(init.signal).toBeInstanceOf(AbortSignal)
  expect(vi.mocked(GoogleAuth).mock.calls[0][0]).toMatchObject({ scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] })

  vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 429 })))
  const e = await readYtdTabImpl(ID, 'Test Co').catch((x) => x)
  expect(e).toBeInstanceOf(YtdSheetReadError)
  expect(e.status).toBe('429')
  expect(String(e.message)).not.toContain(ID)
  expect(String(e.message)).not.toContain('Test Co')
})

test('an answer with no values is an empty grid; a malformed answer throws', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })))
  expect(await readYtdTabImpl(ID, 'T')).toEqual([])
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ values: 'x' }), { status: 200 })))
  expect((await readYtdTabImpl(ID, 'T').catch((x) => x)).status).toBe('malformed')
})

test('the 10 second limit covers the token and the body, not only the response headers', async () => {
  vi.useFakeTimers()
  try {
    const never = () => new Promise<never>(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: never }) as unknown as Response))
    const body = readYtdTabImpl(ID, 'T').catch((e) => e)
    await vi.advanceTimersByTimeAsync(10_000)
    const e1 = await Promise.race([body, Promise.resolve('still pending')])
    expect(e1).toBeInstanceOf(YtdSheetReadError)
    expect((e1 as YtdSheetReadError).status).toBe('timeout')

    getAccessToken.mockImplementationOnce(never as never)
    const tok = readYtdTabImpl(ID, 'T').catch((e) => e)
    await vi.advanceTimersByTimeAsync(10_000)
    const e2 = await Promise.race([tok, Promise.resolve('still pending')])
    expect((e2 as YtdSheetReadError).status).toBe('timeout')
  } finally {
    vi.useRealTimers()
  }
})
