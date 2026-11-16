import { beforeEach, expect, test, vi } from 'vitest'

const { getAccessToken, cachedCalls } = vi.hoisted(() => ({ getAccessToken: vi.fn(async () => 'tok'), cachedCalls: [] as unknown[][] }))
vi.mock('google-auth-library', () => ({ GoogleAuth: vi.fn(function () { return { getAccessToken } }) }))
vi.mock('@/lib/cache', () => ({ cached: (...a: unknown[]) => { cachedCalls.push(a); return a[2] } }))

import { GoogleAuth } from 'google-auth-library'
import { classifyCell, parseYtdGrid, rangeFor, readMonthTabImpl, readSheetTabTitlesImpl, readYtdTab, readYtdTabImpl, ytdSheetFor, YtdSheetLayoutError, YtdSheetReadError } from './ytd-sheet'

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

// PR #306 review: the tiles and the YTD block can start the same read in one render; while it is in flight it is shared.
// (cached() is a passthrough in this file, so these calls reach the shared read directly.)
test('two reads of one tab in flight together make one request, and both get the grid', async () => {
  let release!: () => void
  const gate = new Promise<void>((r) => { release = r })
  const fetchMock = vi.fn(async () => { await gate; return new Response(JSON.stringify({ values: [['a']] }), { status: 200 }) })
  vi.stubGlobal('fetch', fetchMock)
  const a = readYtdTab(ID, 'Test Co')
  const b = readYtdTab(ID, 'Test Co')
  release()
  expect(await Promise.all([a, b])).toEqual([[['a']], [['a']]])
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

test('two different tabs are two requests; a read after the first has settled is a fresh request', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ values: [['a']] }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  await Promise.all([readYtdTab(ID, 'One'), readYtdTab(ID, 'Two')])
  expect(fetchMock).toHaveBeenCalledTimes(2)
  await readYtdTab(ID, 'One')
  expect(fetchMock).toHaveBeenCalledTimes(3)
})

test('a shared failure reaches both callers, is not kept, and leaves no unhandled rejection', async () => {
  const seen: unknown[] = []
  const onUnhandled = (e: unknown) => { seen.push(e) }
  process.on('unhandledRejection', onUnhandled)
  try {
    const fetchMock = vi.fn(async () => new Response('no', { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)
    const [a, b] = await Promise.all([readYtdTab(ID, 'T').catch((e) => e), readYtdTab(ID, 'T').catch((e) => e)])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((a as YtdSheetReadError).status).toBe('500')
    expect(b).toBe(a)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ values: [['ok']] }), { status: 200 })))
    expect(await readYtdTab(ID, 'T')).toEqual([['ok']])
    await new Promise((r) => setTimeout(r, 10))
    expect(seen).toEqual([])
  } finally {
    process.off('unhandledRejection', onUnhandled)
  }
})

// KPI month tabs (spec 2026-11-11-kpi-tab-by-month-design.md): the tab titles, read like a tab.
test('the tab titles: one readonly GET of the titles only; titles come back raw; non-200 throws the status without the id', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ sheets: [{ properties: { title: 'September 2026' } }, { properties: { title: ' October 2026 ' } }] }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  expect(await readSheetTabTitlesImpl(ID)).toEqual(['September 2026', ' October 2026 '])
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toBe(`https://sheets.googleapis.com/v4/spreadsheets/${ID}?fields=sheets.properties(title)`)
  expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  expect(init.signal).toBeInstanceOf(AbortSignal)
  vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 403 })))
  const e = await readSheetTabTitlesImpl(ID).catch((x) => x)
  expect(e).toBeInstanceOf(YtdSheetReadError)
  expect(e.status).toBe('403')
  expect(String(e.message)).not.toContain(ID)
})

test.each([
  ['no sheets array', {}],
  ['sheets not an array', { sheets: 'x' }],
  ['a sheet without properties', { sheets: [{}] }],
  ['a title that is not a string', { sheets: [{ properties: { title: 7 } }] }],
])('the tab titles: %s is malformed', async (_n, body) => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })))
  expect((await readSheetTabTitlesImpl(ID).catch((x) => x)).status).toBe('malformed')
})

test('the tab titles: the 10 second limit covers the token and the body', async () => {
  vi.useFakeTimers()
  try {
    const never = () => new Promise<never>(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: never }) as unknown as Response))
    const body = readSheetTabTitlesImpl(ID).catch((e) => e)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(((await Promise.race([body, Promise.resolve('pending')])) as YtdSheetReadError).status).toBe('timeout')
    getAccessToken.mockImplementationOnce(never as never)
    const tok = readSheetTabTitlesImpl(ID).catch((e) => e)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(((await Promise.race([tok, Promise.resolve('pending')])) as YtdSheetReadError).status).toBe('timeout')
  } finally {
    vi.useRealTimers()
  }
})

// Paul, #445 review (#447 and the staging note): a month tab is read through its own wrapper. A 400 there means the tab
// was renamed or deleted after the titles were listed, so it is an ANSWER ('gone'), never a rejection the cache wrapper
// would record as an outage; any other failure still rejects. Cached 5 minutes, so a relabelled tab shows soon.
test('the month tab read: the grid comes back; a 400 is the answer "gone"; any other failure still throws its status', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ values: [['a']] }), { status: 200 })))
  expect(await readMonthTabImpl(ID, 'October 2026')).toEqual([['a']])
  vi.stubGlobal('fetch', vi.fn(async () => new Response('Unable to parse range', { status: 400 })))
  expect(await readMonthTabImpl(ID, 'October 2026')).toBe('gone')
  vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 403 })))
  const e = await readMonthTabImpl(ID, 'October 2026').catch((x) => x)
  expect(e).toBeInstanceOf(YtdSheetReadError)
  expect(e.status).toBe('403')
})

test('cache settings: month tabs and tab titles 5 minutes, the YTD tab reader keeps its hour; all health-critical', () => {
  const opts = (fn: string) => cachedCalls.find((c) => c[1] === fn)?.[3]
  expect(opts('kpiMonthTab')).toEqual({ version: '1', ttlSeconds: 300, negativeTtlSeconds: 30, healthCritical: true })
  expect(opts('sheetTabTitles')).toEqual({ version: '1', ttlSeconds: 300, negativeTtlSeconds: 30, healthCritical: true })
  expect(opts('ytdTab')).toEqual({ version: '1', ttlSeconds: 3600, negativeTtlSeconds: 30, healthCritical: true })
  expect(cachedCalls.find((c) => c[1] === 'kpiMonthTab')?.[0]).toBe('google-sheets')
})
