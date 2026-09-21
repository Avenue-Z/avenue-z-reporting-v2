# Lock Every Number Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. No subagents and no background commands (standing rule, 2026-09-21).

**Goal:** For clients on locked months, every Organic Social number of a finished month (tiles, both graphs, the engagement breakdown, Top Content, and later YTD and annotations) stops changing on the team's wrap day, the 5th of the next month (the Friday before when the 5th is a weekend), and never moves again. Renaissance, and every client without `reportingMonths`, is untouched.

**Architecture (approach A, D28):** one lock at the single point every Organic Social number passes through: the Dash client `dashClientFor` hands out. For an opted-in client it returns a locking wrapper. A read whose every date falls on or before the last locked day is served from a new table, `dash_response_locks`, keyed by the client and a hash of the exact request. The first such read after the lock day fetches Dash once, stores the successful answer, and every later read returns that stored answer. Reads that touch any unlocked day (the live month, or a finished month before its lock day) go to Dash as today. Top Content for these clients skips its own older freeze table, so it locks on the same day as everything else.

**Tech Stack:** Next.js 16 (RSC), React 19 `cache`, Drizzle ORM on Neon Postgres (one new table, one migration), Vitest 3.

## Sources (the premise; the reviewer checks the plan against these)

- **D27 (my decision, 2026-09-21, "A"):** "a finished month's numbers (tiles, graphs, breakdown, Top Content, and later YTD and annotations) lock on the team's wrap day, the 5th of the following month, or the Friday before when the 5th is a weekend (SOP: 'target date the 5th ... so the team has time to review and QA prior to sending to the client on the 12th. If the 5th lands on the weekend it should default to the day before going into the weekend'). From month end to the lock day the team sees the finished month still updating. Per-client setting, default the 5th; Top Content moves to the same day so every number on a page matches. The lock day can never fall after the day the month opens to clients."
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
- `lib/db/schema.ts`: add the new table directly after the `topContentSnapshots` table definition (line 393 today) and its two types directly after line 399; PR 247 edits line 135 and PR 256 edits lines 139-141.
- The lock day is its own knob, `reportingMonths.lockDay`, parsed in the new `lock-day.ts` (not in PR 256's parser): integer 4 to 28, default 5. A malformed value falls back to 5 and is logged by slug and key (the lock timing is a safety default, not a visibility rule).
- Lock day of month M: day `lockDay` of month M+1, moved to the Friday before when it is a Saturday or Sunday, then clamped to on or before `opensOn(M)`.
- "Today" is the New York date from PR 256's `requestClock()`; a month's numbers lock from New York midnight on its lock day.
- Only the two GET reads lock; `getMedia` passes through untouched.
- Logs carry the slug, the period end and the first 12 characters of the request key only; never the response, the brand id or the config.
- No em or en dashes in added lines. Tests first. Every commit ends with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Decisions made overnight (flagged for my yes)

1. **Past months lock with today's data.** August (and September if its lock day has passed when this ships) has no record of what Dash said on its lock day, so its first read after this ships becomes its locked value. The warm-up (cache warmer, hourly) makes that happen on first deploy. The "late lock" warning (below) records each such capture.
2. **A request is locked as a whole.** Dash answers the requested window plus its compare window in one response, so a request is lockable only when ALL its dates are locked days. A finished month compared with a month that is also finished locks; the live month (and a finished month before its lock day) never does.
3. **A changed request after the lock day is captured when first made.** If code later changes a request for a locked month (a new metric, a changed parameter), that new request locks with the data of the day it is first made, and a "late lock" warning names it. Existing stored answers are never rewritten.
4. **Top Content for these clients stops using `top_content_snapshots`**; its answer is locked with every other number. Their existing rows there stay in the table, unused (nothing is deleted).

## File Structure

| File | Responsibility |
|---|---|
| `lib/organic-social/lock-day.ts` (new) | Pure: `parseLockDay`, `lockOn`, `settledThrough`, `requestPeriodEnd`, `requestKey`, `isLateLock` |
| `lib/db/schema.ts` | `dashResponseLocks` table and its types |
| `drizzle/0024_*.sql` + `drizzle/meta/*` (generated) | the migration (create table, unique index) |
| `lib/organic-social/response-lock-store.ts` (new) | `readLock`, `writeLock` (insert on conflict do nothing, then the winner) |
| `lib/organic-social/locking-client.ts` (new) | `lockingClient(inner, opts, deps)`: the wrapper |
| `lib/organic-social/base.ts` | `dashClientFor` wraps the client for opted-in clients |
| `lib/organic-social/frozen.ts` | Top Content skips `top_content_snapshots` for opted-in clients |
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
  expect({ brandId: r.brandId, channels: r.channels }).toMatchSnapshot()
})
```

Also run the existing Top Content freeze tests unchanged: `npx vitest run lib/organic-social/frozen.test.ts lib/organic-social/lock-parity.test.ts` (PASS; they are the record of today's Top Content path).

- [ ] **Step 2: Commit** `test(organic-social): pre-change snapshot for lock every number`.

### Task 1: The lock rules (pure)

**Files:** Create `lib/organic-social/lock-day.ts`; Test `lib/organic-social/lock-day.test.ts`

**Interfaces produced:** `parseLockDay(rm: unknown): { lockDay: number; bad: boolean }`; `lockOn(key: string, lockDay: number, opensOnDate: string): string`; `settledThrough(cfgValue: unknown, today: string): string | null` (the last locked day, or null when nothing can lock: malformed `reportingMonths`); `requestPeriodEnd(params: Record<string, unknown>): string | null`; `requestKey(method: string, params: Record<string, unknown>): string`; `isLateLock(periodEnd: string, cfgValue: unknown, today: string): boolean`.

- [ ] **Step 1: Failing tests**:

```ts
import { expect, test } from 'vitest'
import { isLateLock, lockOn, parseLockDay, requestKey, requestPeriodEnd, settledThrough } from './lock-day'
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
test('a request ends on its latest date, including the compare window; any bad date means not lockable', () => {
  expect(requestPeriodEnd({ startDate: '2026-09-01T04:00:00Z', endDate: '2026-09-30T04:00:00Z', contextStartDate: '2026-08-01T04:00:00Z', contextEndDate: '2026-08-31T04:00:00Z' })).toBe('2026-09-30')
  expect(requestPeriodEnd({ startDate: '2026-09-01', endDate: '2026-09-30' })).toBe('2026-09-30')
  expect(requestPeriodEnd({ startDate: 'junk', endDate: '2026-09-30' })).toBeNull()
  expect(requestPeriodEnd({ brandId: 1 })).toBeNull()
})
test('the request key ignores parameter order and undefined values, and changes with any real difference', () => {
  const a = requestKey('getReportsData', { brandId: 1, metrics: ['A', 'B'], startDate: 's', endDate: 'e', limit: undefined })
  expect(requestKey('getReportsData', { endDate: 'e', startDate: 's', metrics: ['A', 'B'], brandId: 1 })).toBe(a)
  expect(requestKey('getReportsData', { brandId: 1, metrics: ['A', 'C'], startDate: 's', endDate: 'e' })).not.toBe(a)
  expect(requestKey('getContent', { brandId: 1, metrics: ['A', 'B'], startDate: 's', endDate: 'e' })).not.toBe(a)
  expect(a).toMatch(/^[0-9a-f]{64}$/)
})
test('a late lock: captured more than 7 days after its month locked', () => {
  expect(isLateLock('2026-09-30', CFG, '2026-10-12')).toBe(false)
  expect(isLateLock('2026-09-30', CFG, '2026-10-13')).toBe(true)
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

/** The latest day a request asks about, or null when it has no dates or any date is malformed. */
export function requestPeriodEnd(params: Record<string, unknown>): string | null {
  const days: string[] = []
  for (const k of DATE_KEYS) {
    const v = params[k]
    if (v === undefined || v === null) continue
    const d = String(v).slice(0, 10)
    if (!DAY.test(d)) return null
    days.push(d)
  }
  return days.length ? days.sort()[days.length - 1] : null
}

/** A stable hash of the exact request: method plus parameters, sorted, without undefined values. */
export function requestKey(method: string, params: Record<string, unknown>): string {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
  return createHash('sha256').update(JSON.stringify({ method, params: clean })).digest('hex')
}

/** A lock captured more than 7 days after its month's lock day (the numbers were captured late). */
export function isLateLock(periodEnd: string, cfgValue: unknown, today: string): boolean {
  const parsed = parseReportingMonths(cfgValue)
  if (!parsed.ok) return false
  const key = monthOf(periodEnd)
  const lock = lockOn(key, parseLockDay(cfgValue).lockDay, opensOn(key, parsed.cfg.opensOnDay, parsed.cfg.weekendRule))
  return today > addDays(lock, 7)
}
```

(`firstOf`, `lastOf`, `monthOf` and `opensOn` are exported by PR 256's `reporting-months.ts`; `parseReportingMonths` too.)
- [ ] **Step 4: Run PASS.** Step 5: **Commit** `feat(organic-social): lock day rules (pure)`.

### Task 2: The table, the migration, the store

**Files:** Modify `lib/db/schema.ts`; generate `drizzle/0024_*.sql` and `drizzle/meta/*`; create `lib/organic-social/response-lock-store.ts`; Test `lib/organic-social/response-lock-store.test.ts`

- [ ] **Step 1: Failing test** (mock `@/lib/db/client` with a fake `db` whose `select().from().where().limit()` and `insert().values().onConflictDoNothing().returning()` chains are `vi.fn`s): `readLock` returns `{ response }` for a row and `null` for none; `writeLock` returns the inserted response; when the insert returns no row (a concurrent writer won), `writeLock` reads and returns the stored winner.
- [ ] **Step 2: Run, see FAIL.**
- [ ] **Step 3: Implement.** In `lib/db/schema.ts`, directly after the `topContentSnapshots` table (ends line 393):

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

and directly after line 399: `export type DashResponseLock = typeof dashResponseLocks.$inferSelect`. Run `npm run db:generate` (no database needed); commit the generated SQL and meta as is; read the SQL and confirm it only creates this table, its foreign key and its unique constraint.

`response-lock-store.ts`:

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

- [ ] **Step 4: Run PASS; `npx tsc --noEmit`.** Step 5: **Commit** `feat(organic-social): dash_response_locks table, migration and store`.

### Task 3: The locking client

**Files:** Create `lib/organic-social/locking-client.ts`; Test `lib/organic-social/locking-client.test.ts`

**Interfaces produced:** `type DashReader = Pick<DashSocialClient, 'getReportsData' | 'getContent' | 'getMedia'>`; `lockingClient(inner: DashReader, opts: { clientId: string; slug: string; settled: string | null; late: (periodEnd: string) => boolean }, deps?: { read; write }): DashReader`.

- [ ] **Step 1: Failing tests** (inner is a fake with `vi.fn` methods; `deps.read`/`deps.write` fakes):
  - a request ending on or before `settled`: first call misses, calls inner once, writes, returns the answer; a second call with the same params reads the stored answer and never calls inner;
  - a request ending after `settled` (the live month; a finished month before its lock day): always inner, never read or written;
  - `settled: null`: always inner;
  - a request with no dates or a bad date: always inner;
  - inner throws (a Dash error): nothing is written, the error propagates as today;
  - `read` throws: served live, NOT written (a failed read is not proof of absence), one `console.warn` `[organic-social] lock read failed slug=<slug> period_end=<d> key=<first 12>`;
  - `write` throws: served live, one `console.warn` `[organic-social] lock write failed ...`;
  - a concurrent writer won: the stored winner is returned, not this call's answer;
  - a late lock: one `console.warn` `[organic-social] late lock slug=<slug> period_end=<d> key=<first 12>` on the capture only;
  - `getMedia` always passes straight through;
  - no log line contains the response, the brand id or the config.
- [ ] **Step 2: Run, see FAIL.**
- [ ] **Step 3: Implement**:

```ts
// Lock every number (D27, D28): the one place every Organic Social number passes through. For a
// client on locked months, a read whose dates are all locked days is answered from
// dash_response_locks; the first such read stores Dash's successful answer.
import type { DashSocialClient } from '@/lib/dash-social/client'
import { requestKey, requestPeriodEnd } from './lock-day'
import { readLock, writeLock } from './response-lock-store'

export type DashReader = Pick<DashSocialClient, 'getReportsData' | 'getContent' | 'getMedia'>
type Opts = { clientId: string; slug: string; settled: string | null; late: (periodEnd: string) => boolean }

export function lockingClient(inner: DashReader, opts: Opts, deps = { read: readLock, write: writeLock }): DashReader {
  const tag = (end: string, key: string) => `slug=${opts.slug} period_end=${end} key=${key.slice(0, 12)}`
  async function locked<T>(method: string, params: object, live: () => Promise<T>): Promise<T> {
    const end = requestPeriodEnd(params as Record<string, unknown>)
    if (!end || !opts.settled || end > opts.settled) return live()
    const key = requestKey(method, params as Record<string, unknown>)
    try {
      const hit = await deps.read(opts.clientId, key)
      if (hit) return hit.response as T
    } catch (e) {
      console.warn(`[organic-social] lock read failed ${tag(end, key)}: ${(e as Error).message}`)
      return live()
    }
    const res = await live()
    try {
      const stored = await deps.write(opts.clientId, key, end, res)
      if (opts.late(end)) console.warn(`[organic-social] late lock ${tag(end, key)}`)
      return stored as T
    } catch (e) {
      console.warn(`[organic-social] lock write failed ${tag(end, key)}: ${(e as Error).message}`)
      return res
    }
  }
  return {
    getReportsData(p) { return locked('getReportsData', p, () => inner.getReportsData(p)) },
    getContent(p) { return locked('getContent', p, () => inner.getContent(p)) },
    getMedia(p) { return inner.getMedia(p) },
  } as DashReader
}
```

Check at build time that the object satisfies `DashReader` including `getReportsData`'s generic (`<M>`); if TypeScript needs it, write the method as `getReportsData<M = unknown>(p: ReportsDataParams) { return locked('getReportsData', p, () => inner.getReportsData<M>(p)) }` and drop the cast.
- [ ] **Step 4: Run PASS.** Step 5: **Commit** with the edge table:

| # | Category | What breaks | Where | Disposition |
|---|---|---|---|---|
| 1 | external failure | Dash errors, times out or 429s | `live()` throws | fix: nothing stored, error propagates as today; test |
| 2 | external failure | the lock table is missing (migration not applied) or the database is down | `deps.read` throws | fix: served live, never written, warned; test |
| 3 | operator visibility | a month locked late, or a changed request locked later | capture | fix: `late lock` warning with slug, period end, key prefix; test |
| 4 | state | two first reads race | `writeLock` | fix: unique constraint, the stored winner is returned; test |
| 5 | state | a request straddles the lock-day midnight | `settled` is computed once per request (`requestClock`) | accept: one request, one decision |
| 6 | bounds | rows per client | one per distinct request per locked month (a few dozen) | accept |
| 7 | security | response, brand id or config in logs | log lines | fix: slug, date, 12-character key prefix only; test |

### Task 4: Wire the client for opted-in clients

**Files:** Modify `lib/organic-social/base.ts` (`dashClientFor` only); Test `lib/organic-social/lock-wiring.test.ts` (new)

- [ ] **Step 1: Failing tests** (mock `@/lib/db/queries` and `./response-lock-store`; fake timers at `2026-10-20T14:00:00Z`): a client with `reportingMonths` gets a client that is NOT a `DashSocialClient` instance and, for a September request, reads the lock store; a client without the key still gets a plain `DashSocialClient` (Task 0's test still passes); a client whose `reportingMonths` is malformed gets a wrapper with `settled: null` (live), and a bad `lockDay` logs `[organic-social] reportingMonths.lockDay is invalid slug=<slug>` once and locks on the 5th.
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

- [ ] **Step 1: Failing tests**: add at the top `vi.mock('@/lib/db/queries', () => ({ getClientBySlug: vi.fn(async () => null) }))` so the new default dependency never touches a database in the existing tests. New tests: with `responseLocked: async () => true`, a CLOSED window calls `fetchLive` and never `readSnapshot` or `writeSnapshot`; with `responseLocked` rejecting, today's path runs; with `responseLocked: async () => false`, today's path runs (the existing tests are the proof).
- [ ] **Step 2: Run, see FAIL.**
- [ ] **Step 3: Implement**: `Deps` gains `responseLocked: (slug: string) => Promise<boolean>`; `defaultDeps()` gains `responseLocked: async (slug) => hasReportingMonths(await getClientBySlug(slug))`; the first lines of `fetchTopContentFrozen` after building `d` become:

```ts
  // Lock every number (D27): a client on locked months has its Top Content answer locked with every
  // other number (dash_response_locks, via the locking client), so it skips this older freeze table.
  let locked = false
  try { locked = await d.responseLocked(slug) } catch { locked = false }
  if (locked) return d.fetchLive(slug, dateRange, channel)
```

- [ ] **Step 4: Run PASS** (all of `frozen.test.ts`, unchanged assertions). Step 5: **Commit** `feat(organic-social): Top Content locks with every other number for locked-months clients`.

### Task 6: Prove it

- [ ] Full suite, `npx tsc --noEmit`, `npm run -s check:rsc`; Task 0 unchanged.
- [ ] Renaissance drift check: RESULT no drift.
- [ ] Zero conflicts: `git merge-tree --write-tree` with 247, 250, 252, 253, 254, 255 and the outline-fixes branch (256 is the base); all merged in two orders on a scratch worktree off `origin/dev`, same tree, tests, tsc, `check:rsc` green.
- [ ] Nothing pushed without my go; then a stacked PR into `feat/os-locked-months`, retargeted to `organic-social-october` once 256 merges.

## Rollout (each step waits for my go)

1. Staging only: pre-change snapshot of the staging database's table list; `npm run db:migrate` against staging with a host guard (refuse unless the host is the staging endpoint); confirm only `dash_response_locks` was added; drift check.
2. The code reaches staging with the rest of the October set. The first read after deploy locks August (and September once Oct 5 passes) for the three clients; the cache warmer triggers it within the hour. Read the late-lock warnings in the logs to confirm which months were captured late (Decision 1).
3. Production: migration and code with the rest of the set, on my express written consent.

## Follow-ups (filed, not built)

- An unlock tool for the team (today: a documented `DELETE FROM dash_response_locks WHERE client_id = $1 AND period_end BETWEEN $2 AND $3`, run only with my go).
- Locking `getMedia` if it ever becomes a number source (it is unused today).
