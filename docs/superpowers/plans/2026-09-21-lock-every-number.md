# Lock Every Number Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. No subagents and no background commands (standing rule, 2026-09-21).

**Goal:** For clients on locked months, every Organic Social number of a finished month (tiles, both graphs, the engagement breakdown, Top Content, and later YTD and annotations) stops changing on the team's wrap day, the 5th of the next month (the Friday before when the 5th is a weekend), and never moves again. Renaissance, and every client without `reportingMonths`, is untouched.

**Architecture (approach A, D28):** one lock at the single point every Organic Social number passes through: the Dash client `dashClientFor` hands out. For an opted-in client it returns a locking wrapper. A read whose every date falls on or before the last locked day is served from a new table, `dash_response_locks`, keyed by the client and a hash of the exact request. The first such read after the lock day fetches Dash once, stores the successful answer, and every later read returns that stored answer. Reads that touch any unlocked day (the live month, or a finished month before its lock day) go to Dash as today. Three rules keep a locked page consistent: an incomplete Dash answer is never stored; a lockable read never falls back to live numbers (a lock-table failure shows the section's error card instead); and a month's compare value is the prior month's LOCKED value whenever both are locked. A lock sweep in the hourly cache warmer renders every Organic Social tab of the two most recently locked months, so every number on a page is captured in the same run on the lock day. Top Content for these clients skips its older freeze table, so it locks on the same day as everything else.

**Where this lives (2026-09-22):** this plan is built on PR 256 itself (`feat/os-locked-months`), not on a separate stacked PR. Every PR in the October set must stand alone and merge in any order, and this work builds on 256's `reporting-months.ts` and `locked-range.ts`, so it belongs in 256. Draft PR #258, which stacked it on 256, is closed.

**Tech Stack:** Next.js 16 (RSC), React 19 `cache`, Drizzle ORM on Neon Postgres (one new table, one migration), Vitest 3.

## Sources (the premise; the reviewer checks the plan against these)

- **D27 (recorded 2026-09-21; its basis is Jasmine's own deck-creation answer quoted inside it, see Decision 0):** "a finished month's numbers (tiles, graphs, breakdown, Top Content, and later YTD and annotations) lock on the team's wrap day, the 5th of the following month, or the Friday before when the 5th is a weekend (SOP: 'target date the 5th ... so the team has time to review and QA prior to sending to the client on the 12th. If the 5th lands on the weekend it should default to the day before going into the weekend'). From month end to the lock day the team sees the finished month still updating. Per-client setting, default the 5th; Top Content moves to the same day so every number on a page matches. The lock day can never fall after the day the month opens to clients."
- **D28:** approach A, one lock at the Dash client from `dashClientFor`, for clients with the locked-months setting only; Renaissance gets today's client.
- **D7 / DFA Confirm 5 (Jasmine, approved 2026-09-21):** "Numbers lock when a month ends and never move again." D20: everything a client sees must lock before any client sees a month.
- **How D27 refines D7 (stated, not hidden):** between month end and the lock day only the team can see the month (clients see it from the 12th, locked months spec 3.4), so no client ever sees a number move; the team's wrap and QA window is the SOP's. Every client-visible number is locked before the client can see it, because the lock day is clamped to on or before the opening day.
- Defaults decided with D27: only successful Dash answers are stored; the live month never locks; there is no unlock button (filed as a follow-up).
- Standing rules: Renaissance untouched (stored config and rendered output), client agnostic (config, never a slug), zero conflicts with every open PR in any order, Dash GET only, staging-only database writes with my go.

## Before (pre-change snapshot, at base `97dce1e`, `feat/os-locked-months`)

- `lib/organic-social/base.ts:22-32` `dashClientFor(slug)` (React `cache`) returns `{ client: new DashSocialClient({ token }), brandId, channels }` for every client.
- Every Organic Social number reaches Dash only through that client: `headlines.ts:29`, `followers.ts:32`, `trends.ts:31`, `top-content.ts:147`/`:172`, and on PR 255 `outline-headlines.ts:71` (and plan 1's `outline-media.ts`). Verify at build time with `grep -rn "dashClientFor" lib components` that no other caller reaches Dash.
- `lib/organic-social/frozen.ts:48-86` `fetchTopContentFrozen` freezes Top Content in `top_content_snapshots` once a window reads closed (`isPeriodOpen`, UTC day after its end plus one), independent of any client setting.
- `lib/dash-social/client.ts` `DashSocialClient` has `getReportsData` (GET), `getContent` (GET), `getMedia` (PUT, unused outside the class).
- `lib/db/schema.ts:382-399` `topContentSnapshots` is the only snapshot table; migrations live in `drizzle/` (latest `0023_*`) and are applied manually (`npm run db:migrate`, the `db-migrate.yml` workflow is `workflow_dispatch` only).
- `lib/organic-social/reporting-months.ts` (PR 256) owns `reportingMonths` parsing, `opensOn` and `clockFor`; `lib/organic-social/locked-range.ts` owns `requestClock`.

## Global Constraints

- Renaissance (no `reportingMonths` key) gets exactly today's `DashSocialClient` instance from `dashClientFor` and today's Top Content path. Task 0 pins both before any change.
- Never edit: `lib/organic-social/reporting-months.ts`, `locked-range.ts` (PR 256's), `lib/dash-social/client.ts`, `lib/dash-social/types.ts`, the Organic Social getters, `lib/constants.ts`, `components/**`.
- `lib/db/schema.ts`: this branch never edits the tables; the `dashResponseLocks` table and its type arrive only through the October schema commit (Task 2), which places them by text, not line number: the table directly after the `topContentSnapshots` table definition, the type directly after `export type NewTopContentSnapshot`. PR 247 edits `DashSocialConfig` (line 135) and PR 256 edits `DashSocialConfig` (lines 140-142), well clear of both.
- The lock day is its own knob, `reportingMonths.lockDay`, parsed in the new `lock-day.ts` (not in PR 256's parser): integer 4 to 28, default 5. A malformed value falls back to 5 and is logged by slug and key (the lock timing is a safety default, not a visibility rule).
- Lock day of month M: day `lockDay` of month M+1, moved to the Friday before when it is a Saturday or Sunday, then clamped to on or before `opensOn(M)`.
- "Today" is the New York date from PR 256's `requestClock()`; a month's numbers lock from New York midnight on its lock day.
- Only the two GET reads lock; `getMedia` passes through untouched.
- Fail closed: for a lockable read, a lock-table read or write failure is thrown (the part shows its error card); it never falls back to live numbers. An incomplete answer (not the shape its reader needs) is served as is and NOT stored, so the next read retries the capture.
- `app/api/cache-warm/route.ts` gains only the lock sweep's URLs (one import, one loop); no open PR edits it.
- Logs carry the slug, the period end and the first 12 characters of the request key only; never the response, the brand id or the config.
- No em or en dashes in added lines. Tests first. Every commit ends with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Decisions (2026-09-22: each settled from the outlines, the decks, Jasmine's past answers or Renaissance; none needs a new question)

0. **The lock day is the 5th of the next month (the Friday before when the 5th is a weekend).** Evidence: Jasmine's own words on the deck-creation Q&A, "Lets make the target date the 5th of every month so the team has time to review and QA prior to sending to the client on the 12th. If the 5th lands on the weekend it should default to the day before going into the weekend." Her DFA Confirm 5 ("Numbers lock when a month ends and never move again", YES) still holds for everything a client can see: clients see a month from the 12th (Confirm 4), after the lock, so no client ever sees a number move. Locking on the 1st instead would freeze numbers that are still growing and would not match the decks the team QAs by the 5th (re-check 2026-09-22: the dashboard is 0 to 9% above decks cut around Sep 5).

1. **Past months lock with the data of the day this ships.** August (and September, if its lock day has passed when this ships) has no record of what Dash said on its lock day. Technical: Jasmine asked for August and September for every platform (DFA Q5), and Dash is the source she named ("All data should be retrieved from Dash Social"), so August reads a few percent above the August decks. The lock sweep captures the two most recently locked months, every tab, in the first warmer run after deploy, so each month is captured in one run; each capture after its lock day logs a "late lock" warning. Older months are captured on first view, also warned.
2. **A request is locked as a whole** (technical). Dash answers the requested window plus its compare window in one response, so a request is lockable only when ALL its dates are locked days. The live month (and a finished month before its lock day) never locks.
3. **The compare baseline is the prior month's locked value** when both months are locked (evidence: the team compares against what it reported before, not what Dash says today: APFM's August deck, "August's 109,793 views remained well above June's 60,680", where 60,680 is the June number the team reported, while Dash now returns 88,966 for June, DFA Q3) (applied when the answer is read, so capture order never matters): September's "vs August" uses August's locked number, so a client dividing the two locked reports gets the arrow shown. When the prior month is not locked (the first reporting month's July, or previous-year comparisons before a year of history), Dash's own compare value is used.
4. **A changed request after the lock day is captured when first made** (technical) and warned as late. So the whole October set (247, 255, the outline fixes and this) ships together, before the first lock day it is meant to cover; if it lands on staging after Oct 5, the three clients' September locks on staging are cleared once with my go (the documented unlock below) and the sweep recaptures them the same hour, before any client could see September on Oct 12.
5. **Top Content for these clients stops using `top_content_snapshots`** (technical), so it locks on the lock day like every other number (D27). Their existing rows in that table were written by internal testing on staging (the three clients exist only on staging, and none has a client user, handoff item 16), so no reported number changes. The outline-fixes plan's "re-freeze" rollout step becomes unnecessary once this ships.

## File Structure

| File | Responsibility |
|---|---|
| `lib/organic-social/lock-day.ts` (new) | Pure: `parseLockDay`, `lockOn`, `settledThrough`, `requestPeriodEnd`, `requestKey`, `isLateLock`, `priorParams` |
| `lib/db/schema.ts`, `drizzle/0024_*.sql`, `drizzle/meta/*`, `MIGRATIONS-PENDING.md` | the October schema commit (Task 2): both new tables and ONE migration, the same commit object merged into this branch and into PR 252 |
| `lib/organic-social/response-lock-store.ts` (new) | `readLock`, `writeLock` (insert on conflict do nothing, then the winner) |
| `lib/organic-social/locking-client.ts` (new) | `lockingClient(inner, opts, deps)`: the wrapper |
| `lib/organic-social/base.ts` | `dashClientFor` wraps the client for opted-in clients |
| `lib/organic-social/frozen.ts` | Top Content skips `top_content_snapshots` for opted-in clients |
| `lib/organic-social/lock-sweep.ts` (new) | Pure: `lockSweepUrls(baseUrl, client, today)` |
| `app/api/cache-warm/route.ts` | adds the lock sweep's URLs |
| tests beside each | |

---

### Task 0: Pre-change snapshots

**Files:** Test `lib/organic-social/lock-parity.test.ts` (new)

- [ ] **Step 1: Write the characterisation test** (passes on today's code; must not move):

```ts
import { expect, test, vi } from 'vitest'
const { getClientBySlug } = vi.hoisted(() => ({ getClientBySlug: vi.fn() }))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug }))
import { dashClientFor } from './base'
import { DashSocialClient } from '@/lib/dash-social/client'

// Pre-change record for lock every number: a client without reportingMonths gets a plain
// DashSocialClient and the same brand and channels as today.
test('a client without reportingMonths gets a plain DashSocialClient', async () => {
  process.env.DASH_API_TOKEN = 'test-token'
  getClientBySlug.mockResolvedValue({ id: 'c1', slug: 'r', dashSocialConfig: { brandId: 7, channels: ['instagram'] } })
  const r = await dashClientFor('r')
  expect(r.client).toBeInstanceOf(DashSocialClient)
  expect(Object.getPrototypeOf(r.client)).toBe(DashSocialClient.prototype)
  expect({ brandId: r.brandId, channels: r.channels }).toEqual({ brandId: 7, channels: ['INSTAGRAM'] })
})
```

Also run the existing Top Content freeze tests unchanged: `npx vitest run lib/organic-social/frozen.test.ts lib/organic-social/lock-parity.test.ts` (PASS; they are the record of today's Top Content path).

- [ ] **Step 2: Commit** `test(organic-social): pre-change snapshot for lock every number`.

### Task 1: The lock rules (pure)

**Files:** Create `lib/organic-social/lock-day.ts`; Test `lib/organic-social/lock-day.test.ts`

**Interfaces produced:** `priorParams(params: Record<string, unknown>): Record<string, unknown> | null`; `parseLockDay(rm: unknown): { lockDay: number; bad: boolean }`; `lockOn(key: string, lockDay: number, opensOnDate: string): string`; `settledThrough(cfgValue: unknown, today: string): string | null` (the last locked day, or null when nothing can lock: malformed `reportingMonths`); `requestPeriodEnd(params: Record<string, unknown>): string | null`; `requestKey(method: string, params: Record<string, unknown>): string`; `isLateLock(periodEnd: string, cfgValue: unknown, today: string): boolean`.

- [ ] **Step 1: Failing tests**:

```ts
import { expect, test } from 'vitest'
import { isLateLock, lockOn, parseLockDay, priorParams, requestKey, requestPeriodEnd, settledThrough } from './lock-day'
import { opensOn } from './reporting-months'

const CFG = { firstMonth: '2026-08' }

test('lock day: the 5th, the Friday before a weekend, never after the opening day', () => {
  // Sep 5 2026 is a Saturday, Oct 5 a Monday, Dec 5 a Saturday.
  expect(lockOn('2026-08', 5, opensOn('2026-08', 12, 'next-monday'))).toBe('2026-09-04')
  expect(lockOn('2026-09', 5, opensOn('2026-09', 12, 'next-monday'))).toBe('2026-10-05')
  expect(lockOn('2026-11', 5, opensOn('2026-11', 12, 'next-monday'))).toBe('2026-12-04')
  // A lock day later than the opening day is clamped to the opening day.
  expect(lockOn('2026-09', 12, '2026-10-09')).toBe('2026-10-09')
})
test('lock day is never after the opening day, for every month 2026 to 2030 and every valid pair', () => {
  for (let y = 2026; y <= 2030; y++) for (let m = 1; m <= 12; m++) {
    const key = `${y}-${String(m).padStart(2, '0')}`
    for (let open = 4; open <= 28; open++) for (const rule of ['next-monday', 'previous-friday'] as const) for (let lock = 4; lock <= 28; lock++) {
      const o = opensOn(key, open, rule)
      const l = lockOn(key, lock, o)
      expect(l <= o).toBe(true)
      expect(l > `${key}-31`).toBe(true) // always after the month ends
    }
  }
})
test('lockDay knob: default 5, integers 4 to 28, anything else is bad and falls back to 5', () => {
  expect(parseLockDay(CFG)).toEqual({ lockDay: 5, bad: false })
  expect(parseLockDay({ ...CFG, lockDay: 7 })).toEqual({ lockDay: 7, bad: false })
  for (const v of [3, 29, 4.5, '5', null]) expect(parseLockDay({ ...CFG, lockDay: v })).toEqual({ lockDay: 5, bad: true })
})
test('the last locked day moves on each lock day, in New York dates', () => {
  expect(settledThrough(CFG, '2026-10-04')).toBe('2026-08-31') // September locks on Oct 5
  expect(settledThrough(CFG, '2026-10-05')).toBe('2026-09-30')
  expect(settledThrough(CFG, '2026-09-04')).toBe('2026-08-31')
  expect(settledThrough(CFG, '2026-09-03')).toBe('2026-07-31')
  expect(settledThrough(null, '2026-10-05')).toBeNull()
  expect(settledThrough({}, '2026-10-05')).toBeNull()
})
test('a request ends on its latest date, including the compare window; no endDate or any impossible date means not lockable', () => {
  expect(requestPeriodEnd({ startDate: '2026-09-01T04:00:00Z', endDate: '2026-09-30T04:00:00Z', contextStartDate: '2026-08-01T04:00:00Z', contextEndDate: '2026-08-31T04:00:00Z' })).toBe('2026-09-30')
  expect(requestPeriodEnd({ startDate: '2026-09-01', endDate: '2026-09-30' })).toBe('2026-09-30')
  for (const p of [{ startDate: 'junk', endDate: '2026-09-30' }, { startDate: '2026-02-30', endDate: '2026-09-30' }, { startDate: '2026-09-01', endDate: '2026-09-99' }, { startDate: '2026-09-01' }, { brandId: 1 }]) {
    expect(requestPeriodEnd(p)).toBeNull()
  }
})
test('the prior request is the same request one comparison step back, for whole-month compare windows only', () => {
  const base = { brandId: 1, metrics: ['A'], reportType: 'TOTAL_GROUPED_METRIC' }
  expect(priorParams({ ...base, startDate: '2026-09-01T04:00:00Z', endDate: '2026-09-30T04:00:00Z', contextStartDate: '2026-08-01T04:00:00Z', contextEndDate: '2026-08-31T04:00:00Z' }))
    .toEqual({ ...base, startDate: '2026-08-01T04:00:00Z', endDate: '2026-08-31T04:00:00Z', contextStartDate: '2026-07-01T04:00:00Z', contextEndDate: '2026-07-31T04:00:00Z' })
  expect(priorParams({ ...base, startDate: '2026-09-01T04:00:00Z', endDate: '2026-09-30T04:00:00Z', contextStartDate: '2025-09-01T04:00:00Z', contextEndDate: '2025-09-30T04:00:00Z' }))
    .toMatchObject({ startDate: '2025-09-01T04:00:00Z', contextStartDate: '2024-09-01T04:00:00Z', contextEndDate: '2024-09-30T04:00:00Z' })
  expect(priorParams({ ...base, startDate: '2026-10-01T04:00:00Z', endDate: '2026-10-19T04:00:00Z', contextStartDate: '2026-09-01T04:00:00Z', contextEndDate: '2026-09-19T04:00:00Z' })).toBeNull()
  expect(priorParams({ ...base, startDate: '2026-09-01', endDate: '2026-09-30' })).toBeNull()
})
test('the request key ignores parameter order and undefined values, and changes with any real difference', () => {
  const a = requestKey('getReportsData', { brandId: 1, metrics: ['A', 'B'], startDate: 's', endDate: 'e', limit: undefined })
  expect(requestKey('getReportsData', { endDate: 'e', startDate: 's', metrics: ['A', 'B'], brandId: 1 })).toBe(a)
  expect(requestKey('getReportsData', { brandId: 1, metrics: ['A', 'C'], startDate: 's', endDate: 'e' })).not.toBe(a)
  expect(requestKey('getContent', { brandId: 1, metrics: ['A', 'B'], startDate: 's', endDate: 'e' })).not.toBe(a)
  expect(a).toMatch(/^[0-9a-f]{64}$/)
})
test("a late lock: captured after its month's lock day (the sweep captures on the day itself)", () => {
  expect(isLateLock('2026-09-30', CFG, '2026-10-05')).toBe(false)
  expect(isLateLock('2026-09-30', CFG, '2026-10-06')).toBe(true)
  expect(isLateLock('2026-08-31', CFG, '2026-10-05')).toBe(true)
})
```

- [ ] **Step 2: Run, see FAIL** (module missing).
- [ ] **Step 3: Implement** `lib/organic-social/lock-day.ts`:

```ts
// Lock every number (D27): when a finished month's Dash answers stop changing. Pure.
import { createHash } from 'node:crypto'
import { opensOn, parseReportingMonths, firstOf, lastOf, monthOf } from './reporting-months'

const DAY = /^\d{4}-\d{2}-\d{2}$/
const iso = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (day: string, n: number) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d) }
const nextMonth = (key: string) => monthOf(addDays(lastOf(key), 1))
const prevMonth = (key: string) => monthOf(addDays(firstOf(key), -1))

/** reportingMonths.lockDay: default 5 (the SOP's wrap day); integers 4 to 28. */
export function parseLockDay(rm: unknown): { lockDay: number; bad: boolean } {
  const has = typeof rm === 'object' && rm !== null && Object.prototype.hasOwnProperty.call(rm, 'lockDay')
  if (!has) return { lockDay: 5, bad: false }
  const v = (rm as { lockDay: unknown }).lockDay
  return typeof v === 'number' && Number.isInteger(v) && v >= 4 && v <= 28 ? { lockDay: v, bad: false } : { lockDay: 5, bad: true }
}

/** Day `lockDay` of the month after `key`, the Friday before a weekend, never after the opening day. */
export function lockOn(key: string, lockDay: number, opensOnDate: string): string {
  let day = `${nextMonth(key)}-${String(lockDay).padStart(2, '0')}`
  const wd = new Date(`${day}T00:00:00Z`).getUTCDay()
  if (wd === 6) day = addDays(day, -1)
  if (wd === 0) day = addDays(day, -2)
  return day <= opensOnDate ? day : opensOnDate
}

/** The last day whose numbers are locked on `today` (New York date), or null when the
 *  reportingMonths config is malformed (then nothing locks). At most two months are checked: the
 *  month before last always locked, since a lock day is at most the 28th. */
export function settledThrough(cfgValue: unknown, today: string): string | null {
  const parsed = parseReportingMonths(cfgValue)
  if (!parsed.ok) return null
  const { lockDay } = parseLockDay(cfgValue)
  let key = prevMonth(monthOf(today))
  for (let i = 0; i < 2; i++, key = prevMonth(key)) {
    if (today >= lockOn(key, lockDay, opensOn(key, parsed.cfg.opensOnDay, parsed.cfg.weekendRule))) return lastOf(key)
  }
  return lastOf(key)
}

const DATE_KEYS = ['startDate', 'endDate', 'contextStartDate', 'contextEndDate'] as const
const isDay = (d: string) => { if (!DAY.test(d)) return false; const t = new Date(`${d}T00:00:00Z`); return !Number.isNaN(t.getTime()) && iso(t) === d }
const shiftMonths = (key: string, n: number) => {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(Date.UTC(2000, 0, 1)); d.setUTCFullYear(y, m - 1 + n, 1)
  return `${String(d.getUTCFullYear()).padStart(4, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
const monthsBetween = (from: string, to: string) => {
  const [fy, fm] = from.split('-').map(Number); const [ty, tm] = to.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm)
}

/** The latest day a request asks about, or null when it has no endDate or any date is impossible. */
export function requestPeriodEnd(params: Record<string, unknown>): string | null {
  if (params.endDate === undefined || params.endDate === null) return null
  const days: string[] = []
  for (const k of DATE_KEYS) {
    const v = params[k]
    if (v === undefined || v === null) continue
    const d = String(v).slice(0, 10)
    if (!isDay(d)) return null
    days.push(d)
  }
  return days.sort()[days.length - 1]
}

/** The same request one comparison step earlier (1 month, or 12 for previous-year), for the locked
 *  compare baseline. Null unless the compare window is one whole month. Time suffixes are kept. */
export function priorParams(params: Record<string, unknown>): Record<string, unknown> | null {
  const { startDate: s, contextStartDate: cs, contextEndDate: ce } = params
  if (typeof s !== 'string' || typeof cs !== 'string' || typeof ce !== 'string') return null
  const cs10 = cs.slice(0, 10), ce10 = ce.slice(0, 10)
  if (!isDay(cs10) || !isDay(ce10) || !isDay(s.slice(0, 10))) return null
  const ck = monthOf(cs10)
  if (cs10 !== firstOf(ck) || ce10 !== lastOf(ck)) return null
  const step = monthsBetween(ck, monthOf(s.slice(0, 10)))
  if (step !== 1 && step !== 12) return null
  const pk = shiftMonths(ck, -step)
  return { ...params, startDate: cs, endDate: ce, contextStartDate: firstOf(pk) + cs.slice(10), contextEndDate: lastOf(pk) + ce.slice(10) }
}

/** A stable hash of the exact request: method plus parameters, sorted, without undefined values. */
export function requestKey(method: string, params: Record<string, unknown>): string {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
  return createHash('sha256').update(JSON.stringify({ method, params: clean })).digest('hex')
}

/** A lock captured after its month's lock day (the numbers were captured late). */
export function isLateLock(periodEnd: string, cfgValue: unknown, today: string): boolean {
  const parsed = parseReportingMonths(cfgValue)
  if (!parsed.ok) return false
  const key = monthOf(periodEnd)
  const lock = lockOn(key, parseLockDay(cfgValue).lockDay, opensOn(key, parsed.cfg.opensOnDay, parsed.cfg.weekendRule))
  return today > lock
}
```

(`firstOf`, `lastOf`, `monthOf` and `opensOn` are exported by PR 256's `reporting-months.ts`; `parseReportingMonths` too.)
- [ ] **Step 4: Run PASS.** Step 5: **Commit** `feat(organic-social): lock day rules (pure)`.

### Task 2: The October schema commit, then the store

**Files:** Create `lib/organic-social/response-lock-store.ts`; Test `lib/organic-social/response-lock-store.test.ts`.

**Step 0: the October schema commit first.** Follow the appendix at the end of this file ("the October schema commit"), steps 1 to 9, exactly. It adds this plan's `dash_response_locks` table (and PR 252's hides table) in one migration, merged into this branch with `git merge --no-ff`. Everything it needs is in that appendix; nothing is read from another PR's branch. If PR 252's build already made the commit, merge that same commit instead of making a new one (appendix step 8).

- [ ] **Step 1: Failing test** (mock `@/lib/db/client` with a fake `db` whose `select().from().where().limit()` and `insert().values().onConflictDoNothing().returning()` chains are `vi.fn`s): `readLock` returns `{ response }` for a row and `null` for none; `writeLock` returns the inserted response; when the insert returns no row (a concurrent writer won), `writeLock` reads and returns the stored winner.
- [ ] **Step 2: Run, see FAIL.**
- [ ] **Step 3: Implement** (the table and its `DashResponseLock` type came in with the schema commit; do not edit them on this branch). On this branch, `response-lock-store.ts`:

```ts
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { dashResponseLocks } from '@/lib/db/schema'

export async function readLock(clientId: string, requestKey: string): Promise<{ response: unknown } | null> {
  const rows = await db.select({ response: dashResponseLocks.response }).from(dashResponseLocks)
    .where(and(eq(dashResponseLocks.clientId, clientId), eq(dashResponseLocks.requestKey, requestKey))).limit(1)
  return rows[0] ?? null
}

/** Insert once. If another request stored this lock first, return the stored answer so every
 *  reader agrees. */
export async function writeLock(clientId: string, requestKey: string, periodEnd: string, response: unknown): Promise<unknown> {
  const inserted = await db.insert(dashResponseLocks).values({ clientId, requestKey, periodEnd, response })
    .onConflictDoNothing().returning({ response: dashResponseLocks.response })
  if (inserted[0]) return inserted[0].response
  return (await readLock(clientId, requestKey))?.response ?? response
}
```

- [ ] **Step 4: Run PASS; `npx tsc --noEmit`.** Step 5: **Commit** `feat(organic-social): dash_response_locks store`.

### Task 3: The locking client

**Files:** Create `lib/organic-social/locking-client.ts`; Test `lib/organic-social/locking-client.test.ts`

**Interfaces produced:** `type DashReader = Pick<DashSocialClient, 'getReportsData' | 'getContent' | 'getMedia'>`; `completeReportsData(p, res): boolean`; `completeContent(res): boolean`; `withLockedBaseline(answer, prior): unknown`; `lockingClient(inner: DashReader, opts: { clientId: string; slug: string; settled: string | null; late: (periodEnd: string) => boolean }, deps?: { read; write }): DashReader`.

- [ ] **Step 1: Failing tests** (inner is a fake with `vi.fn` methods; `deps.read`/`deps.write` fakes; answers are realistic fixtures: a TOTAL_GROUPED_METRIC answer keyed by the brand id, a GRAPH answer with `data.metrics`, a MULTI_METRIC_MEDIA_TYPE answer, a CONTENT answer):
  - a request ending on or before `settled`: first call misses, calls inner once, writes, returns the stored answer; a second call reads the stored answer and never calls inner;
  - a request ending after `settled` (the live month; a finished month before its lock day), `settled: null`, or a request with no `endDate`: always inner, never read or written;
  - inner throws (a Dash error): nothing written, the error propagates as today;
  - `read` throws or `write` throws: the error propagates (fail closed); inner's answer is never returned for a lockable read whose write failed;
  - incomplete answers are served and NOT written, with one `console.warn` `[organic-social] lock skipped (incomplete answer) slug=<slug> period_end=<d> key=<first 12>`: TOTAL answer without the brand entry, TOTAL answer missing a requested metric, GRAPH answer without `data.metrics` or missing a metric, MEDIA answer without the brand entry, CONTENT answer without an array `data.content`. A MEDIA answer with the brand entry but no `reel` block IS complete (no reels is a real answer);
  - a concurrent writer won: the stored winner is returned;
  - a late lock: one `console.warn` `[organic-social] late lock ...` on the capture only;
  - the locked baseline: with September and August both stored, September's answer is returned with every `context` replaced by August's `value` at the same path (brand-keyed metrics and the media-type shape), and a later call gives the same; with August not stored, Dash's `context` is kept;
  - a stored answer read back after `JSON.parse(JSON.stringify(x))` builds the same headline, graph series and posts as the original (`buildPlatformHeadline`, the follower and trend series builders, `normalizePost`), proving the jsonb round trip changes nothing;
  - `getMedia` always passes straight through; no log line contains the response, the brand id or the config.
- [ ] **Step 2: Run, see FAIL.**
- [ ] **Step 3: Implement**:

```ts
// Lock every number (D27, D28): the one place every Organic Social number passes through. For a
// client on locked months, a read whose dates are all locked days is answered from
// dash_response_locks; the first such read stores Dash's complete, successful answer. Fail closed:
// a lock-table failure is an error, never a quiet fallback to live numbers.
import type { DashSocialClient } from '@/lib/dash-social/client'
import type { ContentResponse, ReportsDataParams, ReportsDataResponse } from '@/lib/dash-social/types'
import { priorParams, requestKey, requestPeriodEnd } from './lock-day'
import { readLock, writeLock } from './response-lock-store'

export type DashReader = Pick<DashSocialClient, 'getReportsData' | 'getContent' | 'getMedia'>
type Opts = { clientId: string; slug: string; settled: string | null; late: (periodEnd: string) => boolean }

/** The shape every reader needs (headlines.ts:41, followers.ts:41, trends.ts:40, the outline
 *  getters), so an incomplete 200 is never locked. */
export function completeReportsData(p: ReportsDataParams, res: unknown): boolean {
  const data = (res as { data?: unknown } | null)?.data as Record<string, unknown> | undefined
  if (!data || typeof data !== 'object') return false
  if (p.reportType === 'GRAPH') {
    const m = data.metrics as Record<string, unknown> | undefined
    return !!m && p.metrics.every((k) => m[k] != null)
  }
  const brand = data[String(p.brandId)] as { metrics?: Record<string, unknown> } | undefined
  if (!brand) return false
  if (p.reportType === 'MULTI_METRIC_MEDIA_TYPE') return true
  return !!brand.metrics && p.metrics.every((k) => k in brand.metrics!)
}
export function completeContent(res: unknown): boolean {
  return Array.isArray((res as { data?: { content?: unknown } } | null)?.data?.content)
}

/** Pure. Wherever the answer has `value` and `context`, the context becomes the prior answer's
 *  `value` at the same path, so a month's comparison uses the prior month's locked number. */
export function withLockedBaseline(answer: unknown, prior: unknown): unknown {
  if (!answer || typeof answer !== 'object' || Array.isArray(answer) || !prior || typeof prior !== 'object') return answer
  const a = answer as Record<string, unknown>
  const p = prior as Record<string, unknown>
  if ('value' in a && 'context' in a && 'value' in p) return { ...a, context: p.value }
  return Object.fromEntries(Object.entries(a).map(([k, v]) => [k, k in p ? withLockedBaseline(v, p[k]) : v]))
}

export function lockingClient(inner: DashReader, opts: Opts, deps = { read: readLock, write: writeLock }): DashReader {
  const tag = (end: string, key: string) => `slug=${opts.slug} period_end=${end} key=${key.slice(0, 12)}`
  async function locked<T>(method: string, params: object, complete: (res: unknown) => boolean, live: () => Promise<T>): Promise<T> {
    const p = params as Record<string, unknown>
    const end = requestPeriodEnd(p)
    if (!end || !opts.settled || end > opts.settled) return live()
    const key = requestKey(method, p)
    let answer: unknown
    const hit = await deps.read(opts.clientId, key) // throws on failure: fail closed
    if (hit) {
      answer = hit.response
    } else {
      const res = await live()
      if (!complete(res)) {
        console.warn(`[organic-social] lock skipped (incomplete answer) ${tag(end, key)}`)
        return res
      }
      answer = await deps.write(opts.clientId, key, end, res) // throws on failure: fail closed
      if (opts.late(end)) console.warn(`[organic-social] late lock ${tag(end, key)}`)
    }
    const prior = priorParams(p)
    if (prior) {
      const before = await deps.read(opts.clientId, requestKey(method, prior))
      if (before) answer = withLockedBaseline(answer, before.response)
    }
    return answer as T
  }
  const reader: DashReader = {
    getReportsData<M = unknown>(p: ReportsDataParams): Promise<ReportsDataResponse<M>> {
      return locked('getReportsData', p, (r) => completeReportsData(p, r), () => inner.getReportsData<M>(p))
    },
    getContent(p: Parameters<DashReader['getContent']>[0]): Promise<ContentResponse> {
      return locked('getContent', p, completeContent, () => inner.getContent(p))
    },
    getMedia(p: Parameters<DashReader['getMedia']>[0]) {
      return inner.getMedia(p)
    },
  }
  return reader
}
```

- [ ] **Step 4: Run PASS**; tsc clean with no cast. Step 5: **Commit** with the edge table:

| # | Category | What breaks | Where | Disposition |
|---|---|---|---|---|
| 1 | external failure | Dash errors, times out or 429s | `live()` throws | fix: nothing stored, error propagates as today; test |
| 2 | external failure | the lock table is missing (migration not applied) or the database is down | `deps.read`/`deps.write` throw | fix: fail closed, the part's error card; never live numbers for a locked month; test; rollout applies the migration before the code |
| 3 | input boundary | a 200 with partial or empty data | `complete*` | fix: served, never stored, warned; the next read retries; tests per shape |
| 4 | operator visibility | a month captured after its lock day, or a changed request captured later | capture | fix: `late lock` warning on any capture after the lock day; test |
| 5 | state | numbers on one page captured on different days | the sweep (Task 6) | fix: every tab of the two newest locked months rendered in one warmer run |
| 6 | state | a month's comparison disagrees with the prior month's locked number | `withLockedBaseline` | fix: prior locked value at read time; test |
| 7 | state | two first reads race | `writeLock` | fix: unique constraint, the stored winner is returned; test |
| 8 | state | the route and the lock read the clock at different moments | `requestClock()` is React-cached per request in production | accept: one clock per request (tests pass their own) |
| 9 | state | Next's fetch cache (`revalidate: 3600`, `client.ts:46`) serves an answer up to an hour old at capture | first capture | accept: at most an hour before the capture, after the month ended |
| 10 | bounds | rows per client | one per distinct request per locked month (a few dozen) | accept |
| 11 | security | response, brand id or config in logs | log lines | fix: slug, date, 12-character key prefix only; test |

### Task 4: Wire the client for opted-in clients

**Files:** Modify `lib/organic-social/base.ts` (`dashClientFor` only); Test `lib/organic-social/lock-wiring.test.ts` (new)

- [ ] **Step 1: Failing tests** (mock `@/lib/db/queries` and `./response-lock-store`; fake timers at `2026-10-20T14:00:00Z`): a client with `reportingMonths` gets a client that is NOT a `DashSocialClient` instance and, for a September request, reads the lock store; a client without the key still gets a plain `DashSocialClient` (Task 0's test still passes); a client whose `reportingMonths` is malformed gets a wrapper with `settled: null` (live), and a bad `lockDay` logs `[organic-social] reportingMonths.lockDay is invalid slug=<slug>` (once per `dashClientFor` call, which React caches per request) and locks on the 5th.
- [ ] **Step 2: Run, see FAIL.**
- [ ] **Step 3: Implement** in `base.ts` (imports: `hasReportingMonths` from `./reporting-months`, `requestClock` from `./locked-range`, `lockingClient` from `./locking-client`, `isLateLock`, `parseLockDay`, `settledThrough` from `./lock-day`):

```ts
    const inner = new DashSocialClient({ token })
    return { client: hasReportingMonths(c) ? lockedClientFor(c!, slug, inner) : inner, brandId: cfg.brandId, channels: resolveChannels(cfg.channels) }
```

replacing today's `return { client: new DashSocialClient({ token }), ... }` line, with:

```ts
/** Lock every number (D27): the locking wrapper for a client on locked months. */
function lockedClientFor(c: { id: string; dashSocialConfig: unknown }, slug: string, inner: DashSocialClient) {
  const rm = (c.dashSocialConfig as { reportingMonths?: unknown }).reportingMonths
  const today = requestClock().today
  if (parseLockDay(rm).bad) console.error(`[organic-social] reportingMonths.lockDay is invalid slug=${slug}`)
  return lockingClient(inner, { clientId: c.id, slug, settled: settledThrough(rm, today), late: (end) => isLateLock(end, rm, today) })
}
```

The return type of `dashClientFor` becomes `{ client: DashReader; brandId: number; channels: DashChannel[] }`; every caller only uses the three methods (confirm with `npx tsc --noEmit`).
- [ ] **Step 4: Run PASS**, full suite, tsc. Step 5: **Commit** `feat(organic-social): opted-in clients read Dash through the lock`.

### Task 5: Top Content locks on the same day

**Files:** Modify `lib/organic-social/frozen.ts`; Test `lib/organic-social/frozen.test.ts` (add one `vi.mock` block at the top and new tests at the end; no existing test body changes)

- [ ] **Step 1: Failing tests**: add at the top `vi.mock('@/lib/db/queries', () => ({ getClientBySlug: vi.fn(async () => null) }))` so the new default dependency never touches a database in the existing tests. New tests: with `responseLocked: async () => true`, a CLOSED window calls `fetchLive` and never `readSnapshot` or `writeSnapshot`; with `responseLocked` rejecting, the error propagates (fail closed: an opted-in client must never write the old table); with `responseLocked: async () => false`, today's path runs (the existing tests are the proof).
- [ ] **Step 2: Run, see FAIL.**
- [ ] **Step 3: Implement**: `Deps` gains `responseLocked: (slug: string) => Promise<boolean>`; `defaultDeps()` gains `responseLocked: async (slug) => hasReportingMonths(await getClientBySlug(slug))` (a failed client read throws, as it already would in `dashClientFor` a moment later); the first lines of `fetchTopContentFrozen` after building `d` become:

```ts
  // Lock every number (D27): a client on locked months has its Top Content answer locked with every
  // other number (dash_response_locks, via the locking client), so it skips this older freeze table.
  if (await d.responseLocked(slug)) return d.fetchLive(slug, dateRange, channel)
```

- [ ] **Step 4: Run PASS** (all of `frozen.test.ts`, unchanged assertions). Step 5: **Commit** `feat(organic-social): Top Content locks with every other number for locked-months clients`.

### Task 6: The lock sweep

**Files:** Create `lib/organic-social/lock-sweep.ts`; modify `app/api/cache-warm/route.ts` (one import, one loop after the existing URL loop); Test `lib/organic-social/lock-sweep.test.ts`

- [ ] **Step 1: Failing tests**: for an opted-in client (`enabledReports` includes `organic-social`, channels instagram and facebook) on `2026-10-05`, `lockSweepUrls` returns the dashboard URLs for August then September, each for every tab `organicSocialSubsections(client)` returns (Overview and each platform tab id), with `dateRange=custom%3A2026-08-01%2C2026-08-31` and `...2026-09-01%2C2026-09-30`; on `2026-10-04` it returns July and August but drops July (before `firstMonth`); a client without `reportingMonths`, without `organic-social`, or with malformed config gets `[]`.
- [ ] **Step 2: Run, see FAIL.**
- [ ] **Step 3: Implement** `lock-sweep.ts`:

```ts
// The lock sweep (D27): the hourly cache warmer renders every Organic Social tab of the two most
// recently locked months, oldest first, as the team, so a month's numbers are all captured in one run
// on its lock day. Pure. Tabs come from the same helper the sidebar uses, so a new channel is swept
// with no code change.
import { organicSocialSubsections } from '@/lib/constants'
import type { Client } from '@/lib/db/schema'
import { firstOf, hasReportingMonths, lastOf, monthOf, parseReportingMonths } from './reporting-months'
import { settledThrough } from './lock-day'

const prevKey = (key: string) => monthOf(new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 0)).toISOString().slice(0, 10))

export function lockSweepUrls(baseUrl: string, client: Client, today: string): string[] {
  if (!hasReportingMonths(client) || !client.enabledReports.includes('organic-social')) return []
  const rm = (client.dashSocialConfig as { reportingMonths?: unknown }).reportingMonths
  const parsed = parseReportingMonths(rm)
  const settled = settledThrough(rm, today)
  if (!parsed.ok || !settled) return []
  const newest = monthOf(settled)
  const months = [prevKey(newest), newest].filter((m) => m >= parsed.cfg.firstMonth)
  const tabs = organicSocialSubsections(client)
  return months.flatMap((m) => {
    const range = encodeURIComponent(`custom:${firstOf(m)},${lastOf(m)}`)
    return tabs.map((t) => `${baseUrl}/dashboard/${client.slug}/reports?section=organic-social${t.id ? `&subsection=${t.id}` : ''}&dateRange=${range}`)
  })
}
```

In `cache-warm/route.ts`, after the existing `for (const client of clients)` URL loop: `const today = clockFor(new Date()).today` and `for (const client of clients) urls.push(...lockSweepUrls(baseUrl, client, today))` (imports `lockSweepUrls` and `clockFor`). The warmer already drains each body so every Suspense boundary renders (`route.ts:67-69`), and it signs in as an internal admin, so the team's canonical month renders with no redirect.
- [ ] **Step 4: Run PASS**; tsc. Step 5: **Commit** `feat(organic-social): lock sweep captures every tab of a locked month in one warmer run`.

### Task 7: Prove it

- [ ] Full suite, `npx tsc --noEmit`, `npm run -s check:rsc`; Task 0 unchanged.
- [ ] Renaissance drift check: RESULT no drift.
- [ ] Zero conflicts: `git merge-tree --write-tree` with 247, 250, 252 (with the annotations rebuild), 253, 254, and 255 (with the outline fixes and YTD Review) (this is 256); all merged in two orders on a scratch worktree off `origin/dev`, same tree, tests, tsc, `check:rsc` green. Also prove each PR stands alone: this branch by itself on `organic-social-october` passes tests, tsc and `check:rsc`. Only 256 and 252 touch `drizzle/`, and only through the same October schema commit.
- [ ] Nothing pushed without my go. The commits go on PR 256 (`feat/os-locked-months` into `organic-social-october`); no separate PR.

## Rollout (each step waits for my go)

1. Staging only, from whichever of 256 or 252 reaches staging first (the migration is the same): pre-change snapshot of the staging database's table list; `npm run db:migrate:staging` (host-guarded: refuse unless the host is the staging endpoint); confirm only `dash_response_locks` and `chart_annotation_hides` were added; drift check.
2. The code reaches staging with the rest of the October set, together (Decision 4). The migration is applied first (fail closed means a missing table shows error cards, never live numbers). The first warmer run after deploy captures every tab of the two most recently locked months. Read the late-lock warnings to confirm which months were captured late (Decision 1).
3. If any October PR reaches staging after Oct 5, clear the three clients' September locks on staging once, with my go (`DELETE FROM dash_response_locks WHERE client_id IN (...) AND period_end BETWEEN '2026-09-01' AND '2026-09-30'`, host-guarded, snapshot first), and let the next warmer run recapture, before Oct 12.
4. Production: migration first, then the code with the rest of the set, on my express written consent.

## Follow-ups (filed, not built)

- An unlock tool for the team (today: a documented `DELETE FROM dash_response_locks WHERE client_id = $1 AND period_end BETWEEN $2 AND $3`, run only with my go).
- Locking `getMedia` if it ever becomes a number source (it is unused today).

## Review record

Fresh adversarial review of `0e949c8` (one reviewer, read only; it ran the plan's `lock-day.ts` against PR 256's rules: every expected date matched, and 75,000 combinations 2026 to 2030 never locked after the opening day or inside the month). Every finding was checked against the code and accepted.

| # | Sev | Finding | Disposition |
|---|---|---|---|
| B1 | BLOCKER | A 200 with partial or empty data would be stored forever (callers treat a missing brand entry as bad data) | Fixed: `completeReportsData`/`completeContent`; incomplete answers served, not stored, warned (Task 3 edge 3) |
| M1 | MAJOR | A lock-table read or write failure served live numbers for a locked month | Fixed: fail closed, the error card (Task 3 edge 2; Task 5 too) |
| M2 | MAJOR | Numbers on one page captured on different days (the warmer only covers the default Overview) | Fixed: the lock sweep (Task 6); late tolerance 0 |
| M3 | MAJOR | September's "vs August" used Dash's later August value, not August's locked one | Fixed: `withLockedBaseline` at read time (Decision 3) |
| M4 | MAJOR | Already-frozen Top Content would be re-captured | Kept the bypass (D27 moves Top Content to the lock day) with the evidence that those rows are staging test data no client has seen (Decision 5); the outline-fixes re-freeze step is noted as unnecessary |
| M5 | MAJOR | PR landing order decides which requests capture late | Fixed: ship the set together; a documented, go-gated staging unlock and recapture before Oct 12 (Decision 4, Rollout 3) |
| m1 | MINOR | `requestPeriodEnd` accepted impossible dates and start-only requests | Fixed: `endDate` required, dates round-trip |
| m2 | MINOR | The clock is read inside `dashClientFor` | Accepted and stated (edge 8) |
| m3 | MINOR | `as DashReader` hid type errors | Fixed: typed object, no cast |
| m4 | MINOR | Task 0 snapshot of mocked input | Fixed: explicit assertions |
| m5 | MINOR | No jsonb round-trip proof | Fixed: Task 3 test |
| m6 | MINOR | Next's fetch cache can make a capture up to an hour old | Stated (edge 9) |
| m7 | MINOR | A failed `responseLocked` wrote the old table | Fixed: fail closed |
| m8 | MINOR | "logs once" was per call | Wording fixed |

**Amendment after the annotations rebuild review (2026-09-21):** the table and its migration moved to one shared schema PR, `feat/os-october-schema`, with the annotations' hides table, because two PRs each generating `0024` conflict in any merge order (Task 2, Task 7, Rollout 1 updated).

**Amendment 2026-09-22:** the shared schema PR is dropped, because it made this work and the annotations depend on it. The one migration is now a single commit merged into both 256 and 252 (Task 2), and this plan lives on 256 itself instead of the stacked PR #258.

**Review of the 2026-09-22 restructure** (one fresh reviewer, read only). It merged a simulated schema commit off `100e6c7` into 256 and 252 (both clean, tsc green) and the whole set in three orders (one identical tree, one journal entry `idx: 24`, each table once), and found no remaining dependency on another PR. Findings fixed here: the schema commit's base is pinned to `100e6c7` with a merge-base check (a commit cut from the moving tip would carry merged PRs into 256 and 252); the hides table's source is the exact 2026-09-18 plan path on PR 252's branch; schema placement is by text, not line numbers, and the Global Constraints bullet no longer tells this branch to edit the tables; a later table change is a new migration made the same way, never an edit on one branch; the SQL gets a mechanical grep and a `diff --stat` check. Not verifiable read only: that `npm run db:generate` at `100e6c7` produces only these two tables (the grep above is the guard), and that no database records a migration later than `0023` (Rollout step 1 confirms only the two tables were added).

**Audit fix 2026-09-22 (fresh audit, M1):** the schema commit recipe and BOTH table definitions now live verbatim in this file's appendix (identical text in the annotations rebuild plan on PR 252), so building it never reads another PR's branch; and the shared commit is recorded as the one named exception to "no shared commits" (D32).

## Appendix: the October schema commit (this text is identical in the lock every number plan on PR 256 and the annotations rebuild plan on PR 252)

**What it is.** Two October PRs each need a new table: PR 256 (`dash_response_locks`, lock every number) and PR 252 (`chart_annotation_hides`, annotation hides). Drizzle keeps one migration list (`drizzle/meta/_journal.json`), so two PRs that each generate their own `0024` conflict in any merge order, and a separate schema PR would make both depend on it. So ONE commit adds both tables and ONE migration, and that same commit object is merged into both PRs. Either PR can merge first; the other then merges clean and the migration runs once. Each PR carries one table it does not read until the other lands: empty, unused, harmless.

**The one named exception to "no PR carries another PR's commits" (my decision, D32, 2026-09-22, "same commit in both").** This commit is the only commit two October PRs share. It is not another PR's work: it belongs to both equally, contains only the two tables and their migration, and neither PR needs the other to merge. Every other commit on every October PR is unique to that PR.

**Everything the builder needs is here; nothing is read from the other PR's branch.**

1. Cut a local scratch branch from commit `100e6c7` EXACTLY: `git switch -c local/october-schema 100e6c7`. Never from the moving tip of `organic-social-october`: once any PR has merged there, a commit cut from the tip would carry that PR's commits into 256 and 252.
2. In `lib/db/schema.ts` (every helper used below is already imported on line 1 at `100e6c7`), directly after the line `export type PostDesignation = typeof postDesignations.$inferSelect`, add:

```ts

// One row per (client, platform, chart, day) the team has hidden or unhidden on a v2
// Organic Social graph. hidden=true keeps that annotation from the client; the team still
// sees it, faded, with an Unhide button. No row means never touched, i.e. shown. Mirrors
// post_designations. Purely additive: nothing Renaissance renders reads it.
export const chartAnnotationHides = pgTable('chart_annotation_hides', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  channel: text('channel').notNull(),   // DashChannel, e.g. 'INSTAGRAM'
  chart: text('chart').notNull(),       // 'followers' | 'engagements'
  day: date('day').notNull(),           // the annotation's day, yyyy-mm-dd, the UTC day Dash counts
  hidden: boolean('hidden').notNull(),
  setBy: text('set_by').notNull(),      // email
  setAt: timestamp('set_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  clientCalloutUnique: unique('chart_annotation_hides_client_callout_key').on(table.clientId, table.channel, table.chart, table.day),
  clientIdx: index('chart_annotation_hides_client_idx').on(table.clientId),
}))

export type ChartAnnotationHide = typeof chartAnnotationHides.$inferSelect
```

3. Directly after the `topContentSnapshots` table definition (the `}))` that closes it), add:

```ts
/** Lock every number (D27): the stored Dash answer for one exact request of a locked month, per
 *  client. Written once (the first read after the lock day), then served forever. Only clients with
 *  reportingMonths ever read or write it. */
export const dashResponseLocks = pgTable('dash_response_locks', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  requestKey: text('request_key').notNull(),
  periodEnd: date('period_end').notNull(),
  response: jsonb('response').notNull(),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  clientRequestUnique: unique('dash_response_locks_client_request_key').on(table.clientId, table.requestKey),
}))
```

   and directly after the line `export type NewTopContentSnapshot = typeof topContentSnapshots.$inferInsert`, add `export type DashResponseLock = typeof dashResponseLocks.$inferSelect`.
4. Run `npm run db:generate` once (no database). If it asks any question, STOP and bring it to me.
5. Dry run 2026-09-22 (scratch worktree at `100e6c7`, steps 2 to 4, nothing committed): `drizzle-kit generate` produced exactly `CREATE TABLE "chart_annotation_hides"`, `CREATE TABLE "dash_response_locks"`, their two foreign keys and `CREATE INDEX "chart_annotation_hides_client_idx"`, nothing else (so the `0023` snapshot matches `schema.ts` at `100e6c7`), and tsc passed. At build time, check it mechanically again: `grep -iE 'create table|alter table|drop|rename' drizzle/0024_*.sql` shows only `CREATE TABLE "dash_response_locks"`, `CREATE TABLE "chart_annotation_hides"` and `ALTER TABLE` lines adding those two tables' foreign keys; read every other line (unique constraints, the hides index); `git diff --stat 100e6c7` lists only `lib/db/schema.ts`, `drizzle/0024_*.sql`, `drizzle/meta/0024_snapshot.json`, `drizzle/meta/_journal.json` and `MIGRATIONS-PENDING.md` (add both tables there).
6. Commit `feat(db): October tables (dash_response_locks, chart_annotation_hides), one migration`.
7. Before merging it anywhere: `git merge-base local/october-schema origin/dev` prints `100e6c7`, and `git rev-list --count 100e6c7..local/october-schema` prints `1`.
8. `git merge --no-ff local/october-schema` into the PR branch being built. Whichever of 256 or 252 is built second merges the SAME commit (the branch stays local until both have it; recreate it from the first PR's history with `git branch local/october-schema <sha>` if needed). Never cherry-pick: a cherry-pick is a different commit, and the two `0024_snapshot.json` files would differ.
9. Prove it: `git merge-tree --write-tree` of 256 and 252 is clean, and the two branches' `drizzle/` trees are byte-identical (`git diff 256-branch 252-branch -- drizzle` is empty).

**After it is shared.** It is never amended. A later change to either table (for example from Paul's review) is a new migration `0025` made the same way (one commit on top of this one, merged into both), never an edit on one branch. If one of the two PRs is squash-merged into `organic-social-october`, the other still merges clean (both sides add byte-identical files); re-run `git merge-tree` at that time to confirm.

**Staging.** The migration is applied once, from whichever of 256 or 252 reaches staging first, only with my go (`npm run db:migrate:staging`, host-guarded, table list snapshot first; confirm only the two tables were added).
