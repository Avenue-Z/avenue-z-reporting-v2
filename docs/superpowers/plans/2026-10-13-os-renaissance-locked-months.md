# Renaissance on locked months (Organic Social only): implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The code that lets Renaissance's Organic Social run on locked months: `ytd-review@4`, the sidebar date-range
rule for locked clients, and a lower bound so months before `firstMonth` never lock. No data changes; Renaissance's
settings switch is a later, separate, consented step (spec section 8).

**Architecture:** Three independent code changes plus one settings-proof test. 4.2c is a one-condition change in the
locking client with its bound computed by a new pure helper. `@4` is a new part composed from existing pieces (`@2`'s
months, `@3`'s floor and sheet fallback, the shared block). 4.2b is one pure helper used at every range-copying link in
both sidebars, plus one boolean on the portal sidebar mapper.

**Tech Stack:** Next.js 16 App Router (RSC + client components), TypeScript strict, vitest (explicit `include` list in
`vitest.config.ts`; `lib/organic-social/**` and `lib/portal/**` and `components/report-sections/**` are globbed).

**Spec:** `docs/superpowers/specs/2026-10-12-os-renaissance-locked-months-design.md`, approved by Paul 2026-10-13 on
PR #372 (branch `docs/os-renaissance-locked-months-spec`, commit `291c136d`). Code branch
`feat/os-renaissance-locked-months`, cut from `origin/dev` `fd1da06b`.

## Global Constraints

- Scope is the Organic Social section only. Paid Media, AEO and Executive Overview pages behave exactly as today.
- No change to `ytd-review@1`, `@2`, `@3`. `@4` is unpublished and pinned per client.
- `@4`: the YTD sheet first; Dash for a blank cell; every platform tab including X; months from January of the year on
  screen through the month on screen; never a partial month; every Dash month a whole month with `compareRange` null;
  Dash floor = January of the year on screen; Overview renders nothing; renders nothing and logs without
  `reportingMonths`; missing or invalid sheet = empty sheet (every month from Dash, notes kept); sheet read failure =
  "Couldn't load this section."; slow Dash month = the YTD timeout card; `EXPORT_LAYOUT` entry `'ytd-review@4': 'own'`.
- 4.2b: for a client on locked months, a sidebar link that crosses the Organic Social boundary in either direction carries
  no `dateRange` and no `compareRange`, at all 17 places; Organic Social's own tab links keep them; "in Organic Social" =
  `?section=organic-social` on the reports page, or a path ending `/reports/organic-social`; for every other client every
  link is unchanged. The portal mapper gains exactly one field, `lockedMonths: boolean`, and never the setting.
- 4.2c: a request whose period ends before the 1st of `firstMonth` reads live through the cached client and is never
  stored; a `firstMonth` request locks and reads its baseline exactly as today; `lock-key-pin.test.ts` unchanged.
  `settledThrough`'s unreachable final `return lastOf(key)` becomes `return null`.
- Public repo: no client names other than Renaissance; no figures; no brand ids or sheet ids (placeholders only).
- No em or en dashes in anything this plan adds.

## Review Focus

1. **The team's live January.** No month of the year on screen has finished, so `@4`'s month list is empty. Ruling:
   render nothing (as `@2` does when it has no months); a client never sees a live month; the team picks December to see
   the year. Pinned in Task 2 ("live January renders nothing and asks nothing").
2. **A client with `reportingMonths` but a malformed `firstMonth`.** `lockedFrom` returns null and `settledThrough`
   returns null, so nothing locks (today's behaviour); `@4` renders nothing because `ytdConfig` is null. Pinned in Task 1
   (`lockedFrom` null cases) and Task 2 (no-config test uses a malformed setting too).
3. **The portal deep-link route.** `activeSection` is null there; the sidebar must still treat it as Organic Social.
   Pinned in Task 3 (deep-link page in the comparison test).
4. **A non-locked client's sidebar (every other live client).** Every href must be byte-identical to today. Pinned in
   Task 3 (control renders) and by the unchanged portal golden snapshots.
5. **A `firstMonth` request's comparison baseline.** Its context window is in the month before `firstMonth`; the baseline
   read goes to the store directly and must not change. Pinned in Task 1.

## Merge safety with the other open PR

#374 (`chore/remove-unused-api-routes`) edits `components/layout/portal-sidebar.tsx:66` and
`app/dashboard/settings/page.tsx:173`. This plan edits `portal-sidebar.tsx` from line 29 down, around `:66`'s hunk. Task 5
proves both PRs merge cleanly into `dev` in either order (`git merge-tree`).

---

### Task 1: 4.2c lower bound and `settledThrough` null

**Files:**
- Modify: `lib/organic-social/lock-day.ts:28-40` (doc + final return), add `lockedFrom` after `settledThrough`
- Modify: `lib/organic-social/locking-client.ts:11` (`Opts`), `:77` (the condition)
- Modify: `lib/organic-social/base.ts:11, 31`
- Test: `lib/organic-social/lock-day.test.ts`, `lib/organic-social/locking-client.test.ts`, new `lib/organic-social/base.lock-window.test.ts`

**Interfaces:**
- Produces: `lockedFrom(cfgValue: unknown): string | null` (the 1st of `firstMonth`, or null); `Opts.from: string | null`.

- [ ] **Step 1: Failing tests in `lock-day.test.ts`** (append; add `lockedFrom` to the import on line 2)

```ts
test('the first lockable day is the 1st of firstMonth; nothing when the config is malformed', () => {
  expect(lockedFrom({ firstMonth: '2026-07' })).toBe('2026-07-01')
  expect(lockedFrom({ firstMonth: '2026-07', clientMonths: 1 })).toBe('2026-07-01')
  for (const bad of [null, {}, { firstMonth: '2026-13' }, { firstMonth: 202607 }]) expect(lockedFrom(bad)).toBeNull()
})

test('settledThrough is always last month or the month before last, for every lock day, opening day, weekend rule and day of a year', () => {
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const endOfMonthBefore = (day: string, back: number) => iso(new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - back, 0)))
  for (const weekendRule of ['next-monday', 'previous-friday'] as const) {
    for (const opensOnDay of [4, 12, 28]) {
      for (let lockDay = 4; lockDay <= 28; lockDay++) {
        const cfg = { firstMonth: '2025-01', opensOnDay, weekendRule, lockDay }
        for (let t = Date.UTC(2026, 0, 1); t <= Date.UTC(2027, 0, 31); t += 86_400_000) {
          const today = iso(new Date(t))
          expect([endOfMonthBefore(today, 1), endOfMonthBefore(today, 2)]).toContain(settledThrough(cfg, today))
        }
      }
    }
  }
})
```

- [ ] **Step 2: Run, watch `lockedFrom` fail**

Run: `npx vitest run lib/organic-social/lock-day.test.ts`
Expected: the `lockedFrom` test FAILS (`lockedFrom is not a function` or not exported); the enumeration test PASSES
already (it pins today's behaviour, which the null change must keep).

- [ ] **Step 3: Implement in `lock-day.ts`**

Replace the doc comment and final line of `settledThrough`:

```ts
/** The last day whose numbers are locked on `today` (New York date), or null when the
 *  reportingMonths config is malformed (then nothing locks). At most two months are checked: a lock day is day 4 to 28
 *  of the next month and only ever moves earlier (lockOn), so the month before last has always locked within last
 *  month and the loop returns by its second pass. The final null is unreachable. */
export function settledThrough(cfgValue: unknown, today: string): string | null {
  const parsed = parseReportingMonths(cfgValue)
  if (!parsed.ok) return null
  const { lockDay } = parseLockDay(cfgValue)
  let key = prevMonth(monthOf(today))
  for (let i = 0; i < 2; i++, key = prevMonth(key)) {
    if (today >= lockOn(key, lockDay, opensOn(key, parsed.cfg.opensOnDay, parsed.cfg.weekendRule))) return lastOf(key)
  }
  return null
}

/** The first day a client's numbers can lock: the 1st of firstMonth, or null when the reportingMonths config is
 *  malformed (then nothing locks anyway). A request whose period ends before it is read live and never stored (spec
 *  2026-10-12-os-renaissance-locked-months-design.md 4.2c). */
export function lockedFrom(cfgValue: unknown): string | null {
  const parsed = parseReportingMonths(cfgValue)
  return parsed.ok ? firstOf(parsed.cfg.firstMonth) : null
}
```

- [ ] **Step 4: Failing test in `locking-client.test.ts`**

Change line 11 to `const OPTS = { clientId: 'c1', slug: 'client-a', settled: '2026-09-30', from: null, late: () => false }`
and append:

```ts
test('4.2c: a request ending before the first lockable day reads live and is never stored; one ending in it locks as before', async () => {
  const opts = { ...OPTS, from: '2026-09-01' }
  const AUG: ReportsDataParams = { ...SEPT, startDate: '2026-08-01T04:00:00Z', endDate: '2026-08-31T04:00:00Z', contextStartDate: '2026-07-01T04:00:00Z', contextEndDate: '2026-07-31T04:00:00Z' }
  const inner = innerFake(); const deps = depsFake()
  inner.getReportsData.mockResolvedValue(total(1, 1))
  inner.getContent.mockResolvedValue(content)
  expect(await lockingClient(inner, opts, deps).getReportsData(AUG)).toEqual(total(1, 1))
  expect(await lockingClient(inner, opts, deps).getContent({ ...contentParams, startDate: '2026-08-01', endDate: '2026-08-31' })).toEqual(content)
  expect(deps.read).not.toHaveBeenCalled()
  expect(deps.write).not.toHaveBeenCalled()
  expect(deps.capture.getReportsData).not.toHaveBeenCalled()
  expect(deps.capture.getContent).not.toHaveBeenCalled()
  // September ends on or after the first lockable day: captured, stored, and its baseline read from the store as today.
  const inner2 = innerFake(); const deps2 = depsFake()
  deps2.capture.getReportsData.mockResolvedValue(total(5, 4))
  await lockingClient(inner2, opts, deps2).getReportsData(SEPT)
  expect(inner2.getReportsData).not.toHaveBeenCalled()
  expect(deps2.write).toHaveBeenCalledTimes(1)
  expect(deps2.read.mock.calls.map((c) => c[1])).toEqual([requestKey('getReportsData', SEPT), requestKey('getReportsData', { ...SEPT, startDate: '2026-08-01T04:00:00Z', endDate: '2026-08-31T04:00:00Z', contextStartDate: '2026-07-01T04:00:00Z', contextEndDate: '2026-07-31T04:00:00Z' })])
})
```

- [ ] **Step 5: Run, watch it fail**

Run: `npx vitest run lib/organic-social/locking-client.test.ts`
Expected: the new test FAILS (August is captured and written); every other test passes.

- [ ] **Step 6: Implement in `locking-client.ts`**

`Opts` (line 11) becomes:

```ts
/** `from` is the first day a request can lock (the 1st of firstMonth, lockedFrom). A request ending before it is read
 *  live and never stored (spec 4.2c). Null means no lower bound. */
type Opts = { clientId: string; slug: string; settled: string | null; from: string | null; late: (periodEnd: string) => boolean }
```

Line 77 becomes:

```ts
    if (!end || !opts.settled || end > opts.settled || (opts.from !== null && end < opts.from)) return live()
```

- [ ] **Step 7: Wiring test `base.lock-window.test.ts`** (new)

```ts
import { expect, test, vi } from 'vitest'

const { lockingClient, getClientBySlug } = vi.hoisted(() => ({ lockingClient: vi.fn(() => ({})), getClientBySlug: vi.fn() }))
vi.mock('./locking-client', async () => ({ ...(await vi.importActual<typeof import('./locking-client')>('./locking-client')), lockingClient }))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug }))
vi.mock('./locked-range', async () => ({
  ...(await vi.importActual<typeof import('./locked-range')>('./locked-range')),
  requestClock: () => ({ today: '2026-10-13', lastCompleteUtcDay: '2026-10-12', liveDayInProgress: false }),
}))

import { dashClientFor } from './base'

test('a client on locked months gets the lower bound from its firstMonth, next to its settled day', async () => {
  process.env.DASH_API_TOKEN = 'test-token'
  getClientBySlug.mockResolvedValue({ id: 'c1', dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2026-07', clientMonths: 1 } } })
  await dashClientFor('locked-co')
  expect(lockingClient).toHaveBeenCalledTimes(1)
  const opts = (lockingClient.mock.calls[0] as unknown[])[1] as { settled: string | null; from: string | null }
  expect(opts.from).toBe('2026-07-01')
  expect(opts.settled).toBe('2026-09-30')
})
```

Run: `npx vitest run lib/organic-social/base.lock-window.test.ts`
Expected: FAIL (`opts.from` undefined) until Step 8.

- [ ] **Step 8: Wire `base.ts`**

Line 11: `import { isLateLock, lockedFrom, parseLockDay, settledThrough } from './lock-day'`
Line 31: `return lockingClient(inner, { clientId: c.id, slug, settled: settledThrough(rm, today), from: lockedFrom(rm), late: (end) => isLateLock(end, rm, today) }, {`

- [ ] **Step 9: Run the three files and the key pin**

Run: `npx vitest run lib/organic-social/lock-day.test.ts lib/organic-social/locking-client.test.ts lib/organic-social/base.lock-window.test.ts lib/organic-social/lock-key-pin.test.ts lib/organic-social/lock-sweep.test.ts`
Expected: all PASS; `lock-key-pin.test.ts` unchanged and passing.

- [ ] **Step 10: Commit and push**

```bash
git add lib/organic-social/lock-day.ts lib/organic-social/lock-day.test.ts lib/organic-social/locking-client.ts lib/organic-social/locking-client.test.ts lib/organic-social/base.ts lib/organic-social/base.lock-window.test.ts
git commit -m "feat(organic-social): months before firstMonth read live and never lock"
git push -u origin feat/os-renaissance-locked-months
```

### Task 2: `ytd-review@4`

**Files:**
- Modify: `lib/organic-social/ytd.ts` (add `ytdLockedMonths` after `ytdSheetMonths`; `YtdMonth` doc at `:15`)
- Create: `components/report-sections/organic-social/parts/ytd-review-locked.tsx`
- Modify: `components/report-sections/organic-social/parts/registry.ts:8, 28`
- Modify: `components/report-sections/organic-social/parts/export-layout.ts:18` (add `@4`)
- Modify: `components/report-sections/organic-social/parts/ytd-failure.ts:36, 40` (`version: 1 | 2 | 3 | 4`)
- Test: `lib/organic-social/ytd.test.ts`, new `components/report-sections/organic-social/parts/ytd-review-locked.test.tsx`,
  `components/report-sections/organic-social/parts/export-layout.test.ts:20`

**Interfaces:**
- Consumes: nothing from Task 1 at the type level (the lock bound applies inside `getOutlineKpis`'s reader).
- Produces: `ytdLockedMonths(dateRange: string, compareRange: string, cfg: YtdConfig): YtdMonth[] | null`;
  `ytdReviewV4: PartImpl<OrganicSocialCtx>`; `YtdLockedReviewSection`.

- [ ] **Step 1: Failing test in `lib/organic-social/ytd.test.ts`** (append; import `ytdLockedMonths`)

```ts
test('ytdLockedMonths: January of the year on screen through the month on screen, whole months, no comparison, never a partial month', () => {
  const cfg = { firstMonth: '2026-07', comparison: 'previous-month' as const }
  const sept = ytdLockedMonths('custom:2026-09-01,2026-09-30', 'custom:2026-08-01,2026-08-31', cfg)!
  expect(sept.map((m) => m.key)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'])
  expect(sept.every((m) => m.compareRange === null && !m.partial)).toBe(true)
  expect(sept[8].dateRange).toBe('custom:2026-09-01,2026-09-30')
  // The team's live month: the month in progress is left off.
  const live = ytdLockedMonths('custom:2026-10-01,2026-10-12', 'custom:2026-09-01,2026-09-12', cfg)!
  expect(live.map((m) => m.key).at(-1)).toBe('2026-09')
  expect(live.some((m) => m.key === '2026-10')).toBe(false)
  // The team's live January: nothing of that year has finished.
  expect(ytdLockedMonths('custom:2027-01-01,2027-01-12', 'custom:2026-12-01,2026-12-12', cfg)).toEqual([])
  // Not a month starting on the 1st: null, as ytd-review@2.
  expect(ytdLockedMonths('last_30_days', 'previous_period', cfg)).toBeNull()
})
```

- [ ] **Step 2: Run, watch it fail**

Run: `npx vitest run lib/organic-social/ytd.test.ts`
Expected: FAIL (`ytdLockedMonths` is not exported).

- [ ] **Step 3: Implement in `ytd.ts`** (after `ytdSheetMonths`)

```ts
/** ytd-review@4's months (spec 2026-10-12-os-renaissance-locked-months-design.md 4.2): ytd-review@2's months (January of
 *  the year on screen through the month on screen), without a month in progress (the 10/5 decision ytdLiveMonths
 *  keeps: a partial month reads as a drop) and with no comparison, as ytd-review@3 asks. Locking keys on the period end
 *  alone, so a comparison would only add a baseline read. null where version 2 draws nothing; [] on the team's live
 *  January, when no month of that year has finished. */
export function ytdLockedMonths(dateRange: string, compareRange: string, cfg: YtdConfig): YtdMonth[] | null {
  const months = ytdSheetMonths(dateRange, compareRange, cfg)
  return months && months.filter((m) => !m.partial).map((m) => ({ ...m, compareRange: null }))
}
```

Change the `YtdMonth` comment at `:15` to: `/** compareRange is null for ytd-review@3's and @4's months, which ask Dash with no comparison. */`

Run: `npx vitest run lib/organic-social/ytd.test.ts` → PASS.

- [ ] **Step 4: Failing part tests** (new `parts/ytd-review-locked.test.tsx`)

```tsx
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'

const { getOutlineKpis, getClientBySlug, readYtdTab, readYtdNotes } = vi.hoisted(() => ({ getOutlineKpis: vi.fn(), getClientBySlug: vi.fn(), readYtdTab: vi.fn(), readYtdNotes: vi.fn() }))
vi.mock('@/lib/organic-social/outline-headlines', async () => ({
  ...(await vi.importActual<typeof import('@/lib/organic-social/outline-headlines')>('@/lib/organic-social/outline-headlines')),
  getOutlineKpis,
}))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug }))
vi.mock('@/lib/organic-social/ytd-sheet', async () => ({
  ...(await vi.importActual<typeof import('@/lib/organic-social/ytd-sheet')>('@/lib/organic-social/ytd-sheet')),
  readYtdTab,
}))
vi.mock('./ytd-notes', async () => ({ ...(await vi.importActual<typeof import('./ytd-notes')>('./ytd-notes')), readYtdNotes }))

import { YtdLockedReviewSection, ytdReviewV4 } from './ytd-review-locked'
import { ytdReviewV1 } from './ytd-review'
import { ytdReviewV2 } from './ytd-review-sheet'
import { ytdReviewV3 } from './ytd-review-live'
import { ORGANIC_SOCIAL_PARTS } from './registry'
import { YtdSheetReadError } from '@/lib/organic-social/ytd-sheet'
import { FIXTURE_ORGANIC_SOCIAL_CTX } from './__fixtures__/organic-social-ctx'

// Made-up sheet id and numbers only. A client on locked months with firstMonth 2026-07.
const ID = 'TESTSHEETID_abcdefghij0123'
const SEPT = { dateRange: 'custom:2026-09-01,2026-09-30', compareRange: 'custom:2026-08-01,2026-08-31' }
const CTX = { ...FIXTURE_ORGANIC_SOCIAL_CTX, clientSlug: 'locked-co', channel: 'INSTAGRAM' as const, ...SEPT }
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const sheet = (col: string, f: (i: number) => string, v: (i: number) => string) => [
  ['CLIENT: Locked Co'], ['FOLLOWER GROWTH'], ['', col], ...MONTHS.map((m, i) => [m, f(i)]),
  [], ['VIEWS'], ['', col], ...MONTHS.map((m, i) => [m, v(i)]),
]
const kpis = (followers: number, views: number) => ({ noData: false, kpis: { followers: { key: 'followers', label: 'Total Followers', format: 'number', value: followers }, exposure: { key: 'exposure', label: 'Views', format: 'number', value: views } } }) as never
const RM = { firstMonth: '2026-07', clientMonths: 1 }
const client = (dsc: Record<string, unknown> = {}) => ({ id: 'c1', dashSocialConfig: { brandId: 1, reportingMonths: RM, ...dsc } })
const ENTRY = { ytdSheets: { 2026: { sheetId: ID, tab: 'Locked Co' } } }

type Chart = { name: string; data: Record<string, unknown>[] }
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
const monthsAsked = () => getOutlineKpis.mock.calls.map((c) => [c[1], c[2], c[3]])

beforeEach(() => {
  vi.restoreAllMocks()
  getOutlineKpis.mockReset(); getClientBySlug.mockReset(); readYtdTab.mockReset(); readYtdNotes.mockReset()
  readYtdNotes.mockResolvedValue(undefined)
  getClientBySlug.mockResolvedValue(client(ENTRY))
  getOutlineKpis.mockResolvedValue(kpis(1000, 100))
  vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.useRealTimers())

test('ytd-review@4 is registered unpublished; 1, 2 and 3 are the same objects as before', () => {
  expect(ORGANIC_SOCIAL_PARTS['ytd-review'][4]).toBe(ytdReviewV4)
  expect(ytdReviewV4.published).toBe(false)
  expect(ORGANIC_SOCIAL_PARTS['ytd-review'][1]).toBe(ytdReviewV1)
  expect(ORGANIC_SOCIAL_PARTS['ytd-review'][2]).toBe(ytdReviewV2)
  expect(ORGANIC_SOCIAL_PARTS['ytd-review'][3]).toBe(ytdReviewV3)
})

test('January through the month on screen; the sheet wins; every blank month from January asks Dash as a whole month with no comparison', async () => {
  // Filled January to June except March; blank from July.
  readYtdTab.mockResolvedValue(sheet('Instagram', (i) => (i < 6 && i !== 2 ? String(100 + i) : ''), (i) => (i < 6 && i !== 2 ? String(10 + i) : '')))
  const el = await YtdLockedReviewSection({ ctx: CTX })
  expect(monthsAsked()).toEqual([
    ['custom:2026-03-01,2026-03-31', null, 'INSTAGRAM'],
    ['custom:2026-07-01,2026-07-31', null, 'INSTAGRAM'],
    ['custom:2026-08-01,2026-08-31', null, 'INSTAGRAM'],
    ['custom:2026-09-01,2026-09-30', null, 'INSTAGRAM'],
  ])
  const c = charts(el)
  expect(c[0].data.map((d) => d.month)).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'])
  expect(c[0].data[0]).toEqual({ month: 'Jan', followers: 100 })
  expect(c[0].data[2]).toEqual({ month: 'Mar', followers: 1000 })
})

test("on the team's live month the graph ends at the newest finished month; no label says (live) and no range in progress is asked", async () => {
  readYtdTab.mockResolvedValue(sheet('Instagram', () => '', () => ''))
  const el = await YtdLockedReviewSection({ ctx: { ...CTX, dateRange: 'custom:2026-10-01,2026-10-12', compareRange: 'custom:2026-09-01,2026-09-12' } })
  expect(charts(el)[0].data.map((d) => d.month)).toEqual(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'])
  expect(getOutlineKpis.mock.calls.some((c) => String(c[1]).startsWith('custom:2026-10'))).toBe(false)
  expect(JSON.stringify(charts(el))).not.toContain('(live)')
})

test("the team's live January renders nothing and asks nothing", async () => {
  expect(await YtdLockedReviewSection({ ctx: { ...CTX, dateRange: 'custom:2027-01-01,2027-01-12', compareRange: 'custom:2026-12-01,2026-12-12' } })).toBeNull()
  expect(getOutlineKpis).not.toHaveBeenCalled()
  expect(readYtdTab).not.toHaveBeenCalled()
})

test('the X tab draws the block (X included)', async () => {
  readYtdTab.mockResolvedValue(sheet('X', (i) => (i < 9 ? String(500 + i) : ''), (i) => (i < 9 ? String(50 + i) : '')))
  const el = await YtdLockedReviewSection({ ctx: { ...CTX, channel: 'TWITTER' } })
  expect(charts(el)[0].data.map((d) => d.followers)).toEqual([500, 501, 502, 503, 504, 505, 506, 507, 508])
  expect(getOutlineKpis).not.toHaveBeenCalled()
})

test('Overview renders nothing and reads nothing', async () => {
  expect(await YtdLockedReviewSection({ ctx: { ...CTX, channel: null } })).toBeNull()
  expect(getClientBySlug).not.toHaveBeenCalled()
})

test('without reportingMonths (absent or malformed) it renders nothing, logs one line, and asks Dash and the sheet nothing', async () => {
  for (const dsc of [{ brandId: 1 }, { brandId: 1, reportingMonths: { firstMonth: 'bad' } }]) {
    getClientBySlug.mockResolvedValue({ id: 'c1', dashSocialConfig: dsc })
    expect(await YtdLockedReviewSection({ ctx: CTX })).toBeNull()
  }
  expect(logs()).toEqual([
    '[organic-social] ytd-review@4 skipped (no reportingMonths) slug=locked-co',
    '[organic-social] ytd-review@4 skipped (no reportingMonths) slug=locked-co',
  ])
  expect(getOutlineKpis).not.toHaveBeenCalled()
  expect(readYtdTab).not.toHaveBeenCalled()
})

test('no sheet, an invalid entry, or a year with no entry, each on X: every month from January asks Dash, and notes are still read', async () => {
  for (const ytdSheets of [undefined, { 2026: { sheetId: 'x' } }, { 2025: { sheetId: ID, tab: 'Locked Co' } }]) {
    getOutlineKpis.mockClear(); readYtdNotes.mockClear()
    getClientBySlug.mockResolvedValue(client(ytdSheets === undefined ? {} : { ytdSheets }))
    const el = await YtdLockedReviewSection({ ctx: { ...CTX, channel: 'TWITTER' } })
    expect(getOutlineKpis.mock.calls.map((c) => c[1])).toEqual(['01', '02', '03', '04', '05', '06', '07', '08', '09'].map((m) => `custom:2026-${m}-01,${m === '02' ? '2026-02-28' : ['04', '06', '09'].includes(m) ? `2026-${m}-30` : `2026-${m}-31`}`))
    expect(getOutlineKpis.mock.calls.every((c) => c[2] === null)).toBe(true)
    expect(charts(el)[0].data).toHaveLength(9)
    expect(readYtdNotes).toHaveBeenCalledTimes(1)
  }
  expect(readYtdTab).not.toHaveBeenCalled()
})

test('a sheet read failure is the error card, logged without the sheet id or tab', async () => {
  readYtdTab.mockRejectedValueOnce(new YtdSheetReadError('429'))
  const r = render(<>{await YtdLockedReviewSection({ ctx: CTX })}</>)
  expect(r.container.textContent).toContain("Couldn't load this section.")
  expect(logs()).toEqual(['[organic-social] ytd sheet read failed slug=locked-co status=429'])
  expect(getOutlineKpis).not.toHaveBeenCalled()
})

test('a slow Dash month shows the YTD timeout card and is logged as ytd-review@4', async () => {
  const { DashTimeoutError } = await import('@/lib/dash-social/client')
  getClientBySlug.mockResolvedValue(client())
  getOutlineKpis.mockRejectedValue(new DashTimeoutError())
  const text = render(<>{await YtdLockedReviewSection({ ctx: CTX })}</>).container.textContent
  expect(text).toBe('Taking longer than usual. Try again in a minute.')
  expect(logs().some((l) => l.startsWith('[organic-social] ytd-review@4 Dash request failed slug=locked-co channel=INSTAGRAM'))).toBe(true)
})

test('a missing client row logs one line, shows the error card, and asks Dash and the sheet nothing', async () => {
  getClientBySlug.mockResolvedValue(null)
  const r = render(<>{await YtdLockedReviewSection({ ctx: CTX })}</>)
  expect(r.container.textContent).toContain("Couldn't load this section.")
  expect(logs()).toEqual(['[organic-social] ytd-review@4 client row missing slug=locked-co'])
  expect(getOutlineKpis).not.toHaveBeenCalled()
})
```

In `export-layout.test.ts:20` add `'ytd-review@4'` to the list after `'ytd-review@3'`.

- [ ] **Step 5: Run, watch them fail**

Run: `npx vitest run components/report-sections/organic-social/parts/ytd-review-locked.test.tsx components/report-sections/organic-social/parts/export-layout.test.ts`
Expected: FAIL (module `./ytd-review-locked` not found; `wrapsAsBlock('ytd-review', 4)` is true).

- [ ] **Step 6: Implement the part** (new `parts/ytd-review-locked.tsx`)

```tsx
import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import { getClientBySlug } from '@/lib/db/queries'
import { getOutlineKpis } from '@/lib/organic-social/outline-headlines'
import { monthsNeedingDash, ytdConfig, ytdLockedMonths, ytdSheetSeries } from '@/lib/organic-social/ytd'
import { parseYtdGrid, readYtdTab, ytdSheetFor, YtdSheetLayoutError, YtdSheetReadError, type YtdTab } from '@/lib/organic-social/ytd-sheet'
import { mapWithConcurrency } from '@/lib/concurrency'
import { TrendSkeleton } from '../skeletons'
import { NoData } from '../no-data'
import type { OrganicSocialCtx } from '../ctx'
import { safe, Fallback, YTD_TIMEOUT_TEXT } from './shared'
import { ytdReviewBlock } from './ytd-review-sheet'
import { logYtdClientReadFailed, logYtdMonthFailed } from './ytd-failure'
import { readYtdNotes } from './ytd-notes'

const NO_SHEET: YtdTab = { followers: {}, views: {} }

/** YTD Review for a client on locked months that keeps a live client's coverage (spec
 *  2026-10-12-os-renaissance-locked-months-design.md 4.2): the sheet first, Dash for a blank cell from January of the
 *  year on screen (ytd-review@3's floor), every platform tab including X (@3's channel rule), January through the
 *  month on screen (@2's rule) but never a month in progress. Every Dash month is a whole month with no comparison, so
 *  it locks like any other read once its month has. A missing or invalid sheet is an empty sheet (@3's path). Log lines
 *  carry the slug, never the sheet id, the tab or a value. */
export async function YtdLockedReviewSection({ ctx }: { ctx: OrganicSocialCtx }) {
  const { clientSlug, channel, dateRange, compareRange } = ctx
  if (!channel) return null
  let client: Awaited<ReturnType<typeof getClientBySlug>>
  try { client = await getClientBySlug(clientSlug) } catch { logYtdClientReadFailed(4, clientSlug); return <Fallback kind="error" /> }
  if (!client) {
    console.error(`[organic-social] ytd-review@4 client row missing slug=${clientSlug}`)
    return <Fallback kind="error" />
  }
  const dsc = client.dashSocialConfig as { reportingMonths?: unknown; ytdSheets?: unknown } | null | undefined
  const cfg = ytdConfig(dsc?.reportingMonths)
  if (!cfg) {
    console.warn(`[organic-social] ytd-review@4 skipped (no reportingMonths) slug=${clientSlug}`)
    return null
  }
  const months = ytdLockedMonths(dateRange, compareRange, cfg)
  if (!months || months.length === 0) return null
  const year = months[0].key.slice(0, 4)
  const floor = `${year}-01`
  const sheet = ytdSheetFor(dsc?.ytdSheets, year)
  let tab = NO_SHEET
  if (sheet.kind === 'invalid') console.warn(`[organic-social] ytd sheet config invalid slug=${clientSlug} year=${year}; using Dash`)
  if (sheet.kind === 'ok') {
    try {
      tab = parseYtdGrid(await readYtdTab(sheet.entry.sheetId, sheet.entry.tab))
    } catch (e) {
      if (e instanceof YtdSheetLayoutError) console.error(`[organic-social] ytd sheet layout not found slug=${clientSlug} missing=${e.missing}`)
      else console.error(`[organic-social] ytd sheet read failed slug=${clientSlug} status=${e instanceof YtdSheetReadError ? e.status : 'error'}`)
      return <Fallback kind="error" />
    }
  }
  const need = monthsNeedingDash(months, tab, channel, floor)
  const r = await safe(mapWithConcurrency(need, 3, (m) => getOutlineKpis(clientSlug, m.dateRange, m.compareRange, channel).catch((e: unknown) => {
    logYtdMonthFailed(4, clientSlug, channel, m.key, e)
    throw e
  }))
    .then((all) => ytdSheetSeries(months, tab, channel, floor, Object.fromEntries(need.map((m, i) => [m.key, all[i]])))))
  if (!r.data) return <Fallback kind={r.error!} timeoutText={YTD_TIMEOUT_TEXT} />
  const s = r.data
  if (sheet.kind === 'ok') for (const g of s.missingColumn) console.warn(`[organic-social] ytd sheet column missing slug=${clientSlug} channel=${channel} graph=${g}`)
  for (const x of s.invalid) console.warn(`[organic-social] ytd sheet cell invalid slug=${clientSlug} channel=${channel} month=${x.month} graph=${x.graph}`)
  if (s.followers.points.length === 0 && s.views.points.length === 0) return <NoData />
  return ytdReviewBlock(s.followers, s.views, await readYtdNotes(client, ctx, months, s))
}

export const ytdReviewV4: PartImpl<OrganicSocialCtx> = {
  id: 'ytd-review',
  version: 4,
  published: false,
  defaultLabel: 'YTD Review',
  render: (ctx) => (
    <Suspense fallback={<TrendSkeleton />}>
      <YtdLockedReviewSection ctx={ctx} />
    </Suspense>
  ),
}
```

Registry: add `import { ytdReviewV4 } from './ytd-review-locked'` after line 8, and line 28 becomes
`'ytd-review': { 1: ytdReviewV1, 2: ytdReviewV2, 3: ytdReviewV3, 4: ytdReviewV4 },`.
`export-layout.ts`: after `'ytd-review@3': 'own',` add `'ytd-review@4': 'own',`.
`ytd-failure.ts:36, 40`: `version: 1 | 2 | 3 | 4`.

- [ ] **Step 7: Run and pass**

Run: `npx vitest run components/report-sections/organic-social/parts lib/organic-social/ytd.test.ts`
Expected: PASS, including every existing `ytd-review` test (1 to 3 unchanged).

- [ ] **Step 8: Commit and push**

```bash
git add lib/organic-social/ytd.ts lib/organic-social/ytd.test.ts components/report-sections/organic-social/parts/ytd-review-locked.tsx components/report-sections/organic-social/parts/ytd-review-locked.test.tsx components/report-sections/organic-social/parts/registry.ts components/report-sections/organic-social/parts/export-layout.ts components/report-sections/organic-social/parts/export-layout.test.ts components/report-sections/organic-social/parts/ytd-failure.ts
git commit -m "feat(organic-social): ytd-review@4 for a locked client with a live client's coverage"
git push
```

### Task 3: 4.2b the date range stops at the Organic Social boundary

**Files:**
- Create: `lib/organic-social/section-range.ts`, `lib/organic-social/section-range.test.ts`
- Modify: `lib/portal/sidebar-client.ts:8-27` (`lockedMonths`), `lib/portal/sidebar-client.test.ts:19-25`
- Modify: `components/layout/portal-sidebar.tsx:29-31` (two consts), `:75, 114, 134, 162, 196, 224, 244, 275, 296, 324, 359`
- Modify: `components/layout/sidebar.tsx` (`ClientSidebar` setup after `:348`), `:494-495, 531-532, 564-565, 586-587, 618-619, 647-648`
- Test: new `lib/organic-social/sidebar-range.test.tsx`

**Interfaces:**
- Produces: `isOrganicSocialView(pathname: string, section: string | null): boolean`;
  `carriesRange(lockedMonths: boolean, inOrganic: boolean, targetSection: string): boolean`;
  `PortalSidebarClient.lockedMonths: boolean`.

- [ ] **Step 1: Failing helper test** (new `lib/organic-social/section-range.test.ts`)

```ts
import { expect, test } from 'vitest'
import { carriesRange, isOrganicSocialView } from './section-range'

test('in Organic Social: ?section=organic-social on the reports page, or the deep-link route', () => {
  expect(isOrganicSocialView('/dashboard/c/reports', 'organic-social')).toBe(true)
  expect(isOrganicSocialView('/portal/c/reports', 'organic-social')).toBe(true)
  expect(isOrganicSocialView('/dashboard/c/reports/organic-social', null)).toBe(true)
  expect(isOrganicSocialView('/portal/c/reports/organic-social', null)).toBe(true)
  expect(isOrganicSocialView('/dashboard/c/reports', 'paid-media')).toBe(false)
  expect(isOrganicSocialView('/portal/c/reports', null)).toBe(false)
  expect(isOrganicSocialView('/portal/c/reports/peec-ai', null)).toBe(false)
  expect(isOrganicSocialView('/portal/c/team', 'organic-social')).toBe(false)
})

test('a locked client drops the range only on a link that crosses the Organic Social boundary; everyone else keeps it', () => {
  expect(carriesRange(true, true, 'paid-media')).toBe(false)
  expect(carriesRange(true, false, 'organic-social')).toBe(false)
  expect(carriesRange(true, true, 'organic-social')).toBe(true)
  expect(carriesRange(true, false, 'peec-ai')).toBe(true)
  for (const inOrganic of [true, false]) for (const t of ['organic-social', 'paid-media']) expect(carriesRange(false, inOrganic, t)).toBe(true)
})
```

Run: `npx vitest run lib/organic-social/section-range.test.ts` → FAIL (module not found).

- [ ] **Step 2: Implement `lib/organic-social/section-range.ts`**

```ts
// Spec 2026-10-12-os-renaissance-locked-months-design.md 4.2b: for a client on locked months, a sidebar link that
// crosses the Organic Social boundary in either direction carries no dateRange or compareRange, so the other section
// opens on its own default and Organic Social opens on its default month. Pure and client-safe: both sidebars import it.

/** Whether the page is Organic Social: `?section=organic-social` on the reports page, or the deep-link route. */
export function isOrganicSocialView(pathname: string, section: string | null): boolean {
  if (pathname.endsWith('/reports/organic-social')) return true
  return pathname.endsWith('/reports') && section === 'organic-social'
}

/** Whether a link to `targetSection` keeps the page's range. */
export function carriesRange(lockedMonths: boolean, inOrganic: boolean, targetSection: string): boolean {
  return !lockedMonths || inOrganic === (targetSection === 'organic-social')
}
```

Run the test → PASS.

- [ ] **Step 3: Failing mapper test** (`lib/portal/sidebar-client.test.ts`)

In the first test's expected object add `lockedMonths: false,` and rename it `'only the seven fields the sidebar reads'`. Append:

```ts
test('lockedMonths says whether the client is on locked months, and the setting itself never leaves the server', () => {
  const locked = { ...FULL, dashSocialConfig: { ...(FULL.dashSocialConfig as object), reportingMonths: { firstMonth: '2026-07', clientMonths: 1, note: 'SECRET-RM' } } } as unknown as Client
  const out = toPortalSidebarClient(locked)
  expect(out.lockedMonths).toBe(true)
  expect(JSON.stringify(out)).not.toContain('reportingMonths')
  expect(JSON.stringify(out)).not.toContain('SECRET-RM')
  expect(toPortalSidebarClient({ ...FULL, dashSocialConfig: null } as unknown as Client).lockedMonths).toBe(false)
})
```

Run: `npx vitest run lib/portal/sidebar-client.test.ts` → FAIL (no `lockedMonths`).

- [ ] **Step 4: Implement the mapper** (`lib/portal/sidebar-client.ts`)

Add to the type (after `dashSocialConfig`):
```ts
  /** Whether the client is on locked months (hasReportingMonths), for the sidebar's date-range rule (spec 4.2b). Only
   *  the boolean leaves the server, never the setting. */
  lockedMonths: boolean
```
Import `hasReportingMonths` from `@/lib/organic-social/reporting-months` and add `lockedMonths: hasReportingMonths(client),`
to the returned object. Run the test → PASS (the golden snapshots in `portal-sidebar.golden.test.tsx` must stay unchanged).

- [ ] **Step 5: Failing sidebar comparison test** (new `lib/organic-social/sidebar-range.test.tsx`)

```tsx
import { expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock('next/navigation', () => ({ usePathname: vi.fn(), useSearchParams: vi.fn() }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLinkStatus: () => ({ pending: false }),
}))
vi.mock('next/image', () => ({ default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} /> }))
vi.mock('@/app/actions/auth', () => ({ signOutAction: vi.fn() }))

import { usePathname, useSearchParams } from 'next/navigation'
import { PortalSidebar } from '@/components/layout/portal-sidebar'
import { Sidebar } from '@/components/layout/sidebar'
import { toPortalSidebarClient } from '@/lib/portal/sidebar-client'
import type { Client } from '@/lib/db/schema'

// Spec 4.2b. Every report section enabled, so every range-copying branch renders. Made-up names.
const BASE = {
  id: 'c1', slug: 'acme', name: 'Acme', logoUrl: null, users: [],
  enabledReports: ['organic-social', 'paid-media', 'peec-ai', 'ga4', 'inbound-funnel', 'executive-overview', 'request-a-report'],
  hiddenReports: [], dashSocialConfig: { brandId: 1 },
} as unknown as Client
const LOCKED = { ...BASE, dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2026-07' } } } as unknown as Client
const RANGE = 'dateRange=custom%3A2026-09-01%2C2026-09-30&compareRange=custom%3A2026-08-01%2C2026-08-31'

function at(url: string) {
  const u = new URL(url, 'https://app.example.com')
  vi.mocked(usePathname).mockReturnValue(u.pathname)
  vi.mocked(useSearchParams).mockReturnValue(u.searchParams as unknown as ReturnType<typeof useSearchParams>)
}
const links = (el: HTMLElement) => [...el.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '').filter((h) => h.includes('/reports?'))
const q = (href: string) => new URL(href, 'https://app.example.com').searchParams
const portal = (c: Client) => links(render(<PortalSidebar client={toPortalSidebarClient(c)} userRole="CLIENT_VIEWER" />).container)
const dashboard = (c: Client) => links(render(<Sidebar clients={[c]} />).container)

// The pages each sidebar can be on, as section to path (deep link included).
const PAGES = (area: 'portal' | 'dashboard') => [
  ['organic-social', `/${area}/acme/reports?section=organic-social&${RANGE}`],
  ['organic-social', `/${area}/acme/reports/organic-social?${RANGE}`],
  ['paid-media', `/${area}/acme/reports?section=paid-media&${RANGE}`],
  ['peec-ai', `/${area}/acme/reports?section=peec-ai&${RANGE}`],
  ['ga4', `/${area}/acme/reports?section=ga4&${RANGE}`],
  ['inbound-funnel', `/${area}/acme/reports?section=inbound-funnel&${RANGE}`],
  ['executive-overview', `/${area}/acme/reports?section=executive-overview&${RANGE}`],
] as const

for (const [name, draw] of [['portal', portal], ['dashboard', dashboard]] as const) {
  test(`${name} sidebar: a locked client's links drop the range exactly when they cross the Organic Social boundary; every other link is as for a client without locked months`, () => {
    const sectionsSeen = new Set<string>()
    for (const [pageSection, url] of PAGES(name)) {
      at(url)
      const control = draw(BASE)
      at(url)
      const locked = draw(LOCKED)
      expect(locked).toHaveLength(control.length)
      locked.forEach((href, i) => {
        const target = q(href).get('section') ?? ''
        sectionsSeen.add(target)
        const crosses = (pageSection === 'organic-social') !== (target === 'organic-social')
        if (crosses) {
          expect(q(href).get('dateRange'), `${url} -> ${href}`).toBeNull()
          expect(q(href).get('compareRange'), `${url} -> ${href}`).toBeNull()
          // Only the range goes: the rest of the link is the control's.
          const c = q(control[i]); c.delete('dateRange'); c.delete('compareRange')
          const l = q(href); l.delete('dateRange'); l.delete('compareRange')
          expect(l.toString()).toBe(c.toString())
        } else {
          expect(href, `${url}`).toBe(control[i])
        }
      })
    }
    expect([...sectionsSeen].sort()).toEqual(['executive-overview', 'ga4', 'inbound-funnel', 'organic-social', 'paid-media', 'peec-ai', 'request-a-report'].filter((s) => name === 'portal' || s !== 'request-a-report').sort())
  })

  test(`${name} sidebar: Organic Social's own tab links keep the range for a locked client`, () => {
    at(`/${name}/acme/reports?section=organic-social&${RANGE}`)
    const os = draw(LOCKED).filter((h) => q(h).get('section') === 'organic-social')
    expect(os.length).toBeGreaterThan(1)
    for (const h of os) expect(q(h).get('dateRange')).toBe('custom:2026-09-01,2026-09-30')
  })
}
```

Run: `npx vitest run lib/organic-social/sidebar-range.test.tsx`
Expected: FAIL (crossing links still carry the range). If the `sectionsSeen` line fails on which sections a sidebar
renders (for example the dashboard sidebar never renders `request-a-report`), correct that expected list from the
control render, record a ruling, and keep every other assertion.

- [ ] **Step 6: Implement in `portal-sidebar.tsx`**

Import `carriesRange, isOrganicSocialView` from `@/lib/organic-social/section-range`. After line 32 (`isOnReports`) add:

```ts
  // Spec 4.2b: for a client on locked months the range stops at the Organic Social boundary.
  const inOrganic = isOrganicSocialView(pathname, activeSection)
  const carry = (p: URLSearchParams, target: string) => { if (dateRange && carriesRange(client.lockedMonths, inOrganic, target)) p.set('dateRange', dateRange) }
```

Replace each copy (line numbers before the edit):
`:75` `carry(linkParams, slug)`; `:114` `carry(ifBaseParams, 'inbound-funnel')`; `:134` `carry(subParams, 'inbound-funnel')`;
`:162` `carry(aeoBaseParams, 'peec-ai')`; `:196` `carry(subParams, 'peec-ai')`; `:224` `carry(pmBaseParams, 'paid-media')`;
`:244` `carry(subParams, 'paid-media')`; `:275` `carry(osBaseParams, 'organic-social')`; `:296` `carry(subParams, 'organic-social')`;
`:324` `carry(ga4BaseParams, 'ga4')`; `:359` `carry(subParams, 'ga4')`.

- [ ] **Step 7: Implement in `sidebar.tsx`**

Import `hasReportingMonths` from `@/lib/organic-social/reporting-months` and `carriesRange, isOrganicSocialView` from
`@/lib/organic-social/section-range`. After `const isOnReports = ...` (`:348`) add:

```ts
  // Spec 4.2b: for a client on locked months the range stops at the Organic Social boundary.
  const lockedMonths = hasReportingMonths(client)
  const inOrganic = isOrganicSocialView(pathname, activeSection)
  const carry = (p: URLSearchParams, target: string) => {
    if (!carriesRange(lockedMonths, inOrganic, target)) return
    if (dateRange) p.set('dateRange', dateRange)
    if (compareRange) p.set('compareRange', compareRange)
  }
```

Replace each pair of `if (dateRange) X.set(...)` / `if (compareRange) X.set(...)` lines with one call:
`:494-495` `carry(aeoBaseParams, 'peec-ai')`; `:531-532` `carry(subParams, 'peec-ai')`; `:564-565` `carry(pmBaseParams, 'paid-media')`;
`:586-587` `carry(subParams, 'paid-media')`; `:618-619` `carry(osBaseParams, 'organic-social')`; `:647-648` `carry(subParams, 'organic-social')`.

- [ ] **Step 8: Run and pass**

Run: `npx vitest run lib/organic-social/section-range.test.ts lib/organic-social/sidebar-range.test.tsx lib/portal`
Expected: PASS; `portal-sidebar.golden.test.tsx` snapshots unchanged (no `-u`).

- [ ] **Step 9: Commit and push**

```bash
git add lib/organic-social/section-range.ts lib/organic-social/section-range.test.ts lib/organic-social/sidebar-range.test.tsx lib/portal/sidebar-client.ts lib/portal/sidebar-client.test.ts components/layout/portal-sidebar.tsx components/layout/sidebar.tsx
git commit -m "feat(organic-social): a locked client's date range stops at the Organic Social boundary in both sidebars"
git push
```

### Task 4: Renaissance settings proof

**Files:**
- Create: `lib/organic-social/renaissance-locked-settings.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { expect, test } from 'vitest'
import { resolveSection } from '@/lib/report-sections/resolve'
import { validateSectionOverride } from '@/lib/report-sections/mutations'
import { REGISTRIES } from '@/lib/report-sections/registries'
import { SHARED_PARTS } from '@/components/report-sections/shared/parts/registry'
import type { PartRegistry, SectionOverride, SectionTemplate } from '@/lib/report-sections/types'
import { clockFor, hasReportingMonths, resolveLockedRange } from './reporting-months'

// Renaissance's production rows, verbatim (read-only probe, 2026-10-12): its organic-social:platform override and the
// organic-social:platform section_templates row. Neither holds an id or a secret.
const PROD_OVERRIDE: SectionOverride = { order: ['ytd-review', 'platform-headlines', 'follower-graph', 'engagement-trend', 'top-content'], versions: { 'follower-graph': 2, 'engagement-trend': 2 }, extraParts: [{ id: 'ytd-review', version: 3 }] }
const PROD_TEMPLATE: SectionTemplate = { order: [{ id: 'platform-headlines', version: 1 }, { id: 'follower-graph', version: 1 }, { id: 'engagement-trend', version: 1 }, { id: 'top-content', version: 2 }], labels: {}, thresholds: {} }
// The switch (spec 4.1): the YTD pin moves to @4 and reportingMonths is added. Nothing else changes.
const AFTER: SectionOverride = { ...PROD_OVERRIDE, extraParts: [{ id: 'ytd-review', version: 4 }] }
const RM = { firstMonth: '2026-07', clientMonths: 1 }
const pins = (o: SectionOverride) => resolveSection(PROD_TEMPLATE, o).map((r) => `${r.id}@${r.version}`)

test('the production override resolves to @3 today and to @4 after the switch, nothing else moving', () => {
  expect(pins(PROD_OVERRIDE)).toEqual(['ytd-review@3', 'platform-headlines@1', 'follower-graph@2', 'engagement-trend@2', 'top-content@2'])
  expect(pins(AFTER)).toEqual(['ytd-review@4', 'platform-headlines@1', 'follower-graph@2', 'engagement-trend@2', 'top-content@2'])
})

test('the swap only works because the override has no versions pin for ytd-review (resolve.ts:43-45)', () => {
  expect(PROD_OVERRIDE.versions).not.toHaveProperty('ytd-review')
  expect(pins({ ...AFTER, versions: { ...AFTER.versions, 'ytd-review': 3 } })[0]).toBe('ytd-review@3')
})

test('the switched override passes validateSectionOverride', () => {
  expect(() => validateSectionOverride('organic-social:platform', AFTER, REGISTRIES, PROD_TEMPLATE.order.map((p) => p.id), SHARED_PARTS as unknown as PartRegistry<unknown>)).not.toThrow()
})

test('with reportingMonths the month picker serves the expected months on 2026-10-13', () => {
  const clock = clockFor(new Date('2026-10-13T15:00:00Z'))
  expect(hasReportingMonths({ dashSocialConfig: { brandId: 1, reportingMonths: RM } })).toBe(true)
  expect(resolveLockedRange(RM, 'team', clock, undefined).months.map((m) => m.key)).toEqual(['2026-10', '2026-09', '2026-08', '2026-07'])
  expect(resolveLockedRange(RM, 'client', clock, undefined).months.map((m) => m.key)).toEqual(['2026-09'])
})
```

- [ ] **Step 2: Run**

Run: `npx vitest run lib/organic-social/renaissance-locked-settings.test.ts`
Expected: PASS (it depends on Task 2's `@4` being registered; run after Task 2). If the type import names differ
(`SectionOverride`, `SectionTemplate`, `PartRegistry` in `lib/report-sections/types.ts`), use the names that file
exports and record a ruling.

- [ ] **Step 3: Commit and push**

```bash
git add lib/organic-social/renaissance-locked-settings.test.ts
git commit -m "test(organic-social): Renaissance's production override resolves to ytd-review@4 after the switch"
git push
```

### Task 5: CLAUDE.md entry, full check, merge safety

- [ ] **Step 1: Close the CLAUDE.md entry** (`CLAUDE.md:969-975`, the `settledThrough` item): change `- [ ]` to `- [x]`
  and prefix the text with `**RESOLVED (feat/os-renaissance-locked-months):** a request ending before the 1st of
  firstMonth now reads live and is never stored (lockedFrom, locking-client.ts), and the unreachable final return is
  null (lock-day.ts).` Keep the original text after it.

- [ ] **Step 2: Full check exactly as CI**

```bash
rm -rf .next
DATABASE_URL=postgresql://ci:ci@db.invalid/ci make check
```
Expected: typecheck clean, every test passes, RSC check passes, build succeeds.

- [ ] **Step 3: Merge safety with #374**

```bash
git fetch origin
git merge-tree --write-tree origin/dev HEAD origin/chore/remove-unused-api-routes
git merge-tree --write-tree origin/dev origin/chore/remove-unused-api-routes HEAD
```
Expected: both print a tree id and no `CONFLICT` line.

- [ ] **Step 4: Commit the plan and CLAUDE.md, push**

```bash
git add CLAUDE.md docs/superpowers/plans/2026-10-13-os-renaissance-locked-months.md
git commit -m "docs: close the settledThrough follow-up; locked months plan for Renaissance"
git push
```

Then: final whole-branch review (fresh reviewer, opus), local walkthrough on the dev database with a locked test client
if one exists (no writes), PR to `dev` titled "feat(organic-social): Renaissance on locked months, code → dev", Paul's
code review. Staging and production settings writes are separate steps under spec section 8 and need Thomas's go and
written consent.
