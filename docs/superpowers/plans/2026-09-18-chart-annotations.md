# Chart Annotations Implementation Plan

> **For the executor:** run inline in this session with superpowers:executing-plans, task by task. No subagents. Steps use checkbox (`- [ ]`) syntax. Stop and ask at every step marked **STOP**.

**Goal:** Annotate the v2 Organic Social follower and engagement graphs the way the team's monthly deck does (top 2 follower days, top 3 engagement days, each with its value and the post behind it), behind one Annotations button, and let internal staff hide any single annotation from the client.

**Architecture:** Pure functions turn a single-channel daily series plus the posts the section already fetches into annotations. The v2 parts fetch the series over the UTC month, build annotations, apply the team's hides on the server, and pass the result down; the shared chart renders a row of annotations and a dot per peak only when annotations are passed. Hides live in one new additive table behind a role-checked server action. v1, which Renaissance renders, is pinned by snapshot and request tests committed before any change.

**Tech Stack:** Next.js 16 App Router, React 19 server and client components, TypeScript strict, Drizzle on Neon Postgres, Recharts 3.7, Vitest 3 (globals on) with @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-09-18-chart-annotations-design.md`

## Global Constraints

- **Renaissance must not change.** It renders v1 of both graphs: the `section_templates` rows in prod, staging and dev pin `follower-graph@1` and `engagement-trend@1` (read 2026-09-18), and Renaissance overrides nothing but Commentary. Never edited by this plan: `components/report-sections/organic-social/template.ts`, the v1 functions (`FollowerSection`, `followerGraphV1`, `TrendSection`, `engagementTrendV1`), `components/charts/line-chart.tsx`, `parts/top-content.tsx`, `post-card.tsx`.
- Every change to a shared file (`trends.tsx`, `follower-graph.tsx`, `lib/organic-social/followers.ts`, `lib/organic-social/trends.ts`, `lib/organic-social/types.ts`, `lib/db/schema.ts`, `app/actions/organic-social.ts`) is additive and inert when its new input is absent.
- From Task 0's commit on, no `*.snap` file may change. If one does, stop: that is a Renaissance change.
- The existing test `follower-graph fetches and renders for a real channel` (v1 called with exactly three arguments) must keep passing unedited.
- Limits: 2 annotations on the follower graph, 3 on the engagement graph. Positive values only. Days inside the requested window only. Platform tabs only (none on Overview).
- Labels: `8/10 | +12 Followers`, `8/9 | 35 Engagements`. No leading zeros, no year, singular at exactly 1.
- Titles, v2 only, word for word from Jasmine's outlines: "{Platform} Follower Growth Graph", "{Platform} Engagement Graph" (Overview keeps "Engagement Over Time"). Button: **Annotations**.
- No real client figure anywhere: tests, comments, commit messages, PR text. All numbers here are made up.
- No em or en dash characters in anything added. Never type a backslash-u dash escape: the file-writing tool turns it into the literal character. Build such characters with `String.fromCharCode` instead. After writing any file, run `grep -c "$(printf '\xe2\x80\x93')\|$(printf '\xe2\x80\x94')" <file>` and expect 0.
- Databases: read-only checks run inside a READ ONLY transaction. The only write in this plan is the Task 5 migration, to staging only, through `npm run db:migrate:staging`, and only after my explicit go at that step.
- Dash: GET requests only. Brand ids are never printed or committed.
- `$SCRATCH` is the executing session's scratchpad directory, outside the repo. Throwaway scripts live there, never in the repo.
- Before every commit: `npx vitest run`, `npx tsc --noEmit`, `npm run check:rsc` all clean. Baseline before Task 0: **1063** tests passing.
- Commit messages end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Branch `docs/chart-annotations` (PR 252). Nothing is pushed until Task 6.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `components/report-sections/organic-social/v1-render.golden.test.tsx` | Create (Task 0) | Snapshots of what v1 charts and the Paid Media chart draw today |
| `lib/organic-social/graph-requests.test.ts` | Create (Task 0), extend (Task 3) | The exact Dash requests and gap rules of both getters |
| `~/.claude/renaissance-baseline/ren-templates.ts`, `check-drift.sh` | Create, modify (Task 0) | Drift check learns to read the part pins. Outside the repo |
| `lib/organic-social/annotations.ts` + `.test.ts` | Create (Tasks 1, 2), extend (Task 5) | Pure: peaks, labels, top post of the day, annotations |
| `lib/organic-social/types.ts` | Modify (Task 3) | `DayWindow` type |
| `lib/organic-social/followers.ts` | Modify (Task 3) | Optional metric and window |
| `lib/organic-social/trends.ts` | Modify (Task 3) | Optional window |
| `components/report-sections/organic-social/annotation-callouts.tsx` + `.test.tsx` | Create (Task 4), extend (Task 5) | Client: the row, thumbnails, hide controls |
| `components/report-sections/organic-social/trends.tsx` | Modify (Tasks 4, 5) | `annotations` replaces `marks`, Annotations button, titles, controls |
| `components/report-sections/organic-social/follower-graph.tsx` | Modify (Tasks 4, 5) | Pass annotations, title and controls through |
| `components/report-sections/organic-social/parts/follower-graph.tsx` | Modify v2 only (Tasks 4, 5) | Daily gains, UTC month, annotations, hides |
| `components/report-sections/organic-social/parts/engagement-trend.tsx` | Modify v2 only (Tasks 4, 5) | UTC month, annotations, hides, Overview without |
| `components/report-sections/organic-social/parts/annotations-wiring.test.tsx` | Create (Task 4), extend (Task 5) | Behavioural tests of v1 and v2 wiring |
| `lib/db/schema.ts`, `drizzle/0024_*.sql`, `drizzle/meta/*` | Modify, generate (Task 5) | `chart_annotation_hides` table |
| `lib/organic-social/annotation-hides/{permissions,mutations,select,apply}.ts` + tests | Create (Task 5) | Who may hide, validation, write, read, apply |
| `components/report-sections/organic-social/parts/annotation-hides.ts` | Create (Task 5) | Apply hides for a chart, fail closed for clients |
| `app/actions/organic-social.ts` + `organic-social.test.ts` | Modify, create (Task 5) | `setAnnotationHiddenAction` |
| `MIGRATIONS-PENDING.md` | Modify (Task 5) | Record where the migration is and is not applied |
| `lib/organic-social/post-marks.ts` + `.test.ts` | Delete (Task 6) | Superseded, once nothing imports it |

---

### Task 0: Pin what Renaissance draws and requests today

Characterization tests: written against today's code, they pass at once. Each gets a deliberate break to prove it bites.

**Files:**
- Create: `components/report-sections/organic-social/v1-render.golden.test.tsx`
- Create: `lib/organic-social/graph-requests.test.ts`
- Outside the repo: `~/.claude/renaissance-baseline/ren-templates.ts`, `templates-{prod,staging,dev}.txt`, `check-drift.sh`

- [ ] **Step 1: Commit the revised docs**

```bash
git status --short
```
Expected: exactly ` M docs/superpowers/specs/2026-09-18-chart-annotations-design.md` and `?? docs/superpowers/plans/2026-09-18-chart-annotations.md`. Anything else: stop.

```bash
git add docs/superpowers/specs/2026-09-18-chart-annotations-design.md docs/superpowers/plans/2026-09-18-chart-annotations.md
git commit -m "docs: chart annotations plan, and the spec revised after audit

Folds in the audit: hiding a single annotation is built here, the v2 graphs use
the UTC month, titles and the button follow Jasmine's outlines, Renaissance's
guarantee is proven from the section_templates rows, and no client figure
appears anywhere.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 2: Write the v1 render snapshots**

Create `components/report-sections/organic-social/v1-render.golden.test.tsx`:

```tsx
import { expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'

// Recharts draws nothing inside ResponsiveContainer in jsdom, because it measures 0 by 0.
// A fixed size makes these snapshots capture the real chart: lines, axes, legend, dots.
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts')
  const { cloneElement } = await import('react')
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement<{ width?: number; height?: number }> }) =>
      cloneElement(children, { width: 800, height: 300 }),
  }
})

import { FollowerGraph } from './follower-graph'
import { EngagementTrend } from './trends'
import { LineChart } from '@/components/charts/line-chart'
import type { TrendSeries } from '@/lib/organic-social/types'

// THE RENAISSANCE GUARD FOR WHAT ITS CHARTS DRAW. Written before any annotation work,
// against the code Renaissance runs today: v1 of both Organic Social graphs, and the
// shared line chart its Paid Media section uses. Every later commit on this branch must
// leave these snapshots byte-identical. The numbers are made up.
const DAYS = Array.from({ length: 31 }, (_, i) => `2026-08-${String(i + 1).padStart(2, '0')}`)
const ONE: TrendSeries = {
  channels: ['Instagram'],
  points: DAYS.map((date, i) => ({ date, Instagram: 500 + i * 3 + (i % 5) * 7 })),
}
const MANY: TrendSeries = {
  channels: ['Instagram', 'Facebook', 'X', 'LinkedIn'],
  points: DAYS.map((date, i) => ({
    date, Instagram: 10 + ((i * 7) % 23), Facebook: 3 + ((i * 5) % 17), X: (i * 3) % 4, LinkedIn: 20 + (i % 9),
  })),
}
const EMPTY: TrendSeries = { channels: ['Instagram'], points: [] }
const html = (el: ReactElement) => render(el).container.innerHTML

test('v1 follower graph, one channel', () => {
  const out = html(<FollowerGraph series={ONE} />)
  expect(out).toContain('recharts-line') // the chart really drew, so the snapshot means something
  expect(out).toMatchSnapshot()
})

test('v1 follower graph, no data', () => {
  expect(html(<FollowerGraph series={EMPTY} />)).toMatchSnapshot()
})

test('v1 engagement graph, four channels (Overview)', () => {
  expect(html(<EngagementTrend series={MANY} />)).toMatchSnapshot()
})

test('v1 engagement graph, one channel (platform tab)', () => {
  expect(html(<EngagementTrend series={ONE} />)).toMatchSnapshot()
})

test('v1 engagement graph, one channel toggled off, then all of them', () => {
  const { container } = render(<EngagementTrend series={MANY} />)
  fireEvent.click(screen.getByRole('button', { name: 'Facebook' }))
  expect(container.innerHTML).toMatchSnapshot()
  for (const name of ['Instagram', 'X', 'LinkedIn']) fireEvent.click(screen.getByRole('button', { name }))
  expect(container.innerHTML).toMatchSnapshot()
})

test('v1 follower graph, its only channel toggled off and back on', () => {
  const { container } = render(<FollowerGraph series={ONE} />)
  fireEvent.click(screen.getByRole('button', { name: 'Instagram' }))
  expect(container.innerHTML).toMatchSnapshot()
  fireEvent.click(screen.getByRole('button', { name: 'Instagram' }))
  expect(container.innerHTML).toMatchSnapshot()
})

test('Paid Media shaped chart, no marks', () => {
  const yKeys = [{ key: 'Instagram', color: '#ffffff', label: 'Meta' }, { key: 'Facebook' }]
  expect(html(<LineChart data={MANY.points} xKey="date" yKeys={yKeys} valueFormat="currency-cents" />)).toMatchSnapshot()
})
```

- [ ] **Step 3: Run it; the snapshots are written**

Run: `npx vitest run components/report-sections/organic-social/v1-render.golden.test.tsx`
Expected: 7 passed, `Snapshots 9 written`.

- [ ] **Step 4: Prove the snapshots bite, then restore**

```bash
sed -i '' 's/title="Engagement Over Time"/title="Engagement over time"/' components/report-sections/organic-social/trends.tsx
npx vitest run components/report-sections/organic-social/v1-render.golden.test.tsx
```
Expected: 3 failed (the three engagement tests), `Snapshots 4 failed`.

```bash
git checkout components/report-sections/organic-social/trends.tsx
npx vitest run components/report-sections/organic-social/v1-render.golden.test.tsx
```
Expected: 7 passed, 9 snapshots passed, none written.

- [ ] **Step 5: Write the request tests**

Create `lib/organic-social/graph-requests.test.ts`:

```ts
import { beforeEach, expect, test, vi } from 'vitest'

// A real DashSocialClient with a fake fetch, so each test sees the exact request the app
// would send to Dash and gets back a canned GRAPH payload: a null day in the middle and a
// day past the month, the two shapes the gap rules exist for. No network. Made-up numbers.
const requests: URL[] = []
vi.mock('./base', async () => {
  const actual = await vi.importActual<typeof import('./base')>('./base')
  const { DashSocialClient } = await vi.importActual<typeof import('@/lib/dash-social/client')>('@/lib/dash-social/client')
  const fakeFetch = (async (url: string) => {
    const u = new URL(url)
    requests.push(u)
    const metric = u.searchParams.get('metrics')!
    const daily = { '2026-08-01': 100, '2026-08-02': null, '2026-08-03': 104, '2026-09-01': 110 }
    return new Response(JSON.stringify({ data: { metrics: { [metric]: { ALL_CHANNELS: daily } } } }), { status: 200 })
  }) as unknown as typeof fetch
  return {
    ...actual,
    dashClientFor: async () => ({
      client: new DashSocialClient({ token: 'test-token', fetchImpl: fakeFetch }),
      brandId: 1,
      channels: ['INSTAGRAM', 'FACEBOOK', 'TWITTER', 'LINKEDIN'],
    }),
  }
})

import { getFollowerGraph } from './followers'
import { getEngagementTrend } from './trends'

const AUG = '2026-08-01,2026-08-31'
const EASTERN = { start_date: '2026-08-01T04:00:00Z', end_date: '2026-08-31T04:00:00Z' }
const sent = (i = 0) => Object.fromEntries(requests[i].searchParams)
// Every test uses its own slug, so React's cache can never hand one test another's result.
beforeEach(() => { requests.length = 0 })

// v1: what Renaissance's graphs send and plot today. These must never change.
test('v1 follower graph asks Dash for total followers over the Eastern window', async () => {
  await getFollowerGraph('slug-a', AUG, 'INSTAGRAM')
  expect(requests).toHaveLength(1)
  expect(sent()).toMatchObject({
    channels: 'INSTAGRAM', metrics: 'TOTAL_FOLLOWERS', report_type: 'GRAPH', time_scale: 'DAILY', ...EASTERN,
  })
})

test('v1 follower graph carries a missing day forward and keeps every day Dash returns', async () => {
  expect(await getFollowerGraph('slug-b', AUG, 'INSTAGRAM')).toEqual({
    channels: ['Instagram'],
    points: [
      { date: '2026-08-01', Instagram: 100 },
      { date: '2026-08-02', Instagram: 100 },
      { date: '2026-08-03', Instagram: 104 },
      { date: '2026-09-01', Instagram: 110 },
    ],
  })
})

test('v1 engagement graph asks each platform for its own engagement metric over the Eastern window', async () => {
  const expected = {
    INSTAGRAM: 'TOTAL_ENGAGEMENTS', FACEBOOK: 'TOTAL_ENGAGEMENTS_POSTS_V2',
    TWITTER: 'TOTAL_ENGAGEMENTS_POSTS', LINKEDIN: 'ENGAGEMENTS_BY_POST',
  } as const
  for (const [channel, metric] of Object.entries(expected)) {
    requests.length = 0
    await getEngagementTrend(`slug-c-${channel}`, AUG, channel as keyof typeof expected)
    expect(sent()).toMatchObject({ channels: channel, metrics: metric, report_type: 'GRAPH', time_scale: 'DAILY', ...EASTERN })
  }
})

test('v1 engagement graph treats a missing day as zero', async () => {
  const s = await getEngagementTrend('slug-d', AUG, 'INSTAGRAM')
  expect(s.points.find((p) => p.date === '2026-08-02')).toEqual({ date: '2026-08-02', Instagram: 0 })
})

test('v1 Overview engagement graph asks every configured platform, one request each', async () => {
  const s = await getEngagementTrend('slug-e', AUG, null)
  expect(requests.map((u) => u.searchParams.get('channels')).sort()).toEqual(['FACEBOOK', 'INSTAGRAM', 'LINKEDIN', 'TWITTER'])
  expect(s.channels).toEqual(['Instagram', 'Facebook', 'X', 'LinkedIn'])
})
```

- [ ] **Step 6: Run it, prove it bites, restore**

Run: `npx vitest run lib/organic-social/graph-requests.test.ts`
Expected: 5 passed.

```bash
sed -i '' "s/metricForKey(channel, 'followers')/metricForKey(channel, 'netNewFollowers')/" lib/organic-social/followers.ts
npx vitest run lib/organic-social/graph-requests.test.ts
```
Expected: 1 failed, `v1 follower graph asks Dash for total followers over the Eastern window`, on `metrics: 'NET_NEW_FOLLOWERS'` vs `'TOTAL_FOLLOWERS'`.

```bash
git checkout lib/organic-social/followers.ts
npx vitest run lib/organic-social/graph-requests.test.ts
```
Expected: 5 passed.

- [ ] **Step 7: Teach the drift check to read the part pins (outside the repo)**

Create `~/.claude/renaissance-baseline/ren-templates.ts`:

```ts
// READ ONLY (READ ONLY transaction). The part versions Renaissance's Organic Social sections
// pin: the section_templates rows, which win over the code template at runtime, and
// Renaissance's own override. Prints part ids and versions only. No brand ids.
import { neon } from '@neondatabase/serverless'

const env = process.argv[2] ?? '?'
const sql = neon(process.env.DATABASE_URL!)

async function main() {
  const [templates, clients] = await sql.transaction([
    sql`SELECT section_slug, composition FROM section_templates WHERE section_slug LIKE 'organic-social%' ORDER BY section_slug`,
    sql`SELECT report_section_config FROM clients WHERE slug = 'renaissance'`,
  ], { readOnly: true })
  for (const t of templates as any[]) {
    console.log(`[${env}] template ${t.section_slug}: ${(t.composition.order ?? []).map((p: any) => `${p.id}@${p.version}`).join(' ')}`)
  }
  const cfg = (clients as any[])[0]?.report_section_config ?? {}
  for (const k of Object.keys(cfg).filter((k) => k.startsWith('organic-social')).sort()) {
    console.log(`[${env}] renaissance ${k}: ${JSON.stringify(cfg[k])}`)
  }
}
main().catch((e) => { console.log(`[${env}] FAILED ${(e as Error).message}`); process.exit(1) })
```

Capture the baseline, from the repo root so the env files resolve:

```bash
for pair in prod:.env.production staging:.env.staging dev:.env.local; do
  npx tsx --env-file=${pair#*:} ~/.claude/renaissance-baseline/ren-templates.ts ${pair%%:*} > ~/.claude/renaissance-baseline/templates-${pair%%:*}.txt
done
cat ~/.claude/renaissance-baseline/templates-*.txt
```
Expected for prod and staging (read 2026-09-18):
```
[env] template organic-social: platform-headlines@1 engagement-trend@1 top-content@2
[env] template organic-social:platform: platform-headlines@1 follower-graph@1 engagement-trend@1 top-content@2
[env] renaissance organic-social: {"sharedParts":[{"id":"commentary","version":1}]}
```
and for dev the same, except both template lines end with ` top-ai-retrieved@1` (a part from another branch, seeded into dev only). What matters in every environment: `follower-graph@1`, `engagement-trend@1`, and a Renaissance override with no graph versions. Anything else: stop.

In `~/.claude/renaissance-baseline/check-drift.sh`, replace:

```bash
echo
if [ $fail -eq 0 ]; then
  echo "RESULT: Renaissance renders exactly what it did before."
  [ $advisory -eq 1 ] && echo "        (files changed, but the resolved surface did not. That is a clean feature branch.)"
```

with:

```bash
echo
echo "=== 4. PART PINS: which graph versions Renaissance's sections resolve to ==="
for pair in "prod:.env.production" "staging:.env.staging" "dev:.env.local"; do
  env="${pair%%:*}"; envf="${pair##*:}"
  [ -f "$envf" ] || { echo "  [$env] $envf missing, SKIPPED"; continue; }
  npx tsx --env-file="$envf" "$OUT/ren-templates.ts" "$env" > "/tmp/ren-templates-$env.txt" 2>&1
  if diff -q "$OUT/templates-$env.txt" "/tmp/ren-templates-$env.txt" >/dev/null 2>&1; then
    echo "  [$env] OK, identical. $(grep -c 'template' "$OUT/templates-$env.txt") template rows, Renaissance override unchanged."
  else
    echo "  [$env] !! PART PINS CHANGED:"
    diff "$OUT/templates-$env.txt" "/tmp/ren-templates-$env.txt" | grep -E '^[<>]' | head -20 | sed 's/^/       /'
    fail=1
  fi
done

echo
if [ $fail -eq 0 ]; then
  echo "RESULT: no drift in Renaissance's row, users, KPI surface or part pins."
  echo "        (What its charts draw is guarded by the v1 snapshot tests in the repo, not by this check.)"
  [ $advisory -eq 1 ] && echo "        (files changed, but the resolved surface did not. That is a clean feature branch.)"
```

Run: `~/.claude/renaissance-baseline/check-drift.sh`
Expected: sections 1, 2 and 4 all `OK` in prod, staging and dev; the last line group starts `RESULT: no drift`.

- [ ] **Step 8: Gates and commit**

Run: `npx vitest run && npx tsc --noEmit && npm run check:rsc`
Expected: **1075** passed (1063 + 7 + 5), 9 snapshots written earlier and now passing, `tsc` silent, RSC check passed.

```bash
git add components/report-sections/organic-social/v1-render.golden.test.tsx components/report-sections/organic-social/__snapshots__/v1-render.golden.test.tsx.snap lib/organic-social/graph-requests.test.ts
git commit -m "test(organic-social): pin what Renaissance's charts draw and request today

Snapshots of v1 FollowerGraph and EngagementTrend (and a Paid Media shaped
LineChart) rendered with real Recharts output, and tests of the exact Dash
request and gap rule behind each v1 graph. Written before any annotation
work; each was deliberately broken once to prove it fails. From here on none
of these may change.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 1: Pick the peaks

**Files:**
- Create: `lib/organic-social/annotations.ts`
- Create: `lib/organic-social/annotations.test.ts`

**Interfaces:**
- Consumes: `TrendSeries` from `lib/organic-social/types.ts`: `{ points: { date: string; [channel: string]: string | number }[]; channels: string[] }`. Point dates are `yyyy-mm-dd`.
- Produces: `interface Peak { date: string; value: number }`, `pickPeaks(series: TrendSeries, opts: { limit: number; from: string; to: string }): Peak[]`.

- [ ] **Step 1: Write the failing tests**

Create `lib/organic-social/annotations.test.ts`:

```ts
import { expect, test } from 'vitest'
import { pickPeaks } from './annotations'
import type { TrendSeries } from './types'

// All numbers are made up.
const AUG = { from: '2026-08-01', to: '2026-08-31' }
const series = (values: Record<string, number>, channel = 'Instagram'): TrendSeries => ({
  channels: [channel],
  points: Object.entries(values).map(([date, v]) => ({ date, [channel]: v })),
})

test('returns the highest days up to the limit, in date order', () => {
  const s = series({ '2026-08-03': 10, '2026-08-10': 50, '2026-08-20': 30, '2026-08-25': 40 })
  expect(pickPeaks(s, { limit: 2, ...AUG })).toEqual([
    { date: '2026-08-10', value: 50 },
    { date: '2026-08-25', value: 40 },
  ])
})

test('only positive days are peaks, so a quiet month returns fewer', () => {
  const s = series({ '2026-08-01': 0, '2026-08-02': -4, '2026-08-03': 6 })
  expect(pickPeaks(s, { limit: 3, ...AUG })).toEqual([{ date: '2026-08-03', value: 6 }])
})

test('a month with no positive days has no peaks', () => {
  expect(pickPeaks(series({ '2026-08-01': 0, '2026-08-02': -1 }), { limit: 3, ...AUG })).toEqual([])
})

// The Eastern window the v1 graphs send returns a day past the month on some channels.
test('a day outside the requested window is never a peak, however high', () => {
  const s = series({ '2026-08-15': 5, '2026-09-01': 999, '2026-07-31': 888 })
  expect(pickPeaks(s, { limit: 3, ...AUG })).toEqual([{ date: '2026-08-15', value: 5 }])
})

test('the first and last days of the window are inside it', () => {
  const s = series({ '2026-08-01': 5, '2026-08-31': 7 })
  expect(pickPeaks(s, { limit: 3, ...AUG }).map((p) => p.date)).toEqual(['2026-08-01', '2026-08-31'])
})

test('ties break on the earlier date, so the same data always gives the same peaks', () => {
  const s = series({ '2026-08-29': 20, '2026-08-10': 20, '2026-08-22': 26, '2026-08-05': 20 })
  expect(pickPeaks(s, { limit: 3, ...AUG })).toEqual([
    { date: '2026-08-05', value: 20 },
    { date: '2026-08-10', value: 20 },
    { date: '2026-08-22', value: 26 },
  ])
})

test('when every day is equal, the earliest days win', () => {
  const s = series({ '2026-08-04': 3, '2026-08-01': 3, '2026-08-03': 3, '2026-08-02': 3 })
  expect(pickPeaks(s, { limit: 2, ...AUG }).map((p) => p.date)).toEqual(['2026-08-01', '2026-08-02'])
})

// The deck calls out three consecutive days on one slide.
test('neighbouring days can all be peaks', () => {
  const s = series({ '2026-08-09': 40, '2026-08-10': 65, '2026-08-11': 38, '2026-08-20': 10 })
  expect(pickPeaks(s, { limit: 3, ...AUG }).map((p) => p.date)).toEqual(['2026-08-09', '2026-08-10', '2026-08-11'])
})

test('a chart with more than one channel gets no peaks', () => {
  const s: TrendSeries = {
    channels: ['Instagram', 'Facebook'],
    points: [{ date: '2026-08-10', Instagram: 50, Facebook: 40 }],
  }
  expect(pickPeaks(s, { limit: 3, ...AUG })).toEqual([])
})

test('a chart with no channels gets no peaks', () => {
  expect(pickPeaks({ channels: [], points: [] }, { limit: 3, ...AUG })).toEqual([])
})

test('a limit of zero returns nothing', () => {
  expect(pickPeaks(series({ '2026-08-10': 50 }), { limit: 0, ...AUG })).toEqual([])
})

test('a value that is not a finite number is skipped rather than ranked', () => {
  const s: TrendSeries = {
    channels: ['Instagram'],
    points: [
      { date: '2026-08-10', Instagram: 'n/a' },
      { date: '2026-08-11', Instagram: 12 },
      { date: '2026-08-12' },
    ],
  }
  expect(pickPeaks(s, { limit: 3, ...AUG })).toEqual([{ date: '2026-08-11', value: 12 }])
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/organic-social/annotations.test.ts`
Expected: FAIL, `Failed to resolve import "./annotations"`.

- [ ] **Step 3: Write the implementation**

Create `lib/organic-social/annotations.ts`:

```ts
import type { TrendSeries } from './types'

/** One day worth calling out on a trend chart. */
export interface Peak {
  /** yyyy-mm-dd, as it appears on the series. */
  date: string
  /** That day's value on the chart. Always positive. */
  value: number
}

/**
 * The days that spiked, the way the team marks them by hand in the monthly deck.
 *
 * Only days inside the requested window count. The v2 graphs request the UTC month, which
 * has no extra day, but the Eastern window v1 sends returns a day past the month on some
 * channels, so the guard stays.
 *
 * Only positive values count, so a quiet account shows fewer annotations rather than
 * calling out a flat day. Ties go to the earlier date so the same data always produces the
 * same annotations. Neighbouring days are allowed.
 *
 * Returns nothing for a chart with more than one channel: a peak across several lines is
 * ambiguous. Returned in date order, left to right, matching the chart.
 */
export function pickPeaks(
  series: TrendSeries,
  { limit, from, to }: { limit: number; from: string; to: string },
): Peak[] {
  if (limit <= 0 || series.channels.length !== 1) return []
  const key = series.channels[0]
  const candidates: Peak[] = []
  for (const point of series.points) {
    const date = String(point.date)
    if (date < from || date > to) continue
    const value = Number(point[key])
    if (!Number.isFinite(value) || value <= 0) continue
    candidates.push({ date, value })
  }
  candidates.sort((a, b) => b.value - a.value || a.date.localeCompare(b.date))
  return candidates.slice(0, limit).sort((a, b) => a.date.localeCompare(b.date))
}
```

A point with no value for the channel reads as `Number(undefined)`, which is `NaN`, so it is skipped. `buildTrendSeries` never produces one today, but `pickPeaks` should not trust its caller.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/organic-social/annotations.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Gates and commit**

Run: `npx vitest run && npx tsc --noEmit && npm run check:rsc`
Expected: **1087** passed, `tsc` silent, RSC check passed.

```bash
git add lib/organic-social/annotations.ts lib/organic-social/annotations.test.ts
git commit -m "feat(organic-social): pick the peak days for chart annotations

Pure function over a single-channel daily series. Positive days only, inside
the requested window only, ties to the earlier date, returned in date order.

Edge cases in the code this touches:
- input boundaries: fix. Days outside the window and values that are not
  finite numbers are never ranked.
- external failure, operator visibility, bounds, state and concurrency,
  security: decline. Pure function, no I/O, one pass over the series.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Label the peaks and attach the post behind them

**Files:**
- Modify: `lib/organic-social/annotations.ts`
- Modify: `lib/organic-social/annotations.test.ts`

**Interfaces:**
- Consumes: `Peak` (Task 1). `TopContentPost` from `lib/organic-social/content-types.ts` (uses `id: number`, `publishedAt: string` as `yyyy-mm-dd`, `metrics.engagements: number`).
- Produces:
  - `type AnnotationChart = 'followers' | 'engagements'`
  - `interface Annotation extends Peak { label: string; post: TopContentPost | null }`
  - `const ANNOTATION_LIMIT: Record<AnnotationChart, number>` = `{ followers: 2, engagements: 3 }`
  - `annotationLabel(date: string, value: number, chart: AnnotationChart): string`
  - `topPostByDate(posts: TopContentPost[]): Map<string, TopContentPost>`
  - `buildAnnotations(peaks: Peak[], posts: TopContentPost[] | null, chart: AnnotationChart): Annotation[]`

- [ ] **Step 1: Write the failing tests**

In `lib/organic-social/annotations.test.ts`, replace:

```ts
import { expect, test } from 'vitest'
import { pickPeaks } from './annotations'
```

with:

```ts
import { expect, test } from 'vitest'
import { pickPeaks, annotationLabel, topPostByDate, buildAnnotations, ANNOTATION_LIMIT } from './annotations'
import type { TopContentPost } from './content-types'
```

Append to the end of the file:

```ts
const post = (id: number, publishedAt: string, engagements: number): TopContentPost => ({
  id, channel: 'INSTAGRAM', platform: 'Instagram', publishedAt, caption: `post ${id}`,
  url: `https://example.com/${id}`, mediaType: 'IMAGE', mediaGroup: null,
  creative: { kind: 'image', thumb: `https://cdn.example.com/t${id}.jpg`, full: `https://cdn.example.com/f${id}.jpg` },
  metrics: { effectiveness: null, engagementRate: null, engagements, impressions: 0 },
  sourceType: 'organic',
})

test('follower labels carry a plus sign and no leading zeros', () => {
  expect(annotationLabel('2026-08-10', 12, 'followers')).toBe('8/10 | +12 Followers')
  expect(annotationLabel('2026-08-05', 1204, 'followers')).toBe('8/5 | +1,204 Followers')
})

test('engagement labels carry no sign', () => {
  expect(annotationLabel('2026-08-09', 35, 'engagements')).toBe('8/9 | 35 Engagements')
  expect(annotationLabel('2026-08-26', 12345, 'engagements')).toBe('8/26 | 12,345 Engagements')
})

test('a value of exactly 1 reads in the singular', () => {
  expect(annotationLabel('2026-08-05', 1, 'followers')).toBe('8/5 | +1 Follower')
  expect(annotationLabel('2026-08-05', 1, 'engagements')).toBe('8/5 | 1 Engagement')
})

test('labels contain no em or en dash', () => {
  const dashes = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`)
  expect(annotationLabel('2026-08-09', 35, 'engagements')).not.toMatch(dashes)
  expect(annotationLabel('2026-08-10', 12, 'followers')).not.toMatch(dashes)
})

test('the top post of each day is the one with the most engagements', () => {
  const m = topPostByDate([post(1, '2026-08-10', 5), post(2, '2026-08-10', 90), post(3, '2026-08-11', 1)])
  expect(m.get('2026-08-10')?.id).toBe(2)
  expect(m.get('2026-08-11')?.id).toBe(3)
})

test('equal engagements on the same day go to the lower post id, so the choice is stable', () => {
  expect(topPostByDate([post(9, '2026-08-10', 50), post(4, '2026-08-10', 50)]).get('2026-08-10')?.id).toBe(4)
})

test('a post with no publish date is left out rather than guessed', () => {
  expect(topPostByDate([post(1, '', 999)]).size).toBe(0)
})

test('each annotation gets its label and the top post of that day', () => {
  const peaks = [{ date: '2026-08-10', value: 50 }, { date: '2026-08-22', value: 26 }]
  expect(buildAnnotations(peaks, [post(7, '2026-08-10', 40)], 'engagements')).toEqual([
    { date: '2026-08-10', value: 50, label: '8/10 | 50 Engagements', post: expect.objectContaining({ id: 7 }) },
    { date: '2026-08-22', value: 26, label: '8/22 | 26 Engagements', post: null },
  ])
})

test('a peak day with no post gets an annotation with no thumbnail', () => {
  expect(buildAnnotations([{ date: '2026-08-29', value: 20 }], [], 'engagements')[0].post).toBeNull()
})

// The post fetch can fail on its own. A missing picture must never cost the annotation.
test('when the posts could not be fetched, annotations still build without thumbnails', () => {
  expect(buildAnnotations([{ date: '2026-08-10', value: 50 }], null, 'followers')).toEqual([
    { date: '2026-08-10', value: 50, label: '8/10 | +50 Followers', post: null },
  ])
})

test('the limits match the deck: 2 follower annotations, 3 engagement annotations', () => {
  expect(ANNOTATION_LIMIT).toEqual({ followers: 2, engagements: 3 })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/organic-social/annotations.test.ts`
Expected: FAIL. Ten new tests fail with `... is not a function` for `annotationLabel`, `topPostByDate` or `buildAnnotations`; the limits test fails with `expected undefined to deeply equal { followers: 2, engagements: 3 }`. The 12 Task 1 tests still pass.

- [ ] **Step 3: Write the implementation**

In `lib/organic-social/annotations.ts`, replace the first line:

```ts
import type { TrendSeries } from './types'
```

with:

```ts
import type { TrendSeries } from './types'
import type { TopContentPost } from './content-types'
```

Append to the end of the file:

```ts
export type AnnotationChart = 'followers' | 'engagements'

/** A peak ready to render: its value, its label, and the post that likely caused it. */
export interface Annotation extends Peak {
  label: string
  /** The top post published that day, or null when nothing went live or the posts failed to load. */
  post: TopContentPost | null
}

/** Every Follower Growth slide in the deck calls out 2 days; every Engagement slide 3. */
export const ANNOTATION_LIMIT: Record<AnnotationChart, number> = { followers: 2, engagements: 3 }

/**
 * `8/10 | +12 Followers` or `8/9 | 35 Engagements`. No leading zeros and no year, since a
 * report covers one month. The deck separates the engagement label with a dash; a pipe is
 * used on both so the two charts read the same way.
 */
export function annotationLabel(date: string, value: number, chart: AnnotationChart): string {
  const [, month, day] = date.split('-')
  const when = `${Number(month)}/${Number(day)}`
  const amount = value.toLocaleString('en-US')
  if (chart === 'followers') return `${when} | +${amount} Follower${value === 1 ? '' : 's'}`
  return `${when} | ${amount} Engagement${value === 1 ? '' : 's'}`
}

/**
 * The top post published on each day, by engagements. Ties go to the lower post id so the
 * choice never flips between renders. A post with no publish date is dropped: a guessed
 * date would attach it to the wrong spike. publishedAt is the UTC date, which is the day
 * Dash's daily series counts the post on (probed 2026-09-18).
 */
export function topPostByDate(posts: TopContentPost[]): Map<string, TopContentPost> {
  const best = new Map<string, TopContentPost>()
  for (const p of posts) {
    if (!p.publishedAt) continue
    const current = best.get(p.publishedAt)
    const wins = !current
      || p.metrics.engagements > current.metrics.engagements
      || (p.metrics.engagements === current.metrics.engagements && p.id < current.id)
    if (wins) best.set(p.publishedAt, p)
  }
  return best
}

/** Peaks plus their labels and posts. `posts` is null when the post fetch failed, in which
 *  case every annotation still builds, just without a thumbnail. */
export function buildAnnotations(peaks: Peak[], posts: TopContentPost[] | null, chart: AnnotationChart): Annotation[] {
  const byDate = posts ? topPostByDate(posts) : new Map<string, TopContentPost>()
  return peaks.map((p) => ({ ...p, label: annotationLabel(p.date, p.value, chart), post: byDate.get(p.date) ?? null }))
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/organic-social/annotations.test.ts`
Expected: PASS, 23 tests.

- [ ] **Step 5: Gates and commit**

Run: `npx vitest run && npx tsc --noEmit && npm run check:rsc`
Expected: **1098** passed, `tsc` silent, RSC check passed.

```bash
git add lib/organic-social/annotations.ts lib/organic-social/annotations.test.ts
git commit -m "feat(organic-social): label peak days and attach the post behind each

Labels read like the deck (8/10 | +12 Followers). The top post of a peak day,
by engagements, becomes its thumbnail; ties go to the lower post id.

Edge cases in the code this touches:
- input boundaries: fix. A post with no publish date is never attached; a
  failed post fetch (null) still yields every annotation.
- external failure, operator visibility, bounds, state and concurrency,
  security: decline. Pure functions, no I/O.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Let the getters take a metric and a window

**Files:**
- Modify: `lib/organic-social/types.ts`
- Modify: `lib/organic-social/followers.ts` (lines 3, 6, 15-21, 25, 29, 49-52)
- Modify: `lib/organic-social/trends.ts` (lines 3, 6, 16-20, 24)
- Modify: `lib/organic-social/graph-requests.test.ts`

**Interfaces:**
- Consumes: `isoRange` and `isoRangeTz` from `lib/organic-social/base.ts`. `metricForKey(channel, 'netNewFollowers')` resolves to `NET_NEW_FOLLOWERS` on every channel.
- Produces:
  - `type DayWindow = 'eastern' | 'utc'` (types.ts)
  - `type FollowerKey = 'followers' | 'netNewFollowers'` (followers.ts)
  - `getFollowerGraph(slug, dateRange, channel = null, key: FollowerKey = 'followers', window: DayWindow = 'eastern')`
  - `getEngagementTrend(slug, dateRange, channel = null, window: DayWindow = 'eastern')`

- [ ] **Step 1: Write the failing tests**

Append to `lib/organic-social/graph-requests.test.ts`:

```ts
// v2: what the new clients' graphs send.
test('followers gained: NET_NEW_FOLLOWERS over the UTC month', async () => {
  await getFollowerGraph('slug-f', AUG, 'INSTAGRAM', 'netNewFollowers', 'utc')
  expect(sent()).toMatchObject({ metrics: 'NET_NEW_FOLLOWERS', start_date: '2026-08-01', end_date: '2026-08-31' })
})

test('followers gained treat a missing day as zero, not the last known value', async () => {
  const s = await getFollowerGraph('slug-g', AUG, 'INSTAGRAM', 'netNewFollowers', 'utc')
  expect(s.points.find((p) => p.date === '2026-08-02')).toEqual({ date: '2026-08-02', Instagram: 0 })
})

test('choosing the metric alone keeps the Eastern window', async () => {
  await getFollowerGraph('slug-h', AUG, 'INSTAGRAM', 'netNewFollowers')
  expect(sent()).toMatchObject({ metrics: 'NET_NEW_FOLLOWERS', ...EASTERN })
})

test('engagement graph over the UTC month', async () => {
  await getEngagementTrend('slug-i', AUG, 'INSTAGRAM', 'utc')
  expect(sent()).toMatchObject({ metrics: 'TOTAL_ENGAGEMENTS', start_date: '2026-08-01', end_date: '2026-08-31' })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/organic-social/graph-requests.test.ts`
Expected: FAIL, 4 of 9. The extra arguments are ignored today, so the first and third fail on `metrics: 'TOTAL_FOLLOWERS'`, the second on `Instagram: 100` (carried) instead of 0, the fourth on `start_date: '2026-08-01T04:00:00Z'`. The 5 v1 tests pass.

- [ ] **Step 3: Add the window type**

Append to `lib/organic-social/types.ts`:

```ts

/** Which calendar a GRAPH request's days follow. 'eastern' is what every graph has always
 *  sent (midnight US Eastern on both ends; Dash treats the end date as inclusive, so on
 *  some channels the last evening lands on an extra UTC day). 'utc' sends plain dates, the
 *  window Top Content uses: exactly the month's days, each a full UTC day, which is how
 *  Dash buckets daily data (probed 2026-09-18). Only v2 graphs pass 'utc'. */
export type DayWindow = 'eastern' | 'utc'
```

- [ ] **Step 4: Change followers.ts**

In `lib/organic-social/followers.ts`, replace line 3:

```ts
import { dashClientFor, isoRangeTz } from './base'
```

with:

```ts
import { dashClientFor, isoRange, isoRangeTz } from './base'
```

Replace line 6:

```ts
import type { TrendSeries } from './types'
```

with:

```ts
import type { DayWindow, TrendSeries } from './types'
```

Replace lines 15-21:

```ts
/** Daily TOTAL_FOLLOWERS per channel (GRAPH/DAILY). Findings §3a: available on all four.
 *  TOTAL_FOLLOWERS is basis-neutral (identical both bases in PLATFORM_KPIS). */
export const getFollowerGraph = cache(async (
  slug: string,
  dateRange: string,
  channel: DashChannel | null = null,
): Promise<TrendSeries> => {
```

with:

```ts
export type FollowerKey = 'followers' | 'netNewFollowers'

/** Daily TOTAL_FOLLOWERS per channel (GRAPH/DAILY). Findings §3a: available on all four.
 *  TOTAL_FOLLOWERS is basis-neutral (identical both bases in PLATFORM_KPIS).
 *
 *  `key` and `window` are optional and default to exactly what every existing caller gets:
 *  total followers over the Eastern window. v1 of the follower graph, which Renaissance
 *  renders, passes neither. Only follower-graph@2 passes 'netNewFollowers' and 'utc',
 *  because the team's Follower Growth chart plots daily gains. React's cache keys on every
 *  argument and the Dash request is cached by URL, so v1 and v2 never share a result. */
export const getFollowerGraph = cache(async (
  slug: string,
  dateRange: string,
  channel: DashChannel | null = null,
  key: FollowerKey = 'followers',
  window: DayWindow = 'eastern',
): Promise<TrendSeries> => {
```

Replace line 25 (`const { start, end } = isoRangeTz(dateRange)`) with:

```ts
  const { start, end } = window === 'utc' ? isoRange(dateRange) : isoRangeTz(dateRange)
```

Replace line 29:

```ts
      const metric = metricForKey(channel, 'followers') // TOTAL_FOLLOWERS
```

with:

```ts
      const metric = metricForKey(channel, key) // TOTAL_FOLLOWERS unless v2 asks for NET_NEW_FOLLOWERS
```

Replace lines 49-52:

```ts
  // TOTAL_FOLLOWERS is a STOCK, not a flow: a missing day must hold the last known
  // count, never plot a fabricated 0 (the "don't fabricate a zero" hazard the headline
  // builder throws to avoid). gapFill:'carry' does exactly that.
  return buildTrendSeries(perChannel, { gapFill: 'carry' })
```

with:

```ts
  // TOTAL_FOLLOWERS is a STOCK, not a flow: a missing day must hold the last known
  // count, never plot a fabricated 0 (the "don't fabricate a zero" hazard the headline
  // builder throws to avoid). gapFill:'carry' does exactly that. NET_NEW_FOLLOWERS is a
  // flow, like daily engagements, so a missing day is 0.
  return buildTrendSeries(perChannel, { gapFill: key === 'followers' ? 'carry' : 'zero' })
```

- [ ] **Step 5: Change trends.ts**

In `lib/organic-social/trends.ts`, replace line 3:

```ts
import { dashClientFor, isoRangeTz } from './base'
```

with:

```ts
import { dashClientFor, isoRange, isoRangeTz } from './base'
```

Replace line 6:

```ts
import type { TrendSeries } from './types'
```

with:

```ts
import type { DayWindow, TrendSeries } from './types'
```

Replace lines 16-20:

```ts
export const getEngagementTrend = cache(async (
  slug: string,
  dateRange: string,
  channel: DashChannel | null = null,
): Promise<TrendSeries> => {
```

with:

```ts
/** `window` is optional and defaults to the Eastern window every existing caller gets. v1,
 *  which Renaissance renders, passes nothing; only engagement-trend@2 passes 'utc'. */
export const getEngagementTrend = cache(async (
  slug: string,
  dateRange: string,
  channel: DashChannel | null = null,
  window: DayWindow = 'eastern',
): Promise<TrendSeries> => {
```

Replace (formerly line 24) `  const { start, end } = isoRangeTz(dateRange)` with:

```ts
  const { start, end } = window === 'utc' ? isoRange(dateRange) : isoRangeTz(dateRange)
```

- [ ] **Step 6: Run to verify it passes, and that v1 is unmoved**

Run: `npx vitest run lib/organic-social/graph-requests.test.ts components/report-sections/organic-social/parts/follower-graph.golden.test.tsx components/report-sections/organic-social/v1-render.golden.test.tsx`
Expected: PASS: 9 + 4 + 7, no snapshot written or changed.

- [ ] **Step 7: Gates and commit**

Run: `npx vitest run && npx tsc --noEmit && npm run check:rsc`
Expected: **1102** passed, `tsc` silent, RSC check passed.

```bash
git add lib/organic-social/types.ts lib/organic-social/followers.ts lib/organic-social/trends.ts lib/organic-social/graph-requests.test.ts
git commit -m "feat(organic-social): let the graph getters take a metric and a window

Optional arguments, defaulting to exactly today's total followers and Eastern
window, so every existing caller, including the v1 graphs Renaissance renders,
is unchanged (pinned by the request tests from the first commit). v2 will ask
for daily net new followers over the UTC month. The gap rule follows the
metric: carry for the running total, zero for the daily change.

Edge cases in the code this touches:
- external failure: decline. A Dash error or timeout takes the existing path
  (the channel error policy, then safe() and the error card). Unchanged.
- operator visibility: decline. Same as v1: a failed chart shows the error
  card with no log line naming the client. Pre-existing.
- bounds: decline. One request per configured channel, as before.
- input boundaries: decline. The metric and window come from our own code,
  never from a request.
- state and concurrency: decline. The metric and window are part of both
  cache keys, so v1 and v2 on one page never share a result.
- security: decline. No new input crosses a trust boundary.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Show the annotations on the v2 graphs

One reviewable unit: the row, the chart button, the titles, and the two v2 parts that feed them. Split further and a commit would leave the v2 parts passing a prop the chart no longer takes.

**Files:**
- Create: `components/report-sections/organic-social/annotation-callouts.tsx`
- Create: `components/report-sections/organic-social/annotation-callouts.test.tsx`
- Create: `components/report-sections/organic-social/parts/annotations-wiring.test.tsx`
- Modify: `components/report-sections/organic-social/trends.tsx` (five exact edits; the channel buttons are not touched)
- Modify: `components/report-sections/organic-social/follower-graph.tsx`
- Modify: `components/report-sections/organic-social/parts/follower-graph.tsx` (imports and the v2 block only)
- Modify: `components/report-sections/organic-social/parts/engagement-trend.tsx` (imports and the v2 block only)

**Interfaces:**
- Consumes: `Annotation`, `pickPeaks`, `buildAnnotations`, `ANNOTATION_LIMIT` (Tasks 1, 2). The Task 3 getter arguments. `Creative` from `content-types.ts`. `CHANNEL_LABEL` from `metrics.ts`. `isoRange` from `base.ts`. `LineChart`'s existing optional `marks?: { x: string; label?: string }[]` (a dot per mark on the first series; `label` is not drawn).
- Produces:
  - `AnnotationCallouts({ items }: { items: Annotation[] })`: a `<ul aria-label="Annotations">`
  - `ChannelTrendChart({ title, series, annotations }: { title: string; series: TrendSeries; annotations?: Annotation[] })`
  - `EngagementTrend({ series, annotations, title = 'Engagement Over Time' })`
  - `FollowerGraph({ series, annotations, title = 'Followers' })`

- [ ] **Step 1: Write the failing render tests**

Create `components/report-sections/organic-social/annotation-callouts.test.tsx`:

```tsx
import { expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

// Recharts draws nothing in jsdom, so the chart is replaced by a stub that records its
// props: the dots are asserted on what the chart is handed.
vi.mock('@/components/charts/line-chart', () => ({ LineChart: vi.fn(() => null) }))

import { LineChart } from '@/components/charts/line-chart'
import { AnnotationCallouts } from './annotation-callouts'
import { ChannelTrendChart, EngagementTrend } from './trends'
import { FollowerGraph } from './follower-graph'
import type { Annotation } from '@/lib/organic-social/annotations'
import type { TopContentPost } from '@/lib/organic-social/content-types'
import type { TrendSeries } from '@/lib/organic-social/types'

// All numbers are made up.
const post = (over: Partial<TopContentPost> = {}): TopContentPost => ({
  id: 1, channel: 'INSTAGRAM', platform: 'Instagram', publishedAt: '2026-08-10', caption: 'A caregiver tip',
  url: 'https://example.com/p/1', mediaType: 'IMAGE', mediaGroup: null,
  creative: { kind: 'image', thumb: 'https://cdn.example.com/t.jpg', full: 'https://cdn.example.com/f.jpg' },
  metrics: { effectiveness: null, engagementRate: null, engagements: 40, impressions: 0 },
  sourceType: 'organic', ...over,
})
const A = (over: Partial<Annotation> = {}): Annotation =>
  ({ date: '2026-08-10', value: 50, label: '8/10 | 50 Engagements', post: post(), ...over })
const SERIES: TrendSeries = { channels: ['Instagram'], points: [{ date: '2026-08-10', Instagram: 50 }] }
// The chart's own legend could be a list too, so the annotations are found by name.
const annotationList = () => screen.queryByRole('list', { name: 'Annotations' })
const lastMarks = () => vi.mocked(LineChart).mock.lastCall?.[0].marks

test('each annotation shows its label', () => {
  render(<AnnotationCallouts items={[A(), A({ date: '2026-08-22', value: 26, label: '8/22 | 26 Engagements', post: null })]} />)
  expect(screen.getByText('8/10 | 50 Engagements')).toBeTruthy()
  expect(screen.getByText('8/22 | 26 Engagements')).toBeTruthy()
})

test('an annotation with a post shows its thumbnail and links to the post', () => {
  const { container } = render(<AnnotationCallouts items={[A()]} />)
  expect(container.querySelector('img')?.getAttribute('src')).toBe('https://cdn.example.com/t.jpg')
  expect(container.querySelector('a')?.getAttribute('href')).toBe('https://example.com/p/1')
})

test('a video with a poster shows the poster frame, not a player', () => {
  const video = post({ mediaType: 'VIDEO', creative: { kind: 'video', src: 'https://cdn.example.com/v.mp4', poster: 'https://cdn.example.com/p.jpg' } })
  const { container } = render(<AnnotationCallouts items={[A({ post: video })]} />)
  expect(container.querySelector('video')).toBeNull()
  expect(container.querySelector('img')?.getAttribute('src')).toBe('https://cdn.example.com/p.jpg')
})

test('an annotation with no post shows its label and no image', () => {
  const { container } = render(<AnnotationCallouts items={[A({ post: null })]} />)
  expect(screen.getByText('8/10 | 50 Engagements')).toBeTruthy()
  expect(container.querySelector('img')).toBeNull()
})

test('a post whose creative is gone shows the same placeholder Top Content uses', () => {
  render(<AnnotationCallouts items={[A({ post: post({ creative: null }) })]} />)
  expect(screen.getByText('creative no longer available')).toBeTruthy()
})

// Dash keeps returning the URL after the CDN purges the file, so the load itself fails.
test('an image that fails to load swaps to the placeholder rather than a broken image', () => {
  const { container } = render(<AnnotationCallouts items={[A()]} />)
  fireEvent.error(container.querySelector('img')!)
  expect(container.querySelector('img')).toBeNull()
  expect(screen.getByText('creative no longer available')).toBeTruthy()
})

// Top Content keeps a live video with no poster rather than calling it gone (creative.ts).
test('a video with no poster shows a muted video tile, not the placeholder', () => {
  const video = post({ mediaType: 'VIDEO', creative: { kind: 'video', src: 'https://cdn.example.com/v.mp4', poster: null } })
  const { container } = render(<AnnotationCallouts items={[A({ post: video })]} />)
  const tile = container.querySelector('video')
  expect(tile?.getAttribute('src')).toBe('https://cdn.example.com/v.mp4')
  expect(tile?.muted).toBe(true)
  expect(screen.queryByText('creative no longer available')).toBeNull()
})

test('a post with no link still shows its thumbnail, just not as a link', () => {
  const { container } = render(<AnnotationCallouts items={[A({ post: post({ url: null }) })]} />)
  expect(container.querySelector('img')).toBeTruthy()
  expect(container.querySelector('a')).toBeNull()
})

// The link comes from Dash. Anything but http(s), such as a javascript: URL, is not rendered as a link.
test('a link that is not http or https is not rendered as a link', () => {
  const { container } = render(<AnnotationCallouts items={[A({ post: post({ url: 'javascript:alert(1)' }) })]} />)
  expect(container.querySelector('img')).toBeTruthy()
  expect(container.querySelector('a')).toBeNull()
})

test('a post with no caption is described by its annotation', () => {
  const { container } = render(<AnnotationCallouts items={[A({ post: post({ caption: '' }) })]} />)
  expect(container.querySelector('img')?.getAttribute('alt')).toBe('8/10 | 50 Engagements')
})

test('no annotations renders nothing at all', () => {
  const { container } = render(<AnnotationCallouts items={[]} />)
  expect(container.firstChild).toBeNull()
})

// THE RENAISSANCE GUARD FOR THE SHARED CHART. v1 passes no annotations, so there must be
// no Annotations button, no row and no dots: the chart is exactly what it was.
test('a chart given no annotations has no button, no row and no dots', () => {
  render(<ChannelTrendChart title="Followers" series={SERIES} />)
  expect(screen.queryByText('Annotations')).toBeNull()
  expect(annotationList()).toBeNull()
  expect(lastMarks()).toBeUndefined()
})

test('a chart given an empty list of annotations looks the same as one given none', () => {
  render(<ChannelTrendChart title="Followers" series={SERIES} annotations={[]} />)
  expect(screen.queryByText('Annotations')).toBeNull()
  expect(annotationList()).toBeNull()
  expect(lastMarks()).toBeUndefined()
})

test('a chart given annotations shows the row, and the button hides and restores it', () => {
  render(<ChannelTrendChart title="Instagram Engagement Graph" series={SERIES} annotations={[A()]} />)
  expect(annotationList()).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Annotations' }))
  expect(annotationList()).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Annotations' }))
  expect(annotationList()).toBeTruthy()
})

test('each annotated day gets a dot, and the button takes the dots away too', () => {
  render(<ChannelTrendChart title="Instagram Engagement Graph" series={SERIES} annotations={[A()]} />)
  expect(lastMarks()).toEqual([{ x: '2026-08-10', label: '8/10 | 50 Engagements' }])
  fireEvent.click(screen.getByRole('button', { name: 'Annotations' }))
  expect(lastMarks()).toBeUndefined()
})

test('toggling off the only channel takes the annotations away with the chart', () => {
  render(<ChannelTrendChart title="Instagram Engagement Graph" series={SERIES} annotations={[A()]} />)
  fireEvent.click(screen.getByRole('button', { name: 'Instagram' }))
  expect(annotationList()).toBeNull()
})

// Regression: an earlier commit on this branch accepted marks on EngagementTrend and
// never passed them to the chart, so the engagement graph silently showed nothing.
test('EngagementTrend passes its annotations through to the chart', () => {
  render(<EngagementTrend series={SERIES} annotations={[A()]} />)
  expect(screen.getByText('8/10 | 50 Engagements')).toBeTruthy()
})

test('EngagementTrend keeps its "Engagement Over Time" title unless given another', () => {
  const { unmount } = render(<EngagementTrend series={SERIES} />)
  expect(screen.getByText('Engagement Over Time')).toBeTruthy()
  unmount()
  render(<EngagementTrend series={SERIES} title="Instagram Engagement Graph" />)
  expect(screen.getByText('Instagram Engagement Graph')).toBeTruthy()
})

test('FollowerGraph keeps its "Followers" title unless given another', () => {
  const { unmount } = render(<FollowerGraph series={SERIES} />)
  expect(screen.getByText('Followers')).toBeTruthy()
  unmount()
  render(<FollowerGraph series={SERIES} title="Instagram Follower Growth Graph" />)
  expect(screen.getByText('Instagram Follower Growth Graph')).toBeTruthy()
})
```

- [ ] **Step 2: Write the failing wiring tests**

Create `components/report-sections/organic-social/parts/annotations-wiring.test.tsx`:

```tsx
import { beforeEach, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'

// Same pattern as the golden tests: the data getters are stubbed, everything between them
// and the rendered chart is real. All numbers are made up.
vi.mock('@/lib/organic-social/followers', () => import('./__mocks__/followers'))
vi.mock('@/lib/organic-social/trends', () => import('./__mocks__/trends'))
const { fetchTopContentFrozen } = vi.hoisted(() => ({ fetchTopContentFrozen: vi.fn() }))
vi.mock('@/lib/organic-social/frozen', () => ({ fetchTopContentFrozen }))

import { getFollowerGraph } from '@/lib/organic-social/followers'
import { getEngagementTrend } from '@/lib/organic-social/trends'
import { FollowerSection, FollowerSectionV2 } from './follower-graph'
import { TrendSectionV2 } from './engagement-trend'
import { FIXTURE_ORGANIC_SOCIAL_CTX } from './__fixtures__/organic-social-ctx'
import type { Annotation } from '@/lib/organic-social/annotations'
import type { TopContentPost } from '@/lib/organic-social/content-types'
import type { TrendSeries } from '@/lib/organic-social/types'

// A closed month, so the window is fixed and the test does not move with the calendar.
const AUG = { ...FIXTURE_ORGANIC_SOCIAL_CTX, dateRange: '2026-08-01,2026-08-31', channel: 'INSTAGRAM' as const }
const ig = (values: Record<string, number>): TrendSeries => ({
  channels: ['Instagram'],
  points: Object.entries(values).map(([date, v]) => ({ date, Instagram: v })),
})
const post = (id: number, publishedAt: string, engagements: number): TopContentPost => ({
  id, channel: 'INSTAGRAM', platform: 'Instagram', publishedAt, caption: `post ${id}`,
  url: `https://example.com/${id}`, mediaType: 'IMAGE', mediaGroup: null,
  creative: { kind: 'image', thumb: `https://cdn.example.com/t${id}.jpg`, full: `https://cdn.example.com/f${id}.jpg` },
  metrics: { effectiveness: null, engagementRate: null, engagements, impressions: 0 },
  sourceType: 'organic',
})
const annotationsOf = (el: unknown) => (el as ReactElement<{ annotations?: Annotation[] }>).props.annotations
const summary = (el: unknown) => annotationsOf(el)?.map((a) => [a.label, a.post?.id ?? null])

beforeEach(() => vi.clearAllMocks())

// v1 is what Renaissance renders. It must still ask for total followers with exactly three
// arguments, never fetch posts, and pass no annotations.
test('v1 follower graph is unchanged: total followers, no posts, no annotations', async () => {
  vi.mocked(getFollowerGraph).mockResolvedValueOnce(ig({ '2026-08-10': 5 }))
  const el = await FollowerSection(AUG)
  expect(getFollowerGraph).toHaveBeenCalledWith('fixture-client', '2026-08-01,2026-08-31', 'INSTAGRAM')
  expect(fetchTopContentFrozen).not.toHaveBeenCalled()
  expect(annotationsOf(el)).toBeUndefined()
})

test('v2 follower graph asks for daily gains over the UTC month and annotates the top 2 days', async () => {
  vi.mocked(getFollowerGraph).mockResolvedValueOnce(ig({ '2026-08-05': 12, '2026-08-10': 28, '2026-08-20': 19, '2026-09-01': 99 }))
  fetchTopContentFrozen.mockResolvedValueOnce([post(1, '2026-08-10', 40)])
  const el = await FollowerSectionV2(AUG)
  expect(getFollowerGraph).toHaveBeenCalledWith('fixture-client', '2026-08-01,2026-08-31', 'INSTAGRAM', 'netNewFollowers', 'utc')
  expect(fetchTopContentFrozen).toHaveBeenCalledWith('fixture-client', '2026-08-01,2026-08-31', 'INSTAGRAM')
  expect(summary(el)).toEqual([['8/10 | +28 Followers', 1], ['8/20 | +19 Followers', null]])
})

test('v2 follower graph carries the outline title and renders its annotations', async () => {
  vi.mocked(getFollowerGraph).mockResolvedValueOnce(ig({ '2026-08-10': 28 }))
  fetchTopContentFrozen.mockResolvedValueOnce([])
  render(<>{await FollowerSectionV2(AUG)}</>)
  expect(screen.getByText('Instagram Follower Growth Graph')).toBeTruthy()
  expect(screen.getByText('8/10 | +28 Followers')).toBeTruthy()
})

test('when the posts cannot be fetched, the follower annotations still show, without thumbnails', async () => {
  vi.mocked(getFollowerGraph).mockResolvedValueOnce(ig({ '2026-08-10': 28, '2026-08-20': 19 }))
  fetchTopContentFrozen.mockRejectedValueOnce(new Error('dash down'))
  const el = await FollowerSectionV2(AUG)
  expect(summary(el)).toEqual([['8/10 | +28 Followers', null], ['8/20 | +19 Followers', null]])
})

test('when the follower series cannot be fetched, v2 shows the same error card as v1', async () => {
  vi.mocked(getFollowerGraph).mockRejectedValueOnce(new Error('dash down'))
  fetchTopContentFrozen.mockResolvedValueOnce([])
  render(<>{await FollowerSectionV2(AUG)}</>)
  expect(screen.getByText("Couldn't load this section.")).toBeTruthy()
})

test('v2 follower graph on Overview renders nothing and fetches nothing, like v1', async () => {
  expect(await FollowerSectionV2({ ...AUG, channel: null })).toBeNull()
  expect(getFollowerGraph).not.toHaveBeenCalled()
  expect(fetchTopContentFrozen).not.toHaveBeenCalled()
})

test('v2 engagement graph asks for the UTC month and annotates the top 3 days with their top posts', async () => {
  vi.mocked(getEngagementTrend).mockResolvedValueOnce(ig({ '2026-08-03': 5, '2026-08-09': 40, '2026-08-10': 65, '2026-08-11': 38, '2026-09-01': 500 }))
  fetchTopContentFrozen.mockResolvedValueOnce([post(7, '2026-08-10', 3), post(8, '2026-08-10', 60), post(9, '2026-08-11', 12)])
  const el = await TrendSectionV2(AUG)
  expect(getEngagementTrend).toHaveBeenCalledWith('fixture-client', '2026-08-01,2026-08-31', 'INSTAGRAM', 'utc')
  expect(fetchTopContentFrozen).toHaveBeenCalledWith('fixture-client', '2026-08-01,2026-08-31', 'INSTAGRAM')
  expect(summary(el)).toEqual([['8/9 | 40 Engagements', null], ['8/10 | 65 Engagements', 8], ['8/11 | 38 Engagements', 9]])
})

test('when the posts cannot be fetched, the engagement annotations still show, without thumbnails', async () => {
  vi.mocked(getEngagementTrend).mockResolvedValueOnce(ig({ '2026-08-10': 65 }))
  fetchTopContentFrozen.mockRejectedValueOnce(new Error('dash down'))
  expect(summary(await TrendSectionV2(AUG))).toEqual([['8/10 | 65 Engagements', null]])
})

test('v2 engagement graph on Overview has no annotations and fetches no posts', async () => {
  vi.mocked(getEngagementTrend).mockResolvedValueOnce({
    channels: ['Instagram', 'Facebook'],
    points: [{ date: '2026-08-10', Instagram: 50, Facebook: 40 }],
  })
  const el = await TrendSectionV2({ ...AUG, channel: null })
  expect(getEngagementTrend).toHaveBeenCalledWith('fixture-client', '2026-08-01,2026-08-31', null, 'utc')
  expect(fetchTopContentFrozen).not.toHaveBeenCalled()
  expect(annotationsOf(el)).toBeUndefined()
  render(<>{el}</>)
  expect(screen.getByText('Engagement Over Time')).toBeTruthy()
})

test('v2 engagement graph on a platform tab carries the outline title', async () => {
  vi.mocked(getEngagementTrend).mockResolvedValueOnce(ig({ '2026-08-10': 65 }))
  fetchTopContentFrozen.mockResolvedValueOnce([])
  render(<>{await TrendSectionV2(AUG)}</>)
  expect(screen.getByText('Instagram Engagement Graph')).toBeTruthy()
})
```

- [ ] **Step 3: Run both to verify they fail**

Run: `npx vitest run components/report-sections/organic-social/annotation-callouts.test.tsx components/report-sections/organic-social/parts/annotations-wiring.test.tsx`
Expected: FAIL. The render file fails to resolve `./annotation-callouts`. In the wiring file, three pass already because they pin existing behaviour (v1 unchanged, the series error card, the follower Overview returning nothing); the other seven fail, on the new arguments (`'netNewFollowers', 'utc'`), on the missing titles, and on `annotations` being `undefined`.

- [ ] **Step 4: Create the annotation row**

Create `components/report-sections/organic-social/annotation-callouts.tsx`:

```tsx
'use client'

import { useState } from 'react'
import type { Annotation } from '@/lib/organic-social/annotations'
import type { Creative } from '@/lib/organic-social/content-types'

const TILE = 'h-16 w-16 shrink-0 rounded-md'

/** Only http(s) links are rendered. The URL comes from Dash, so a javascript: URL must never
 *  become an href. */
const safeHref = (url: string | null) => (url && /^https?:\/\//i.test(url) ? url : null)

/** Same fallback as the Top Content card (post-card.tsx, Media): a missing or purged image
 *  shows the placeholder, never a broken image. onError catches a load that fails after
 *  hydration; the ref catches one that failed before React attached the handler. A video
 *  with no poster keeps a muted video tile, as the card keeps a live video. */
function Picture({ creative, alt }: { creative: Creative | null; alt: string }) {
  const [broken, setBroken] = useState(false)
  if (broken || !creative) {
    return (
      <div className={`${TILE} flex items-center justify-center bg-white/[0.04] p-1 text-center text-[9px] leading-tight text-text-muted`}>
        creative no longer available
      </div>
    )
  }
  if (creative.kind === 'video' && !creative.poster) {
    return (
      <video className={`${TILE} object-cover`} src={creative.src} muted playsInline preload="metadata"
        aria-label={alt} onError={() => setBroken(true)} />
    )
  }
  const src = creative.kind === 'image' ? creative.thumb : creative.poster!
  return (
    <img
      src={src}
      alt={alt}
      className={`${TILE} object-cover`}
      ref={(el) => { if (el && el.complete && el.naturalWidth === 0) setBroken(true) }}
      onError={() => setBroken(true)}
    />
  )
}

function Thumb({ annotation }: { annotation: Annotation }) {
  const post = annotation.post
  if (!post) return null
  const picture = <Picture creative={post.creative} alt={post.caption.slice(0, 80) || annotation.label} />
  const href = safeHref(post.url)
  return href ? <a href={href} target="_blank" rel="noopener noreferrer">{picture}</a> : picture
}

/** The days that spiked, in date order, directly above the chart they explain. Not pinned
 *  to pixel positions over the line, which would break as the chart resizes on a phone. */
export function AnnotationCallouts({ items }: { items: Annotation[] }) {
  if (items.length === 0) return null
  return (
    <ul aria-label="Annotations" className="flex flex-wrap gap-3">
      {items.map((a) => (
        <li key={a.date} className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] p-2">
          <Thumb annotation={a} />
          <span className="text-xs font-bold text-white">{a.label}</span>
        </li>
      ))}
    </ul>
  )
}
```

jsdom has no image loading (no `canvas` package), so an `<img>` with a `src` reports `complete === false` and the ref check never fires in tests; the failure path is exercised with `fireEvent.error`.

- [ ] **Step 5: Edit the chart component**

Five exact replacements in `components/report-sections/organic-social/trends.tsx`. Nothing else in the file changes.

Edit 5a. Replace:

```tsx
import type { PostMark } from '@/lib/organic-social/post-marks'
import { NoData } from './no-data'
```

with:

```tsx
import type { Annotation } from '@/lib/organic-social/annotations'
import { NoData } from './no-data'
import { AnnotationCallouts } from './annotation-callouts'
```

Edit 5b. Replace:

```tsx
// Exported so the Follower Graph part (M3) reuses the exact same chart + legend, retitled.
// `marks` is optional: a chart given none renders exactly as it did before the prop existed,
// which is what keeps every client still pinned to v1 of these parts unchanged.
export function ChannelTrendChart({
  title, series, marks,
}: { title: string; series: TrendSeries; marks?: PostMark[] }) {
  const [active, setActive] = useState<Set<string>>(() => new Set(series.channels))
  // Marks default ON. They exist to answer "what ran that day" the moment the chart is
  // opened; defaulting them off would mean the feature only helps someone who knows it is
  // there. Only rendered at all when the caller supplies marks.
  const [showMarks, setShowMarks] = useState(true)
```

with:

```tsx
// Exported so the Follower Graph part (M3) reuses the exact same chart + legend, retitled.
// `annotations` is optional: a chart given none (or an empty list) renders exactly as it did
// before the prop existed, with no button, no row and no dots. That is what keeps every
// client still pinned to v1 of these parts, Renaissance included, unchanged.
export function ChannelTrendChart({
  title, series, annotations,
}: { title: string; series: TrendSeries; annotations?: Annotation[] }) {
  const [active, setActive] = useState<Set<string>>(() => new Set(series.channels))
  // Annotations default ON, as in the deck. Only rendered at all when the caller supplies
  // at least one.
  const [showAnnotations, setShowAnnotations] = useState(true)
```

Edit 5c. Replace:

```tsx
  const activeEmpty = isEmptyTrend(series, activeChannels)

```

with:

```tsx
  const activeEmpty = isEmptyTrend(series, activeChannels)
  const hasAnnotations = !!annotations && annotations.length > 0
  // Annotations explain the line, so they go when the line does (every channel toggled off).
  const visible = hasAnnotations && showAnnotations && !activeEmpty ? annotations : undefined

```

Edit 5d. Replace:

```tsx
            {marks && marks.length > 0 && (
              <button
                type="button"
                onClick={() => setShowMarks((v) => !v)}
                aria-pressed={showMarks}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition-colors',
                  showMarks
                    ? 'border-white/20 bg-white/[0.06] text-white'
                    : 'border-white/[0.08] text-text-muted hover:text-white',
                )}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: showMarks ? CHART_COLORS.primary : 'transparent', border: `1px solid ${CHART_COLORS.primary}` }}
                />
                Posts
              </button>
            )}
          </div>
          {activeEmpty ? (
            <NoData />
          ) : (
            <LineChart
              data={series.points}
              xKey="date"
              yKeys={yKeys}
              marks={showMarks ? marks?.map((m) => ({ x: m.date, label: `${m.count} post${m.count === 1 ? '' : 's'}` })) : undefined}
            />
          )}
```

with:

```tsx
            {hasAnnotations && (
              <button
                type="button"
                onClick={() => setShowAnnotations((v) => !v)}
                aria-pressed={showAnnotations}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition-colors',
                  showAnnotations
                    ? 'border-white/20 bg-white/[0.06] text-white'
                    : 'border-white/[0.08] text-text-muted hover:text-white',
                )}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: showAnnotations ? CHART_COLORS.primary : 'transparent', border: `1px solid ${CHART_COLORS.primary}` }}
                />
                Annotations
              </button>
            )}
          </div>
          {visible && <AnnotationCallouts items={visible} />}
          {activeEmpty ? (
            <NoData />
          ) : (
            <LineChart
              data={series.points}
              xKey="date"
              yKeys={yKeys}
              marks={visible?.map((a) => ({ x: a.date, label: a.label }))}
            />
          )}
```

With no annotations, `visible` is `undefined`, so `LineChart` receives `marks={undefined}`: the same value every v1 chart received before this change.

Edit 5e. Replace:

```tsx
export function EngagementTrend({ series, marks }: { series: TrendSeries; marks?: PostMark[] }) {
  return <ChannelTrendChart title="Engagement Over Time" series={series} />
}
```

with:

```tsx
export function EngagementTrend({
  series, annotations, title = 'Engagement Over Time',
}: { series: TrendSeries; annotations?: Annotation[]; title?: string }) {
  return <ChannelTrendChart title={title} series={series} annotations={annotations} />
}
```

- [ ] **Step 6: Edit the follower graph component**

Replace the whole of `components/report-sections/organic-social/follower-graph.tsx` (9 lines) with:

```tsx
import { ChannelTrendChart } from './trends'
import type { TrendSeries } from '@/lib/organic-social/types'
import type { Annotation } from '@/lib/organic-social/annotations'

/** Daily followers over time. On a platform subpage `series` has one channel.
 *  `annotations` and `title` are optional: v1 of this part passes neither and renders
 *  exactly as before, titled "Followers" over total followers. */
export function FollowerGraph({
  series, annotations, title = 'Followers',
}: { series: TrendSeries; annotations?: Annotation[]; title?: string }) {
  return <ChannelTrendChart series={series} title={title} annotations={annotations} />
}
```

- [ ] **Step 7: Rewrite the v2 follower section**

In `components/report-sections/organic-social/parts/follower-graph.tsx`, replace:

```tsx
import { fetchTopContentFrozen } from '@/lib/organic-social/frozen'
import { toPostMarks } from '@/lib/organic-social/post-marks'
```

with:

```tsx
import { fetchTopContentFrozen } from '@/lib/organic-social/frozen'
import { isoRange } from '@/lib/organic-social/base'
import { CHANNEL_LABEL } from '@/lib/organic-social/metrics'
import { pickPeaks, buildAnnotations, ANNOTATION_LIMIT } from '@/lib/organic-social/annotations'
```

Replace everything from the line `/** v2 = v1 plus a mark on every day content went live, and a control to hide them.` to the end of the file with:

```tsx
/** v2 plots followers GAINED per day over the UTC month and annotates the top days, each
 *  with the post behind it, the way the team's Follower Growth slides do. Total followers
 *  is a near-flat line with nothing to annotate.
 *
 *  The posts come from the SAME frozen Top Content fetch the section already makes, so this
 *  costs no extra request. If that fetch fails the annotations still render, just without
 *  thumbnails: a missing picture is not a reason to lose the graph.
 *
 *  Registered alongside v1, never replacing it. A client only sees this by pinning
 *  follower-graph@2 in its own report_section_config; the section_templates rows and the
 *  code templates pin v1. */
export async function FollowerSectionV2({ clientSlug, dateRange, channel }: OrganicSocialCtx) {
  if (!channel) return null
  const [graph, posts] = await Promise.all([
    safe(getFollowerGraph(clientSlug, dateRange, channel, 'netNewFollowers', 'utc')),
    safe(fetchTopContentFrozen(clientSlug, dateRange, channel)),
  ])
  if (!graph.data) return <Fallback kind={graph.error!} />
  const { start, end } = isoRange(dateRange)
  const peaks = pickPeaks(graph.data, { limit: ANNOTATION_LIMIT.followers, from: start, to: end })
  const annotations = buildAnnotations(peaks, posts.data ?? null, 'followers')
  // Jasmine's outline names this chart, word for word.
  return <FollowerGraph series={graph.data} annotations={annotations} title={`${CHANNEL_LABEL[channel]} Follower Growth Graph`} />
}

export const followerGraphV2: PartImpl<OrganicSocialCtx> = {
  id: 'follower-graph',
  version: 2,
  published: true,
  defaultLabel: 'Follower Growth Graph',
  render: (ctx) => (
    <Suspense fallback={<TrendSkeleton />}>
      <FollowerSectionV2 {...ctx} />
    </Suspense>
  ),
}
```

- [ ] **Step 8: Rewrite the v2 engagement section**

In `components/report-sections/organic-social/parts/engagement-trend.tsx`, replace:

```tsx
import { fetchTopContentFrozen } from '@/lib/organic-social/frozen'
import { toPostMarks } from '@/lib/organic-social/post-marks'
```

with:

```tsx
import { fetchTopContentFrozen } from '@/lib/organic-social/frozen'
import { isoRange } from '@/lib/organic-social/base'
import { CHANNEL_LABEL } from '@/lib/organic-social/metrics'
import { pickPeaks, buildAnnotations, ANNOTATION_LIMIT } from '@/lib/organic-social/annotations'
```

Replace everything from the line `/** v2 = v1 plus a mark on every day content went live, and a control to hide them.` to the end of the file with:

```tsx
/** v2 = daily engagements over the UTC month, with the top days annotated, each with the
 *  post behind it. Same frozen Top Content fetch the section already makes. A failed post
 *  fetch loses the thumbnails, never the chart. On Overview several platforms share one
 *  chart and a peak is ambiguous, so Overview gets no annotations and fetches no posts.
 *  Registered alongside v1; the section_templates rows and code templates pin v1. */
export async function TrendSectionV2({ clientSlug, dateRange, channel }: OrganicSocialCtx) {
  if (!channel) {
    const trend = await safe(getEngagementTrend(clientSlug, dateRange, null, 'utc'))
    return trend.data ? <EngagementTrend series={trend.data} /> : <Fallback kind={trend.error!} />
  }
  const [trend, posts] = await Promise.all([
    safe(getEngagementTrend(clientSlug, dateRange, channel, 'utc')),
    safe(fetchTopContentFrozen(clientSlug, dateRange, channel)),
  ])
  if (!trend.data) return <Fallback kind={trend.error!} />
  const { start, end } = isoRange(dateRange)
  const peaks = pickPeaks(trend.data, { limit: ANNOTATION_LIMIT.engagements, from: start, to: end })
  const annotations = buildAnnotations(peaks, posts.data ?? null, 'engagements')
  // Jasmine's outline names this chart, word for word.
  return <EngagementTrend series={trend.data} annotations={annotations} title={`${CHANNEL_LABEL[channel]} Engagement Graph`} />
}

export const engagementTrendV2: PartImpl<OrganicSocialCtx> = {
  id: 'engagement-trend',
  version: 2,
  published: true,
  defaultLabel: 'Engagement Graph',
  render: (ctx) => (
    <Suspense fallback={<TrendSkeleton />}>
      <TrendSectionV2 {...ctx} />
    </Suspense>
  ),
}
```

- [ ] **Step 9: Run to verify it passes, then run the gates**

Run: `npx vitest run components/report-sections/organic-social/annotation-callouts.test.tsx components/report-sections/organic-social/parts/annotations-wiring.test.tsx`
Expected: PASS, 19 + 10.

Run: `npx vitest run && npx tsc --noEmit && npm run check:rsc`
Expected: **1131** passed, no snapshot written or updated, `tsc` silent, RSC check passed. `post-marks.ts` still exists but nothing imports it.

- [ ] **Step 10: Commit**

```bash
git add components/report-sections/organic-social/annotation-callouts.tsx components/report-sections/organic-social/annotation-callouts.test.tsx components/report-sections/organic-social/trends.tsx components/report-sections/organic-social/follower-graph.tsx components/report-sections/organic-social/parts/follower-graph.tsx components/report-sections/organic-social/parts/engagement-trend.tsx components/report-sections/organic-social/parts/annotations-wiring.test.tsx
git commit -m "feat(organic-social): annotate peak days on the v2 graphs

follower-graph@2 plots followers gained per day and annotates the top 2 days;
engagement-trend@2 annotates the top 3. Both use the UTC month. Each
annotation is a row above the chart with its value and the thumbnail of the
post behind it, plus a dot on the day, behind one Annotations button. Titles
follow Jasmine's outlines word for word. Overview gets no annotations.

With no annotations passed the chart is exactly as before: no button, no row,
no dots. That is every v1 chart, Renaissance included; the v1 snapshots from
the first commit are unchanged.

Also fixes a bug from an earlier commit on this branch: EngagementTrend
accepted marks and never passed them on. A test now covers it.

Edge cases in the code this touches:
- external failure: fix. A failed post fetch keeps the annotations without
  thumbnails; a failed series fetch shows the existing error card. Tested.
- operator visibility: file. A failed post fetch is swallowed by safe() with
  no log, as the earlier commit on this branch already noted.
- bounds: decline. At most 2 or 3 annotations; linear in the window length.
- input boundaries: fix. Days outside the window, non-positive and non-finite
  values never become annotations; a post with no date is never attached; a
  post link that is not http(s) is not rendered as a link.
- state and concurrency: decline. The platform tabs already called the frozen
  Top Content fetch; Overview no longer does. Concurrent first freezes of a
  month settle on the same rows (writeSnapshot, onConflictDoNothing).
- security: fix. Post URLs from Dash only become links when http(s); captions
  render as text and attributes, never as HTML.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Let the team hide one annotation from the client

**Files:**
- Modify: `lib/db/schema.ts` (append after the `postDesignations` block)
- Generate: `drizzle/0024_*.sql`, `drizzle/meta/0024_snapshot.json`, `drizzle/meta/_journal.json`
- Create: `lib/organic-social/annotation-hides/permissions.ts` + `permissions.test.ts`
- Create: `lib/organic-social/annotation-hides/mutations.ts` + `mutations.test.ts`
- Create: `lib/organic-social/annotation-hides/apply.ts` + `apply.test.ts`
- Create: `lib/organic-social/annotation-hides/select.ts`
- Create: `components/report-sections/organic-social/parts/annotation-hides.ts`
- Modify: `app/actions/organic-social.ts` (append a new action; the designation action is untouched)
- Create: `app/actions/organic-social.test.ts`
- Modify: `lib/organic-social/annotations.ts` (optional `hidden` flag, `AnnotationControls` type)
- Modify: `components/report-sections/organic-social/annotation-callouts.tsx` and its test
- Modify: `components/report-sections/organic-social/trends.tsx`, `follower-graph.tsx`
- Modify: both v2 parts and `parts/annotations-wiring.test.tsx`
- Modify: `MIGRATIONS-PENDING.md`

**Interfaces:**
- Consumes: `isInternalStaff` (`lib/dashboard/permissions.ts`), `CHANNELS`, `DashChannel` (`metrics.ts`), `getClientBySlug` (`lib/db/queries.ts`), `db` (`lib/db/client.ts`), `auth` (`@/auth`), `revalidateTag` (`next/cache`).
- Produces:
  - Table `chart_annotation_hides` (`chartAnnotationHides`)
  - `canHideAnnotation(role: string): boolean`
  - `authorizeAnnotationHide(input: { channel: string; chart: string; day: string; hidden: unknown }): { ok: boolean; error?: string }`
  - `setAnnotationHidden(args: { clientId: string; channel: DashChannel; chart: AnnotationChart; day: string; hidden: boolean; setBy: string }): Promise<void>`
  - `getAnnotationHides(clientId: string, channel: DashChannel): Promise<Set<string>>`
  - `hideKey(chart, day): string`, `applyHides(items, hidden: Set<string>, chart, audience: 'client' | 'staff'): Annotation[]`
  - `withHides(args: { clientSlug; channel; chart; role; items }): Promise<{ items: Annotation[]; controls?: AnnotationControls }>`
  - `setAnnotationHiddenAction(input: { clientSlug: string; channel: string; chart: string; day: string; hidden: boolean }): Promise<{ ok: true } | { ok: false; error: string }>`
  - `Annotation.hidden?: boolean`; `interface AnnotationControls { clientSlug: string; channel: DashChannel; chart: AnnotationChart }`

- [ ] **Step 1: Add the table**

In `lib/db/schema.ts`, directly after the line `export type PostDesignation = typeof postDesignations.$inferSelect`, add:

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

- [ ] **Step 2: Generate the migration and read every line of it**

`drizzle-kit generate` compares the schema with `drizzle/meta/0023_snapshot.json`; it does not connect to any database.

Run: `npm run db:generate`
Expected: one new `drizzle/0024_<generated name>.sql`, a new `drizzle/meta/0024_snapshot.json`, and one new entry in `drizzle/meta/_journal.json`. If it asks any interactive question (Drizzle asks when it suspects a rename), **STOP**: answer nothing, cancel, and bring it to me. A new table alone never prompts.

Run: `cat drizzle/0024_*.sql`
Expected, and nothing else:

```sql
CREATE TABLE "chart_annotation_hides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"chart" text NOT NULL,
	"day" date NOT NULL,
	"hidden" boolean NOT NULL,
	"set_by" text NOT NULL,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chart_annotation_hides_client_callout_key" UNIQUE("client_id","channel","chart","day")
);
--> statement-breakpoint
ALTER TABLE "chart_annotation_hides" ADD CONSTRAINT "chart_annotation_hides_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chart_annotation_hides_client_idx" ON "chart_annotation_hides" USING btree ("client_id");
```

Run: `grep -v chart_annotation_hides drizzle/0024_*.sql | grep -iE "create|alter|drop|insert|update|delete"`
Expected: no output. **STOP** if there is any: the generator picked up another difference. Delete the three generated changes (`git checkout drizzle/meta/_journal.json && rm drizzle/0024_*.sql drizzle/meta/0024_snapshot.json`) and bring it to me.

- [ ] **Step 3: Write the failing tests for who may hide, the validator and applying hides**

Create `lib/organic-social/annotation-hides/permissions.test.ts`:

```ts
import { expect, test } from 'vitest'
import { canHideAnnotation } from './permissions'

test('internal staff may hide an annotation', () => {
  expect(canHideAnnotation('INTERNAL_ADMIN')).toBe(true)
  expect(canHideAnnotation('INTERNAL_ANALYST')).toBe(true)
})

test('client roles may not', () => {
  expect(canHideAnnotation('CLIENT_ADMIN')).toBe(false)
  expect(canHideAnnotation('CLIENT_VIEWER')).toBe(false)
})
```

Create `lib/organic-social/annotation-hides/mutations.test.ts`:

```ts
import { expect, test } from 'vitest'
import { authorizeAnnotationHide } from './mutations'

const OK = { channel: 'INSTAGRAM', chart: 'followers', day: '2026-08-10', hidden: true }

test('accepts a real platform, chart and day', () => {
  expect(authorizeAnnotationHide(OK)).toEqual({ ok: true })
  expect(authorizeAnnotationHide({ ...OK, chart: 'engagements', hidden: false })).toEqual({ ok: true })
})

test('rejects an unknown platform', () => {
  expect(authorizeAnnotationHide({ ...OK, channel: 'MYSPACE' })).toEqual({ ok: false, error: 'invalid channel' })
})

test('rejects an unknown chart', () => {
  expect(authorizeAnnotationHide({ ...OK, chart: 'reach' })).toEqual({ ok: false, error: 'invalid chart' })
})

test('rejects a day that is not yyyy-mm-dd', () => {
  expect(authorizeAnnotationHide({ ...OK, day: '8/10/2026' })).toEqual({ ok: false, error: 'invalid day' })
})

test('rejects a day that does not exist', () => {
  expect(authorizeAnnotationHide({ ...OK, day: '2026-02-30' })).toEqual({ ok: false, error: 'invalid day' })
})

test('rejects a hidden flag that is not true or false', () => {
  expect(authorizeAnnotationHide({ ...OK, hidden: 'yes' })).toEqual({ ok: false, error: 'invalid hidden' })
})
```

Create `lib/organic-social/annotation-hides/apply.test.ts`:

```ts
import { expect, test } from 'vitest'
import { applyHides, hideKey } from './apply'
import type { Annotation } from '../annotations'

const A = (date: string, value: number): Annotation => ({ date, value, label: `${date} | ${value}`, post: null })
const ITEMS = [A('2026-08-05', 30), A('2026-08-10', 50), A('2026-08-20', 40)]
const HIDDEN = new Set([hideKey('engagements', '2026-08-10')])

test('a client never receives a hidden annotation, and the next day down does not take its place', () => {
  expect(applyHides(ITEMS, HIDDEN, 'engagements', 'client').map((a) => a.date)).toEqual(['2026-08-05', '2026-08-20'])
})

test('staff receive every annotation, the hidden one marked', () => {
  expect(applyHides(ITEMS, HIDDEN, 'engagements', 'staff').map((a) => [a.date, a.hidden])).toEqual([
    ['2026-08-05', false], ['2026-08-10', true], ['2026-08-20', false],
  ])
})

test("a hide on one chart does not hide the other chart's annotation for the same day", () => {
  expect(applyHides(ITEMS, HIDDEN, 'followers', 'client')).toHaveLength(3)
})

test('with nothing hidden, everyone sees every annotation', () => {
  expect(applyHides(ITEMS, new Set(), 'engagements', 'client').every((a) => a.hidden === false)).toBe(true)
})
```

Run: `npx vitest run lib/organic-social/annotation-hides`
Expected: FAIL, three files fail to resolve `./permissions`, `./mutations`, `./apply`.

- [ ] **Step 4: Implement who may hide, the validator, the write, the read and apply**

In `lib/organic-social/annotations.ts`, replace:

```ts
import type { TrendSeries } from './types'
import type { TopContentPost } from './content-types'
```

with:

```ts
import type { TrendSeries } from './types'
import type { TopContentPost } from './content-types'
import type { DashChannel } from './metrics'
```

and replace:

```ts
  /** The top post published that day, or null when nothing went live or the posts failed to load. */
  post: TopContentPost | null
}
```

with:

```ts
  /** The top post published that day, or null when nothing went live or the posts failed to load. */
  post: TopContentPost | null
  /** Set for staff only: the team hid this annotation from the client. Clients never receive one. */
  hidden?: boolean
}

/** What the hide control needs to address one chart's annotations. Present only for staff. */
export interface AnnotationControls {
  clientSlug: string
  channel: DashChannel
  chart: AnnotationChart
}
```

Create `lib/organic-social/annotation-hides/permissions.ts`:

```ts
import { isInternalStaff } from '@/lib/dashboard/permissions'

/** Any internal Avenue Z staff member may hide an annotation from the client: the same rule
 *  as the Organic/Influencer designation. If the answer narrows, change isInternalStaff. */
export function canHideAnnotation(role: string): boolean {
  return isInternalStaff(role)
}
```

Create `lib/organic-social/annotation-hides/mutations.ts`:

```ts
import { db } from '@/lib/db/client'
import { chartAnnotationHides } from '@/lib/db/schema'
import { CHANNELS, type DashChannel } from '../metrics'
import type { AnnotationChart } from '../annotations'

const CHARTS = new Set<string>(['followers', 'engagements'])

function isRealDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false
  const d = new Date(`${day}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day
}

/** Pure validation for the server-action payload. Kept out of the action file so it is
 *  unit-testable (a 'use server' module may only export async actions). */
export function authorizeAnnotationHide(input: {
  channel: string; chart: string; day: string; hidden: unknown
}): { ok: boolean; error?: string } {
  if (!(CHANNELS as readonly string[]).includes(input.channel)) return { ok: false, error: 'invalid channel' }
  if (!CHARTS.has(input.chart)) return { ok: false, error: 'invalid chart' }
  if (!isRealDay(input.day)) return { ok: false, error: 'invalid day' }
  if (typeof input.hidden !== 'boolean') return { ok: false, error: 'invalid hidden' }
  return { ok: true }
}

/** Upsert one annotation's hidden flag. Unhiding writes hidden=false rather than deleting,
 *  so who last touched it and when stays on record. */
export async function setAnnotationHidden(args: {
  clientId: string; channel: DashChannel; chart: AnnotationChart; day: string; hidden: boolean; setBy: string
}): Promise<void> {
  await db
    .insert(chartAnnotationHides)
    .values({ clientId: args.clientId, channel: args.channel, chart: args.chart, day: args.day, hidden: args.hidden, setBy: args.setBy })
    .onConflictDoUpdate({
      target: [chartAnnotationHides.clientId, chartAnnotationHides.channel, chartAnnotationHides.chart, chartAnnotationHides.day],
      set: { hidden: args.hidden, setBy: args.setBy, setAt: new Date() },
    })
}
```

Create `lib/organic-social/annotation-hides/apply.ts`:

```ts
import type { Annotation, AnnotationChart } from '../annotations'

export const hideKey = (chart: AnnotationChart, day: string) => `${chart}|${day}`

/** Clients never receive a hidden annotation: it is dropped here, on the server, so it is
 *  not in the page at all. Staff receive every annotation, hidden ones marked so the row can
 *  fade them. No backfill: hiding a peak does not promote the next day down. */
export function applyHides(
  items: Annotation[], hidden: Set<string>, chart: AnnotationChart, audience: 'client' | 'staff',
): Annotation[] {
  const marked = items.map((a) => ({ ...a, hidden: hidden.has(hideKey(chart, a.date)) }))
  return audience === 'client' ? marked.filter((a) => !a.hidden) : marked
}
```

Create `lib/organic-social/annotation-hides/select.ts`:

```ts
import { cache } from 'react'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { chartAnnotationHides } from '@/lib/db/schema'
import { hideKey } from './apply'
import type { AnnotationChart } from '../annotations'
import type { DashChannel } from '../metrics'

/** The annotations hidden from the client on one platform, as hideKey strings. React.cache
 *  for per-render dedup; freshness after a write comes from revalidateTag('db') in the
 *  server action. */
export const getAnnotationHides = cache(async (clientId: string, channel: DashChannel): Promise<Set<string>> => {
  const rows = await db
    .select({ chart: chartAnnotationHides.chart, day: chartAnnotationHides.day })
    .from(chartAnnotationHides)
    .where(and(
      eq(chartAnnotationHides.clientId, clientId),
      eq(chartAnnotationHides.channel, channel),
      eq(chartAnnotationHides.hidden, true),
    ))
  return new Set(rows.map((r) => hideKey(r.chart as AnnotationChart, String(r.day))))
})
```

Run: `npx vitest run lib/organic-social/annotation-hides`
Expected: PASS, 2 + 6 + 4.

- [ ] **Step 5: Write the failing server action tests**

Create `app/actions/organic-social.test.ts`:

```ts
import { beforeEach, expect, test, vi } from 'vitest'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug: vi.fn(async () => ({ id: 'client-uuid' })) }))
vi.mock('@/lib/organic-social/annotation-hides/mutations', async () => {
  const actual = await vi.importActual<typeof import('@/lib/organic-social/annotation-hides/mutations')>(
    '@/lib/organic-social/annotation-hides/mutations',
  )
  return { ...actual, setAnnotationHidden: vi.fn(async () => {}) }
})

import { auth } from '@/auth'
import { revalidateTag } from 'next/cache'
import { getClientBySlug } from '@/lib/db/queries'
import { setAnnotationHidden } from '@/lib/organic-social/annotation-hides/mutations'
import { setAnnotationHiddenAction } from './organic-social'

const INPUT = { clientSlug: 'a-client', channel: 'INSTAGRAM', chart: 'followers', day: '2026-08-10', hidden: true }
const session = (value: unknown) => (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(value)
const signedInAs = (role: string) => session({ user: { role, email: 'someone@avenuez.com' } })

beforeEach(() => vi.clearAllMocks())

test('a client role is refused, and nothing is written', async () => {
  signedInAs('CLIENT_ADMIN')
  expect(await setAnnotationHiddenAction(INPUT)).toEqual({ ok: false, error: 'forbidden' })
  expect(setAnnotationHidden).not.toHaveBeenCalled()
})

test('no session is refused', async () => {
  session(null)
  expect(await setAnnotationHiddenAction(INPUT)).toEqual({ ok: false, error: 'forbidden' })
  expect(setAnnotationHidden).not.toHaveBeenCalled()
})

test('malformed input is refused before any write', async () => {
  signedInAs('INTERNAL_ADMIN')
  expect(await setAnnotationHiddenAction({ ...INPUT, day: '2026-02-30' })).toEqual({ ok: false, error: 'invalid day' })
  expect(setAnnotationHidden).not.toHaveBeenCalled()
})

test('an unknown client is refused', async () => {
  signedInAs('INTERNAL_ADMIN')
  vi.mocked(getClientBySlug).mockResolvedValueOnce(undefined as never)
  expect(await setAnnotationHiddenAction(INPUT)).toEqual({ ok: false, error: 'client not found' })
  expect(setAnnotationHidden).not.toHaveBeenCalled()
})

test('internal staff hide an annotation: one write, then the page data refreshes', async () => {
  signedInAs('INTERNAL_ANALYST')
  expect(await setAnnotationHiddenAction(INPUT)).toEqual({ ok: true })
  expect(setAnnotationHidden).toHaveBeenCalledWith({
    clientId: 'client-uuid', channel: 'INSTAGRAM', chart: 'followers', day: '2026-08-10', hidden: true, setBy: 'someone@avenuez.com',
  })
  expect(revalidateTag).toHaveBeenCalledWith('db', 'max')
})
```

Run: `npx vitest run app/actions/organic-social.test.ts`
Expected: FAIL, `setAnnotationHiddenAction is not a function` in all five.

- [ ] **Step 6: Add the server action**

In `app/actions/organic-social.ts`, replace:

```ts
import { authorizeDesignation, setDesignation } from '@/lib/organic-social/designations/mutations'
import type { SourceType } from '@/lib/organic-social/types'
```

with:

```ts
import { authorizeDesignation, setDesignation } from '@/lib/organic-social/designations/mutations'
import type { SourceType } from '@/lib/organic-social/types'
import { canHideAnnotation } from '@/lib/organic-social/annotation-hides/permissions'
import { authorizeAnnotationHide, setAnnotationHidden } from '@/lib/organic-social/annotation-hides/mutations'
import type { DashChannel } from '@/lib/organic-social/metrics'
import type { AnnotationChart } from '@/lib/organic-social/annotations'
```

Append to the end of the file:

```ts

/** Hide or unhide one annotation on a v2 graph from the client. Internal staff only: the
 *  control is invisible to CLIENT_* AND this action re-checks the role, because a hidden
 *  control is not an authorization boundary. */
export async function setAnnotationHiddenAction(input: {
  clientSlug: string; channel: string; chart: string; day: string; hidden: boolean
}): Promise<Result> {
  const session = await auth()
  const role = session?.user?.role
  const email = session?.user?.email
  if (!role || !canHideAnnotation(role)) return { ok: false, error: 'forbidden' }

  const valid = authorizeAnnotationHide(input)
  if (!valid.ok) return { ok: false, error: valid.error! }

  const client = await getClientBySlug(input.clientSlug)
  if (!client) return { ok: false, error: 'client not found' }

  await setAnnotationHidden({
    clientId: client.id, channel: input.channel as DashChannel, chart: input.chart as AnnotationChart,
    day: input.day, hidden: input.hidden, setBy: email ?? 'unknown',
  })
  revalidateTag('db', 'max')
  return { ok: true }
}
```

Run: `npx vitest run app/actions/organic-social.test.ts`
Expected: PASS, 5.

- [ ] **Step 7: Write the failing tests for what clients and staff receive**

At the top of `components/report-sections/organic-social/parts/annotations-wiring.test.tsx`, replace:

```tsx
const { fetchTopContentFrozen } = vi.hoisted(() => ({ fetchTopContentFrozen: vi.fn() }))
vi.mock('@/lib/organic-social/frozen', () => ({ fetchTopContentFrozen }))
```

with:

```tsx
const { fetchTopContentFrozen } = vi.hoisted(() => ({ fetchTopContentFrozen: vi.fn() }))
vi.mock('@/lib/organic-social/frozen', () => ({ fetchTopContentFrozen }))
// Nothing is hidden unless a test says so. The client lookup never reaches a database.
const { getAnnotationHides } = vi.hoisted(() => ({ getAnnotationHides: vi.fn(async () => new Set<string>()) }))
vi.mock('@/lib/organic-social/annotation-hides/select', () => ({ getAnnotationHides }))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug: vi.fn(async () => ({ id: 'client-uuid' })) }))
vi.mock('@/app/actions/organic-social', () => ({ setAnnotationHiddenAction: vi.fn(async () => ({ ok: true })) }))
```

Append to the end of the same file:

```tsx
const controlsOf = (el: unknown) => (el as ReactElement<{ annotationControls?: unknown }>).props.annotationControls
const STAFF = { ...AUG, role: 'INTERNAL_ADMIN' }

test('a client never receives an annotation the team hid', async () => {
  vi.mocked(getFollowerGraph).mockResolvedValueOnce(ig({ '2026-08-10': 28, '2026-08-20': 19 }))
  fetchTopContentFrozen.mockResolvedValueOnce([])
  getAnnotationHides.mockResolvedValueOnce(new Set(['followers|2026-08-10']))
  const el = await FollowerSectionV2(AUG)
  expect(summary(el)).toEqual([['8/20 | +19 Followers', null]])
  expect(controlsOf(el)).toBeUndefined()
})

test('the team receives every annotation, the hidden one marked, with the controls', async () => {
  vi.mocked(getEngagementTrend).mockResolvedValueOnce(ig({ '2026-08-10': 65, '2026-08-11': 38 }))
  fetchTopContentFrozen.mockResolvedValueOnce([])
  getAnnotationHides.mockResolvedValueOnce(new Set(['engagements|2026-08-10']))
  const el = await TrendSectionV2(STAFF)
  expect(annotationsOf(el)?.map((a) => [a.date, a.hidden])).toEqual([['2026-08-10', true], ['2026-08-11', false]])
  expect(controlsOf(el)).toEqual({ clientSlug: 'fixture-client', channel: 'INSTAGRAM', chart: 'engagements' })
})

test('if the hides cannot be read, a client gets no annotations at all', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(getFollowerGraph).mockResolvedValueOnce(ig({ '2026-08-10': 28 }))
  fetchTopContentFrozen.mockResolvedValueOnce([])
  getAnnotationHides.mockRejectedValueOnce(new Error('relation "chart_annotation_hides" does not exist'))
  const el = await FollowerSectionV2(AUG)
  expect(annotationsOf(el)).toEqual([])
  expect(log).toHaveBeenCalled()
  log.mockRestore()
})

test('if the hides cannot be read, the team gets every annotation but no controls', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(getFollowerGraph).mockResolvedValueOnce(ig({ '2026-08-10': 28 }))
  fetchTopContentFrozen.mockResolvedValueOnce([])
  getAnnotationHides.mockRejectedValueOnce(new Error('timeout'))
  const el = await FollowerSectionV2(STAFF)
  expect(summary(el)).toEqual([['8/10 | +28 Followers', null]])
  expect(controlsOf(el)).toBeUndefined()
  log.mockRestore()
})

test('a chart with nothing to annotate never reads the hides', async () => {
  vi.mocked(getFollowerGraph).mockResolvedValueOnce(ig({ '2026-08-10': 0 }))
  fetchTopContentFrozen.mockResolvedValueOnce([])
  await FollowerSectionV2(AUG)
  expect(getAnnotationHides).not.toHaveBeenCalled()
})
```

Run: `npx vitest run components/report-sections/organic-social/parts/annotations-wiring.test.tsx`
Expected: FAIL, 3 of 15: `a client never receives an annotation the team hid`, `the team receives every annotation, the hidden one marked, with the controls`, and `if the hides cannot be read, a client gets no annotations at all`. Two new tests pass already, because nothing reads the hides yet: `if the hides cannot be read, the team gets every annotation but no controls` and `a chart with nothing to annotate never reads the hides`. They pin behaviour Step 8 must keep, and Step 11 re-runs them against the real code. The 10 Task 4 tests pass.

- [ ] **Step 8: Apply the hides in the v2 parts**

Create `components/report-sections/organic-social/parts/annotation-hides.ts`:

```ts
import { getClientBySlug } from '@/lib/db/queries'
import { getAnnotationHides } from '@/lib/organic-social/annotation-hides/select'
import { applyHides } from '@/lib/organic-social/annotation-hides/apply'
import { canHideAnnotation } from '@/lib/organic-social/annotation-hides/permissions'
import type { Annotation, AnnotationChart, AnnotationControls } from '@/lib/organic-social/annotations'
import type { DashChannel } from '@/lib/organic-social/metrics'

/** Applies the team's hides to one chart's annotations. Clients get hidden annotations
 *  removed here, on the server; staff get them marked, plus the controls to change them.
 *  If the hides cannot be read (a transient error, or an environment without the
 *  migration), clients get none, so one the team hid is never shown by accident, and staff
 *  get all of them without controls. Logged either way. Skips the read when there is
 *  nothing to hide. */
export async function withHides(args: {
  clientSlug: string; channel: DashChannel; chart: AnnotationChart; role: string; items: Annotation[]
}): Promise<{ items: Annotation[]; controls?: AnnotationControls }> {
  if (args.items.length === 0) return { items: [] }
  const staff = canHideAnnotation(args.role)
  try {
    const client = await getClientBySlug(args.clientSlug)
    const hidden = client ? await getAnnotationHides(client.id, args.channel) : new Set<string>()
    return {
      items: applyHides(args.items, hidden, args.chart, staff ? 'staff' : 'client'),
      controls: staff ? { clientSlug: args.clientSlug, channel: args.channel, chart: args.chart } : undefined,
    }
  } catch (e) {
    console.error(
      `[organic-social] annotation hides unreadable for ${args.clientSlug} ${args.channel} ${args.chart}; ` +
        `${staff ? 'showing staff every annotation without controls' : 'showing the client none'}:`,
      (e as Error).message,
    )
    return { items: staff ? args.items : [] }
  }
}
```

In `components/report-sections/organic-social/parts/follower-graph.tsx`, replace:

```tsx
import { pickPeaks, buildAnnotations, ANNOTATION_LIMIT } from '@/lib/organic-social/annotations'
```

with:

```tsx
import { pickPeaks, buildAnnotations, ANNOTATION_LIMIT } from '@/lib/organic-social/annotations'
import { withHides } from './annotation-hides'
```

and replace:

```tsx
export async function FollowerSectionV2({ clientSlug, dateRange, channel }: OrganicSocialCtx) {
```

with:

```tsx
export async function FollowerSectionV2({ clientSlug, dateRange, channel, role }: OrganicSocialCtx) {
```

and replace:

```tsx
  const annotations = buildAnnotations(peaks, posts.data ?? null, 'followers')
  // Jasmine's outline names this chart, word for word.
  return <FollowerGraph series={graph.data} annotations={annotations} title={`${CHANNEL_LABEL[channel]} Follower Growth Graph`} />
```

with:

```tsx
  const built = buildAnnotations(peaks, posts.data ?? null, 'followers')
  const { items, controls } = await withHides({ clientSlug, channel, chart: 'followers', role, items: built })
  // Jasmine's outline names this chart, word for word.
  return (
    <FollowerGraph
      series={graph.data}
      annotations={items}
      annotationControls={controls}
      title={`${CHANNEL_LABEL[channel]} Follower Growth Graph`}
    />
  )
```

In `components/report-sections/organic-social/parts/engagement-trend.tsx`, replace:

```tsx
import { pickPeaks, buildAnnotations, ANNOTATION_LIMIT } from '@/lib/organic-social/annotations'
```

with:

```tsx
import { pickPeaks, buildAnnotations, ANNOTATION_LIMIT } from '@/lib/organic-social/annotations'
import { withHides } from './annotation-hides'
```

and replace:

```tsx
export async function TrendSectionV2({ clientSlug, dateRange, channel }: OrganicSocialCtx) {
```

with:

```tsx
export async function TrendSectionV2({ clientSlug, dateRange, channel, role }: OrganicSocialCtx) {
```

and replace:

```tsx
  const annotations = buildAnnotations(peaks, posts.data ?? null, 'engagements')
  // Jasmine's outline names this chart, word for word.
  return <EngagementTrend series={trend.data} annotations={annotations} title={`${CHANNEL_LABEL[channel]} Engagement Graph`} />
```

with:

```tsx
  const built = buildAnnotations(peaks, posts.data ?? null, 'engagements')
  const { items, controls } = await withHides({ clientSlug, channel, chart: 'engagements', role, items: built })
  // Jasmine's outline names this chart, word for word.
  return (
    <EngagementTrend
      series={trend.data}
      annotations={items}
      annotationControls={controls}
      title={`${CHANNEL_LABEL[channel]} Engagement Graph`}
    />
  )
```

- [ ] **Step 9: Write the failing UI tests**

In `components/report-sections/organic-social/annotation-callouts.test.tsx`, replace:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
```

with:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
```

and replace:

```tsx
vi.mock('@/components/charts/line-chart', () => ({ LineChart: vi.fn(() => null) }))

import { LineChart } from '@/components/charts/line-chart'
```

with:

```tsx
vi.mock('@/components/charts/line-chart', () => ({ LineChart: vi.fn(() => null) }))
vi.mock('@/app/actions/organic-social', () => ({ setAnnotationHiddenAction: vi.fn(async () => ({ ok: true })) }))

import { LineChart } from '@/components/charts/line-chart'
import { setAnnotationHiddenAction } from '@/app/actions/organic-social'
```

Append to the end of the same file:

```tsx
const CONTROLS = { clientSlug: 'a-client', channel: 'INSTAGRAM' as const, chart: 'engagements' as const }

test('without controls there is no hide button', () => {
  render(<AnnotationCallouts items={[A()]} />)
  expect(screen.queryByRole('button', { name: 'Hide from client' })).toBeNull()
})

test('staff can hide an annotation: one call, and it fades at once', async () => {
  render(<AnnotationCallouts items={[A({ hidden: false })]} controls={CONTROLS} />)
  fireEvent.click(screen.getByRole('button', { name: 'Hide from client' }))
  expect(screen.getByText('Hidden from client')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Unhide' })).toBeTruthy()
  await waitFor(() => expect(setAnnotationHiddenAction).toHaveBeenCalledWith({ ...CONTROLS, day: '2026-08-10', hidden: true }))
})

test('a hidden annotation shows faded, marked, with Unhide', () => {
  const { container } = render(<AnnotationCallouts items={[A({ hidden: true })]} controls={CONTROLS} />)
  expect(container.querySelector('li')?.className).toContain('opacity-40')
  expect(screen.getByText('Hidden from client')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Unhide' })).toBeTruthy()
})

test('a failed hide puts the annotation back, whether refused or errored', async () => {
  vi.mocked(setAnnotationHiddenAction).mockResolvedValueOnce({ ok: false, error: 'forbidden' })
  render(<AnnotationCallouts items={[A({ hidden: false })]} controls={CONTROLS} />)
  fireEvent.click(screen.getByRole('button', { name: 'Hide from client' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Hide from client' })).toBeTruthy())
  vi.mocked(setAnnotationHiddenAction).mockRejectedValueOnce(new Error('network'))
  fireEvent.click(screen.getByRole('button', { name: 'Hide from client' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Hide from client' })).toBeTruthy())
  expect(screen.queryByText('Hidden from client')).toBeNull()
})

test('a hidden annotation gets no dot, so the team sees the chart the client sees', () => {
  const items = [A({ hidden: true }), A({ date: '2026-08-11', label: '8/11 | 38 Engagements', hidden: false })]
  render(<ChannelTrendChart title="Instagram Engagement Graph" series={SERIES} annotations={items} annotationControls={CONTROLS} />)
  expect(lastMarks()).toEqual([{ x: '2026-08-11', label: '8/11 | 38 Engagements' }])
})
```

Run: `npx vitest run components/report-sections/organic-social/annotation-callouts.test.tsx`
Expected: FAIL, 4 of 24. `without controls there is no hide button` passes already; the other four fail on the missing buttons and on the hidden annotation's dot still being passed. TypeScript does not run in vitest, so the unknown `controls` and `annotationControls` props do not error here.

- [ ] **Step 10: Add the controls to the row and the chart**

In `components/report-sections/organic-social/annotation-callouts.tsx`, replace:

```tsx
import { useState } from 'react'
import type { Annotation } from '@/lib/organic-social/annotations'
import type { Creative } from '@/lib/organic-social/content-types'
```

with:

```tsx
import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { setAnnotationHiddenAction } from '@/app/actions/organic-social'
import type { Annotation, AnnotationControls } from '@/lib/organic-social/annotations'
import type { Creative } from '@/lib/organic-social/content-types'
```

and replace:

```tsx
/** The days that spiked, in date order, directly above the chart they explain. Not pinned
 *  to pixel positions over the line, which would break as the chart resizes on a phone. */
export function AnnotationCallouts({ items }: { items: Annotation[] }) {
  if (items.length === 0) return null
  return (
    <ul aria-label="Annotations" className="flex flex-wrap gap-3">
      {items.map((a) => (
        <li key={a.date} className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] p-2">
          <Thumb annotation={a} />
          <span className="text-xs font-bold text-white">{a.label}</span>
        </li>
      ))}
    </ul>
  )
}
```

with:

```tsx
/** One annotation. With controls (staff only; the parent gets them from the server and the
 *  action re-checks the role) it carries a hide or unhide button. Optimistic: it fades or
 *  un-fades at once and goes back if the action refuses or fails. Freshness after success
 *  comes from the action's revalidateTag('db'). */
function AnnotationItem({ annotation, controls }: { annotation: Annotation; controls?: AnnotationControls }) {
  const [hidden, setHidden] = useState(!!annotation.hidden)
  const [pending, startTransition] = useTransition()

  function toggle() {
    if (!controls) return
    const next = !hidden
    setHidden(next) // optimistic
    startTransition(async () => {
      let ok = false
      try {
        ok = (await setAnnotationHiddenAction({ ...controls, day: annotation.date, hidden: next })).ok
      } catch {
        ok = false
      }
      if (!ok) setHidden(!next) // put it back
    })
  }

  return (
    <li className={cn('flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] p-2', hidden && 'opacity-40')}>
      <Thumb annotation={annotation} />
      <span className="text-xs font-bold text-white">{annotation.label}</span>
      {hidden && <span className="text-[11px] text-text-muted">Hidden from client</span>}
      {controls && (
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          className="whitespace-nowrap rounded-full border border-white/[0.12] px-2 py-0.5 text-[11px] font-bold text-text-muted hover:text-white disabled:opacity-50"
        >
          {hidden ? 'Unhide' : 'Hide from client'}
        </button>
      )}
    </li>
  )
}

/** The days that spiked, in date order, directly above the chart they explain. Not pinned
 *  to pixel positions over the line, which would break as the chart resizes on a phone. */
export function AnnotationCallouts({ items, controls }: { items: Annotation[]; controls?: AnnotationControls }) {
  if (items.length === 0) return null
  return (
    <ul aria-label="Annotations" className="flex flex-wrap gap-3">
      {items.map((a) => <AnnotationItem key={a.date} annotation={a} controls={controls} />)}
    </ul>
  )
}
```

In `components/report-sections/organic-social/trends.tsx`, replace:

```tsx
import type { Annotation } from '@/lib/organic-social/annotations'
```

with:

```tsx
import type { Annotation, AnnotationControls } from '@/lib/organic-social/annotations'
```

replace:

```tsx
export function ChannelTrendChart({
  title, series, annotations,
}: { title: string; series: TrendSeries; annotations?: Annotation[] }) {
```

with:

```tsx
export function ChannelTrendChart({
  title, series, annotations, annotationControls,
}: { title: string; series: TrendSeries; annotations?: Annotation[]; annotationControls?: AnnotationControls }) {
```

replace:

```tsx
          {visible && <AnnotationCallouts items={visible} />}
```

with:

```tsx
          {visible && <AnnotationCallouts items={visible} controls={annotationControls} />}
```

replace:

```tsx
              marks={visible?.map((a) => ({ x: a.date, label: a.label }))}
```

with:

```tsx
              marks={visible?.filter((a) => !a.hidden).map((a) => ({ x: a.date, label: a.label }))}
```

and replace:

```tsx
export function EngagementTrend({
  series, annotations, title = 'Engagement Over Time',
}: { series: TrendSeries; annotations?: Annotation[]; title?: string }) {
  return <ChannelTrendChart title={title} series={series} annotations={annotations} />
}
```

with:

```tsx
export function EngagementTrend({
  series, annotations, annotationControls, title = 'Engagement Over Time',
}: { series: TrendSeries; annotations?: Annotation[]; annotationControls?: AnnotationControls; title?: string }) {
  return <ChannelTrendChart title={title} series={series} annotations={annotations} annotationControls={annotationControls} />
}
```

In `components/report-sections/organic-social/follower-graph.tsx`, replace:

```tsx
import type { Annotation } from '@/lib/organic-social/annotations'
```

with:

```tsx
import type { Annotation, AnnotationControls } from '@/lib/organic-social/annotations'
```

and replace:

```tsx
export function FollowerGraph({
  series, annotations, title = 'Followers',
}: { series: TrendSeries; annotations?: Annotation[]; title?: string }) {
  return <ChannelTrendChart series={series} title={title} annotations={annotations} />
}
```

with:

```tsx
export function FollowerGraph({
  series, annotations, annotationControls, title = 'Followers',
}: { series: TrendSeries; annotations?: Annotation[]; annotationControls?: AnnotationControls; title?: string }) {
  return <ChannelTrendChart series={series} title={title} annotations={annotations} annotationControls={annotationControls} />
}
```

- [ ] **Step 11: Run to verify it passes**

Run: `npx vitest run components/report-sections/organic-social/annotation-callouts.test.tsx components/report-sections/organic-social/parts/annotations-wiring.test.tsx components/report-sections/organic-social/v1-render.golden.test.tsx`
Expected: PASS, 24 + 15 + 7, no snapshot written or changed.

- [ ] **Step 12: Record the migration**

In `MIGRATIONS-PENDING.md`, append:

```markdown

## Add chart_annotation_hides (delivered on PR 252)

- Migration: `drizzle/0024_*.sql`. One new table, `chart_annotation_hides`, plus its
  foreign key to `clients` and an index. Additive: no existing table, column or row
  changes.
- Read only by the v2 Organic Social graphs (`follower-graph@2`, `engagement-trend@2`).
  Renaissance renders v1 and never reads it.
- Without it, the v2 graphs fail closed: clients see no annotations, staff see every
  annotation without hide controls, and the read failure is logged.
- Applied: staging (see the PR 252 description for the date). Dev and prod: NOT applied.
  Apply before PR 252 reaches those branches, and only with written go-ahead:
  dev with `drizzle-kit migrate` against dev's unpooled URL, prod through the manual
  "DB migrate" GitHub workflow.
```

- [ ] **Step 13: Gates and commit**

Run: `npx vitest run && npx tsc --noEmit && npm run check:rsc`
Expected: **1158** passed (1131 + 27), no snapshot written or updated, `tsc` silent, RSC check passed.

```bash
git add lib/db/schema.ts drizzle/0024_*.sql drizzle/meta/0024_snapshot.json drizzle/meta/_journal.json lib/organic-social/annotations.ts lib/organic-social/annotation-hides app/actions/organic-social.ts app/actions/organic-social.test.ts components/report-sections/organic-social/parts/annotation-hides.ts components/report-sections/organic-social/parts/follower-graph.tsx components/report-sections/organic-social/parts/engagement-trend.tsx components/report-sections/organic-social/parts/annotations-wiring.test.tsx components/report-sections/organic-social/annotation-callouts.tsx components/report-sections/organic-social/annotation-callouts.test.tsx components/report-sections/organic-social/trends.tsx components/report-sections/organic-social/follower-graph.tsx MIGRATIONS-PENDING.md
git commit -m "feat(organic-social): let the team hide one annotation from the client

Internal staff get a Hide from client button on each annotation. A hidden one
is removed on the server before a client's page is sent; the team still sees
it, faded, with Unhide, and no dot. A hide attaches to the day on one chart
(client, platform, chart, day), so it works with or without a post. Stored in
a new additive table, chart_annotation_hides, mirroring post_designations.

Edge cases in the code this touches:
- external failure: fix. If the hides cannot be read, clients get no
  annotations (never one the team hid) and staff get all of them without
  controls; a failed or refused write puts the annotation back. Tested.
- operator visibility: fix. A read failure logs the client, platform and
  chart. The action returns a named error for every refusal.
- bounds: decline. One indexed read per chart render, only when there is
  something to hide; at most 3 rows matter.
- input boundaries: fix. Platform, chart, day and the hidden flag are
  validated before any write; the client id is resolved on the server from
  the slug.
- state and concurrency: decline. Upsert on the unique key: two people
  toggling the same annotation settle on the last write.
- security: fix. The action re-checks the role; a hidden control is not an
  authorization boundary. Decline: staff could write a row for any client
  slug with a crafted call, including Renaissance's; such a row is inert for
  any client on v1, which never reads the table.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 14: Apply the migration to staging. STOP: ask me first**

This is the only database write in the plan. Wait for my explicit go. Then:

```bash
npm run db:migrate:staging
```
Expected: the script confirms the staging endpoint (`ep-restless-union-aqkw7ig0`) and applies `0024`. It refuses any other database by design.

Verify, read only, in staging:

```bash
cat > $SCRATCH/hides-table-check.ts <<'EOF'
// READ ONLY. Does chart_annotation_hides exist here, and is it empty?
import { neon } from '@neondatabase/serverless'
const sql = neon(process.env.DATABASE_URL!)
sql.transaction([
  sql`SELECT to_regclass('public.chart_annotation_hides') AS t`,
  sql`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name = 'chart_annotation_hides'`,
], { readOnly: true }).then(([a, b]) => console.log(`host=${new URL(process.env.DATABASE_URL!).host.split('.')[0]} table=${(a as any[])[0].t} present=${(b as any[])[0].n}`))
EOF
npx tsx --env-file=.env.staging $SCRATCH/hides-table-check.ts
```
Expected: `host=ep-restless-union-aqkw7ig0-pooler table=chart_annotation_hides present=1`.

---

### Task 6: Remove the superseded module, prove Renaissance is untouched, push

**Files:**
- Delete: `lib/organic-social/post-marks.ts`, `lib/organic-social/post-marks.test.ts`

- [ ] **Step 1: Confirm nothing imports it, then delete it**

```bash
grep -rn "post-marks\|PostMark\|toPostMarks" --include='*.ts' --include='*.tsx' app components lib | grep -v "^lib/organic-social/post-marks"
```
Expected: no output. (The globs are quoted; unquoted, zsh fails the glob and the check passes without checking anything.)

```bash
git rm lib/organic-social/post-marks.ts lib/organic-social/post-marks.test.ts
```

- [ ] **Step 2: Run every gate**

```bash
npx vitest run
```
Expected: all pass, **1152** (1158 minus the 6 post-marks tests), no snapshot written or changed. If the count differs, find out why before continuing.

```bash
npx tsc --noEmit
```
Expected: exit 0, no output.

```bash
npm run check:rsc
```
Expected: `RSC boundary check passed`.

```bash
git commit -m "chore(organic-social): remove post-marks, superseded by annotations

It marked every day a post went live. The graphs now annotate peaks, and the
top post of a day comes from topPostByDate. Nothing imports it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 3: Prove Renaissance is untouched**

No snapshot has changed since Task 0 pinned them:

```bash
T0=$(git log --format=%H -1 --grep="pin what Renaissance's charts draw")
git diff --stat "$T0" HEAD -- '*.snap'
```
Expected: no output.

The files Renaissance renders through are unchanged on this branch (three dots, so dev moving on does not show up here):

```bash
git diff --stat origin/dev...HEAD -- components/report-sections/organic-social/template.ts components/report-sections/organic-social/parts/top-content.tsx components/report-sections/organic-social/post-card.tsx
git diff --stat 922a090 HEAD -- components/charts/line-chart.tsx
```
Expected: no output from either.

The v1 blocks are byte-identical to `origin/dev`, whole functions, not just the lines that name them:

```bash
V1F='/^export async function FollowerSection(/,/^}/p;/^export const followerGraphV1/,/^}/p'
V1E='/^async function TrendSection(/,/^}/p;/^export const engagementTrendV1/,/^}/p'
F=components/report-sections/organic-social/parts/follower-graph.tsx
E=components/report-sections/organic-social/parts/engagement-trend.tsx
diff <(git show origin/dev:$F | sed -n "$V1F") <(sed -n "$V1F" $F) && echo "follower v1 identical"
diff <(git show origin/dev:$E | sed -n "$V1E") <(sed -n "$V1E" $E) && echo "engagement v1 identical"
```
Expected: `follower v1 identical` and `engagement v1 identical`, nothing else.

Renaissance's part pins, row, users and KPI surface, in all three databases:

```bash
~/.claude/renaissance-baseline/check-drift.sh
```
Expected: sections 1, 2 and 4 `OK` in prod, staging and dev, and `RESULT: no drift in Renaissance's row, users, KPI surface or part pins.` Section 3 lists the files this branch changes; that is advisory on a feature branch.

- [ ] **Step 4: Live check on real data, read only**

Create `$SCRATCH/annotations-live.ts`:

```ts
// READ ONLY. Dash: GET /reports/data only. DB: one SELECT in a READ ONLY transaction, staging
// host only, for brand ids, which are never printed. Runs the real pickPeaks and
// buildAnnotations over real August data, with the same requests the v2 parts send.
import { neon } from '@neondatabase/serverless'

const T = process.env.DASH_API_TOKEN, url = process.env.DATABASE_URL
if (!T || !url) { console.log('missing env'); process.exit(1) }
if (!new URL(url).host.startsWith('ep-restless-union')) { console.log('refusing: not staging'); process.exit(1) }

const MONTH = { start: '2026-08-01', end: '2026-08-31' } // exactly what isoRange gives v2
const ENG: Record<string, { graph: string; content: string; field: string }> = {
  INSTAGRAM: { graph: 'TOTAL_ENGAGEMENTS', content: 'TOTAL_ENGAGEMENTS', field: 'sum_total_engagements' },
  FACEBOOK: { graph: 'TOTAL_ENGAGEMENTS_POSTS_V2', content: 'TOTAL_ENGAGEMENTS', field: 'total_engagements_public' },
  LINKEDIN: { graph: 'ENGAGEMENTS_BY_POST', content: 'ENGAGEMENTS_BY_POST', field: 'engagements' },
}
async function get(q: Record<string, string>) {
  const res = await fetch(`https://dashboard.dashsocial.com/reports/data?${new URLSearchParams(q)}`, { method: 'GET', headers: { Authorization: `Bearer ${T}` } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<any>
}
async function series(bid: number, ch: string, metric: string) {
  const j = await get({ brand_ids: String(bid), channels: ch, metrics: metric, report_type: 'GRAPH', time_scale: 'DAILY', start_date: MONTH.start, end_date: MONTH.end })
  const daily: Record<string, number | null> = j?.data?.metrics?.[metric]?.ALL_CHANNELS ?? {}
  return { channels: [ch], points: Object.keys(daily).sort().map((date) => ({ date, [ch]: daily[date] ?? 0 })) }
}

async function main() {
  // The real functions, loaded from the repo (REPO is set on the command line).
  const { pickPeaks, buildAnnotations, ANNOTATION_LIMIT } = await import(`${process.env.REPO}/lib/organic-social/annotations.ts`)
  const sql = neon(url!)
  const [rows] = await sql.transaction([sql`SELECT slug, dash_social_config FROM clients WHERE slug IN ('a-place-for-mom','akara-living','joy-of-life') ORDER BY slug`], { readOnly: true })
  for (const r of rows as any[]) {
    const bid = Number(r.dash_social_config.brandId)
    for (const ch of (r.dash_social_config.channels as string[]).map((c) => c.toUpperCase()).filter((c) => c in ENG)) {
      const e = ENG[ch]
      const j = await get({ brand_ids: String(bid), channels: ch, metrics: e.content, report_type: 'CONTENT', start_date: MONTH.start, end_date: MONTH.end, limit: '500' })
      const posts = (j?.data?.content ?? []).map((p: any) => ({
        id: p.id, publishedAt: String(p.source_created_at ?? '').slice(0, 10), metrics: { engagements: Number(p?.[ch.toLowerCase()]?.[e.field] ?? 0) },
      })) // only the fields topPostByDate reads
      for (const [chart, metric] of [['followers', 'NET_NEW_FOLLOWERS'], ['engagements', e.graph]] as const) {
        const s = await series(bid, ch, metric)
        const days = s.points.map((p) => p.date)
        const outside = days.filter((d) => d < MONTH.start || d > MONTH.end)
        const peaks = pickPeaks(s, { limit: ANNOTATION_LIMIT[chart], from: MONTH.start, to: MONTH.end })
        const out = buildAnnotations(peaks, posts, chart)
        console.log(`${r.slug} ${ch} ${chart}: ${days.length} days, ${outside.length} outside August | ` +
          out.map((a) => `${a.label} [post ${a.post ? a.post.id : 'none'}]`).join(' ; '))
      }
    }
  }
}
main().catch((e) => { console.log('FAILED:', (e as Error).message); process.exit(1) })
```

Run from the repo root:

```bash
REPO=$(pwd) npx tsx --env-file=.env.local --env-file=.env.staging $SCRATCH/annotations-live.ts
```
Expected, for every channel of the three clients and both charts: `31 days, 0 outside August`; at most 2 follower and 3 engagement annotations, all positive, in date order; each `[post N]` is that day's highest-engagement post, or `none` on a day nothing went live. Check two annotations per client by hand against Dash's own UI. TikTok is not wired on this branch (PR 247); its data behaves the same (probed 2026-09-18). Nothing here goes into the repo or the PR, which is public.

- [ ] **Step 5: Push. STOP: show me the PR description first**

```bash
git push origin docs/chart-annotations
```

Draft the new PR 252 description in the scratchpad: what annotations are, how peaks are picked, the UTC month and why, hiding and who can, the migration's status (staging only), the Renaissance proof (Task 0 guards, unchanged snapshots and v1 blocks, part pins in all three databases), and the live check result in words, with no client figures. Show it to me before running `gh pr edit 252 --body-file <draft>`.

---

## Self-Review

**Spec coverage.**
- §1 daily gains and §2 the UTC month: Task 3 (arguments, tested on the actual request), Task 4 (v2 passes them).
- §3 which days: Task 1 (every rule tested), Task 4 (platform tabs only, Overview none), Task 5 (no backfill after hiding).
- §4 labels: Task 2, singular and no dashes included.
- §5 thumbnail: Task 2 (top post, ties, no post, failed fetch) and Task 4 (image, video poster, video without poster, missing creative, failed load, no link, unsafe link, empty caption).
- §6 placement and §7 titles and the button: Task 4.
- §8 hiding: Task 5 (who, what clients and staff receive, the day-on-a-chart key, storage, read failure, the migration on staging only, with a stop).
- §9 what freezes: nothing to build; the spec records it.
- §10 replacing earlier work: Task 4 rewires and fixes the engagement passthrough; Task 6 deletes `post-marks`.
- Renaissance: Task 0 (render snapshots and request tests, each proven to bite; the drift check reads part pins), Task 6 (snapshots, whole v1 blocks, shared files, drift check across three databases).
- Edge cases table: every row has a test in Tasks 1, 2, 4 or 5, except the influencer-spike and tagged-post rows, which are documented limits with hiding as the remedy.
- Deferred and Phase 2 items: no task, correct.

**Placeholder scan.** None. Every code step shows the code, every run step the command and the expected result. The one thing not known in advance is the migration's generated file name, and Step 2 pins its full content instead.

**Type consistency.** `Peak`, `Annotation` (with optional `hidden`), `AnnotationChart`, `AnnotationControls`, `ANNOTATION_LIMIT`, `pickPeaks`, `annotationLabel`, `topPostByDate`, `buildAnnotations`, `DayWindow`, `FollowerKey`, `canHideAnnotation`, `authorizeAnnotationHide`, `setAnnotationHidden`, `getAnnotationHides`, `hideKey`, `applyHides`, `withHides`, `setAnnotationHiddenAction` are spelled the same everywhere. `ChannelTrendChart`, `EngagementTrend` and `FollowerGraph` all take `annotations?: Annotation[]` and `annotationControls?: AnnotationControls`; `LineChart` is not edited.

**Green at every commit.** Test totals: 1063, then 1075, 1087, 1098, 1102, 1131, 1158, and 1152 once `post-marks` goes. `tsc` and the RSC check pass at each.
