# YTD sheet: find each client's tab automatically: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> This project runs Native (superpowers:executing-plans): no implementer subagents (standing rule).

**Goal:** `ytd-review@2` finds each client's tab in the year's YTD sheet by name, so a new tab needs no manual step,
never showing one client another client's numbers; a one-line override covers a name that does not match.

**Architecture:** the year's sheet comes from one setting (`ORGANIC_SOCIAL_YTD_SHEETS`). A cached tab index (titles and
each tab's A1 CLIENT row) feeds a pure matcher over every client's name. A resolver decides override, auto match or
version 1, and the part adds two read-time checks (a vanished tab, a changed CLIENT row). Everything from reading the
chosen tab onward is #286's code.

**Tech Stack:** Next.js 16 RSC, TypeScript strict, `google-auth-library`, `lib/cache.ts` `cached()`, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-01-ytd-auto-tabs-design.md` (REVIEWED, two rounds).

**Precondition:** #286 is merged into `dev`, and `dev` is merged into this branch (`git merge origin/dev`, no force
push). Every file this plan edits exists only after that. Cited lines are at #286's head `5a4e63c1`.

## Global Constraints
- Never another client's numbers: a tab is used for a client only when it claims that client and no other (spec 4.4),
  and an override is refused when its tab claims another client (spec 4.5 step 1).
- No sheet id, tab title or cell value in any log line or thrown message. Tests use made-up ids and names.
- Renaissance unchanged. Measured on staging 2026-10-01 (read-only): Renaissance's row pins no `ytd-review` and has no
  `ytdSheets`; no `section_templates` row mentions `ytd-review`. So this code never runs for it.
- Overrides written for #286 (`{ sheetId, tab }`) keep working.
- `ORGANIC_SOCIAL_YTD_SHEETS` is read per render (tests stub and restore it).
- No em or en dashes in new text (a quoted sheet title stays exact).

## Rulings recorded before Task 1
- **#286's part tests gain two mocks** (`readYtdTabIndex`, `getAllClients`); their assertions do not change. Spec 7
  says they pass unchanged, but spec 4.5 step 1 checks every override against the index, and #286's tests use an
  override. Cost if wrong: none; mocks only.
- **The index reads A1 in batches of 10 tabs, at most 50 tabs** (round 1 minor: URL length). Ten quoted, encoded
  titles keep each GET short; 50 is far above today's 6. More than 50 visible tabs is `too-many-tabs`. Cost if wrong:
  a sheet with more than 50 client tabs shows the error card until the cap is raised.
- **`ytd sheet no year` warns only when the setting is set and lacks the year.** With the setting unset (as in #286's
  tests and today), no warning, so a deploy before the setting exists is quiet. Cost if wrong: a forgotten setting is
  silent until someone notices version 1.
- **Duplicate years: the first valid pair wins** (round 1 minor).
- **An override's tab must equal an index title exactly** (after #286's trim), so a typo is refused, not guessed.

## Review Focus
1. A client renamed in the dashboard since the 5-minute `getAllClients` cache: matched by its current name (Task 3
   test, the merge).
2. A tab whose title names one client and whose CLIENT row names another: used for neither (Task 2 test).
3. A batch answer with one `valueRanges` entry missing: `malformed`, never shifted pairs (Task 1 test).
4. The setting with spaces, a trailing comma and a duplicate year (Task 1 test).
5. A 400 from the chosen tab after a rename: version 1 with `tab gone`, never the error card (Task 4 test).

---

### Task 1: Year setting, widened override, tab index (`lib/organic-social/ytd-sheet.ts`)

**Files:**
- Modify: `lib/organic-social/ytd-sheet.ts` (`YtdSheetEntry` `:10`, `ytdSheetFor` `:28-37`, add exports after
  `readYtdTab` `:123`)
- Modify: `lib/organic-social/ytd-sheet.test.ts` (add tests)
- Modify: `lib/db/schema.ts` (the `ytdSheets` comment `:144-146`)
- Modify: `.env.example` (one line after `CHART_NOTES_APPROVERS`, `:88`)

**Interfaces:**
- Produces: `YtdSheetEntry = { sheetId?: string; tab: string }`; `ytdSheetFor` (same signature, accepts `{ tab }`);
  `ytdSheetForYear(raw: string | undefined, year: string): string | null`; `ytdYearsInvalid(raw: string | undefined):
  boolean`; `YtdTabIndexEntry = { title: string; clientRow: string }`; `readYtdTabIndexImpl(sheetId: string):
  Promise<YtdTabIndexEntry[]>`; `readYtdTabIndex` (cached).

- [ ] **Step 1: Write the failing tests** (append to `lib/organic-social/ytd-sheet.test.ts`; widen its import)

```ts
import { readYtdTabIndexImpl, ytdSheetForYear, ytdYearsInvalid } from './ytd-sheet'

const ID2 = 'OTHERSHEETID_abcdefghij9876'

test('the year setting: YEAR=id pairs, spaces allowed, first valid pair wins, bad pairs ignored and reported', () => {
  expect(ytdSheetForYear(`2026=${ID}`, '2026')).toBe(ID)
  expect(ytdSheetForYear(` 2025=${ID2} , 2026=${ID} ,`, '2026')).toBe(ID)
  expect(ytdSheetForYear(`2026=${ID},2026=${ID2}`, '2026')).toBe(ID)
  expect(ytdSheetForYear(`2026=${ID}`, '2027')).toBeNull()
  expect(ytdSheetForYear(undefined, '2026')).toBeNull()
  expect(ytdSheetForYear(`26=${ID},2026=short`, '2026')).toBeNull()
  expect(ytdYearsInvalid(`2026=${ID}, 2027=${ID2}`)).toBe(false)
  expect(ytdYearsInvalid(`2026=${ID},nonsense`)).toBe(true)
  expect(ytdYearsInvalid(undefined)).toBe(false)
  expect(ytdYearsInvalid('')).toBe(false)
})

test('an override may name only the tab; a sheet id, when present, is still checked', () => {
  expect(ytdSheetFor({ 2026: { tab: ' Kenect Nashville ' } }, '2026')).toEqual({ kind: 'ok', entry: { tab: 'Kenect Nashville' } })
  expect(ytdSheetFor({ 2026: { sheetId: ID, tab: 'T' } }, '2026')).toEqual({ kind: 'ok', entry: { sheetId: ID, tab: 'T' } })
  expect(ytdSheetFor({ 2026: { sheetId: 'bad', tab: 'T' } }, '2026')).toEqual({ kind: 'invalid' })
  expect(ytdSheetFor({ 2026: { sheetId: 5, tab: 'T' } }, '2026')).toEqual({ kind: 'invalid' })
})

function indexFetch(meta: unknown, batches: unknown[]) {
  let call = 0
  return vi.fn(async () => {
    const body = call === 0 ? meta : batches[call - 1]
    call++
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200 })
  })
}
const sheetsMeta = (tabs: { title?: string; hidden?: boolean }[]) => ({ sheets: tabs.map((p) => ({ properties: p })) })
const batch = (rows: (string | undefined)[]) => ({ valueRanges: rows.map((r) => (r === undefined ? {} : { values: [[r]] })) })

test('the tab index: visible tabs only, each with its A1, read in batches of 10', async () => {
  const titles = Array.from({ length: 12 }, (_, i) => `Tab ${i}`)
  const f = indexFetch(sheetsMeta([...titles.map((t) => ({ title: t })), { title: 'Old copy', hidden: true }]), [
    batch(titles.slice(0, 10).map((t) => `CLIENT: ${t}`)), batch([`CLIENT: Tab 10`, undefined]),
  ])
  vi.stubGlobal('fetch', f)
  const idx = await readYtdTabIndexImpl(ID)
  expect(idx).toHaveLength(12)
  expect(idx[0]).toEqual({ title: 'Tab 0', clientRow: 'CLIENT: Tab 0' })
  expect(idx[11]).toEqual({ title: 'Tab 11', clientRow: '' })
  expect(f).toHaveBeenCalledTimes(3)
  const urls = f.mock.calls.map((c) => String((c as unknown[])[0]))
  expect(urls[0]).toBe(`https://sheets.googleapis.com/v4/spreadsheets/${ID}?fields=sheets.properties(title%2Chidden)`)
  expect(urls[1]).toContain(`ranges=${encodeURIComponent("'Tab 0'!A1")}`)
  expect(urls[2]).toContain(`ranges=${encodeURIComponent("'Tab 11'!A1")}`)
})

test('the tab index: an apostrophe is doubled; absent hidden means visible', async () => {
  const f = indexFetch(sheetsMeta([{ title: "Jo's" }]), [batch(['CLIENT: Jo'])])
  vi.stubGlobal('fetch', f)
  expect(await readYtdTabIndexImpl(ID)).toEqual([{ title: "Jo's", clientRow: 'CLIENT: Jo' }])
  expect(String((f.mock.calls[1] as unknown[])[0])).toContain(`ranges=${encodeURIComponent("'Jo''s'!A1")}`)
})

test('the tab index: malformed answers, more than 50 tabs, and no sheet id in any message', async () => {
  const cases: [unknown, unknown[]][] = [
    ['not json', []],
    [{}, []],
    [sheetsMeta([{}]), []],
    [sheetsMeta([{ title: 'A' }, { title: 'B' }]), [batch(['CLIENT: A'])]],
  ]
  for (const [meta, batches] of cases) {
    vi.stubGlobal('fetch', indexFetch(meta, batches))
    const e = await readYtdTabIndexImpl(ID).catch((x) => x)
    expect(e).toBeInstanceOf(YtdSheetReadError)
    expect(e.status).toBe('malformed')
    expect(String(e.message)).not.toContain(ID)
  }
  vi.stubGlobal('fetch', indexFetch(sheetsMeta(Array.from({ length: 51 }, (_, i) => ({ title: `T${i}` }))), []))
  expect((await readYtdTabIndexImpl(ID).catch((x) => x)).status).toBe('too-many-tabs')
  vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 403 })))
  expect((await readYtdTabIndexImpl(ID).catch((x) => x)).status).toBe('403')
})

test('the tab index runs under the same 10 second deadline', async () => {
  vi.useFakeTimers()
  try {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<never>(() => {})))
    const p = readYtdTabIndexImpl(ID).catch((e) => e)
    await vi.advanceTimersByTimeAsync(10_000)
    const e = await Promise.race([p, Promise.resolve('still pending')])
    expect((e as YtdSheetReadError).status).toBe('timeout')
  } finally { vi.useRealTimers() }
})
```

- [ ] **Step 2: Run, watch it fail**

Run: `npx vitest run lib/organic-social/ytd-sheet.test.ts`
Expected: FAIL, `readYtdTabIndexImpl` and `ytdSheetForYear` are not exported.

- [ ] **Step 3: Implement**

In `lib/organic-social/ytd-sheet.ts`, replace `export type YtdSheetEntry = { sheetId: string; tab: string }` with
`export type YtdSheetEntry = { sheetId?: string; tab: string }`, and replace the body of `ytdSheetFor` after
`const e = value[year]` with:

```ts
  if (!isObj(e) || typeof e.tab !== 'string') return { kind: 'invalid' }
  if (e.sheetId !== undefined && (typeof e.sheetId !== 'string' || !SHEET_ID.test(e.sheetId))) return { kind: 'invalid' }
  const tab = e.tab.trim()
  if (tab.length === 0 || tab.length > 100) return { kind: 'invalid' }
  return { kind: 'ok', entry: e.sheetId === undefined ? { tab } : { sheetId: e.sheetId, tab } }
```

Append after `readYtdTab`:

```ts
/** The year's sheet from ORGANIC_SOCIAL_YTD_SHEETS ("2026=<id>,2027=<id>"), read per render; the first valid pair for
 *  the year wins. */
export function ytdSheetForYear(raw: string | undefined, year: string): string | null {
  for (const pair of (raw ?? '').split(',')) {
    const [y, id] = pair.trim().split('=').map((x) => x?.trim())
    if (y === year && /^\d{4}$/.test(y) && typeof id === 'string' && SHEET_ID.test(id)) return id
  }
  return null
}

/** True when the setting holds a non-empty pair that is not a valid YEAR=id. */
export function ytdYearsInvalid(raw: string | undefined): boolean {
  return (raw ?? '').split(',').map((p) => p.trim()).filter(Boolean).some((p) => {
    const [y, id] = p.split('=').map((x) => x?.trim())
    return !(/^\d{4}$/.test(y ?? '') && typeof id === 'string' && SHEET_ID.test(id))
  })
}

export type YtdTabIndexEntry = { title: string; clientRow: string }
const INDEX_BATCH = 10
const INDEX_MAX_TABS = 50

/** Every visible tab's title and A1 (its CLIENT row), under one 10 second deadline: one metadata GET, then A1 in
 *  batches of 10 (spec 4.3). Batch answers pair with titles by position; any other shape is 'malformed'. */
export async function readYtdTabIndexImpl(sheetId: string): Promise<YtdTabIndexEntry[]> {
  const ctrl = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { ctrl.abort(); reject(new YtdSheetReadError('timeout')) }, TIMEOUT_MS)
  })
  try {
    return await Promise.race([readIndex(sheetId, ctrl.signal), deadline])
  } finally {
    clearTimeout(timer)
  }
}

async function getJson(url: string, token: string | null | undefined, signal: AbortSignal): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal, cache: 'no-store' })
  } catch {
    throw new YtdSheetReadError(signal.aborted ? 'timeout' : 'network')
  }
  if (!res.ok) throw new YtdSheetReadError(String(res.status))
  const body = await res.json().catch(() => undefined)
  if (body === undefined) throw new YtdSheetReadError('malformed')
  return body
}

async function readIndex(sheetId: string, signal: AbortSignal): Promise<YtdTabIndexEntry[]> {
  let token: string | null | undefined
  try { token = await getAuth().getAccessToken() } catch (e) { throw e instanceof YtdSheetReadError ? e : new YtdSheetReadError('auth') }
  const meta = await getJson(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=${encodeURIComponent('sheets.properties(title,hidden)')}`, token, signal)
  if (!isObj(meta) || !Array.isArray(meta.sheets)) throw new YtdSheetReadError('malformed')
  const titles: string[] = []
  for (const s of meta.sheets) {
    const p = isObj(s) && isObj(s.properties) ? s.properties : null
    if (!p || typeof p.title !== 'string') throw new YtdSheetReadError('malformed')
    if (p.hidden !== true) titles.push(p.title)
  }
  if (titles.length > INDEX_MAX_TABS) throw new YtdSheetReadError('too-many-tabs')
  const out: YtdTabIndexEntry[] = []
  for (let i = 0; i < titles.length; i += INDEX_BATCH) {
    const chunk = titles.slice(i, i + INDEX_BATCH)
    const q = chunk.map((t) => `ranges=${encodeURIComponent(`'${t.replace(/'/g, "''")}'!A1`)}`).join('&')
    const body = await getJson(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchGet?${q}`, token, signal)
    const ranges = isObj(body) ? body.valueRanges : undefined
    if (!Array.isArray(ranges) || ranges.length !== chunk.length) throw new YtdSheetReadError('malformed')
    chunk.forEach((title, j) => {
      const r = ranges[j]
      const values = isObj(r) && Array.isArray(r.values) ? r.values : []
      out.push({ title, clientRow: firstCell(values[0]) })
    })
  }
  return out
}

/** Shared by every client on the sheet; a new tab is found within the hour. */
export const readYtdTabIndex = cached('google-sheets', 'ytdTabIndex', readYtdTabIndexImpl, {
  version: '1', ttlSeconds: 3600, negativeTtlSeconds: 30, healthCritical: true,
})
```

`lib/db/schema.ts`, the `ytdSheets` comment becomes:

```ts
  /** Per-year override for ytd-review@2 (docs/superpowers/specs/2026-10-01-ytd-auto-tabs-design.md):
   *  { "<year>": { tab, sheetId? } }, only for a client whose name does not match its tab; without sheetId the year's
   *  sheet from ORGANIC_SOCIAL_YTD_SHEETS is used. Validated at runtime (ytdSheetFor), so typed unknown. */
```

`.env.example`, after the `CHART_NOTES_APPROVERS=` line:

```
ORGANIC_SOCIAL_YTD_SHEETS=          # [optional] the team's YTD sheet per year, comma-separated YEAR=sheetId pairs (e.g. 2026=<sheet id>). ytd-review@2 finds each client's tab in it by name. Unset: only per-client overrides are used.
```

- [ ] **Step 4: Run, watch it pass**

Run: `npx vitest run lib/organic-social/ytd-sheet.test.ts`
Expected: PASS (#286's 9 tests plus 6 new).

- [ ] **Step 5: Prove two tests can fail** (break, see red, restore by text): drop `ranges.length !== chunk.length ||`
  (the short-batch case must fail); change `p.hidden !== true` to `true` (the hidden-tab count must fail).

- [ ] **Step 6: Commit and push** (`feat(organic-social): The year's YTD sheet from one setting, and its tab index`;
  edge-case list in the body: external failure, bounds (50 tabs, batches of 10, one deadline), input boundaries
  (positional pairing), security (no sheet id in messages)).

### Task 2: Matching (`lib/organic-social/ytd-tab-match.ts`)

**Files:**
- Create: `lib/organic-social/ytd-tab-match.ts`
- Create: `lib/organic-social/ytd-tab-match.test.ts`

**Interfaces:**
- Consumes: `YtdTabIndexEntry` (Task 1).
- Produces: `type NamedClient = { slug: string; name: string }`; `normalizeName(s: string): string`;
  `tabClaims(entry: YtdTabIndexEntry, clients: NamedClient[]): Set<string>`;
  `matchYtdTab(slug: string, clients: NamedClient[], index: YtdTabIndexEntry[]): { kind: 'ok'; entry:
  YtdTabIndexEntry } | { kind: 'none' } | { kind: 'ambiguous'; count: number }`;
  `mergeCurrentClient(all: NamedClient[], current: NamedClient): NamedClient[]`.

- [ ] **Step 1: Write the failing tests**

```ts
import { expect, test } from 'vitest'
import { matchYtdTab, mergeCurrentClient, normalizeName, tabClaims } from './ytd-tab-match'

// Made-up names only.
const C = (slug: string, name: string) => ({ slug, name })
const T = (title: string, clientRow = '') => ({ title, clientRow })
const CLIENTS = [C('alpha', 'Alpha Homes'), C('bravo', 'Bravo & Sons'), C('charlie', 'Charlie Co, North'), C('delta', 'Delta')]

test('normalizeName: case, accents, &, a CLIENT: prefix and punctuation', () => {
  expect(normalizeName('Alpha Homes')).toBe('alphahomes')
  expect(normalizeName('  CLIENT:  alpha HOMES ')).toBe('alphahomes')
  expect(normalizeName('client:Bravo and Sons')).toBe('bravoandsons')
  expect(normalizeName('Bravo & Sons')).toBe('bravoandsons')
  expect(normalizeName('Café Délta')).toBe('cafedelta')
  expect(normalizeName('— , ')).toBe('')
})

test('a tab claims every client its title or CLIENT row names', () => {
  expect([...tabClaims(T('Alpha Homes', 'CLIENT: Alpha Homes'), CLIENTS)]).toEqual(['alpha'])
  expect([...tabClaims(T('Delta', 'CLIENT: Alpha Homes'), CLIENTS)].sort()).toEqual(['alpha', 'delta'])
  expect([...tabClaims(T('North', 'CLIENT: Charlie – North'), CLIENTS)]).toEqual([])
})

test('match: exactly one tab claiming only this client', () => {
  const idx = [T('Alpha Homes', 'CLIENT: Alpha Homes'), T('Bravo and Sons', 'CLIENT: Bravo & Sons'), T('Delta', 'CLIENT: Delta')]
  expect(matchYtdTab('alpha', CLIENTS, idx)).toEqual({ kind: 'ok', entry: idx[0] })
  expect(matchYtdTab('bravo', CLIENTS, idx)).toEqual({ kind: 'ok', entry: idx[1] })
  expect(matchYtdTab('charlie', CLIENTS, idx)).toEqual({ kind: 'none' })
})

test('never guesses: a tab naming two clients is used for neither; two tabs for one client stop both', () => {
  const mixed = [T('Delta', 'CLIENT: Alpha Homes'), T('Alpha Homes', 'CLIENT: Alpha Homes')]
  expect(matchYtdTab('delta', CLIENTS, mixed)).toEqual({ kind: 'none' })
  expect(matchYtdTab('alpha', CLIENTS, mixed)).toEqual({ kind: 'ok', entry: mixed[1] })
  const twice = [T('Alpha Homes'), T('alpha homes', 'CLIENT: ALPHA HOMES')]
  expect(matchYtdTab('alpha', CLIENTS, twice)).toEqual({ kind: 'ambiguous', count: 2 })
})

test('a name another row shares is ambiguous, counted as the clients sharing it; an empty name matches nothing', () => {
  const rows = [...CLIENTS, C('alpha-dash', 'ALPHA homes')]
  expect(matchYtdTab('alpha', rows, [T('Alpha Homes')])).toEqual({ kind: 'ambiguous', count: 2 })
  expect(matchYtdTab('blank', [...CLIENTS, C('blank', '—')], [T('—')])).toEqual({ kind: 'none' })
  expect(matchYtdTab('missing', CLIENTS, [T('Alpha Homes')])).toEqual({ kind: 'none' })
})

test('the current client replaces any stale entry with its slug', () => {
  const merged = mergeCurrentClient([C('alpha', 'Old Name'), C('delta', 'Delta')], C('alpha', 'Alpha Homes'))
  expect(merged).toEqual([C('delta', 'Delta'), C('alpha', 'Alpha Homes')])
})
```

- [ ] **Step 2: Run, watch it fail**

Run: `npx vitest run lib/organic-social/ytd-tab-match.test.ts`
Expected: FAIL, cannot resolve `./ytd-tab-match`.

- [ ] **Step 3: Implement** (`lib/organic-social/ytd-tab-match.ts`)

```ts
// Which tab of the year's YTD sheet belongs to a client (spec docs/superpowers/specs/2026-10-01-ytd-auto-tabs-design.md
// 4.4). Exact after normalizing, over every client row, and it never guesses: a tab that names another client too, two
// tabs for one client, or a name another row shares all mean no tab, so one client can never see another's numbers.
import type { YtdTabIndexEntry } from './ytd-sheet'

export type NamedClient = { slug: string; name: string }

export function normalizeName(s: string): string {
  return s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim()
    .replace(/^client\s*:\s*/, '').replace(/&/g, 'and').replace(/[^a-z0-9]/g, '')
}

/** The slugs of every client the tab's title or CLIENT row names. */
export function tabClaims(entry: YtdTabIndexEntry, clients: NamedClient[]): Set<string> {
  const names = new Set([normalizeName(entry.title), normalizeName(entry.clientRow)].filter(Boolean))
  const out = new Set<string>()
  for (const c of clients) {
    const n = normalizeName(c.name)
    if (n && names.has(n)) out.add(c.slug)
  }
  return out
}

export function matchYtdTab(slug: string, clients: NamedClient[], index: YtdTabIndexEntry[]):
  { kind: 'ok'; entry: YtdTabIndexEntry } | { kind: 'none' } | { kind: 'ambiguous'; count: number } {
  const me = clients.find((c) => c.slug === slug)
  const mine = me ? normalizeName(me.name) : ''
  if (!mine) return { kind: 'none' }
  const sharing = clients.filter((c) => normalizeName(c.name) === mine).length
  if (sharing > 1) return { kind: 'ambiguous', count: sharing }
  const candidates = index.filter((t) => { const c = tabClaims(t, clients); return c.has(slug) && c.size === 1 })
  if (candidates.length === 1) return { kind: 'ok', entry: candidates[0] }
  return candidates.length === 0 ? { kind: 'none' } : { kind: 'ambiguous', count: candidates.length }
}

/** Every row from getAllClients with the current client's own row in place of any entry with its slug, so a client
 *  missing from that 5-minute cache, or renamed since, is matched by its current name. */
export function mergeCurrentClient(all: NamedClient[], current: NamedClient): NamedClient[] {
  return [...all.filter((c) => c.slug !== current.slug), current]
}
```

- [ ] **Step 4: Run, watch it pass**

Run: `npx vitest run lib/organic-social/ytd-tab-match.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Prove two tests can fail**: drop `&& c.size === 1` (the "tab naming two clients" test must fail); drop
  `if (sharing > 1) return ...` (the shared-name test must fail). Restore by text.

- [ ] **Step 6: Commit and push** (`feat(organic-social): Match a client to its YTD tab by name, never guessing`).

### Task 3: The resolver (`lib/organic-social/ytd-source.ts`)

**Files:**
- Create: `lib/organic-social/ytd-source.ts`
- Create: `lib/organic-social/ytd-source.test.ts`

**Interfaces:**
- Consumes: Task 1 `ytdSheetFor`, `ytdSheetForYear`, `YtdTabIndexEntry`; Task 2 `matchYtdTab`, `tabClaims`,
  `mergeCurrentClient`, `NamedClient`.
- Produces: `type YtdSourceDeps = { readIndex: (sheetId: string) => Promise<YtdTabIndexEntry[]>; allClients: () =>
  Promise<NamedClient[]> }`; `type YtdSource = { kind: 'sheet'; sheetId: string; tab: string; clientRow: string } |
  { kind: 'v1'; level?: 'warn' | 'info'; line?: string } | { kind: 'error'; line: string }`;
  `resolveYtdSource(a: { slug: string; name: string; ytdSheets: unknown; year: string; setting: string | undefined },
  deps: YtdSourceDeps): Promise<YtdSource>`.

- [ ] **Step 1: Write the failing tests**

```ts
import { expect, test, vi } from 'vitest'
import { resolveYtdSource } from './ytd-source'
import { YtdSheetReadError } from './ytd-sheet'

// Made-up ids and names only.
const ID = 'TESTSHEETID_abcdefghij0123', ID2 = 'OTHERSHEETID_abcdefghij9876'
const IDX = [{ title: 'Alpha Homes', clientRow: 'CLIENT: Alpha Homes' }, { title: 'North', clientRow: 'CLIENT: Charlie – North' }, { title: 'Delta', clientRow: 'CLIENT: Delta' }]
const CLIENTS = [{ slug: 'alpha', name: 'Alpha Homes' }, { slug: 'charlie', name: 'Charlie Co, North' }, { slug: 'delta', name: 'Delta' }]
const deps = (over: Partial<{ readIndex: unknown; allClients: unknown }> = {}) => ({
  readIndex: vi.fn(async () => IDX), allClients: vi.fn(async () => CLIENTS), ...over,
}) as never
const A = (over: Partial<{ slug: string; name: string; ytdSheets: unknown; setting: string | undefined }> = {}) =>
  ({ slug: 'alpha', name: 'Alpha Homes', ytdSheets: undefined, year: '2026', setting: `2026=${ID}`, ...over })

test('auto: the year sheet and the one tab that claims only this client', async () => {
  const d = deps()
  expect(await resolveYtdSource(A(), d)).toEqual({ kind: 'sheet', sheetId: ID, tab: 'Alpha Homes', clientRow: 'CLIENT: Alpha Homes' })
})
test('auto: no tab is version 1 with an info line; ambiguous warns with the count', async () => {
  expect(await resolveYtdSource(A({ slug: 'charlie', name: 'Charlie Co, North' }), deps())).toEqual({ kind: 'v1', level: 'info', line: '[organic-social] ytd sheet no tab slug=charlie year=2026' })
  const twice = [...IDX, { title: 'alpha homes', clientRow: '' }]
  expect(await resolveYtdSource(A(), deps({ readIndex: vi.fn(async () => twice) }))).toEqual({ kind: 'v1', level: 'warn', line: '[organic-social] ytd sheet tab ambiguous slug=alpha year=2026 count=2' })
})
test('no setting for the year: version 1, warning only when the setting is set', async () => {
  expect(await resolveYtdSource(A({ setting: undefined }), deps())).toEqual({ kind: 'v1' })
  expect(await resolveYtdSource(A({ setting: `2025=${ID}` }), deps())).toEqual({ kind: 'v1', level: 'warn', line: '[organic-social] ytd sheet no year slug=alpha year=2026' })
})
test('override with only a tab uses the year sheet and must pass the index check', async () => {
  const d = deps()
  expect(await resolveYtdSource(A({ slug: 'charlie', name: 'Charlie Co, North', ytdSheets: { 2026: { tab: 'North' } } }), d))
    .toEqual({ kind: 'sheet', sheetId: ID, tab: 'North', clientRow: 'CLIENT: Charlie – North' })
})
test('override refused: a tab claiming another client, or a tab not in the index', async () => {
  const refused = { kind: 'v1', level: 'warn', line: '[organic-social] ytd sheet override refused slug=charlie year=2026' }
  expect(await resolveYtdSource(A({ slug: 'charlie', name: 'Charlie Co, North', ytdSheets: { 2026: { tab: 'Delta' } } }), deps())).toEqual(refused)
  expect(await resolveYtdSource(A({ slug: 'charlie', name: 'Charlie Co, North', ytdSheets: { 2026: { tab: 'Nope' } } }), deps())).toEqual(refused)
})
test('override with its own sheet id (#286 style) is index-checked on that sheet', async () => {
  const d = deps()
  expect(await resolveYtdSource(A({ ytdSheets: { 2026: { sheetId: ID2, tab: 'Alpha Homes' } }, setting: undefined }), d))
    .toEqual({ kind: 'sheet', sheetId: ID2, tab: 'Alpha Homes', clientRow: 'CLIENT: Alpha Homes' })
  expect((d as { readIndex: { mock: { calls: unknown[][] } } }).readIndex.mock.calls).toEqual([[ID2]])
})
test('override without any sheet, and an invalid override, are version 1 with a warning', async () => {
  expect(await resolveYtdSource(A({ ytdSheets: { 2026: { tab: 'Alpha Homes' } }, setting: undefined }), deps()))
    .toEqual({ kind: 'v1', level: 'warn', line: '[organic-social] ytd sheet override without sheet slug=alpha year=2026' })
  expect(await resolveYtdSource(A({ ytdSheets: 'x' }), deps()))
    .toEqual({ kind: 'v1', level: 'warn', line: '[organic-social] ytd sheet config invalid slug=alpha year=2026' })
})
test('an index or client-list failure is the error card, with no sheet id in the line', async () => {
  const e1 = await resolveYtdSource(A(), deps({ readIndex: vi.fn(async () => { throw new YtdSheetReadError('403') }) }))
  expect(e1).toEqual({ kind: 'error', line: '[organic-social] ytd sheet read failed slug=alpha status=403' })
  const e2 = await resolveYtdSource(A(), deps({ allClients: vi.fn(async () => { throw new Error('db down') }) }))
  expect(e2).toEqual({ kind: 'error', line: '[organic-social] ytd sheet client list failed slug=alpha' })
  expect(JSON.stringify([e1, e2])).not.toContain(ID)
})
test('the current client is matched by its own current name, not a stale list entry', async () => {
  const stale = deps({ allClients: vi.fn(async () => [{ slug: 'alpha', name: 'Old Name' }, ...CLIENTS.slice(1)]) })
  expect((await resolveYtdSource(A(), stale)).kind).toBe('sheet')
})
```

- [ ] **Step 2: Run, watch it fail**

Run: `npx vitest run lib/organic-social/ytd-source.test.ts`
Expected: FAIL, cannot resolve `./ytd-source`.

- [ ] **Step 3: Implement** (`lib/organic-social/ytd-source.ts`)

```ts
// Which sheet and tab ytd-review@2 reads for a client (spec docs/superpowers/specs/2026-10-01-ytd-auto-tabs-design.md
// 4.5): a valid override, checked against the sheet's index; else the one tab that claims only this client in the
// year's sheet; else version 1. Lines carry the slug and year, never the sheet id, a tab title or a value.
import { YtdSheetReadError, ytdSheetFor, ytdSheetForYear, type YtdTabIndexEntry } from './ytd-sheet'
import { matchYtdTab, mergeCurrentClient, tabClaims, type NamedClient } from './ytd-tab-match'

export type YtdSourceDeps = { readIndex: (sheetId: string) => Promise<YtdTabIndexEntry[]>; allClients: () => Promise<NamedClient[]> }
export type YtdSource =
  | { kind: 'sheet'; sheetId: string; tab: string; clientRow: string }
  | { kind: 'v1'; level?: 'warn' | 'info'; line?: string }
  | { kind: 'error'; line: string }

export async function resolveYtdSource(
  a: { slug: string; name: string; ytdSheets: unknown; year: string; setting: string | undefined },
  deps: YtdSourceDeps,
): Promise<YtdSource> {
  const tag = `slug=${a.slug} year=${a.year}`
  const warn = (what: string): YtdSource => ({ kind: 'v1', level: 'warn', line: `[organic-social] ytd sheet ${what} ${tag}` })
  const override = ytdSheetFor(a.ytdSheets, a.year)
  if (override.kind === 'invalid') return warn('config invalid')
  const yearSheet = ytdSheetForYear(a.setting, a.year)
  const sheetId = override.kind === 'ok' ? override.entry.sheetId ?? yearSheet : yearSheet
  if (!sheetId) {
    if (override.kind === 'ok') return warn('override without sheet')
    return (a.setting ?? '').trim() ? warn('no year') : { kind: 'v1' }
  }
  let index: YtdTabIndexEntry[]
  try { index = await deps.readIndex(sheetId) } catch (e) {
    return { kind: 'error', line: `[organic-social] ytd sheet read failed slug=${a.slug} status=${e instanceof YtdSheetReadError ? e.status : 'error'}` }
  }
  let clients: NamedClient[]
  try { clients = mergeCurrentClient(await deps.allClients(), { slug: a.slug, name: a.name }) } catch {
    return { kind: 'error', line: `[organic-social] ytd sheet client list failed slug=${a.slug}` }
  }
  if (override.kind === 'ok') {
    const entry = index.find((t) => t.title === override.entry.tab)
    const claims = entry ? tabClaims(entry, clients) : null
    if (!entry || [...claims!].some((s) => s !== a.slug)) return warn('override refused')
    return { kind: 'sheet', sheetId, tab: entry.title, clientRow: entry.clientRow }
  }
  const m = matchYtdTab(a.slug, clients, index)
  if (m.kind === 'ok') return { kind: 'sheet', sheetId, tab: m.entry.title, clientRow: m.entry.clientRow }
  if (m.kind === 'none') return { kind: 'v1', level: 'info', line: `[organic-social] ytd sheet no tab ${tag}` }
  return { kind: 'v1', level: 'warn', line: `[organic-social] ytd sheet tab ambiguous ${tag} count=${m.count}` }
}
```

- [ ] **Step 4: Run, watch it pass**

Run: `npx vitest run lib/organic-social/ytd-source.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Prove two tests can fail**: change the refusal to `if (!entry) return warn(...)` (the "claims another
  client" case must fail); drop `mergeCurrentClient(...)` in favour of the raw list (the stale-name test must fail).
  Restore by text.

- [ ] **Step 6: Commit and push** (`feat(organic-social): Resolve each client's YTD sheet and tab, override checked`;
  edge-case list: operator visibility (every outcome logged with slug and year), security (override refusal, no sheet
  id or tab in lines), state (two caches, current client merged)).

### Task 4: The part uses the resolver, with the two read-time checks

**Files:**
- Modify: `components/report-sections/organic-social/parts/ytd-review-sheet.tsx` (`:7` imports, `:36-47`)
- Modify: `components/report-sections/organic-social/parts/ytd-review-sheet.test.tsx` (two added mocks; new tests)
- Modify: `vitest.config.ts` only if `lib/organic-social/**` were not already included (it is: no change expected)

**Interfaces:**
- Consumes: Task 3 `resolveYtdSource`, `YtdSource`; Task 1 `readYtdTabIndex`; Task 2 `normalizeName`;
  `getAllClients` (`lib/db/queries.ts:97`).

- [ ] **Step 1: Write the failing tests** (in `ytd-review-sheet.test.tsx`: add `readYtdTabIndex` to the hoisted mocks
  and the `@/lib/organic-social/ytd-sheet` mock, add `getAllClients` to the `@/lib/db/queries` mock; in `beforeEach`,
  `readYtdTabIndex.mockResolvedValue([{ title: 'Test Co', clientRow: 'CLIENT: Test Co' }])`,
  `getAllClients.mockResolvedValue([{ slug: 'c', name: 'Test Co' }])`, the client row gains `slug: 'c', name: 'Test Co'`,
  and `delete process.env.ORGANIC_SOCIAL_YTD_SHEETS`. #286's "missing column" test builds a grid with no CLIENT row, so
  that one test also sets `readYtdTabIndex.mockResolvedValue([{ title: 'Test Co', clientRow: 'FOLLOWER GROWTH' }])`, so
  the A1 check (Task 4) passes on its grid. #286's assertions stay as they are.)

```tsx
test('auto: with the year setting and no override, the matched tab is read', async () => {
  process.env.ORGANIC_SOCIAL_YTD_SHEETS = `2026=${ID}`
  getClientBySlug.mockResolvedValue(client(undefined))
  readYtdTab.mockResolvedValue(sheet((i) => (i < 9 ? String(i) : ''), (i) => (i < 9 ? String(i) : '')))
  await YtdSheetReviewSection({ ctx: SEPT })
  expect(readYtdTabIndex).toHaveBeenCalledWith(ID)
  expect(readYtdTab).toHaveBeenCalledWith(ID, 'Test Co')
})

test('a 400 from the matched tab (renamed since the index) is version 1 with tab gone, not the error card', async () => {
  process.env.ORGANIC_SOCIAL_YTD_SHEETS = `2026=${ID}`
  getClientBySlug.mockResolvedValue(client(undefined))
  getOutlineKpis.mockResolvedValue(kpis(1, 2))
  readYtdTab.mockRejectedValue(new YtdSheetReadError('400'))
  const el = await YtdSheetReviewSection({ ctx: SEPT })
  expect(el).toEqual(<YtdReviewSection ctx={SEPT} />)
  expect(logs().some((l) => l.includes('ytd sheet tab gone slug=c year=2026'))).toBe(true)
})

test("a grid whose A1 no longer matches the chosen tab's CLIENT row is version 1 with tab changed", async () => {
  process.env.ORGANIC_SOCIAL_YTD_SHEETS = `2026=${ID}`
  getClientBySlug.mockResolvedValue(client(undefined))
  readYtdTab.mockResolvedValue(sheet((i) => String(i), (i) => String(i)).map((r, i) => (i === 0 ? ['CLIENT: Someone Else'] : r)))
  const el = await YtdSheetReviewSection({ ctx: SEPT })
  expect(el).toEqual(<YtdReviewSection ctx={SEPT} />)
  expect(logs().some((l) => l.includes('ytd sheet tab changed slug=c year=2026'))).toBe(true)
})

test('no tab: version 1 and an info line; an invalid setting pair warns', async () => {
  process.env.ORGANIC_SOCIAL_YTD_SHEETS = `2026=${ID},junk`
  getClientBySlug.mockResolvedValue(client(undefined))
  readYtdTabIndex.mockResolvedValue([{ title: 'Other', clientRow: 'CLIENT: Other' }])
  const info = vi.spyOn(console, 'info').mockImplementation(() => {})
  expect(await YtdSheetReviewSection({ ctx: SEPT })).toEqual(<YtdReviewSection ctx={SEPT} />)
  expect(info.mock.calls.flat().join(' ')).toContain('ytd sheet no tab slug=c year=2026')
  expect(logs().some((l) => l.includes('ytd sheet setting has an invalid pair'))).toBe(true)
})

test('an index failure is the error card; no line carries the sheet id or a tab title', async () => {
  process.env.ORGANIC_SOCIAL_YTD_SHEETS = `2026=${ID}`
  getClientBySlug.mockResolvedValue(client(undefined))
  readYtdTabIndex.mockRejectedValue(new YtdSheetReadError('403'))
  const { container } = render(<>{await YtdSheetReviewSection({ ctx: SEPT })}</>)
  expect(container.textContent).toContain("Couldn't load this section.")
  expect(logs().join('\n')).not.toContain(ID)
  expect(logs().join('\n')).not.toContain('Test Co')
})
```

- [ ] **Step 2: Run, watch it fail**

Run: `npx vitest run components/report-sections/organic-social/parts/ytd-review-sheet.test.tsx`
Expected: the five new tests FAIL (the part still reads `ytdSheetFor` directly); #286's tests PASS with the added
mocks.

- [ ] **Step 3: Implement** (`parts/ytd-review-sheet.tsx`)

Imports: replace `ytdSheetFor` in the `@/lib/organic-social/ytd-sheet` import with `readYtdTabIndex, ytdYearsInvalid`;
add `import { getAllClients } from '@/lib/db/queries'` beside `getClientBySlug`; add
`import { resolveYtdSource } from '@/lib/organic-social/ytd-source'` and
`import { normalizeName } from '@/lib/organic-social/ytd-tab-match'`.

Replace `:36-47` (from `const sheet = ytdSheetFor(...)` through the `catch` that returns the error card) with:

```tsx
  const setting = process.env.ORGANIC_SOCIAL_YTD_SHEETS
  if (ytdYearsInvalid(setting)) console.warn('[organic-social] ytd sheet setting has an invalid pair')
  const src = await resolveYtdSource(
    { slug: clientSlug, name: client?.name ?? '', ytdSheets: dsc?.ytdSheets, year, setting },
    { readIndex: readYtdTabIndex, allClients: async () => (await getAllClients()).map((c) => ({ slug: c.slug, name: c.name })) },
  )
  if (src.kind === 'error') { console.error(src.line); return <Fallback kind="error" /> }
  if (src.kind === 'v1') {
    if (src.line) (src.level === 'info' ? console.info : console.warn)(src.line)
    return <YtdReviewSection ctx={ctx} />
  }
  let grid: unknown[][]
  try {
    grid = await readYtdTab(src.sheetId, src.tab)
  } catch (e) {
    if (e instanceof YtdSheetReadError && e.status === '400') {
      console.warn(`[organic-social] ytd sheet tab gone slug=${clientSlug} year=${year}`)
      return <YtdReviewSection ctx={ctx} />
    }
    console.error(`[organic-social] ytd sheet read failed slug=${clientSlug} status=${e instanceof YtdSheetReadError ? e.status : 'error'}`)
    return <Fallback kind="error" />
  }
  if (normalizeName(String((grid[0] as unknown[] | undefined)?.[0] ?? '')) !== normalizeName(src.clientRow)) {
    console.warn(`[organic-social] ytd sheet tab changed slug=${clientSlug} year=${year}`)
    return <YtdReviewSection ctx={ctx} />
  }
  let tab: YtdTab
  try {
    tab = parseYtdGrid(grid)
  } catch (e) {
    if (e instanceof YtdSheetLayoutError) console.error(`[organic-social] ytd sheet layout not found slug=${clientSlug} missing=${e.missing}`)
    else console.error(`[organic-social] ytd sheet read failed slug=${clientSlug} status=error`)
    return <Fallback kind="error" />
  }
```

- [ ] **Step 4: Run, watch it pass**

Run: `npx vitest run components/report-sections/organic-social/parts/ lib/organic-social/`
Expected: PASS (#286's tests unchanged in their assertions; the new ones green).

- [ ] **Step 5: Prove two tests can fail**: change `e.status === '400'` to `'404'` (the tab-gone test must fail);
  remove the A1 check (the tab-changed test must fail). Restore by text.

- [ ] **Step 6: `make check`** (typecheck, all tests, RSC check, build). Expected: all pass.

- [ ] **Step 7: Commit and push** (`feat(organic-social): ytd-review@2 finds its tab, with the two read-time checks`).

### Task 5: Records, review and PR

- [ ] Final fresh-eyed whole-branch review (one reviewer, most capable model), fix pass for Critical and Important.
- [ ] Merge proof against `dev` and every open PR; combined run if files are shared.
- [ ] PR into `dev` (no sheet id or figure in the body), Paul requested.
- [ ] Rollout notes for me (spec section 8): set `ORGANIC_SOCIAL_YTD_SHEETS` in Vercel staging and Production and the
  local copies, with my consent; on staging, Akara's override becomes `{ tab: "Kenect Nashville" }` and the other four
  lose their per-client entries (guarded script, dry run first); check every client's YTD.
