# Organic Social past months, option B: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Author: Thomas Chang. "I", "me" and "my" mean me. Date: 2026-11-24.

**Goal:** a client moved to the design kit keeps every month before `dash_social_config.designFrom` in the look it was
delivered in, and gets the kit from that month on.

**Architecture:** one pure table says which old version each kit version draws (`kit-wraps.ts`), one pure rule says
whether the kit applies to a served month (`design-from.ts`). The Organic Social body maps each resolved part to the
version it draws, and the two boxes and the AEO tab gate their `look` on the same rule with the same served month. A
pure pin check, in the repo and tested, keeps the private pin script from pinning a kit version over anything but the
version it wraps.

**Tech Stack:** Next.js 16 server components, TypeScript strict, Vitest 3 with jsdom.

**Spec:** `docs/superpowers/specs/2026-11-24-os-design-past-months.md` (Paul on #504, 2026-11-24: "1: B", "2: agree").

**When:** cut from `dev` after #497 to #503 merge (the table names versions that exist only then). #508 is not
required. Every line reference below is to the combined tree (dev, #497 to #505 and #508; tree `9476ab5a`), and
moves only if `dev` changes first; re-check each before editing.

## Global Constraints

- `designFrom` is a string `YYYY-MM` on `dash_social_config`, written only by the guarded pin script (spec section 4).
- The rule, in this order (spec section 3, absent changed to old on Paul's #504 review): absent: old on every month
  (not logged); malformed: old on every month (logged); valid and served
  month on or after it: kit; valid and before: old; valid and no served month: old. Inclusive at the month itself.
- "Old" is exactly the version the kit version wraps (spec section 3 table). No other version, ever.
- No request, no lock key and no getter changes (spec section 5). `lib/organic-social/lock-key-pin.test.ts` and
  `aeo-tab/aeo-lock-key-pin.test.ts` stay untouched and green.
- Social Listening is unchanged (spec section 3). Renaissance has no `designFrom` and no kit pin: byte-identical.
- A malformed `designFrom` is logged once per render, with the slug and the value, never the brand id.
- No schema change, no migration, no new client-side prop beyond the string `monthKey` on a server component.

## Review Focus

1. A frozen composition (`override.frozen`, `lib/report-sections/resolve.ts:9-12`) holding a kit version must be mapped
   like any pin. Test: Task 3, "a frozen snapshot is mapped too".
2. A kit pin without `designFrom` (the admin save accepts kit versions, `lib/report-sections/validate.ts:52-53`, `:78`)
   must draw the old look on every month. Test: Task 3, "no designFrom: the wrapped versions on every month". Both
   live on one row read through one 300 s cache (`lib/db/queries.ts:34`); Task 7 still writes them in one UPDATE, so
   the kit never appears before its `designFrom` is readable.
3. Social Listening's boxes call `monthlyCommentary` with no `look`
   (`organic-social/social-listening/section.tsx:106-109`) and must keep the kit whatever `designFrom` says. Test:
   Task 4, "Social Listening keeps its own panel".
4. `commentary@2` pinned on another report keeps today's panel whatever `designFrom` says. Test: Task 4.
5. On the same day, staff on the in-progress month at or after `designFrom` see the kit while a client sees an older
   month in the old look. Test: Task 3, "staff and a client on the same day".

## Decisions this plan makes (each is mine to make under the spec; listed so a reviewer can disagree)

1. **Absent means no own `designFrom` key.** Any present value that is not `YYYY-MM`, `null` included, is malformed.
   Both draw the old look (Paul, #504); only malformed is logged. Same own-key test as `hasReportingMonths`
   (`lib/organic-social/reporting-months.ts:75-79`). Cost if wrong: a `null` meant as "off" is logged.
2. **A failed client read in the body means no kit** (`!lockReadFailed && kitActive(...)`). Today the override is then
   undefined anyway (`index.tsx:147-162`); this keeps a partial failure on the safe side.
3. **Only the body logs a malformed value**, in its parts path and its AEO branch, so one render logs once. The boxes
   and the AEO section apply the rule silently.
4. **The boxes are gated by `look`, not by a version map.** `commentary@2` and `recommendations@2` are `@1` plus
   `look` (`shared/parts/registry.tsx:45-58`), so dropping `look` is drawing `@1`. Their table exists only for the pin
   check.
5. **The pin check is a pure, tested function in the repo** (Task 6), called by the private script through `--code` as
   its validator already is (`~/.claude/organic-social-work/probes/lib/validate-rsc.mts`). That makes spec test 10 a
   repo test.
6. **The pin script refuses a `designFrom` at or before the newest month a client can already see.** Writing one would
   redraw a delivered month in the kit, which is what B exists to prevent. Not in the spec's words; follows from its
   section 1.
7. **The pin script refuses a config that already has `designFrom`, and one whose `reportingMonths` does not parse.**
   Moving a client's start month is a deliberate change of its own, not a side effect of a pin; an unparseable
   `reportingMonths` gives no months (`reporting-months.ts:199-200`), which would otherwise pass the delivered-month check.
8. **A client without reporting months never gets the kit, and the AEO tab's `design: "kit"` needs `designFrom` too.**
   Both follow from absent = old (spec section 3). The code still calls `kitActive` on those paths (it is `false` for
   every input there today), so the one rule decides everywhere.

## Files

| File | Change |
|---|---|
| `lib/organic-social/kit-wraps.ts` | New. `KIT_WRAPS`, `SHARED_KIT_WRAPS`, `drawnVersion` |
| `lib/organic-social/design-from.ts` | New. `parseDesignFrom`, `kitActive`, `logMalformedDesignFrom`, `designFromWriteProblem` |
| `lib/organic-social/design-from.rows.ts` | New, test data only. `DESIGN_FROM_ROWS`, shared by every surface's tests so they cannot disagree |
| `lib/organic-social/kit-pin-check.ts` | New. `kitPinProblems`, `sharedKitPinProblems` |
| `lib/organic-social/influencer-tab.ts` | `SPLIT_BASIS` (`:45`) becomes `KIT_WRAPS['top-content']` |
| `components/report-sections/organic-social/index.tsx` | Body parts path (`:167-179`) and AEO branch (`:107-121`) |
| `components/report-sections/commentary/monthly.tsx` | `look` gated at `:41` and `:75` |
| `components/report-sections/commentary/index.tsx` | `kitLook` (`:22`) split; `:27` and `:66` |
| `components/report-sections/organic-social/aeo-informed/section.tsx` | `monthKey` prop (`:40-42`); `kitLook` (`:84`) |
| Tests | Beside each file; `index.design-from.test.tsx` new; `commentary-kit-section.test.tsx`, `aeo-informed/kit.test.tsx`, `section.test.tsx`, `influencer-tab.test.ts`, `index.test.tsx` extended |

---

### Task 1: The table of what each kit version draws

**Files:** create `lib/organic-social/kit-wraps.ts`, `lib/organic-social/kit-wraps.test.ts`; modify
`lib/organic-social/influencer-tab.ts:43-45`, `lib/organic-social/influencer-tab.test.ts:43-53`.

**Interfaces:**
- Produces: `KIT_WRAPS: Readonly<Record<string, Readonly<Record<number, number>>>>` (part id, kit version, wrapped
  version); `SHARED_KIT_WRAPS` (same shape, `commentary` and `recommendations`); `drawnVersion(id: string, version:
  number, kitActive: boolean): number`.

- [ ] **Step 1: Write the failing tests** in `kit-wraps.test.ts`:

```ts
import { ORGANIC_SOCIAL_PARTS, PRE_KIT_PARTS } from '@/components/report-sections/organic-social/parts/registry'
import { SHARED_PARTS } from '@/components/report-sections/shared/parts/registry'
const pins = (reg: Record<string, Record<number, unknown>>) => Object.entries(reg).flatMap(([id, vs]) => Object.keys(vs).map((v) => `${id}@${v}`))
test('names exactly the kit versions the registry holds', () => {
  const kit = pins(ORGANIC_SOCIAL_PARTS).filter((p) => !pins(PRE_KIT_PARTS).includes(p)).sort()
  expect(Object.entries(KIT_WRAPS).flatMap(([id, m]) => Object.keys(m).map((v) => `${id}@${v}`)).sort()).toEqual(kit)
})
// Labels cannot prove this: platform-headlines @1 to @3 and ytd-review @1 to @4 share one label each. Every kit version
// calls its wrapped version's render when it runs (tiles-kit.tsx:53, trends-kit.tsx:64, posts-kit.tsx:80,
// ytd-kit.tsx:92, kpi-kit.tsx:75), so the test spies on exactly that render.
test.each(Object.entries(KIT_WRAPS).flatMap(([id, m]) => Object.entries(m).map(([kit, old]) => [id, Number(kit), old] as const)))(
  '%s@%i renders exactly the version it wraps, @%i', (id, kit, old) => {
    const wrapped = PRE_KIT_PARTS[id]?.[old]
    expect(wrapped).toBeDefined()
    const others = Object.values(PRE_KIT_PARTS[id]).filter((p) => p !== wrapped).map((p) => vi.spyOn(p, 'render').mockReturnValue(null))
    const spy = vi.spyOn(wrapped!, 'render').mockReturnValue(null)
    const ctx = { clientSlug: 'c' } as never, part = { id, version: kit, label: 'x' }
    ORGANIC_SOCIAL_PARTS[id][kit].render(ctx, part)
    expect(spy).toHaveBeenCalledExactlyOnceWith(ctx, part)
    for (const o of others) expect(o).not.toHaveBeenCalled()
  })
afterEach(() => vi.restoreAllMocks()) // as index.test.tsx:160: a failing row must not leave a spy for the next
test('the shared boxes: every version after @1 is in SHARED_KIT_WRAPS and wraps a registered version', () => { ... })
test('drawnVersion', () => {
  expect(drawnVersion('top-content', 4, true)).toBe(4)
  expect(drawnVersion('top-content', 4, false)).toBe(3)
  expect(drawnVersion('platform-headlines', 6, false)).toBe(1)
  expect(drawnVersion('top-content', 2, false)).toBe(2) // not a kit version
  expect(drawnVersion('not-a-part', 7, false)).toBe(7)
})
```

- [ ] **Step 2: Run** `npx vitest run lib/organic-social/kit-wraps.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement `kit-wraps.ts`.** Values exactly the spec's table (section 3), read from the code:
  `platform-headlines` 4:2, 5:3, 6:1 (`parts/tiles-kit.tsx:58-63`); `engagement-breakdown` 2:1 (`:65`);
  `follower-graph` 3:2 (`parts/trends-kit.tsx:69`); `engagement-trend` 3:2, 4:1 (`:71-73`); `ytd-review` 5:2
  (`parts/ytd-kit.tsx:86-93`); `top-content` 4:3, 5:2 (`parts/posts-kit.tsx:85-87`); `influencer-posts` 2:1 (`:89`);
  `kpi-check-in` 2:1 (`parts/kpi-kit.tsx:69-76`); shared `commentary` 2:1, `recommendations` 2:1
  (`shared/parts/registry.tsx:57-58`). Pure data, no imports from `components/`.
- [ ] **Step 4: Point `SPLIT_BASIS` at the table.** `influencer-tab.ts:45` becomes `KIT_WRAPS['top-content']`; the doc
  comment at `:43-44` names `kit-wraps.ts`. In `influencer-tab.test.ts:43-53`, the local `WRAPS` and the
  `KIT_POSTS_PARTS` guard go; the loop runs over `Object.entries(KIT_WRAPS['top-content'])`. Coverage of every kit
  version now lives in `kit-wraps.test.ts`, which also closes #507's point that an unmapped future version falls to
  `designations`.
- [ ] **Step 5: Run** `npx vitest run lib/organic-social/kit-wraps.test.ts lib/organic-social/influencer-tab.test.ts
  components/report-sections/organic-social/parts`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(organic-social): one table of what each kit version draws`.

### Task 2: The rule and the setting

**Files:** create `lib/organic-social/design-from.ts`, `design-from.rows.ts`, `design-from.test.ts`.

**Interfaces:**
- Consumes: `resolveLockedRange`, `Clock` (`lib/organic-social/reporting-months.ts:8`, `:196`).
- Produces:
  - `type DesignFrom = { kind: 'absent' } | { kind: 'ok'; month: string } | { kind: 'malformed'; value: unknown }`
  - `parseDesignFrom(client: unknown): DesignFrom`
  - `kitActive(client: unknown, monthKey: string | null): boolean`
  - `logMalformedDesignFrom(slug: string, value: unknown): void`
  - `designFromWriteProblem(dashSocialConfig: unknown, designFrom: string, clock: Clock): string | null`
  - `DESIGN_FROM_ROWS: { name: string; designFrom?: unknown; month: string | null; kit: boolean }[]` (`designFrom`
    omitted means the key is absent)

- [ ] **Step 1: Write the rows** (`design-from.rows.ts`), one per spec row and edge. Every month is one the surface tests
  can actually serve (their clock 2026-11-24 and `firstMonth: '2026-08'` give staff 2026-08 to 2026-11 and a client
  2026-08 to 2026-10; any other request is replaced, `reporting-months.ts:207-210`); `month: null` is served by a client
  without `reportingMonths`. Absent with `'2026-10'`, `'2026-11'` and `null`: old; malformed `null`, `'2026-13'`, `'2026-1'`,
  `202611`, `'2026-11-01'`, `' 2026-11'`, each with `'2026-10'`, and `'2026-13'` with `null`: old; valid `'2026-11'` with
  `'2026-10'`: old, `'2026-11'`: kit (inclusive), `null`: old; valid `'2026-09'` with `'2026-10'`: kit (after it); valid
  `'2027-01'` with `'2026-11'`: old (later than every open month, edge 2). Rows for `kitActive` alone, never served by a
  surface, live in `design-from.test.ts`: valid `'2026-01'` with `'2025-12'`: old, with `'2026-01'`: kit (the year
  boundary).
- [ ] **Step 2: Write the failing tests** (`design-from.test.ts`):
  - `test.each(DESIGN_FROM_ROWS)('%s')`: `kitActive({ dashSocialConfig: { brandId: 1, ...(designFrom key when present) } }, month)` equals `kit`.
  - `parseDesignFrom` of `null`, `undefined`, `{}`, `{ dashSocialConfig: null }`, `{ dashSocialConfig: [] }`: `{ kind: 'absent' }`.
  - `logMalformedDesignFrom('c', '2026-13')` logs exactly
    `[organic-social] designFrom setting is invalid slug=c value="2026-13"` via `console.error`; a 100-character value
    is cut to 32 characters; a value holding `\n` or `\u2028` stays on one line; a non-string value is logged as
    `JSON.stringify(String(value))`, so `202611` logs `value="202611"` and `null` logs `value="null"`.
  - `designFromWriteProblem` with `clockFor(new Date('2026-11-24T15:00:00Z'))` and
    `{ reportingMonths: { firstMonth: '2026-08' } }`: `'2026-11'` and `'2027-01'` give `null`; `'2026-10'` names
    `2026-10` (a client can already see October); `'nope'` names the format; no `reportingMonths` names it;
    `reportingMonths: null` and `{ firstMonth: 'x' }` (they do not parse) name it; a config that already has
    `designFrom` names it (Decision 7).
- [ ] **Step 3: Run** `npx vitest run lib/organic-social/design-from.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 4: Implement.** Pattern of `notesOn` (`lib/organic-social/chart-notes/enabled.ts:6-10`): synchronous, no
  I/O, `unknown` in. Own-key test as `hasReportingMonths` (`reporting-months.ts:75-79`). Month format: its own
  `/^\d{4}-(0[1-9]|1[0-2])$/`, the same as `reporting-months.ts:36` (not exported there; that file is on Renaissance's
  path and stays untouched). Compare month keys as strings. Log line escaping as `logHiddenMonthAttempt`
  (`lib/organic-social/locked-range.ts:16-24`). `designFromWriteProblem` reads the client's months through
  `resolveLockedRange(cfg.reportingMonths, 'client', clock, undefined).months` (newest first, `monthsFor`,
  `reporting-months.ts:168-187`)
  and refuses when any month key is at or after `designFrom`. It first refuses when
  `parseReportingMonths(cfg.reportingMonths).ok` is false (`reporting-months.ts:104`), since that gives `months: []`.
- [ ] **Step 5: Run** the same command. Expected: PASS.
- [ ] **Step 6: Commit** `feat(organic-social): the designFrom setting and the one rule`.

### Task 3: The body draws each part's month look

**Files:** modify `components/report-sections/organic-social/index.tsx`; create
`components/report-sections/organic-social/index.design-from.test.tsx`.

**Interfaces:** consumes `drawnVersion` (Task 1), `kitActive`, `parseDesignFrom`, `logMalformedDesignFrom` (Task 2).

- [ ] **Step 1: Write the failing tests.** Harness as `index.test.tsx:147-162`: mock `@/lib/db/queries`, spy
  `registry.lookup` to record `${id}@${version}`, the ctx and the resolved part, fake `Date` at
  `2026-11-24T15:00:00Z`, `getSectionTemplate` resolving `null`. Two clients: `KIT`, with the platform pins
  `platform-headlines: 4, follower-graph: 3, engagement-trend: 3, top-content: 4`, extraParts `engagement-breakdown@2`
  and `ytd-review@5`, Overview extraParts `kpi-check-in@2`, `organic-social:influencer` versions
  `influencer-posts: 2`, `reportingMonths: { firstMonth: '2026-08' }`, `designFrom: '2026-11'`; and `BEFORE`, the same
  with every pin at the version it wraps and no `designFrom`. Tests:
  - "a month before designFrom asks for exactly what the client drew before its pin, with the same ctx and part":
    staff and a client, Overview, Instagram and the Influencer tab, requesting September: the recorded calls for `KIT`
    equal those for `BEFORE`. The same on November: `KIT`'s calls equal `BEFORE`'s with each version mapped to its kit
    version, and the same ctx (the new-month half of spec test 8).
  - "from designFrom, the kit versions": staff on November asks `platform-headlines@4`, `follower-graph@3`,
    `engagement-trend@3`, `top-content@4`, `engagement-breakdown@2`, `ytd-review@5`.
  - "staff and a client on the same day": staff (November) get the kit, a client (October) the old versions.
  - "a past month's returned tree equals the old composition's": `elementTree` (`lib/test-utils/element-tree.ts`) of
    the body for `KIT` and `BEFORE` in September, with `lookup` returning a marker element per part, are equal: same
    keys, same `data-export-block` (spec test 6; each version's own markup is round 2's parity tests).
  - "no designFrom: the wrapped versions on every month": `KIT` without `designFrom` asks `BEFORE`'s versions in
    September and in November (spec test 7; Paul, #504). `BEFORE` asks the same with or without `designFrom`.
  - "malformed: the old versions on every month, logged once": `designFrom: '2026-13'`; one
    `designFrom setting is invalid slug=c` line per body render.
  - "no reporting months: the old versions, with a valid designFrom or none".
  - "malformed with no months to serve: logged once, then the no-months line": `designFrom: '2026-13'` and
    `reportingMonths: { firstMonth: '2027-01' }`; one log line and the `NoMonths` element.
  - "a frozen snapshot is mapped too": `override.frozen` holding `top-content@4`, September: `top-content@3`.
  - `test.each(DESIGN_FROM_ROWS)` on the Instagram tab (spec test 9): staff requesting the row's month (a row with
    `month: null` uses a client without `reportingMonths`). First assert the served month is the row's month (the
    recorded ctx's `dateRange` starts on its first day, or is the request itself for `month: null`), then that it asks
    `top-content@4` exactly when the row says kit, else `top-content@3`. Task 4 runs every row the same way through the
    boxes. Task 5 runs every row through the AEO section, which is handed `monthKey`; the body's hand-off of the served
    month on the AEO tab is pinned by Task 5's `index.test.tsx:165-172` cases.
  - A client read failure still draws the code template (the existing test, `index.test.tsx:43-53`, stays green).
- [ ] **Step 2: Run** `npx vitest run components/report-sections/organic-social/index.design-from.test.tsx`.
  Expected: FAIL on every case that expects a wrapped version or the log.
- [ ] **Step 3: Implement** in the parts path. Right after `:171` (the malformed-config log) and before the
  `NoMonths` return at `:172`, log `parseDesignFrom(lockClient)` when malformed (skip it when `lockReadFailed`), so a
  client with no months still logs once. After `:172`:
  `const kit = !lockReadFailed && kitActive(lockClient, locked?.month?.key ?? null)`; `:179` maps
  `resolveSection(template, override)` through `drawnVersion(r.id, r.version, kit)`. The key and `wrapsAsBlock` at
  `:187` then use the drawn version with no further change.
- [ ] **Step 4: Run** the new file and `components/report-sections/organic-social/index.test.tsx` (Renaissance's
  composition, `:268-282`, unchanged). Expected: PASS.
- [ ] **Step 5: Commit** `feat(organic-social): a month before designFrom draws the version it was delivered in`.

### Task 4: The boxes follow the same rule

**Files:** modify `components/report-sections/commentary/monthly.tsx:35-41`, `:75`;
`components/report-sections/commentary/index.tsx:22`, `:27`, `:66`; extend `commentary-kit-section.test.tsx`.

**Interfaces:** consumes `kitActive`, `DESIGN_FROM_ROWS` (Task 2).

- [ ] **Step 1: Write the failing tests.** Mock `requestClock` to `clockFor(new Date('2026-11-24T15:00:00Z'))` (the
  existing tests depend on the real date, #507). Every row of `DESIGN_FROM_ROWS` runs, none filtered out:
  - a row with a month, locked-months branch: client with `reportingMonths: { firstMonth: '2026-08' }`, staff
    requesting that month on `organic-social:instagram` with `look: 'kit'`. First assert the panel's `defaultPeriod`
    starts on the row's month (it was served, `monthly.tsx:71`); then it gets `look: 'kit'` exactly when the row says kit.
  - no-months branch (`firstMonth: '2027-01'`, so `month` is null, `monthly.tsx:37-41`): `look` exactly when the row
    with `month: null` says kit.
  - non-month branch (no `reportingMonths`, `commentary/index.tsx:56-67`): the `month: null` rows, all old.
  - Round 2's own cases change with the rule (#503, `commentary-kit-section.test.tsx`): `:49-54` (locked months, no
    `designFrom`) gains `designFrom: '2026-10'` and a request for October, and still gets the kit; `:34-38` used a
    client without reporting months, which now never gets the kit, so it moves to a locked-months client with
    `designFrom` for the three view keys, and a new case pins that the no-months client gets no `look`.
  - Regression guard, passes before the change too: "Social Listening keeps its own panel": `monthlyCommentary` with `Panel` and no `look`, `designFrom: '2026-12'`:
    the panel gets no `look` key, as today.
  - Regression guard, passes before the change too: "another report keeps today's panel": `peec-ai` with `look: 'kit'` and `designFrom: '2026-01'`: no `look` key.
  - Without `look` the panel props equal today's on every branch (#503's snapshots stand).
- [ ] **Step 2: Run** `npx vitest run components/report-sections/commentary`. Expected: FAIL on the rows that expect
  no `look`.
- [ ] **Step 3: Implement.** `index.tsx:22` becomes `wantsKit = look === 'kit' && isOrganicSocialViewKey(viewKey)`;
  `:27` passes `look` when `wantsKit` (the month decides inside `monthlyCommentary`); `:66` passes it when
  `wantsKit && kitActive(client, null)`, which is `false` for every client today (Decision 8). `monthly.tsx`, after `:36`: the `look` it passes at `:41` and `:75` is kept
  only when `kitActive(client, month?.key ?? null)`.
- [ ] **Step 4: Run** the same command and `components/report-sections/organic-social/social-listening`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(commentary): the boxes draw a month before designFrom as delivered`.

### Task 5: The AEO tab follows the same rule

**Files:** modify `aeo-informed/section.tsx:40-42`, `:84`; `organic-social/index.tsx:112-120`; extend
`aeo-informed/kit.test.tsx`, `aeo-informed/section.test.tsx`, `organic-social/index.test.tsx:112`, `:165-172`.

**Interfaces:** consumes `kitActive`, `parseDesignFrom`, `logMalformedDesignFrom`. Produces the prop
`monthKey: string | null` on `AeoInformedSection`.

- [ ] **Step 1: Write the failing tests.** `kit.test.tsx`: with `design: 'kit'` and `designFrom: '2026-11'`,
  `monthKey: '2026-10'` gives the markup of the no-design snapshot (old), `'2026-11'` gives `kit.root`; `designFrom:
  '2026-13'` gives old; `monthKey: null` with a valid `designFrom` gives old; and `test.each(DESIGN_FROM_ROWS)`:
  `kit.root` on the section's wrapper exactly when the row says kit. The props helpers in both test files
  (`kit.test.tsx:47`) add `monthKey: '2026-10'`. Round 2's own kit cases (#502, `kit.test.tsx:78-101`) expect the kit
  from `design: "kit"` alone; under absent = old they need `designFrom: '2026-10'` in `clientWith` to keep proving the
  kit draws the same values (`:102-121` do not depend on the look and stay as they are). `index.test.tsx:112`: the
  exact props now include `monthKey: null` (that client has no reporting months). `index.test.tsx:165-172`: the body
  hands the section `monthKey: '2026-09'` with `servedRange` September, and `monthKey: null` for a client without
  reporting months; a malformed `designFrom` on the AEO tab logs once.
- [ ] **Step 2: Run** `npx vitest run components/report-sections/organic-social/aeo-informed
  components/report-sections/organic-social/index.test.tsx`. Expected: FAIL (no prop, kit drawn on October).
- [ ] **Step 3: Implement.** `section.tsx`: `monthKey` in the props type and destructuring; `:84`
  `kitLook = setting.design === 'kit' && kitActive(client, monthKey)`. `index.tsx:119`: `monthKey={aeoLocked?.month?.key
  ?? null}`; after `:113`, log a malformed `designFrom` as Task 3 does.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(organic-social): the AEO tab's kit look follows designFrom`.

### Task 6: The pin check

**Files:** create `lib/organic-social/kit-pin-check.ts`, `kit-pin-check.test.ts`.

**Interfaces:** consumes `KIT_WRAPS`, `SHARED_KIT_WRAPS` (Task 1), `resolveSection`. Produces
`kitPinProblems(template: SectionTemplate, before: SectionOverride | undefined, after: SectionOverride | undefined):
string[]` and `sharedKitPinProblems(before: PartPin[] | undefined, after: PartPin[] | undefined): string[]`. A
problem is one plain sentence naming the part, the kit version, the version it wraps and the version the client draws.

- [ ] **Step 1: Write the failing tests** (spec test 10):
  - `ytd-review@4` in the override to `@5`: one problem naming `ytd-review@5`, `@2` and `@4`.
  - `ytd-review@2` to `@5`: none.
  - The version from the template row: template `follower-graph@1`, no override version, after `follower-graph: 3`:
    one problem (draws `@1`, `@3` wraps `@2`).
  - A kit version not drawn before (a new extraPart at `@2`): one problem.
  - A kit version already pinned before and after: none. A non-kit change: none.
  - Shared: `commentary@1` to `@2`: none; absent to `@2`: one problem.
- [ ] **Step 2: Run** `npx vitest run lib/organic-social/kit-pin-check.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement.** Resolve both sides with `resolveSection(template, before|after)`; for each part `after`
  draws at a kit version that `before` did not draw at that same version, the before version must be
  `KIT_WRAPS[id][kitVersion]`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(organic-social): a tested check that a kit pin replaces exactly what it wraps`.

### Task 7: The staging pin script (private, not in the PR)

**Files:** `~/.claude/organic-social-work/probes/staging-2026-11-24-apfm-kit-pins.mts` and its validator
`probes/lib/validate-rsc.mts`. Private because they name a client's staging row; nothing here enters the repo.

- [ ] **Step 1:** `--design-from YYYY-MM` required in every mode but rollback. Read `dash_social_config` with the row
  and fold its md5 into the guard.
- [ ] **Step 2:** The validator (run in `--code`) takes `<before-rsc.json> <after-rsc.json> <templates.json>
  <before-dsc.json> <after-dsc.json>` (today it takes the after config and the templates, `validate-rsc.mts:11-13`) and
  also runs `kitPinProblems` for each Organic Social key (the before
  and after configs, against the environment's `section_templates` rows or the code template, as
  `validate-rsc.mts` already resolves them), `sharedKitPinProblems` for `organic-social` `sharedParts`, and
  `designFromWriteProblem` with `clockFor(new Date())`. Any problem refuses.
- [ ] **Step 3:** Before writing, prove `dash_social_config` changes only in `designFrom` (`without(dsc, ['designFrom'])`
  equal before and after, as the script already proves for `report_section_config`, lines 96-98). One UPDATE writes
  both columns, guarded on both md5s. The before and written states hold both
  columns; rollback restores both, only if both still hold what `--apply` wrote. The gate adds this PR to `PRS`.
- [ ] **Step 4: Dry runs on staging, read only:** with `--design-from 2026-11` against a checkout of this branch:
  VALID, both columns printed. With `--design-from 2026-10`: REFUSING (a client can see October). Expected output
  saved beside the script.
- [ ] **Step 4b: The dev script for Task 8's local look:** `probes/dev-2026-11-24-b-local-look.mts`, a copy of this
  script with the dev host guard (the dev host pattern in `probes/ren-fingerprint-readonly.mts`) and slug
  `notes-test`. Never run on another host.
- [ ] **Step 5:** The production script, when its time comes, is a copy of this one with the production host guard,
  run by me or the session I work in, on my written go (round 2 plan, "Pinning", `2026-11-23-os-design-phase1.md:105-107`).
  For a client with the AEO tab it also writes `aeoInformedSocial.design: "kit"` in the same guarded write, only once
  #489 is on `main`, as that plan says; its "only `designFrom` changes" proof then names those two keys. Under
  absent = old the AEO key alone draws the old look, so it is never written without `designFrom` (Decision 8).

### Task 8: Prove and ship

- [ ] **Step 1:** `npx tsc --noEmit`, `npx eslint` on every changed file, `npm run check:rsc`,
  `npx vitest run --maxWorkers=2` (the round 2 plan's standard gates, `2026-11-23-os-design-phase1.md:86-87`). Expected:
  0 errors, all passing.
- [ ] **Step 2: Renaissance.** Its composition test (`index.test.tsx:268-282`) and the lock key pins pass unchanged;
  state in the PR that no Renaissance input reaches the new code with a value (no `designFrom`, no kit pin).
- [ ] **Step 3: Local look, on my go only** (dev database writes): on `notes-test`, pin the kit and
  `designFrom: '2026-11'` with `probes/dev-2026-11-24-b-local-look.mts` (Task 7 Step 4b), then open September (old) and November (kit) as staff and
  export both PDFs. Roll back after.
- [ ] **Step 4:** PR off `dev`, "→ dev". Prove it merges clean with every open PR. Self-review comment, the
  `self-reviewed` label, and its review record (`docs/qa/os-design-past-months-code-review.md`, its own docs PR off
  `dev`, the format in CLAUDE.md's Branch Flow; Paul asked for the record gate on #490), then Paul's review.
  Screenshots follow Paul's answer to N4 on #504. The PR says spec tests 3, 6 and 8 are met by the `lookup` spy and
  the element tree plus round 2's per-version parity tests, not by `expectSameValues` on the whole body.
- [ ] **Step 5:** Commit body of Task 3 carries the edge-case list: operator visibility (malformed `designFrom` logged
  with slug), input boundaries (unvalidated `dash_social_config` read through the parser), state (300 s cache, both
  columns in one write), external failure (client read failure falls to the code template), bounds and security (none:
  no loop, no new trust boundary).
