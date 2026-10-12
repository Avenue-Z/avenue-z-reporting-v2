# YTD Review from January 2026, Implementation Plan

> SUPERSEDED on 2026-10-01 by `docs/superpowers/plans/2026-10-01-ytd-from-sheet.md` (the team's sheet is the source of truth). Kept for the record.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The YTD graphs can start in January 2026 through a new `reportingMonths.ytdFrom` setting, without changing any number a client already sees. Missing months show as gaps, and the requests are capped.

**Architecture:** `ytdConfig` reads an optional `ytdFrom` and `ytdMonths` uses it as the floor. `lockingClient` never locks a request that starts before the client's first reporting month, and never takes a baseline from one. The tile builder records which tiles were null, and the YTD section leaves those months off that graph.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest with Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-29-ytd-from-january-design.md` (requirements R1 to R7, design points 1 to 4).

**Gate before Task 1:** the spec has passed its review rounds, and the scratch trial in the spec confirms every August number stays identical with `ytdFrom` set. If the trial shows otherwise, stop and bring it to me.

**ON HOLD (2026-09-29):** the call decided the history comes from Jasmine's supplied numbers, not Dash (see the spec's Decision update). This plan is superseded in part: Tasks 1, 3, 4 and 5 still apply in some form, Task 2 may not be needed, and a new task for storing and importing the supplied history is required. Rework the spec, then this plan, once her sheet arrives.

## Global Constraints
- With `ytdFrom` absent, everything behaves exactly as today (R1). Every existing test passes unedited, except where a task says otherwise and why.
- No Dash request changes shape (R4). `lib/organic-social/lock-key-pin.test.ts` must pass unedited.
- The month picker, lock days and what clients may open do not change (R2). `reporting-months.ts` is not edited.
- The tiles keep showing a null as 0 (a separate follow-up). Only the YTD graphs change.
- Renaissance does not use YTD Review and is not on locked months.
- Branch `feat/os-ytd-from-january`, cut from `dev`, standalone.
- Checks: `DATABASE_URL=postgresql://ci:ci@db.invalid/ci make check`.

## Review Focus
1. A September view with `ytdFrom` set: August's prior-month baseline still comes from nothing before August, and September's still comes from August's lock. Both are pinned in Task 2.
2. A team member views a month before `firstMonth` (not selectable today): the section returns nothing, never a partial YTD. Pinned in Task 1.
3. `ytdFrom` in a previous year: the graph starts in January of the year on screen (R7). Pinned in Task 1.
4. A month where only Views is null (a quiet month with no posts): on the Followers graph, off the Views graph, and named. Pinned in Task 4.
5. Twelve months in December: never more than 3 requests in flight. Pinned in Task 5.

---

### Task 1: `ytdFrom` sets the YTD floor

**Files:**
- Modify: `lib/organic-social/ytd.ts:10,31-56`
- Test: `lib/organic-social/ytd.test.ts`

**Interfaces:**
- Produces: `YtdConfig = { firstMonth: string; comparison: 'previous-month' | 'previous-year'; ytdFrom?: string }`. `ytdConfig` includes `ytdFrom` only when the setting is a valid `YYYY-MM`. `ytdMonths(dateRange, compareRange, cfg)` keeps its signature.

- [ ] **Step 1: Write the failing tests** (append to `ytd.test.ts`)

```ts
test('ytdConfig reads a valid ytdFrom, and leaves it out when absent or malformed', () => {
  expect(ytdConfig({ firstMonth: '2026-08', ytdFrom: '2026-01' })).toEqual({ firstMonth: '2026-08', comparison: 'previous-month', ytdFrom: '2026-01' })
  for (const bad of ['2026-13', '2026-1', 202601, null, ''])
    expect(ytdConfig({ firstMonth: '2026-08', ytdFrom: bad })).toEqual({ firstMonth: '2026-08', comparison: 'previous-month' })
})

const JAN = { ...CFG, ytdFrom: '2026-01' }
test('with ytdFrom, August on screen shows January to August; each earlier month is whole and compared with the month before', () => {
  const r = ytdMonths('custom:2026-08-01,2026-08-31', 'custom:2026-07-01,2026-07-31', JAN)!
  expect(keys(r)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'])
  expect(r[0]).toEqual({ key: '2026-01', dateRange: 'custom:2026-01-01,2026-01-31', compareRange: 'custom:2025-12-01,2025-12-31', partial: false })
  expect(r[7]).toEqual({ key: '2026-08', dateRange: 'custom:2026-08-01,2026-08-31', compareRange: 'custom:2026-07-01,2026-07-31', partial: false })
})

test('a ytdFrom later than firstMonth never raises the floor', () => {
  expect(keys(ytdMonths('custom:2026-09-01,2026-09-30', 'x', { ...CFG, ytdFrom: '2026-09' }))).toEqual(['2026-08', '2026-09'])
})

test('the graphs restart each January whatever ytdFrom says', () => {
  expect(keys(ytdMonths('custom:2027-02-01,2027-02-28', 'x', JAN))).toEqual(['2027-01', '2027-02'])
})

test('a month on screen before firstMonth still shows nothing, with or without ytdFrom', () => {
  expect(keys(ytdMonths('custom:2026-07-01,2026-07-31', 'x', JAN))).toEqual([])
})
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run lib/organic-social/ytd.test.ts`
Expected: the new tests FAIL (no `ytdFrom`; July-with-ytdFrom returns January to June).

- [ ] **Step 3: Implement** (`ytd.ts`)

```ts
export type YtdConfig = { firstMonth: string; comparison: 'previous-month' | 'previous-year'; ytdFrom?: string }

export function ytdConfig(value: unknown): YtdConfig | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if (typeof v.firstMonth !== 'string' || !MONTH_RE.test(v.firstMonth)) return null
  const cfg: YtdConfig = { firstMonth: v.firstMonth, comparison: v.comparison === 'previous-year' ? 'previous-year' : 'previous-month' }
  // Jasmine's round 1 feedback: YTD can start before the first reporting month. Only the graphs read it.
  if (typeof v.ytdFrom === 'string' && MONTH_RE.test(v.ytdFrom)) cfg.ytdFrom = v.ytdFrom
  return cfg
}
```

In `ytdMonths`, replace line 49 and guard the month on screen before the loop:

```ts
  if (key < cfg.firstMonth) return []
  const floor = cfg.ytdFrom && cfg.ytdFrom < cfg.firstMonth ? cfg.ytdFrom : cfg.firstMonth
  const from = yearStart > floor ? yearStart : floor
```

Line 55 stays as it is. Update the doc comment above `ytdMonths` to say "never before ytdFrom, or firstMonth when it is absent".

- [ ] **Step 4: Run all YTD tests**

Run: `npx vitest run lib/organic-social/ytd.test.ts lib/organic-social/`
Expected: PASS, every existing test unedited.

- [ ] **Step 5: Commit**

```bash
git add lib/organic-social/ytd.ts lib/organic-social/ytd.test.ts
git commit -m "feat(organic-social): YTD can start before the first reporting month (reportingMonths.ytdFrom)"
```

### Task 2: Never lock, or take a baseline from, a month before `firstMonth`

**Files:**
- Modify: `lib/organic-social/locking-client.ts:11,74-111`
- Modify: `lib/organic-social/base.ts:27-38`
- Test: `lib/organic-social/locking-client.test.ts`, `lib/organic-social/lock-wiring.test.ts`

**Interfaces:**
- Produces: `Opts.firstDay?: string | null` on `lockingClient` (`YYYY-MM-DD`, the first day of `firstMonth`). Absent or null: today's behaviour.

- [ ] **Step 1: Write the failing unit tests** (append to `locking-client.test.ts`; `SEPT`, `total`, `innerFake`, `depsFake` exist there)

```ts
const JULY: ReportsDataParams = { ...SEPT, startDate: '2026-07-01T04:00:00Z', endDate: '2026-07-31T04:00:00Z', contextStartDate: '2026-06-01T04:00:00Z', contextEndDate: '2026-06-30T04:00:00Z' }
const AUG: ReportsDataParams = { ...SEPT, startDate: '2026-08-01T04:00:00Z', endDate: '2026-08-31T04:00:00Z', contextStartDate: '2026-07-01T04:00:00Z', contextEndDate: '2026-07-31T04:00:00Z' }
const FROM = { ...OPTS, firstDay: '2026-08-01' }

test('a request that starts before the first reporting month is live: never read, captured or stored', async () => {
  const inner = innerFake(); const deps = depsFake()
  inner.getReportsData.mockResolvedValue(total(90, 80))
  expect(await lockingClient(inner, FROM, deps).getReportsData(JULY)).toEqual(total(90, 80))
  expect(inner.getReportsData).toHaveBeenCalledTimes(1)
  expect(deps.read).not.toHaveBeenCalled()
  expect(deps.capture.getReportsData).not.toHaveBeenCalled()
  expect(deps.write).not.toHaveBeenCalled()
})

test('the first reporting month never takes a baseline from the month before it, even if one were stored', async () => {
  const inner = innerFake(); const deps = depsFake()
  const julyKey = requestKey('getReportsData', { ...AUG, startDate: AUG.contextStartDate, endDate: AUG.contextEndDate, contextStartDate: '2026-06-01T04:00:00Z', contextEndDate: '2026-06-30T04:00:00Z' } as unknown as Record<string, unknown>)
  deps.read.mockImplementation(async (_c: string, key: string) => key === julyKey ? { response: total(999, 1) } : { response: total(100, 80) })
  expect(await lockingClient(inner, FROM, deps).getReportsData(AUG)).toEqual(total(100, 80))
  expect(deps.read).toHaveBeenCalledTimes(1)
})

test('a later month still takes its baseline from the first reporting month', async () => {
  const inner = innerFake(); const deps = depsFake()
  deps.read.mockImplementation(async (_c: string, key: string) =>
    key === requestKey('getReportsData', SEPT as unknown as Record<string, unknown>) ? { response: total(100, 80) } : { response: total(95, 70) })
  const r = await lockingClient(inner, FROM, deps).getReportsData(SEPT) as ReturnType<typeof total>
  expect(r.data[BRAND].metrics.TOTAL_FOLLOWERS.context).toBe(95)
  expect(deps.read).toHaveBeenCalledTimes(2)
})
```

(The `julyKey` construction mirrors `priorParams` in `lock-day.ts`: the prior request is the context month as the main window, compared with the month before it. If `priorParams` builds it differently, compute it with `priorParams(AUG)` imported from `./lock-day` instead.)

Run: `npx vitest run lib/organic-social/locking-client.test.ts`
Expected: the first two new tests FAIL; the third passes (today's behaviour, pinned).

- [ ] **Step 2: Implement** (`locking-client.ts`)

```ts
type Opts = { clientId: string; slug: string; settled: string | null; late: (periodEnd: string) => boolean; firstDay?: string | null }

/** Before the client's first reporting month nothing is locked (YTD history, ytd.ts): those months
 *  are not reports anyone opens, and a lock there would become the first month's comparison. */
const before = (params: Record<string, unknown> | null, firstDay: string | null | undefined) =>
  !!firstDay && !!params && typeof params.startDate === 'string' && params.startDate.slice(0, 10) < firstDay
```

In `locked()`, first line after `const p = ...`:

```ts
    if (before(p, opts.firstDay)) return live()
```

and the baseline:

```ts
    const prior = priorParams(p)
    if (prior && !before(prior, opts.firstDay)) {
```

- [ ] **Step 3: Run the unit tests**

Run: `npx vitest run lib/organic-social/locking-client.test.ts lib/organic-social/lock-key-pin.test.ts lib/organic-social/lock-day.test.ts`
Expected: PASS, existing tests unedited.

- [ ] **Step 4: Write the failing wiring test** (append to `lock-wiring.test.ts`)

```ts
test('a request before the first reporting month never touches the lock store', async () => {
  getClientBySlug.mockResolvedValue(client({ firstMonth: '2026-08' }))
  const r = await dashClientFor('client-a')
  await r.client.getReportsData({ ...SEPT, startDate: '2026-07-01T04:00:00Z', endDate: '2026-07-31T04:00:00Z' })
  expect(readLock).not.toHaveBeenCalled()
  expect(writeLock).not.toHaveBeenCalled()
})
```

Run: `npx vitest run lib/organic-social/lock-wiring.test.ts`
Expected: FAIL (July is read and stored today).

- [ ] **Step 5: Pass `firstDay` from `base.ts`** (in `lockedClientFor`; add `parseReportingMonths` to the existing `./reporting-months` import)

```ts
  const parsed = parseReportingMonths(rm)
  return lockingClient(inner, {
    clientId: c.id, slug, settled: settledThrough(rm, today), late: (end) => isLateLock(end, rm, today),
    firstDay: parsed.ok ? `${parsed.cfg.firstMonth}-01` : null,
  }, {
```

- [ ] **Step 6: Run and commit**

Run: `npx vitest run lib/organic-social/`
Expected: PASS.

```bash
git add lib/organic-social/locking-client.ts lib/organic-social/locking-client.test.ts lib/organic-social/base.ts lib/organic-social/lock-wiring.test.ts
git commit -m "fix(organic-social): Never lock, or compare against, a month before the first reporting month"
```

### Task 3: The tile builder records which tiles were null

**Files:**
- Modify: `lib/organic-social/outline-headlines.ts:13,23-46`
- Test: `lib/organic-social/outline-headlines.test.ts`

**Interfaces:**
- Produces: `OutlineKpis = { kpis: Record<string, HeadlineKpi>; noData: boolean; nulls?: string[] }`. `buildOutlineKpis` always sets `nulls` (the tile keys whose Dash value was null). Optional in the type so existing hand-built fixtures still type-check.

- [ ] **Step 1: Write the failing test** (append to `outline-headlines.test.ts`; `buildOutlineKpis`, `outlineSpecsFor` and `metricFor` are importable as in that file)

```ts
test('nulls names exactly the tiles whose value was null, and the tiles still read 0', () => {
  const specs = outlineSpecsFor('INSTAGRAM')
  const metrics = Object.fromEntries(specs.map((s) => [metricFor(s), { value: s.key === 'followers' ? null : 5, context: null, context_change: null }]))
  const b = buildOutlineKpis('INSTAGRAM', metrics, specs)
  expect(b.nulls).toEqual(['followers'])
  expect(b.kpis.followers.value).toBe(0)
  expect(b.noData).toBe(false)
})
```

Run: `npx vitest run lib/organic-social/outline-headlines.test.ts`
Expected: FAIL (`nulls` undefined).

- [ ] **Step 2: Implement** (`outline-headlines.ts`)

```ts
export type OutlineKpis = { kpis: Record<string, HeadlineKpi>; noData: boolean; nulls?: string[] }
```

In `buildOutlineKpis`, before the loop `const nulls: string[] = []`; inside it, after `const m = metrics[metric]`: `if (m?.value == null) nulls.push(spec.key)`; return `{ kpis, noData, nulls }`.

- [ ] **Step 3: Run and commit**

Run: `npx vitest run lib/organic-social/ components/report-sections/organic-social/`
Expected: PASS (the Data block and breakdown ignore the new field).

```bash
git add lib/organic-social/outline-headlines.ts lib/organic-social/outline-headlines.test.ts
git commit -m "feat(organic-social): Outline tiles record which values Dash left null"
```

### Task 4: A null month is a gap on that graph, and named

**Files:**
- Modify: `lib/organic-social/ytd.ts:12,61-75`
- Modify: `components/report-sections/organic-social/parts/ytd-review.tsx:33-49`
- Test: `lib/organic-social/ytd.test.ts`, `components/report-sections/organic-social/parts/ytd-review.test.tsx`

**Interfaces:**
- Consumes: `OutlineKpis.nulls` (Task 3).
- Produces: `YtdPoint = { key: string; label: string; followers: number | null; views: number | null }`.

- [ ] **Step 1: Write the failing tests**

In `ytd.test.ts`:

```ts
test('a null Followers or Views value is null on that point only', () => {
  const m = ytdMonths('custom:2026-09-01,2026-09-30', 'custom:2026-08-01,2026-08-31', CFG)!
  const b = (f: number, v: number, nulls: string[]) => ({ noData: false, nulls, kpis: { followers: { value: f }, exposure: { value: v } } }) as never
  expect(ytdSeries(m, { '2026-08': b(0, 7, ['followers']), '2026-09': b(10, 0, ['exposure']) }).points)
    .toEqual([{ key: '2026-08', label: 'Aug', followers: null, views: 7 }, { key: '2026-09', label: 'Sep', followers: 10, views: null }])
})
```

In `ytd-review.test.tsx` (the `kpis` fixture gains an optional `nulls`):

```tsx
test('a month missing one value is left off that graph only and named under the graphs', async () => {
  const withNulls = (f: number, v: number, nulls: string[]) => ({ ...(kpis(f, v) as object), nulls }) as never
  getOutlineKpis.mockResolvedValueOnce(withNulls(0, 10, ['followers'])).mockResolvedValueOnce(kpis(120, 30))
  const el = await YtdReviewSection({ ctx: SEPT })
  const [followers, views] = charts(el)
  expect(followers.data.map((d) => d.month)).toEqual(['Sep'])
  expect(views.data.map((d) => d.month)).toEqual(['Aug', 'Sep'])
  expect(render(<>{el}</>).container.textContent).toContain('No follower data for Aug')
})
```

Run: `npx vitest run lib/organic-social/ytd.test.ts components/report-sections/organic-social/parts/ytd-review.test.tsx`
Expected: both FAIL.

- [ ] **Step 2: Implement `ytdSeries`** (`ytd.ts`)

```ts
export type YtdPoint = { key: string; label: string; followers: number | null; views: number | null }
```

and in the loop:

```ts
    const nulls = b.nulls ?? []
    points.push({ key: m.key, label, followers: nulls.includes('followers') ? null : f.value, views: nulls.includes('exposure') ? null : v.value })
```

- [ ] **Step 3: Implement the section** (`ytd-review.tsx`, replacing lines 33-49)

```tsx
  const d = r.data
  if (d.points.length === 0) return <NoData />
  // One data set per graph: a month whose value Dash left null is left off that graph and named,
  // never drawn as 0. With no nulls both graphs get the same rows, as before.
  const rows = (key: 'followers' | 'views') => d.points.filter((p) => p[key] != null)
    .map((p) => ({ month: p.label, followers: p.followers ?? 0, views: p.views ?? 0 }))
  const gaps = (key: 'followers' | 'views') => d.points.filter((p) => p[key] == null).map((p) => p.label)
  const chart = (data: ReturnType<typeof rows>, yKeys: { key: string; label: string }[]) => data.length === 0
    ? <NoData />
    : data.length < 2 ? <BarChart data={data} xKey="month" yKeys={yKeys} /> : <LineChart data={data} xKey="month" yKeys={yKeys} />
  const notes = [
    d.noData.length > 0 ? `No data for ${d.noData.join(', ')}` : null,
    gaps('followers').length > 0 ? `No follower data for ${gaps('followers').join(', ')}` : null,
    gaps('views').length > 0 ? `No view data for ${gaps('views').join(', ')}` : null,
  ].filter(Boolean)
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-extrabold uppercase tracking-widest text-text-muted">YTD Review</h2>
      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="Follower Growth, Year to Date">{chart(rows('followers'), [{ key: 'followers', label: 'Total Followers' }])}</ChartCard>
        <ChartCard title="Views, Year to Date">{chart(rows('views'), [{ key: 'views', label: 'Views' }])}</ChartCard>
      </div>
      {notes.map((n) => <p key={n} className="text-xs text-text-muted">{n}</p>)}
    </section>
  )
```

Keep the existing comment about bars for a single point above `chart`.

- [ ] **Step 4: Run and commit**

Run: `npx vitest run lib/organic-social/ytd.test.ts components/report-sections/organic-social/parts/ytd-review.test.tsx components/report-sections/organic-social/parts/ytd-parity.test.ts`
Expected: PASS, the existing section tests unedited (with no nulls, both graphs get the rows they got before).

```bash
git add lib/organic-social/ytd.ts lib/organic-social/ytd.test.ts components/report-sections/organic-social/parts/ytd-review.tsx components/report-sections/organic-social/parts/ytd-review.test.tsx
git commit -m "fix(organic-social): A YTD month Dash left null is a named gap, never a zero"
```

### Task 5: Cap the requests, and say when `ytdFrom` is wrong

**Files:**
- Modify: `components/report-sections/organic-social/parts/ytd-review.tsx:23-31`
- Test: `components/report-sections/organic-social/parts/ytd-review.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
test('never more than 3 month requests in flight, and every month still requested once, in order', async () => {
  getClientBySlug.mockResolvedValue(client({ firstMonth: '2026-08', ytdFrom: '2026-01' }))
  let open = 0; let peak = 0
  getOutlineKpis.mockImplementation(async () => { open++; peak = Math.max(peak, open); await new Promise((r) => setTimeout(r, 1)); open--; return kpis(1, 1) })
  await YtdReviewSection({ ctx: { ...SEPT, dateRange: 'custom:2026-12-01,2026-12-31', compareRange: 'custom:2026-11-01,2026-11-30' } })
  expect(peak).toBe(3)
  expect(getOutlineKpis.mock.calls.map((c) => c[1])).toEqual(Array.from({ length: 12 }, (_, i) => `custom:2026-${String(i + 1).padStart(2, '0')}-01,${['2026-01-31','2026-02-28','2026-03-31','2026-04-30','2026-05-31','2026-06-30','2026-07-31','2026-08-31','2026-09-30','2026-10-31','2026-11-30','2026-12-31'][i]}`))
})

test('a malformed ytdFrom is ignored and says so once, by slug', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  getClientBySlug.mockResolvedValue(client({ firstMonth: '2026-08', ytdFrom: '2026-1' }))
  getOutlineKpis.mockResolvedValue(kpis(1, 1))
  await YtdReviewSection({ ctx: SEPT })
  expect(getOutlineKpis).toHaveBeenCalledTimes(2)
  expect(warn).toHaveBeenCalledWith('[organic-social] ytd-review ytdFrom is invalid slug=c')
  warn.mockRestore()
})
```

Run: `npx vitest run components/report-sections/organic-social/parts/ytd-review.test.tsx`
Expected: the cap test FAILS (peak 12); the warning test FAILS (no warning).

- [ ] **Step 2: Implement** (`ytd-review.tsx`; import `mapWithConcurrency` from `@/lib/concurrency`)

After `const cfg = ...` and its null check:

```tsx
  const rm = (client?.dashSocialConfig as { reportingMonths?: { ytdFrom?: unknown } } | null | undefined)?.reportingMonths
  if (rm?.ytdFrom !== undefined && !cfg.ytdFrom) console.warn(`[organic-social] ytd-review ytdFrom is invalid slug=${clientSlug}`)
```

and replace the `Promise.all` on line 30:

```tsx
  // At most 3 in flight: up to 12 month requests by December. Still all or nothing: a partial graph is never drawn.
  const r = await safe(mapWithConcurrency(months, 3, (m) => getOutlineKpis(clientSlug, m.dateRange, m.compareRange, channel))
    .then((all) => ytdSeries(months, Object.fromEntries(months.map((m, i) => [m.key, all[i]])))))
```

- [ ] **Step 3: Run and commit**

Run: `npx vitest run components/report-sections/organic-social/ lib/organic-social/`
Expected: PASS.

```bash
git add components/report-sections/organic-social/parts/ytd-review.tsx components/report-sections/organic-social/parts/ytd-review.test.tsx
git commit -m "fix(organic-social): YTD sends at most 3 month requests at once"
```

### Task 6: Docs, proof, rollout

- [ ] In `CLAUDE.md`, mark done: "A single null metric still plots a zero on the YTD graphs" (for the YTD graphs; the tiles part stays open) and the concurrency half of "The YTD block fails all or nothing across up to 12 requests". Under "settledThrough ignores firstMonth", note that a request before `firstMonth` is no longer locked. Targeted edits only.
- [ ] Run `DATABASE_URL=postgresql://ci:ci@db.invalid/ci make check`. Expected: typecheck, every test, RSC check and `next build` pass.
- [ ] Merge proof against every open PR branch (#281 to #285, #287). Expected: clean.
- [ ] Look at it on the local app (dev database) with `ytdFrom: '2026-01'` set on one outline client in dev only: January to August on the graphs, August tiles unchanged.
- [ ] Push, mark the PR ready, request Paul.
- [ ] After it merges and reaches staging: set `ytdFrom: '2026-01'` for the three outline clients with a guarded staging-only script (staging host check, dry run first, one transaction, Renaissance's row byte-identical or roll back). Check that no lock row before 2026-08 appears afterwards (read-only count of `dash_response_locks` by month).
