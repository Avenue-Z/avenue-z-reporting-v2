# YTD Review from the team's YTD sheet: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> This project runs Native (superpowers:executing-plans): no implementer subagents (standing rule).

**Goal:** `ytd-review@2` draws the two YTD graphs from the team's YTD sheet, with our Data block's value for any month
the sheet has not filled in yet; version 1 and everything else unchanged.

**Architecture:** a reader module (`lib/organic-social/ytd-sheet.ts`: config, one cached read-only GET per tab, a
strict parse), pure month and series functions added to `lib/organic-social/ytd.ts`, and a new part version
(`parts/ytd-review-sheet.tsx`) registered beside version 1. Dash is asked only for blank months on or after
`firstMonth`, with version 1's exact requests.

**Tech Stack:** Next.js 16 RSC, TypeScript strict, `google-auth-library`, `lib/cache.ts` `cached()`, Vitest + Testing
Library.

**Spec:** `docs/superpowers/specs/2026-10-01-ytd-from-sheet-design.md` (REVIEWED). Supersedes
`docs/superpowers/plans/2026-09-29-ytd-from-january.md`.

## Global Constraints
- No sheet id, tab name or client figure in the repo, a test, a log line or a thrown message. Tests use made-up ids
  and numbers.
- Version 1 (`parts/ytd-review.tsx`, `lib/organic-social/ytd.ts` existing exports) is not edited.
- Every Dash request a month on or after `firstMonth` sends is byte-identical to version 1's (`ytdMonths` entries
  unchanged).
- Months before `firstMonth` never call Dash.
- Renaissance: never pinned, never configured; nothing on its path changes.
- No em or en dashes in any text.

## Review Focus
1. Sheets returns a number cell as a JS number rather than a string: it must still parse as `number` (Task 1 test).
2. A month label abbreviated ("Sept"): the layout is not found, the block shows its error card and the log names the
   missing row (Task 1 and Task 3 tests).
3. Google answers 429: error card, log `status=429`, and the 30 second negative cache keeps it from re-asking on every
   render (Task 1 test for the status; the memo is `cached()`'s own, already tested in `lib/cache.negative.test.ts`).
4. One graph has one point and the other two: bars for the first, a line for the second (Task 3 test).
5. A tab title containing an apostrophe: the range is quoted and encoded (Task 1 test).

## Rulings recorded before Task 1
- `ytdSheetFor` returns `{ kind: 'ok'; entry } | { kind: 'none' } | { kind: 'invalid' }` rather than entry-or-null, so
  the part can warn only when something is present but unusable (spec 4.4 and round 2 minor). Cost if wrong: none; a
  null-or-entry wrapper is one line.
- `mapWithConcurrency` keeps starting the remaining Dash calls after one fails (round 1 minor 8). Accepted: at most
  the months from `firstMonth` to the month on screen whose cell is blank, so a handful at most; all or nothing as
  version 1.
- `healthCritical: true` stated explicitly (round 1 minor 6): a sheet outage means the block cannot draw, like a Dash
  failure for version 1.

---

### Task 1: The reader (`lib/organic-social/ytd-sheet.ts`)

**Files:**
- Create: `lib/organic-social/ytd-sheet.ts`
- Create: `lib/organic-social/ytd-sheet.test.ts` (included by `vitest.config.ts` glob `lib/organic-social/**/*.test.{ts,tsx}`)
- Modify: `lib/db/schema.ts` (`DashSocialConfig`, add `ytdSheets?: unknown`)

**Interfaces:**
- Produces: `YtdCell`, `YtdTab`, `YtdSheetEntry`, `YtdSheetLayoutError` (field `missing: string`), `YtdSheetReadError`
  (field `status: string`), `classifyCell(raw: unknown): YtdCell`, `parseYtdGrid(grid: unknown[][]): YtdTab`,
  `ytdSheetFor(value: unknown, year: string): { kind: 'ok'; entry: YtdSheetEntry } | { kind: 'none' } | { kind: 'invalid' }`,
  `rangeFor(tab: string): string`, `readYtdTabImpl(sheetId: string, tab: string): Promise<unknown[][]>`,
  `readYtdTab` (the same, wrapped in `cached`).

- [ ] **Step 1: Write the failing tests** (`lib/organic-social/ytd-sheet.test.ts`)

```ts
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
```

- [ ] **Step 2: Run, watch it fail**

Run: `npx vitest run lib/organic-social/ytd-sheet.test.ts`
Expected: FAIL, cannot resolve `./ytd-sheet`.

- [ ] **Step 3: Implement** (`lib/organic-social/ytd-sheet.ts`)

```ts
// The team's YTD sheet (spec docs/superpowers/specs/2026-10-01-ytd-from-sheet-design.md): the per-year config, one
// read-only read per tab, and a strict parse. The sheet id, the tab and every value stay out of log lines and thrown
// messages: cached() memoizes and logs error messages (lib/cache.ts).
import { GoogleAuth } from 'google-auth-library'
import { cached } from '@/lib/cache'
import type { DashChannel } from './metrics'

export type YtdCell = { kind: 'number'; value: number } | { kind: 'na' | 'blank' | 'invalid' }
export type YtdTab = { followers: Partial<Record<DashChannel, YtdCell[]>>; views: Partial<Record<DashChannel, YtdCell[]>> }
export type YtdSheetEntry = { sheetId: string; tab: string }

export class YtdSheetLayoutError extends Error {
  constructor(readonly missing: string) { super(`ytd sheet layout not found: ${missing}`); this.name = 'YtdSheetLayoutError' }
}
export class YtdSheetReadError extends Error {
  constructor(readonly status: string) { super(`ytd sheet read failed: ${status}`); this.name = 'YtdSheetReadError' }
}

const SHEET_ID = /^[A-Za-z0-9_-]{20,100}$/
const NUMBER = /^(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const HEADERS: Record<string, DashChannel> = { instagram: 'INSTAGRAM', facebook: 'FACEBOOK', linkedin: 'LINKEDIN', tiktok: 'TIKTOK', x: 'TWITTER', twitter: 'TWITTER' }
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const firstCell = (row: unknown) => String((Array.isArray(row) ? row[0] : '') ?? '').trim()

/** The valid entry for the year on screen; 'none' when nothing is set for it; 'invalid' when something is set but
 *  unusable (the part warns once and draws version 1). */
export function ytdSheetFor(value: unknown, year: string): { kind: 'ok'; entry: YtdSheetEntry } | { kind: 'none' } | { kind: 'invalid' } {
  if (value === undefined) return { kind: 'none' }
  if (!isObj(value)) return { kind: 'invalid' }
  if (!Object.prototype.hasOwnProperty.call(value, year)) return { kind: 'none' }
  const e = value[year]
  if (!isObj(e) || typeof e.sheetId !== 'string' || !SHEET_ID.test(e.sheetId) || typeof e.tab !== 'string') return { kind: 'invalid' }
  const tab = e.tab.trim()
  if (tab.length === 0 || tab.length > 100) return { kind: 'invalid' }
  return { kind: 'ok', entry: { sheetId: e.sheetId, tab } }
}

export function classifyCell(raw: unknown): YtdCell {
  if (raw === undefined || raw === null) return { kind: 'blank' }
  const s = String(raw).trim()
  if (s === '') return { kind: 'blank' }
  if (/^n\/a$/i.test(s)) return { kind: 'na' }
  if (NUMBER.test(s)) return { kind: 'number', value: Number(s.replace(/,/g, '')) }
  return { kind: 'invalid' }
}

function block(grid: unknown[][], title: RegExp, name: 'followers' | 'views'): Partial<Record<DashChannel, YtdCell[]>> {
  const at = grid.findIndex((r) => title.test(firstCell(r)))
  if (at < 0) throw new YtdSheetLayoutError(`${name} title`)
  const header = Array.isArray(grid[at + 1]) ? grid[at + 1] : []
  const cols = new Map<DashChannel, number>()
  header.forEach((h, i) => {
    const ch = HEADERS[String(h ?? '').trim().toLowerCase()]
    if (ch && !cols.has(ch)) cols.set(ch, i)
  })
  if (cols.size === 0) throw new YtdSheetLayoutError(`${name} header`)
  const rows = MONTHS.map((m, i) => {
    const r = grid[at + 2 + i]
    if (!Array.isArray(r) || firstCell(r).toLowerCase() !== m) throw new YtdSheetLayoutError(`${name} ${m}`)
    return r
  })
  const out: Partial<Record<DashChannel, YtdCell[]>> = {}
  for (const [ch, i] of cols) out[ch] = rows.map((r) => classifyCell(r[i]))
  return out
}

export function parseYtdGrid(grid: unknown[][]): YtdTab {
  return { followers: block(grid, /^follower growth$/i, 'followers'), views: block(grid, /^views$/i, 'views') }
}

export function rangeFor(tab: string): string {
  return encodeURIComponent(`'${tab.replace(/'/g, "''")}'!A1:Z40`)
}

let auth: GoogleAuth | null = null
function getAuth(): GoogleAuth {
  if (!auth) {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
    if (!raw) throw new YtdSheetReadError('no-key')
    let credentials: Record<string, unknown>
    try { credentials = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) } catch { throw new YtdSheetReadError('bad-key') }
    auth = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] })
  }
  return auth
}

export async function readYtdTabImpl(sheetId: string, tab: string): Promise<unknown[][]> {
  let token: string | null | undefined
  try { token = await getAuth().getAccessToken() } catch (e) { throw e instanceof YtdSheetReadError ? e : new YtdSheetReadError('auth') }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 10_000)
  let res: Response
  try {
    res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${rangeFor(tab)}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal, cache: 'no-store',
    })
  } catch {
    throw new YtdSheetReadError(ctrl.signal.aborted ? 'timeout' : 'network')
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) throw new YtdSheetReadError(String(res.status))
  const body = (await res.json().catch(() => null)) as { values?: unknown } | null
  if (!isObj(body) || (body.values !== undefined && !Array.isArray(body.values))) throw new YtdSheetReadError('malformed')
  return (body.values as unknown[][] | undefined) ?? []
}

/** At most one read per tab an hour; a failure is replayed for 30 seconds rather than re-asked on every render. */
export const readYtdTab = cached('google-sheets', 'ytdTab', readYtdTabImpl, {
  version: '1', ttlSeconds: 3600, negativeTtlSeconds: 30, healthCritical: true,
})
```

Note: `getAuth` caches the client per process; the test's `beforeEach` sets the key before the first call. If the
module-level cache makes a later test see an old client, export nothing new: the tests above use one key throughout.

`lib/db/schema.ts`, inside `DashSocialConfig` after `reportingMonths?: unknown`:

```ts
  /** The team's YTD sheet per year, read by ytd-review@2 (docs/superpowers/specs/2026-10-01-ytd-from-sheet-design.md):
   *  { "<year>": { sheetId, tab } }. Validated at runtime (ytdSheetFor), so typed unknown. */
  ytdSheets?: unknown
```

- [ ] **Step 4: Run, watch it pass**

Run: `npx vitest run lib/organic-social/ytd-sheet.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Prove two tests can fail** (break, see red, restore by text): change `NUMBER` to `/^[\d,.]+$/` (the
  "1,23" case must fail), then `HEADERS.x` to `'INSTAGRAM'` (the X test must fail). Restore each by text.

- [ ] **Step 6: Commit and push**

```bash
git add lib/organic-social/ytd-sheet.ts lib/organic-social/ytd-sheet.test.ts lib/db/schema.ts
git commit -F <message file>   # feat(organic-social): Read the team's YTD sheet, one tab, read-only, strictly parsed (edge-case list in the body)
git push
```

### Task 2: Months and series (`lib/organic-social/ytd.ts`)

**Files:**
- Modify: `lib/organic-social/ytd.ts` (add exports only; existing exports untouched)
- Modify: `lib/organic-social/ytd.test.ts` (add tests only)

**Interfaces:**
- Consumes: `YtdCell`, `YtdTab` from Task 1; `YtdConfig`, `YtdMonth`, `ytdMonths`, `OutlineKpis` (existing).
- Produces: `YtdGraph = { points: { key: string; label: string; value: number }[]; gaps: string[] }`,
  `YtdGraphKey = 'followers' | 'views'`,
  `ytdSheetMonths(dateRange: string, compareRange: string, cfg: YtdConfig): YtdMonth[] | null`,
  `monthsNeedingDash(months: YtdMonth[], tab: YtdTab, channel: DashChannel, firstMonth: string): YtdMonth[]`,
  `ytdSheetSeries(months: YtdMonth[], tab: YtdTab, channel: DashChannel, firstMonth: string, built: Record<string, OutlineKpis | undefined>): { followers: YtdGraph; views: YtdGraph; invalid: { month: string; graph: YtdGraphKey }[]; missingColumn: YtdGraphKey[] }`.

- [ ] **Step 1: Write the failing tests** (append to `lib/organic-social/ytd.test.ts`; add the new names to its import)

```ts
import { monthsNeedingDash, ytdSheetMonths, ytdSheetSeries } from './ytd'
import type { YtdCell, YtdTab } from './ytd-sheet'

const n = (value: number): YtdCell => ({ kind: 'number', value })
const B: YtdCell = { kind: 'blank' }
const NA: YtdCell = { kind: 'na' }
const BAD: YtdCell = { kind: 'invalid' }
const col = (cells: Record<number, YtdCell>, fill: YtdCell = B) => Array.from({ length: 12 }, (_, i) => cells[i + 1] ?? fill)
const tabOf = (f: YtdCell[] | undefined, v: YtdCell[] | undefined): YtdTab => ({ followers: f ? { INSTAGRAM: f } : {}, views: v ? { INSTAGRAM: v } : {} })
const tile = (followers: number, views: number, noData = false) => ({ noData, kpis: { followers: { key: 'followers', label: 'Total Followers', format: 'number', value: followers }, exposure: { key: 'exposure', label: 'Views', format: 'number', value: views } } }) as never

test('ytdSheetMonths: January to the month on screen; months from firstMonth are ytdMonths entries unchanged', () => {
  const m = ytdSheetMonths('custom:2026-09-01,2026-09-30', 'custom:2026-08-01,2026-08-31', CFG)!
  expect(keys(m)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'])
  expect(m.slice(7)).toEqual(ytdMonths('custom:2026-09-01,2026-09-30', 'custom:2026-08-01,2026-08-31', CFG))
  expect(m[0]).toEqual({ key: '2026-01', dateRange: 'custom:2026-01-01,2026-01-31', compareRange: 'custom:2025-12-01,2025-12-31', partial: false })
  expect(ytdSheetMonths('custom:2026-10-01,2026-10-19', 'custom:2026-09-01,2026-09-19', CFG)!.at(-1)).toEqual({ key: '2026-10', dateRange: 'custom:2026-10-01,2026-10-19', compareRange: 'custom:2026-09-01,2026-09-19', partial: true })
})
test('ytdSheetMonths is null wherever ytdMonths draws nothing', () => {
  for (const r of ['last_30_days', 'custom:2026-09-01,2026-10-31', 'custom:2026-09-02,2026-09-30']) expect(ytdSheetMonths(r, 'x', CFG)).toBeNull()
  expect(ytdSheetMonths('custom:2026-07-01,2026-07-31', 'x', CFG)).toBeNull() // before firstMonth: ytdMonths is []
  expect(keys(ytdSheetMonths('custom:2027-02-01,2027-02-28', 'x', CFG))).toEqual(['2027-01', '2027-02'])
})
test('monthsNeedingDash: only blank months on or after firstMonth, and every such month when a column is missing', () => {
  const months = ytdSheetMonths('custom:2026-10-01,2026-10-31', 'custom:2026-09-01,2026-09-30', CFG)!
  const t = tabOf(col({ 1: n(1), 8: n(8), 9: n(9) }), col({ 1: n(1), 8: n(8) }))
  expect(keys(monthsNeedingDash(months, t, 'INSTAGRAM', '2026-08'))).toEqual(['2026-09', '2026-10'])
  expect(keys(monthsNeedingDash(months, tabOf(col({}, n(1)), undefined), 'INSTAGRAM', '2026-08'))).toEqual(['2026-08', '2026-09', '2026-10'])
  expect(keys(monthsNeedingDash(months, tabOf(col({}, NA), col({}, BAD)), 'INSTAGRAM', '2026-08'))).toEqual([])
})
test('ytdSheetSeries: the sheet wins; blank from firstMonth uses our value; N/A, invalid and early blanks are gaps', () => {
  const months = ytdSheetMonths('custom:2026-09-01,2026-09-30', 'custom:2026-08-01,2026-08-31', CFG)!
  const t = tabOf(col({ 1: NA, 2: n(20), 3: BAD, 8: n(80) }), col({ 2: n(2), 8: n(8), 9: n(9) }))
  const s = ytdSheetSeries(months, t, 'INSTAGRAM', '2026-08', { '2026-09': tile(900, 999) })
  expect(s.followers.points).toEqual([{ key: '2026-02', label: 'Feb', value: 20 }, { key: '2026-08', label: 'Aug', value: 80 }, { key: '2026-09', label: 'Sep', value: 900 }])
  expect(s.followers.gaps).toEqual(['Jan', 'Mar', 'Apr', 'May', 'Jun', 'Jul'])
  expect(s.views.points.map((p) => [p.label, p.value])).toEqual([['Feb', 2], ['Aug', 8], ['Sep', 9]])
  expect(s.invalid).toEqual([{ month: '2026-03', graph: 'followers' }])
  expect(s.missingColumn).toEqual([])
})
test('a blank month whose Data block is noData is a gap; a missing built entry throws', () => {
  const months = ytdSheetMonths('custom:2026-09-01,2026-09-30', 'x', CFG)!
  const t = tabOf(col({}), col({}))
  const s = ytdSheetSeries(months, t, 'INSTAGRAM', '2026-08', { '2026-08': tile(1, 1, true), '2026-09': tile(5, 6) })
  expect(s.followers.points.map((p) => p.label)).toEqual(['Sep'])
  expect(s.followers.gaps).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'])
  expect(() => ytdSheetSeries(months, t, 'INSTAGRAM', '2026-08', {})).toThrow('YTD: no tiles for 2026-08')
})
test('a sheet number on the live month keeps (live); a missing column is reported per graph', () => {
  const months = ytdSheetMonths('custom:2026-10-01,2026-10-19', 'x', CFG)!
  const s = ytdSheetSeries(months, tabOf(col({}, n(7)), undefined), 'INSTAGRAM', '2026-08', { '2026-08': tile(1, 1), '2026-09': tile(1, 2), '2026-10': tile(1, 3) })
  expect(s.followers.points.at(-1)).toEqual({ key: '2026-10', label: 'Oct (live)', value: 7 })
  expect(s.missingColumn).toEqual(['views'])
  expect(s.views.points.map((p) => [p.label, p.value])).toEqual([['Aug', 1], ['Sep', 2], ['Oct (live)', 3]])
  expect(s.views.gaps).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'])
})
```

- [ ] **Step 2: Run, watch it fail**

Run: `npx vitest run lib/organic-social/ytd.test.ts`
Expected: FAIL, `ytdSheetMonths` is not exported.

- [ ] **Step 3: Implement** (append to `lib/organic-social/ytd.ts`; add the two imports at the top)

```ts
import type { DashChannel } from './metrics'
import type { YtdCell, YtdTab } from './ytd-sheet'

export type YtdGraph = { points: { key: string; label: string; value: number }[]; gaps: string[] }
export type YtdGraphKey = 'followers' | 'views'
const GRAPHS: readonly YtdGraphKey[] = ['followers', 'views']
const labelOf = (m: YtdMonth) => { const short = SHORT[Number(m.key.slice(5, 7)) - 1]; return m.partial ? `${short} (live)` : short }
/** The cell for a month, or null when the tab has no column for this channel in that block. */
const cellAt = (tab: YtdTab, g: YtdGraphKey, ch: DashChannel, key: string): YtdCell | null => {
  const c = tab[g][ch]
  return c ? c[Number(key.slice(5, 7)) - 1] ?? { kind: 'blank' } : null
}

/** ytd-review@2's months (spec 4.3): null wherever version 1 draws nothing; otherwise January of the year on screen
 *  through the month on screen. Months from firstMonth are ytdMonths's entries unchanged, so their Dash requests are
 *  version 1's; earlier months are built the same way and never requested. */
export function ytdSheetMonths(dateRange: string, compareRange: string, cfg: YtdConfig): YtdMonth[] | null {
  const base = ytdMonths(dateRange, compareRange, cfg)
  if (!base || base.length === 0) return null
  const out: YtdMonth[] = []
  for (let k = `${base[base.length - 1].key.slice(0, 4)}-01`; k < base[0].key; k = addMonths(k, 1)) {
    const ref = addMonths(k, cfg.comparison === 'previous-year' ? -12 : -1)
    out.push({ key: k, dateRange: `custom:${k}-01,${lastOf(k)}`, compareRange: `custom:${ref}-01,${lastOf(ref)}`, partial: false })
  }
  return [...out, ...base]
}

/** Months on or after firstMonth with a blank cell (or no column) on either graph: the only ones Dash is asked for. */
export function monthsNeedingDash(months: YtdMonth[], tab: YtdTab, channel: DashChannel, firstMonth: string): YtdMonth[] {
  return months.filter((m) => m.key >= firstMonth && GRAPHS.some((g) => {
    const c = cellAt(tab, g, channel, m.key)
    return c === null || c.kind === 'blank'
  }))
}

/** Each graph decided separately per month (spec 4.3 table): the sheet's number wins; a blank from firstMonth uses
 *  the Data block's value (a gap when that month is noData); N/A, invalid and earlier blanks are gaps. */
export function ytdSheetSeries(
  months: YtdMonth[], tab: YtdTab, channel: DashChannel, firstMonth: string, built: Record<string, OutlineKpis | undefined>,
): { followers: YtdGraph; views: YtdGraph; invalid: { month: string; graph: YtdGraphKey }[]; missingColumn: YtdGraphKey[] } {
  const res = {
    followers: { points: [], gaps: [] } as YtdGraph,
    views: { points: [], gaps: [] } as YtdGraph,
    invalid: [] as { month: string; graph: YtdGraphKey }[],
    missingColumn: GRAPHS.filter((g) => !tab[g][channel]),
  }
  for (const m of months) {
    const label = labelOf(m)
    for (const g of GRAPHS) {
      const c = cellAt(tab, g, channel, m.key) ?? { kind: 'blank' as const }
      if (c.kind === 'number') { res[g].points.push({ key: m.key, label, value: c.value }); continue }
      if (c.kind === 'invalid') res.invalid.push({ month: m.key, graph: g })
      if (c.kind === 'blank' && m.key >= firstMonth) {
        const b = built[m.key]
        const k = b?.kpis[g === 'followers' ? 'followers' : 'exposure']
        if (!b || !k) throw new Error(`YTD: no tiles for ${m.key}`)
        if (!b.noData) { res[g].points.push({ key: m.key, label, value: k.value }); continue }
      }
      res[g].gaps.push(label)
    }
  }
  return res
}
```

- [ ] **Step 4: Run, watch it pass**

Run: `npx vitest run lib/organic-social/ytd.test.ts`
Expected: PASS (existing tests unchanged plus 6 new).

- [ ] **Step 5: Prove two tests can fail**: make `monthsNeedingDash` drop `m.key >= firstMonth &&` (the first
  `monthsNeedingDash` assertion must fail), then make `ytdSheetSeries` treat `na` like `blank` (the series test must
  fail). Restore each by text.

- [ ] **Step 6: Commit and push** (`feat(organic-social): YTD months and series from the sheet, with our value for blank months`).

### Task 3: The part (`ytd-review@2`)

**Files:**
- Create: `components/report-sections/organic-social/parts/ytd-review-sheet.tsx`
- Create: `components/report-sections/organic-social/parts/ytd-review-sheet.test.tsx`
- Modify: `components/report-sections/organic-social/parts/registry.ts:6,24`
- Modify: `components/report-sections/organic-social/parts/ytd-parity.test.ts` (add the version 2 assertions)

**Interfaces:**
- Consumes: Task 1 `readYtdTab`, `parseYtdGrid`, `ytdSheetFor`, `YtdSheetLayoutError`, `YtdSheetReadError`; Task 2
  `ytdSheetMonths`, `monthsNeedingDash`, `ytdSheetSeries`, `YtdGraph`; existing `YtdReviewSection`, `ytdConfig`,
  `getOutlineKpis`, `OUTLINE_DATA_ROWS`, `safe`, `Fallback`, `NoData`, `ChartCard`, `LineChart`, `BarChart`,
  `TrendSkeleton`, `mapWithConcurrency`.
- Produces: `YtdSheetReviewSection({ ctx })`, `ytdReviewV2: PartImpl<OrganicSocialCtx>` (id `ytd-review`, version 2,
  unpublished).

- [ ] **Step 1: Write the failing tests** (`parts/ytd-review-sheet.test.tsx`)

```tsx
import { beforeEach, expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'

const { getOutlineKpis, getClientBySlug, readYtdTab } = vi.hoisted(() => ({ getOutlineKpis: vi.fn(), getClientBySlug: vi.fn(), readYtdTab: vi.fn() }))
vi.mock('@/lib/organic-social/outline-headlines', async () => ({
  ...(await vi.importActual<typeof import('@/lib/organic-social/outline-headlines')>('@/lib/organic-social/outline-headlines')),
  getOutlineKpis,
}))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug }))
vi.mock('@/lib/organic-social/ytd-sheet', async () => ({
  ...(await vi.importActual<typeof import('@/lib/organic-social/ytd-sheet')>('@/lib/organic-social/ytd-sheet')),
  readYtdTab,
}))

import { YtdSheetReviewSection } from './ytd-review-sheet'
import { YtdReviewSection } from './ytd-review'
import { YtdSheetReadError } from '@/lib/organic-social/ytd-sheet'
import { FIXTURE_ORGANIC_SOCIAL_CTX } from './__fixtures__/organic-social-ctx'

// Made-up sheet id and numbers only.
const ID = 'TESTSHEETID_abcdefghij0123'
const SEPT = { ...FIXTURE_ORGANIC_SOCIAL_CTX, clientSlug: 'c', channel: 'INSTAGRAM' as const, dateRange: 'custom:2026-09-01,2026-09-30', compareRange: 'custom:2026-08-01,2026-08-31' }
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July ', 'August', 'September', 'October', 'November', 'December']
const sheet = (f: (i: number) => string, v: (i: number) => string) => [
  ['CLIENT: Test Co'], ['FOLLOWER GROWTH'], ['', 'Instagram'], ...MONTHS.map((m, i) => [m, f(i)]),
  [], ['VIEWS'], ['', 'Instagram'], ...MONTHS.map((m, i) => [m, v(i)]),
]
const kpis = (followers: number, views: number, noData = false) => ({ noData, kpis: { followers: { key: 'followers', label: 'Total Followers', format: 'number', value: followers }, exposure: { key: 'exposure', label: 'Views', format: 'number', value: views } } }) as never
const client = (ytdSheets?: unknown) => ({ id: 'c1', dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2026-08' }, ...(ytdSheets === undefined ? {} : { ytdSheets }) } })
const ENTRY = { 2026: { sheetId: ID, tab: 'Test Co' } }

type Chart = { name: string; data: Record<string, unknown>[]; yKeys: { key: string }[] }
function charts(node: unknown, found: Chart[] = []): Chart[] {
  const el = node as ReactElement<Record<string, unknown>> | null
  if (!el || typeof el !== 'object') return found
  const type = (el as { type?: { name?: string } }).type
  if (typeof type === 'function' && (type.name === 'LineChart' || type.name === 'BarChart')) found.push({ name: type.name, ...(el.props as unknown as Omit<Chart, 'name'>) })
  const kids = (el.props as { children?: unknown } | undefined)?.children
  for (const k of Array.isArray(kids) ? kids : [kids]) charts(k, found)
  return found
}
const logs = () => [...vi.mocked(console.warn).mock.calls, ...vi.mocked(console.error).mock.calls].map((c) => c.join(' '))

beforeEach(() => {
  getOutlineKpis.mockReset(); getClientBySlug.mockReset(); readYtdTab.mockReset()
  getClientBySlug.mockResolvedValue(client(ENTRY))
  vi.spyOn(console.warn).mockImplementation(() => {}); vi.spyOn(console.error).mockImplementation(() => {})
})

test('both graphs from the sheet, January to September; Dash asked only for September, with version 1 request', async () => {
  readYtdTab.mockResolvedValue(sheet((i) => (i < 8 ? String(100 + i) : ''), (i) => (i < 8 ? String(10 + i) : '')))
  getOutlineKpis.mockResolvedValue(kpis(900, 90))
  const el = await YtdSheetReviewSection({ ctx: SEPT })
  expect(readYtdTab).toHaveBeenCalledWith(ID, 'Test Co')
  expect(getOutlineKpis.mock.calls).toEqual([['c', 'custom:2026-09-01,2026-09-30', 'custom:2026-08-01,2026-08-31', 'INSTAGRAM']])
  const c = charts(el)
  expect(c.map((x) => [x.name, x.yKeys[0].key])).toEqual([['LineChart', 'followers'], ['LineChart', 'views']])
  expect(c[0].data.map((d) => d.month)).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'])
  expect(c[0].data.at(-1)).toEqual({ month: 'Sep', followers: 900 })
  expect(c[1].data[0]).toEqual({ month: 'Jan', views: 10 })
  const { container } = render(<>{el}</>)
  expect(container.textContent).toContain('Follower Growth, Year to Date')
  expect(container.textContent).toContain('Views, Year to Date')
})

test('gaps are named under each graph; a blank before firstMonth never calls Dash', async () => {
  readYtdTab.mockResolvedValue(sheet((i) => (i === 0 ? 'N/A' : i < 5 ? '' : String(i)), (i) => (i === 2 ? '12k' : String(i))))
  const el = await YtdSheetReviewSection({ ctx: SEPT })
  expect(getOutlineKpis).not.toHaveBeenCalled()
  const { container } = render(<>{el}</>)
  expect(container.textContent).toContain('No follower data for Jan, Feb, Mar, Apr, May')
  expect(container.textContent).toContain('No views data for Mar')
  expect(logs().some((l) => l.includes('ytd sheet cell invalid slug=c channel=INSTAGRAM month=2026-03 graph=views'))).toBe(true)
})

test('one empty graph shows NoData in its card; one point is bars while the other graph draws a line', async () => {
  readYtdTab.mockResolvedValue(sheet((i) => (i === 8 ? '5' : 'N/A'), (i) => (i < 9 ? String(i) : '')))
  let el = await YtdSheetReviewSection({ ctx: SEPT })
  expect(charts(el).map((x) => [x.name, x.yKeys[0].key])).toEqual([['BarChart', 'followers'], ['LineChart', 'views']])
  readYtdTab.mockResolvedValue(sheet(() => 'N/A', (i) => (i < 9 ? String(i) : '')))
  el = await YtdSheetReviewSection({ ctx: SEPT })
  const { container } = render(<>{el}</>)
  expect(charts(el).map((x) => x.yKeys[0].key)).toEqual(['views'])
  expect(container.textContent).toContain('No data for this period.')
})

test('both graphs empty: NoData alone', async () => {
  readYtdTab.mockResolvedValue(sheet(() => 'N/A', () => 'N/A'))
  const { container } = render(<>{await YtdSheetReviewSection({ ctx: SEPT })}</>)
  expect(container.textContent).toBe('No data for this period.')
})

test('a read failure or a layout error shows the error card and logs without the sheet id', async () => {
  readYtdTab.mockRejectedValue(new YtdSheetReadError('429'))
  let r = render(<>{await YtdSheetReviewSection({ ctx: SEPT })}</>)
  expect(r.container.textContent).toContain("Couldn't load this section.")
  r.unmount()
  readYtdTab.mockResolvedValue(sheet((i) => String(i), (i) => String(i)).map((row) => (row[0] === 'September' ? ['Sept', '1'] : row)))
  r = render(<>{await YtdSheetReviewSection({ ctx: SEPT })}</>)
  expect(r.container.textContent).toContain("Couldn't load this section.")
  const l = logs()
  expect(l.some((x) => x.includes('ytd sheet read failed slug=c status=429'))).toBe(true)
  expect(l.some((x) => x.includes('ytd sheet layout not found slug=c missing=followers september'))).toBe(true)
  expect(l.join('\n')).not.toContain(ID)
  expect(l.join('\n')).not.toContain('Test Co')
})

test('no entry, an invalid entry, or no entry for the year on screen: exactly version 1 (one warning when invalid)', async () => {
  for (const cfg of [undefined, { 2025: { sheetId: ID, tab: 'T' } }, { 2026: { sheetId: 'bad', tab: 'T' } }, 'x']) {
    getClientBySlug.mockResolvedValue(client(cfg))
    getOutlineKpis.mockResolvedValue(kpis(1, 2))
    const el = await YtdSheetReviewSection({ ctx: SEPT })
    expect(el).toEqual(<YtdReviewSection ctx={SEPT} />)
  }
  expect(readYtdTab).not.toHaveBeenCalled()
  expect(logs().filter((l) => l.includes('ytd sheet config invalid slug=c year=2026'))).toHaveLength(2)
})

test('a multi-month range or a channel without outline rows draws nothing', async () => {
  expect(await YtdSheetReviewSection({ ctx: { ...SEPT, dateRange: 'custom:2026-08-01,2026-09-30' } })).toBeNull()
  expect(await YtdSheetReviewSection({ ctx: { ...SEPT, channel: 'TWITTER' as const } })).toBeNull()
  expect(readYtdTab).not.toHaveBeenCalled()
})

test('a missing column warns and uses our value from firstMonth; at most 3 Dash requests in flight', async () => {
  readYtdTab.mockResolvedValue([['FOLLOWER GROWTH'], ['', 'Facebook'], ...MONTHS.map((m) => [m, '1']), ['VIEWS'], ['', 'Facebook'], ...MONTHS.map((m) => [m, '1'])])
  let live = 0, peak = 0
  getOutlineKpis.mockImplementation(async () => { live++; peak = Math.max(peak, live); await new Promise((r) => setTimeout(r, 5)); live--; return kpis(3, 4) })
  const el = await YtdSheetReviewSection({ ctx: { ...SEPT, dateRange: 'custom:2026-12-01,2026-12-31', compareRange: 'custom:2026-11-01,2026-11-30' } })
  expect(getOutlineKpis).toHaveBeenCalledTimes(5) // Aug to Dec
  expect(peak).toBeLessThanOrEqual(3)
  expect(charts(el)[0].data.map((d) => d.month)).toEqual(['Aug', 'Sep', 'Oct', 'Nov', 'Dec'])
  expect(logs().filter((l) => l.includes('ytd sheet column missing slug=c channel=INSTAGRAM'))).toHaveLength(2)
})
```

`ytd-parity.test.ts`, add inside the first test's file (new test):

```ts
import { ytdReviewV1 } from './ytd-review'
import { ytdReviewV2 } from './ytd-review-sheet'
test('ytd-review version 1 is untouched and version 2 is registered, unpublished', () => {
  expect(lookup(ORGANIC_SOCIAL_PARTS, 'ytd-review', 1)).toBe(ytdReviewV1)
  expect(lookup(ORGANIC_SOCIAL_PARTS, 'ytd-review', 2)).toBe(ytdReviewV2)
  expect(ytdReviewV2.published).toBe(false)
})
```

- [ ] **Step 2: Run, watch it fail**

Run: `npx vitest run components/report-sections/organic-social/parts/ytd-review-sheet.test.tsx components/report-sections/organic-social/parts/ytd-parity.test.ts`
Expected: FAIL, cannot resolve `./ytd-review-sheet`.

- [ ] **Step 3: Implement** (`parts/ytd-review-sheet.tsx`)

```tsx
import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import { getClientBySlug } from '@/lib/db/queries'
import { getOutlineKpis } from '@/lib/organic-social/outline-headlines'
import { OUTLINE_DATA_ROWS } from '@/lib/organic-social/outline-layout'
import { monthsNeedingDash, ytdConfig, ytdSheetMonths, ytdSheetSeries, type YtdGraph } from '@/lib/organic-social/ytd'
import { parseYtdGrid, readYtdTab, ytdSheetFor, YtdSheetLayoutError, YtdSheetReadError, type YtdTab } from '@/lib/organic-social/ytd-sheet'
import { mapWithConcurrency } from '@/lib/concurrency'
import { ChartCard } from '@/components/charts/chart-card'
import { LineChart } from '@/components/charts/line-chart'
import { BarChart } from '@/components/charts/bar-chart'
import { TrendSkeleton } from '../skeletons'
import { NoData } from '../no-data'
import type { OrganicSocialCtx } from '../ctx'
import { safe, Fallback } from './shared'
import { YtdReviewSection } from './ytd-review'

/** YTD Review from the team's YTD sheet (docs/superpowers/specs/2026-10-01-ytd-from-sheet-design.md). The sheet is
 *  the source of truth; a month it has not filled in yet, from firstMonth on, shows the Data block's own value. With
 *  no valid sheet for the year on screen it renders version 1 exactly. Log lines carry the slug, never the sheet id,
 *  the tab or a value. */
export async function YtdSheetReviewSection({ ctx }: { ctx: OrganicSocialCtx }) {
  const { clientSlug, channel, dateRange, compareRange } = ctx
  if (!channel || !OUTLINE_DATA_ROWS.standard[channel]) return null
  let client: Awaited<ReturnType<typeof getClientBySlug>>
  try { client = await getClientBySlug(clientSlug) } catch { return <Fallback kind="error" /> }
  const dsc = client?.dashSocialConfig as { reportingMonths?: unknown; ytdSheets?: unknown } | null | undefined
  const cfg = ytdConfig(dsc?.reportingMonths)
  if (!cfg) {
    console.warn(`[organic-social] ytd-review pinned without reportingMonths slug=${clientSlug}`)
    return null
  }
  const months = ytdSheetMonths(dateRange, compareRange, cfg)
  if (!months) return null
  const year = months[months.length - 1].key.slice(0, 4)
  const sheet = ytdSheetFor(dsc?.ytdSheets, year)
  if (sheet.kind !== 'ok') {
    if (sheet.kind === 'invalid') console.warn(`[organic-social] ytd sheet config invalid slug=${clientSlug} year=${year}`)
    return <YtdReviewSection ctx={ctx} />
  }
  let tab: YtdTab
  try {
    tab = parseYtdGrid(await readYtdTab(sheet.entry.sheetId, sheet.entry.tab))
  } catch (e) {
    if (e instanceof YtdSheetLayoutError) console.error(`[organic-social] ytd sheet layout not found slug=${clientSlug} missing=${e.missing}`)
    else console.error(`[organic-social] ytd sheet read failed slug=${clientSlug} status=${e instanceof YtdSheetReadError ? e.status : 'error'}`)
    return <Fallback kind="error" />
  }
  const need = monthsNeedingDash(months, tab, channel, cfg.firstMonth)
  const r = await safe(mapWithConcurrency(need, 3, (m) => getOutlineKpis(clientSlug, m.dateRange, m.compareRange, channel))
    .then((all) => ytdSheetSeries(months, tab, channel, cfg.firstMonth, Object.fromEntries(need.map((m, i) => [m.key, all[i]])))))
  if (!r.data) return <Fallback kind={r.error!} />
  const s = r.data
  for (const g of s.missingColumn) console.warn(`[organic-social] ytd sheet column missing slug=${clientSlug} channel=${channel} graph=${g}`)
  for (const x of s.invalid) console.warn(`[organic-social] ytd sheet cell invalid slug=${clientSlug} channel=${channel} month=${x.month} graph=${x.graph}`)
  if (s.followers.points.length === 0 && s.views.points.length === 0) return <NoData />
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-extrabold uppercase tracking-widest text-text-muted">YTD Review</h2>
      <div className="grid gap-5 lg:grid-cols-2">
        {graph('Follower Growth, Year to Date', 'followers', 'Total Followers', 'follower', s.followers)}
        {graph('Views, Year to Date', 'views', 'Views', 'views', s.views)}
      </div>
    </section>
  )
}

/** One card. Lines through the months, as version 1; one point is drawn as bars, judged on this graph's own count.
 *  A plain function, not a component, so the returned tree holds the chart elements (as version 1's does). */
function graph(title: string, yKey: 'followers' | 'views', label: string, gapWord: string, g: YtdGraph) {
  const data = g.points.map((p) => ({ month: p.label, [yKey]: p.value }))
  const yKeys = [{ key: yKey, label }]
  return (
    <div key={yKey} className="space-y-2">
      <ChartCard title={title}>
        {data.length === 0 ? <NoData /> : data.length < 2
          ? <BarChart data={data} xKey="month" yKeys={yKeys} />
          : <LineChart data={data} xKey="month" yKeys={yKeys} />}
      </ChartCard>
      {g.gaps.length > 0 && <p className="text-xs text-text-muted">No {gapWord} data for {g.gaps.join(', ')}</p>}
    </div>
  )
}

export const ytdReviewV2: PartImpl<OrganicSocialCtx> = {
  id: 'ytd-review',
  version: 2,
  published: false,
  defaultLabel: 'YTD Review',
  render: (ctx) => (
    <Suspense fallback={<TrendSkeleton />}>
      <YtdSheetReviewSection ctx={ctx} />
    </Suspense>
  ),
}
```

`registry.ts`: line 6 `import { ytdReviewV1 } from './ytd-review'` gains a sibling `import { ytdReviewV2 } from
'./ytd-review-sheet'`; line 24 becomes `'ytd-review': { 1: ytdReviewV1, 2: ytdReviewV2 },`.

- [ ] **Step 4: Run, watch it pass**

Run: `npx vitest run components/report-sections/organic-social/parts/ytd-review-sheet.test.tsx components/report-sections/organic-social/parts/ytd-parity.test.ts components/report-sections/organic-social/parts/ytd-review.test.tsx`
Expected: PASS (version 1's own tests unchanged).

- [ ] **Step 5: Prove two tests can fail**: drop the `if (sheet.kind === 'invalid')` warning (the version 1 fallback
  test must fail on the count), then change `mapWithConcurrency(need, 3` to `need.length || 1` (the in-flight test
  must fail). Restore each by text.

- [ ] **Step 6: `make check`** (typecheck, all tests, RSC check, build). Expected: all pass.

- [ ] **Step 7: Commit and push** (`feat(organic-social): ytd-review@2 draws YTD from the team's sheet`).

### Task 4: Records and PR

**Files:**
- Modify: `docs/superpowers/plans/2026-09-29-ytd-from-january.md` (one superseded line at the top)
- PR #286 body: what it does, how each number is sourced, what is unchanged, the rollout, the edge-case list; mark
  ready for review once `make check` passes and the merge proof against every open PR is clean.

- [ ] **Step 1:** superseded line; commit and push.
- [ ] **Step 2:** merge proof: `git merge-tree --write-tree` against `origin/dev` and each open PR head.
- [ ] **Step 3:** PR body updated (no sheet id, tab name or figure), PR marked ready, Paul requested.
