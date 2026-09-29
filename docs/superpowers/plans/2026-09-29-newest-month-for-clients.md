# Clients see only the newest month, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An opted-in client picks from only its newest opened month (from Oct 12, September alone), while the team keeps every month, with the months clients no longer see tagged.

**Architecture:** One new optional knob, `clientMonths`, in the client's existing `reportingMonths` config. The pure month resolver (`lib/organic-social/reporting-months.ts`) stops a client's list after that many opened months; everything downstream (the picker, the served month, the redirect, Commentary) already follows that list. No route, component or query changes.

**Tech Stack:** Next.js 16 App Router, TypeScript, Vitest.

**Spec:** Jasmine on the call, 2026-09-29 (24:25): "can we remove the August view, like, after September has been added?" Confirmed on Slack the same day (5:12 PM), to my question "from Oct 12, clients only see September, and our team still sees both. Right?": "yes". The locked months rules this extends: `docs/superpowers/specs/2026-09-21-locked-months-design.md`, section 3.1 (config) and 3.7 (hidden-month attempts).

## Global Constraints
- Per-client opt-in. Absent `clientMonths` means today's behaviour, byte for byte (every opened month back to `firstMonth`, `reporting-months.ts:155-169`).
- Renaissance has no `reportingMonths` (staging read 2026-09-29), so `lockedRangeFor` returns null for it (`locked-range.ts:10-11`) and it never reaches this code. Nothing here writes to its row.
- `clientMonths`: a whole number from 1 to `MAX_REPORTING_MONTHS` (36). Anything else is a bad optional knob and fails closed exactly like `opensOnDay` today (spec 3.1): the team keeps its months tagged "Hidden from clients: config error", clients get none, and the section logs the slug and key (`index.tsx:89`).
- Locking never depends on it: `settledThrough`, `isLateLock` and the lock sweep read only `parsed.ok` and the day knobs (`lock-day.ts:31-40,90-95`, `lock-sweep.ts:15-17`).
- The team's list is unchanged apart from the new tag. Tags never reach a client (`option()`, `reporting-months.ts:144-149`).
- No dash characters outside code.
- Branch `feat/os-newest-month-for-clients`, cut from `dev` (8502f40), standalone. Checks: `DATABASE_URL=postgresql://ci:ci@db.invalid/ci make check`.

## Review Focus
1. Between the 1st and the opening day the newest opened month is still the previous one: on Oct 5 a client with `clientMonths: 1` sees August, not nothing (September has not opened). Pinned in Task 2.
2. An old bookmark to a month the client no longer sees redirects to the newest month and is NOT logged as a hidden-month attempt: that month is not secret, the client saw it last month. The live month and an unopened month still are attempts. Pinned in Task 2.
3. Commentary for a client still follows the newest month: its cutoff is `lastOf(locked.months[0].key)` (`components/report-sections/commentary/monthly.tsx:35`), and the cap always keeps `months[0]`. No change needed; the Task 2 tests pin that `months[0]` is unchanged.
4. A typo in `clientMonths` must never stop a month locking. Pinned in Task 2 (`settledThrough` equal with and without it).
5. The deep-link route (`/portal/[slug]/reports/[reportSlug]`) resolves the month inside the section (`components/report-sections/organic-social/index.tsx:85-96`), so an old deep link serves the newest month without a redirect. Same list, same answer; no change.

---

### Task 1: Read `clientMonths` from the config

**Files:**
- Modify: `lib/organic-social/reporting-months.ts:32` (the `Config` type) and `:104-129` (`parseReportingMonths`)
- Test: `lib/organic-social/reporting-months.test.ts` (already in the vitest include through `lib/organic-social/**`)

**Interfaces:**
- Produces: `Config.clientMonths?: number`, present only when the key is valid. `parseReportingMonths` names `'clientMonths'` as `badKey` when it is present and invalid.

- [ ] **Step 1: Write the failing test.** Inside `describe('config (edge 13)')`, after the test `'optional knobs default, validate, and name the first bad one; unknown keys are ignored'`:

```ts
  test('clientMonths is a whole number from 1 to 36; absent, it is not in the config at all', () => {
    expect(parseReportingMonths({ firstMonth: '2026-08', clientMonths: 1 })).toMatchObject({ ok: true, badKey: null, cfg: { clientMonths: 1 } })
    expect(parseReportingMonths({ firstMonth: '2026-08', clientMonths: 36 })).toMatchObject({ ok: true, badKey: null, cfg: { clientMonths: 36 } })
    const absent = parseReportingMonths({ firstMonth: '2026-08' })
    expect(absent.ok && absent.cfg).not.toHaveProperty('clientMonths')
    for (const v of [0, 37, 1.5, -1, '1', null, true]) {
      expect(parseReportingMonths({ firstMonth: '2026-08', clientMonths: v })).toMatchObject({ ok: true, badKey: 'clientMonths' })
    }
  })
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run lib/organic-social/reporting-months.test.ts -t "clientMonths is a whole number"`
Expected: FAIL (`cfg` has no `clientMonths`; `clientMonths: 0` is ignored as an unknown key, so `badKey` is null).

- [ ] **Step 3: Implement.** In `reporting-months.ts`, the type at `:32` becomes:

```ts
type Config = { firstMonth: string; opensOnDay: number; weekendRule: WeekendRule; comparison: Comparison; clientMonths?: number }
```

and the end of `parseReportingMonths` (`:122-128`, from the `comparison` block to the `return`) becomes:

```ts
  let comparison: Comparison = 'previous-month'
  if (hasOwn(value, 'comparison')) {
    const v = value.comparison
    if (v === 'previous-month' || v === 'previous-year') comparison = v
    else bad('comparison')
  }
  // How many of the newest opened months a client may pick (Jasmine, 2026-09-29). Absent: all of them.
  let clientMonths: number | undefined
  if (hasOwn(value, 'clientMonths')) {
    const v = value.clientMonths
    if (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= MAX_REPORTING_MONTHS) clientMonths = v
    else bad('clientMonths')
  }
  const cfg: Config = { firstMonth, opensOnDay, weekendRule, comparison }
  if (clientMonths !== undefined) cfg.clientMonths = clientMonths
  return { ok: true, cfg, badKey }
```

The existing test at `reporting-months.test.ts:77` compares `cfg` with `toEqual` against the four keys; with `clientMonths` absent it is not on the object, so that test is untouched.

- [ ] **Step 4: Run the file**

Run: `npx vitest run lib/organic-social/reporting-months.test.ts`
Expected: PASS, every test.

- [ ] **Step 5: Commit**

```bash
git add lib/organic-social/reporting-months.ts lib/organic-social/reporting-months.test.ts
git commit -m "feat(organic-social): reportingMonths reads an optional clientMonths"
```

### Task 2: Cap the client's list, tag the months clients no longer see

**Files:**
- Modify: `lib/organic-social/reporting-months.ts:138-151` (`option`), `:155-170` (`monthsFor`), `:195-199` (`hiddenMonthAttempt`)
- Modify: `docs/superpowers/specs/2026-09-21-locked-months-design.md:66-73` (the 3.1 table and the line under it)
- Test: `lib/organic-social/reporting-months.test.ts`

**Interfaces:**
- Consumes: `Config.clientMonths?: number` (Task 1).
- Produces: no new exports. `resolveLockedRange` returns a shorter `months` for a client; a team month past the cap carries `tag: 'No longer shown to clients'`.

- [ ] **Step 1: Write the failing tests.** Add `import { settledThrough } from './lock-day'` under the existing imports, and append at the end of the file:

```ts
// Jasmine, 2026-09-29: once September is out, clients see only September; the team keeps both.
describe('clientMonths: clients see only the newest opened months', () => {
  const ONE = { firstMonth: '2026-08', clientMonths: 1 }
  const OCT5 = C('2026-10-05', '2026-10-04')

  test('from the opening day a client sees only the newest month and lands on it', () => {
    const r = resolveLockedRange(ONE, 'client', OCT20, undefined)
    expect([keys(r), r.month?.key, r.reason]).toEqual([['2026-09'], '2026-09', 'ok'])
    expect(keys(resolveLockedRange(ONE, 'client', C('2026-10-12', '2026-10-11'), undefined))).toEqual(['2026-09'])
  })

  test('before the opening day the newest opened month is still the one before', () => {
    expect(keys(resolveLockedRange(ONE, 'client', OCT5, undefined))).toEqual(['2026-08'])
  })

  test('the team keeps every month, and the one clients no longer see is tagged', () => {
    const r = resolveLockedRange(ONE, 'team', OCT20, undefined)
    expect(r.months.map((m) => [m.key, m.tag])).toEqual([
      ['2026-10', 'Live, team only'], ['2026-09', null], ['2026-08', 'No longer shown to clients'],
    ])
    expect(r.month?.key).toBe('2026-09')
  })

  test('before the opening day the team sees the newer month as team only and the older one untagged', () => {
    expect(resolveLockedRange(ONE, 'team', OCT5, undefined).months.map((m) => [m.key, m.tag])).toEqual([
      ['2026-10', 'Live, team only'], ['2026-09', 'Team only until Oct 12'], ['2026-08', null],
    ])
  })

  test('an old link to a month clients no longer see goes to the newest month and is not logged as an attempt', () => {
    expect(resolveLockedRange(ONE, 'client', OCT20, 'custom:2026-08-01,2026-08-31'))
      .toMatchObject({ outcome: 'replaced', hiddenMonthAttempt: false, month: { key: '2026-09' } })
  })

  test('reaching for the live month or an unopened month is still an attempt', () => {
    expect(resolveLockedRange(ONE, 'client', OCT20, 'custom:2026-10-01,2026-10-19')).toMatchObject({ outcome: 'replaced', hiddenMonthAttempt: true })
    expect(resolveLockedRange(ONE, 'client', OCT5, 'custom:2026-09-01,2026-09-30'))
      .toMatchObject({ outcome: 'replaced', hiddenMonthAttempt: true, month: { key: '2026-08' } })
  })

  test('the newest month is canonical and stays put', () => {
    expect(resolveLockedRange(ONE, 'client', OCT20, 'custom:2026-09-01,2026-09-30')).toMatchObject({ outcome: 'canonical', month: { key: '2026-09' } })
  })

  test('two months: the newest two; absent: every opened month, as today', () => {
    const dec20 = C('2026-12-20', '2026-12-19')
    expect(keys(resolveLockedRange({ ...ONE, clientMonths: 2 }, 'client', dec20, undefined))).toEqual(['2026-11', '2026-10'])
    expect(keys(resolveLockedRange(CFG, 'client', dec20, undefined))).toEqual(['2026-11', '2026-10', '2026-09', '2026-08'])
  })

  test('a bad clientMonths hides every month from clients and tags them for the team, like any bad knob', () => {
    const bad = { firstMonth: '2026-08', clientMonths: 0 }
    expect(resolveLockedRange(bad, 'client', OCT20, undefined)).toMatchObject({ months: [], month: null, reason: 'malformed-config', malformedKey: 'clientMonths' })
    expect(resolveLockedRange(bad, 'team', OCT20, undefined).months.map((m) => m.tag))
      .toEqual(['Live, team only', 'Hidden from clients: config error', 'Hidden from clients: config error'])
  })

  test('locking never reads clientMonths: the settled day is the same with or without it, or with a bad one', () => {
    for (const today of ['2026-10-04', '2026-10-05', '2026-10-20', '2026-11-05']) {
      expect(settledThrough(ONE, today)).toBe(settledThrough(CFG, today))
      expect(settledThrough({ ...ONE, clientMonths: 0 }, today)).toBe(settledThrough(CFG, today))
    }
  })
})
```

(Dates checked against `opensOn`: August opens 2026-09-14, September 2026-10-12, October 2026-11-12, November 2026-12-14 because 12 Dec 2026 is a Saturday; the existing test at `reporting-months.test.ts:55-57` pins the same calendar.)

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run lib/organic-social/reporting-months.test.ts -t "clientMonths: clients see"`
Expected: FAIL on the list, tag and attempt tests (the client still gets August). The canonical, bad-knob and locking tests already pass after Task 1; that is expected, they pin behaviour that must not move.

- [ ] **Step 3: Implement.** `option` (`:138`) takes one more argument and one more tag rule:

```ts
function option(key: string, live: boolean, end: string, cfg: Config, badKey: string | null, viewer: Viewer, clock: Clock, agedOut: boolean): MonthOption {
  const open = opensOn(key, cfg.opensOnDay, cfg.weekendRule)
  const cmp = comparisonFor(key, end, live, cfg.comparison)
  const label = live
    ? `${monthTitle(key)}, through ${shortDay(end)}${clock.liveDayInProgress ? ' (in progress)' : ''}`
    : monthTitle(key)
  let tag: string | null = null
  if (viewer === 'team') {
    if (live) tag = 'Live, team only'
    else if (badKey) tag = 'Hidden from clients: config error'
    else if (clock.today < open) tag = `Team only until ${shortDay(open)}`
    else if (agedOut) tag = 'No longer shown to clients'
  }
  return { key, label, dateRange: `custom:${firstOf(key)},${end}`, compareRange: cmp.range, compareLabel: cmp.label, live, opensOn: open, tag }
}
```

`monthsFor` (`:155-170`) becomes:

```ts
/** Newest first: the team gets the live month (when there is one) and every finished month back to
 *  firstMonth; a client gets the finished months that have opened, only the newest `clientMonths` of
 *  them when that is set (the team keeps the rest, tagged). Bounded by MAX_REPORTING_MONTHS. */
function monthsFor(cfg: Config, badKey: string | null, viewer: Viewer, clock: Clock): MonthOption[] {
  const current = monthOf(clock.today)
  const out: MonthOption[] = []
  if (viewer === 'team' && current >= cfg.firstMonth && liveExists(current, clock)) {
    out.push(option(current, true, clock.lastCompleteUtcDay, cfg, badKey, viewer, clock, false))
  }
  if (viewer === 'client' && badKey) return out
  let opened = 0
  let key = addMonths(current, -1)
  for (let i = 0; i < MAX_REPORTING_MONTHS + 2 && key >= cfg.firstMonth && out.length < MAX_REPORTING_MONTHS; i++, key = addMonths(key, -1)) {
    const isOpen = clock.today >= opensOn(key, cfg.opensOnDay, cfg.weekendRule)
    if (viewer === 'client' && !isOpen) continue
    // Every month older than an opened month has opened too, so once one is past the cap all older ones are.
    const agedOut = isOpen && cfg.clientMonths !== undefined && opened >= cfg.clientMonths
    if (isOpen) opened++
    if (viewer === 'client' && agedOut) break
    out.push(option(key, false, lastOf(key), cfg, badKey, viewer, clock, agedOut))
  }
  return out
}
```

In `resolveLockedRange`, the attempt check (`:195-199`) becomes:

```ts
  // A hidden-month attempt (logged): a whole-month or live-month request for a month that exists but
  // is not in a CLIENT's list, i.e. the live month or a finished month that has not opened (spec 3.7).
  // A month the client saw before and no longer does (older than the last one listed under clientMonths)
  // is not hidden: an old link to it is replaced with the newest month and not logged.
  const wholeOrLive = reqKey !== null && (reqKey === current ? liveExists(current, clock) : req!.end === lastOf(reqKey))
  const agedOut = cfg.clientMonths !== undefined && months.length > 0 && reqKey !== null && reqKey < months[months.length - 1].key
  const hiddenMonthAttempt = viewer === 'client' && match === null && wholeOrLive && !agedOut
    && reqKey! >= cfg.firstMonth && reqKey! <= current && !months.some((m) => m.key === reqKey)
```

- [ ] **Step 4: Run the file**

Run: `npx vitest run lib/organic-social/reporting-months.test.ts`
Expected: PASS, every test, old and new.

- [ ] **Step 5: Update the spec's config table.** In `docs/superpowers/specs/2026-09-21-locked-months-design.md`, add a row after the `comparison` row (`:70`):

```markdown
| `clientMonths` | no | integer 1 to 36: how many of the newest opened months a client may pick; older months stay in the team's list, tagged "No longer shown to clients", and an old link to one goes to the newest month without a log line | every opened month |
```

and change the sentence under the table (`:72`) from "The opted-in clients set only `firstMonth`." to "The opted-in clients set `firstMonth`, and `clientMonths: 1` (Jasmine, 2026-09-29: clients see only the newest month)."

- [ ] **Step 6: Run everything that reads the month list, and commit**

Run: `npx vitest run lib/organic-social/ lib/commentary/ components/report-sections/organic-social/ components/report-sections/commentary/`
Expected: PASS, no existing expectation changes.

```bash
git add lib/organic-social/reporting-months.ts lib/organic-social/reporting-months.test.ts docs/superpowers/specs/2026-09-21-locked-months-design.md
git commit -m "feat(organic-social): Clients see only their newest months when clientMonths is set"
```

### Task 3: Prove it and hand it over

- [ ] Run `DATABASE_URL=postgresql://ci:ci@db.invalid/ci make check`. Expected: typecheck, every test, the RSC check and `next build` pass.
- [ ] Run `npx eslint lib/organic-social/reporting-months.ts lib/organic-social/reporting-months.test.ts`. Expected: clean.
- [ ] Merge proof, pair by pair and all together in both orders, against every open PR branch (#281, #282, #283, #284, #285, #286, #287 and the no-post notes branch `feat/os-notes-without-posts`). Expected: clean; none of them touches `reporting-months.ts`, its test or the locked months spec (checked 2026-09-29).
- [ ] Renaissance: it has no `reportingMonths`, so `lockedRangeFor` returns null before this code runs (`locked-range.ts:11`). The Organic Social goldens (`v1-render.golden.test.tsx`, `platform-headlines.golden.test.tsx`) pass unchanged in the `make check` run.
- [ ] Look at it on the local app (dev database): set `clientMonths: 1` on one local outline client and open its report as staff. Until Oct 12 August is still the newest opened month, so the picker must look exactly as before (September live, August untagged); the Oct 12 picture is what the Task 2 tests pin with a fixed clock. A client view needs a client login, which I sign in to myself.
- [ ] Push, mark the PR ready, request Paul.

### Task 4: Turn it on for the outline clients on staging (after the PR is on staging, my go)

Not code in this repo: a guarded staging write. The config holds the brand id, so the script lives in my private folder (`~/.claude/organic-social-work/probes/staging-set-client-months.ts`) and is copied to the repo root as `zz-set-client-months.ts` to run (module resolution), then deleted. Old code ignores unknown keys (`parseReportingMonths`, "Unknown extra keys are ignored", spec 3.1), so the key is safe in the row before the code lands; it is set after, so Jasmine sees the change when it happens.

- [ ] **Step 1: Write the script**

```ts
// Staging only. Sets reportingMonths.clientMonths = 1 on the five outline clients. Dry run unless --write.
import { readFileSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'

const SLUGS = ['a-place-for-mom', 'akara-living', 'joy-of-life', 'piper-aircraft', 'pimco'] as const
const WRITE = process.argv.includes('--write')

async function main() {
  const line = readFileSync('.env.staging', 'utf8').split('\n').find((l) => l.startsWith('DATABASE_URL='))!
  const url = line.slice('DATABASE_URL='.length).replace(/^["']|["']$/g, '')
  if (!url.includes('restless-union')) throw new Error('REFUSED: not the staging host')
  if ((SLUGS as readonly string[]).includes('renaissance')) throw new Error('REFUSED: Renaissance is never written')
  const q = neon(url)
  const renMd5 = async () => (await q`SELECT md5((to_jsonb(c) - 'updated_at')::text) AS h FROM clients c WHERE slug = 'renaissance'`)[0]?.h
  const renBefore = await renMd5()
  for (const slug of SLUGS) {
    const [row] = await q`SELECT dash_social_config->'reportingMonths' AS rm FROM clients WHERE slug = ${slug} AND dash_social_config ? 'reportingMonths'`
    if (!row) throw new Error(`REFUSED: ${slug} has no reportingMonths`)
    console.log(`${slug}: before ${JSON.stringify(row.rm)}`)
    if (!WRITE) continue
    const [after] = await q`UPDATE clients
      SET dash_social_config = jsonb_set(dash_social_config, '{reportingMonths,clientMonths}', '1'::jsonb), updated_at = now()
      WHERE slug = ${slug} AND dash_social_config ? 'reportingMonths'
      RETURNING dash_social_config->'reportingMonths' AS rm`
    console.log(`${slug}: after  ${JSON.stringify(after.rm)}`)
  }
  const renAfter = await renMd5()
  console.log(`renaissance row ${renBefore === renAfter ? 'unchanged' : 'CHANGED'}`)
  if (renBefore !== renAfter) process.exit(1)
}
main().catch((e) => { console.error('failed:', e instanceof Error ? e.message : e); process.exit(1) })
```

It prints only `reportingMonths` (never the brand id) and the Renaissance row hash comparison.

- [ ] **Step 2: Dry run.** From the repo root: `cp ~/.claude/organic-social-work/probes/staging-set-client-months.ts zz-set-client-months.ts && perl -e 'alarm 60; exec @ARGV' -- npx tsx zz-set-client-months.ts; rm -f zz-set-client-months.ts`. Expected: five "before" lines, each `{"firstMonth":"2026-08"}`, and "renaissance row unchanged". Save the output next to the script.
- [ ] **Step 3: On my go, write.** The same with `--write`. Expected: five "after" lines with `"clientMonths":1`, "renaissance row unchanged". Save the output.
- [ ] **Step 4: Check it on staging.** As staff, each client's month picker shows August tagged "No longer shown to clients" once September opens (Oct 12); before that, nothing visible changes for anyone. Production gets the same setting at launch, with my written consent.
