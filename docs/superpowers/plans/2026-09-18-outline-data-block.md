# Outline Data Block Implementation Plan

> **For the executor:** run inline in this session with superpowers:executing-plans. No subagents. Steps use checkbox (`- [ ]`) syntax.

**Update 2026-09-21.** The `OUTLINE_PENDING_Q6` reasons and the Engagement Rate rows below are the plan
as of 2026-09-18. Jasmine answered on 2026-09-21: the reasons were rewritten from the evidence, and the
outline block's Engagement Rate follows her decks (`OUTLINE_KPI_OVERRIDES`). See the spec's update note.

**Goal:** The three new clients' platform tabs show the outline's Data rows with the outline's labels, and the engagement breakdown directly under the engagement graph, while Renaissance resolves to and renders exactly today's parts.

**Architecture:** A pure layout module says which tiles each tab shows. A cached fetcher makes one Dash request per tab for the shared tile metrics plus three extra rows. Three unpublished part versions render it (`platform-headlines@2`, `@3`, `engagement-breakdown@1`); a client opts in through its own `report_section_config['organic-social:platform']`.

**Tech Stack:** Next.js 16 App Router (RSC), React 19, TypeScript strict, Vitest 3 with @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-09-18-outline-data-block-design.md`

## Global Constraints

- Renaissance does not change: no edit to `PLATFORM_KPIS`, `lib/organic-social/headlines.ts`, `components/report-sections/organic-social/platform-headlines.tsx`, or the v1 parts. The only edits on its render path are `export` on `delta` in `headline-build.ts` and new entries in `parts/registry.ts`.
- Every existing test and snapshot passes unchanged. Never run `vitest -u`.
- No database write in this plan. The staging opt-in waits for this code to reach staging and for my go.
- No brand ids, no client figures in any committed file. Test values are made up.
- No em or en dash characters in anything added.
- Before every commit: `npx vitest run`, `npx tsc --noEmit`, `npm run check:rsc`. Baseline on this branch: **1061**.
- Commit messages end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Branch `feat/organic-social-no-overview` (PR 255).

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `lib/organic-social/outline-layout.ts` + `.test.ts` | Create | Rows per tab, extra tile specs, question 6 list |
| `lib/organic-social/headline-build.ts` | Modify, one word | `export` on `delta` |
| `lib/organic-social/outline-headlines.ts` + `.test.ts` | Create | Pure builder, row picker, cached one-request fetcher |
| `components/report-sections/organic-social/outline-tiles.tsx` | Create | Headless tile grid for the breakdown |
| `components/report-sections/organic-social/parts/outline-data.tsx` | Create | `platform-headlines@2` and `@3` |
| `components/report-sections/organic-social/parts/engagement-breakdown.tsx` | Create | `engagement-breakdown@1` |
| `components/report-sections/organic-social/parts/registry.ts` | Modify | Register the three |
| `components/report-sections/organic-social/parts/outline-parts.test.tsx` | Create | Part behaviour |
| `components/report-sections/organic-social/parts/outline-composition.test.tsx` | Create | Opt-in resolves and validates; Renaissance resolves to v1; unpublished guard |

---

### Task 1: The layout from the outlines

**Files:** Create `lib/organic-social/outline-layout.ts`, `lib/organic-social/outline-layout.test.ts`

**Interfaces:**
- Produces: `type OutlineRow = { key: string; label: string }`, `type OutlineVariant = 'standard' | 'profileClicks'`, `OUTLINE_EXTRA_KPIS: Partial<Record<string, KpiSpec[]>>`, `OUTLINE_DATA_ROWS: Record<OutlineVariant, Partial<Record<string, OutlineRow[]>>>`, `OUTLINE_BREAKDOWN_ROWS: Partial<Record<string, OutlineRow[]>>`, `OUTLINE_PENDING_Q6`, `outlineSpecsFor(channel: DashChannel): KpiSpec[]`.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from 'vitest'
import { CHANNELS, PLATFORM_KPIS, metricFor, type KpiSpec } from './metrics'
import {
  OUTLINE_DATA_ROWS, OUTLINE_BREAKDOWN_ROWS, OUTLINE_EXTRA_KPIS, OUTLINE_PENDING_Q6, outlineSpecsFor,
} from './outline-layout'

// Jasmine's three outlines, 2026-09-18. The labels are hers, word for word.
const labels = (rows?: { label: string }[]) => rows?.map((r) => r.label)
const DATA = ['Total Followers', 'Net New Followers', 'Views', 'Total Engagements', 'Engagement Rate']

test('the Data rows follow the outlines, in order, with their labels', () => {
  expect(labels(OUTLINE_DATA_ROWS.standard.INSTAGRAM)).toEqual([...DATA, 'Profile Views'])
  expect(labels(OUTLINE_DATA_ROWS.standard.FACEBOOK)).toEqual([...DATA, 'Video Views'])
  expect(labels(OUTLINE_DATA_ROWS.standard.LINKEDIN)).toEqual([...DATA, 'Profile Views', 'Video Views'])
  expect(labels(OUTLINE_DATA_ROWS.standard.TIKTOK)).toEqual([...DATA, 'Profile Views'])
})

test("Kenect's outline puts Profile Clicks where Video Views would be, on Instagram only", () => {
  expect(labels(OUTLINE_DATA_ROWS.profileClicks.INSTAGRAM)).toEqual([...DATA, 'Profile Views', 'Profile Clicks'])
  for (const ch of ['FACEBOOK', 'LINKEDIN', 'TIKTOK']) {
    expect(OUTLINE_DATA_ROWS.profileClicks[ch]).toEqual(OUTLINE_DATA_ROWS.standard[ch])
  }
})

test('the metrics directly under the engagement graph follow the outlines', () => {
  expect(labels(OUTLINE_BREAKDOWN_ROWS.INSTAGRAM)).toEqual(['Likes', 'Comments', 'Shares', 'Saves', 'Reposts'])
  expect(labels(OUTLINE_BREAKDOWN_ROWS.FACEBOOK)).toEqual(['Reactions', 'Comments', 'Shares', 'Post Clicks'])
  expect(labels(OUTLINE_BREAKDOWN_ROWS.LINKEDIN)).toEqual(['Reactions', 'Comments', 'Shares', 'Post Clicks'])
  expect(labels(OUTLINE_BREAKDOWN_ROWS.TIKTOK)).toEqual(['Likes', 'Comments', 'Shares', 'Completion Rate'])
})

test('no outline covers X, so it has no rows', () => {
  expect(OUTLINE_DATA_ROWS.standard.TWITTER).toBeUndefined()
  expect(OUTLINE_BREAKDOWN_ROWS.TWITTER).toBeUndefined()
})

test("the four rows in Jasmine's question 6 are listed and never render", () => {
  expect(OUTLINE_PENDING_Q6.map((p) => `${p.channel} ${p.label}`)).toEqual([
    'INSTAGRAM Video Views', 'FACEBOOK Profile Views', 'TIKTOK Video Views', 'TIKTOK Reposts',
  ])
  for (const p of OUTLINE_PENDING_Q6) {
    const rows = p.block === 'data'
      ? [...(OUTLINE_DATA_ROWS.standard[p.channel] ?? []), ...(OUTLINE_DATA_ROWS.profileClicks[p.channel] ?? [])]
      : OUTLINE_BREAKDOWN_ROWS[p.channel] ?? []
    expect(labels(rows)).not.toContain(p.label)
  }
})

test('every row resolves to a tile spec on every channel this build supports', () => {
  for (const ch of CHANNELS) {
    const keys = new Set(outlineSpecsFor(ch).map((s) => s.key))
    const rows = [
      ...(OUTLINE_DATA_ROWS.standard[ch] ?? []), ...(OUTLINE_DATA_ROWS.profileClicks[ch] ?? []),
      ...(OUTLINE_BREAKDOWN_ROWS[ch] ?? []),
    ]
    for (const r of rows) expect(keys.has(r.key), `${ch} ${r.key}`).toBe(true)
  }
})

test('the extra rows never reuse a shared tile key, so the shared tiles stay as they are', () => {
  for (const [ch, extras] of Object.entries(OUTLINE_EXTRA_KPIS)) {
    const shared = new Set(((PLATFORM_KPIS as Record<string, KpiSpec[]>)[ch] ?? []).map((k) => k.key))
    for (const e of extras ?? []) expect(shared.has(e.key), `${ch} ${e.key}`).toBe(false)
  }
})

test('the specs a tab requests are the shared tiles, then the probed extra names', () => {
  const names = (ch: 'INSTAGRAM' | 'FACEBOOK' | 'LINKEDIN') => outlineSpecsFor(ch).map(metricFor)
  expect(names('INSTAGRAM')).toEqual([...PLATFORM_KPIS.INSTAGRAM.map(metricFor), 'PROFILE_CLICKS'])
  expect(names('FACEBOOK')).toEqual([...PLATFORM_KPIS.FACEBOOK.map(metricFor), 'PAID_AND_ORGANIC_VIDEO_VIEWS'])
  expect(names('LINKEDIN')).toEqual([...PLATFORM_KPIS.LINKEDIN.map(metricFor), 'VIDEO_VIEWS_BY_POST'])
  expect(outlineSpecsFor('TWITTER')).toEqual(PLATFORM_KPIS.TWITTER)
})
```

- [ ] **Step 2: Run it.** `npx vitest run lib/organic-social/outline-layout.test.ts`. Expected: FAIL, cannot resolve `./outline-layout`.

- [ ] **Step 3: Implement**

```ts
// Jasmine's three outlines (2026-09-18), as data: which tiles form a platform tab's Data block
// and which sit directly under its engagement graph, with her labels. Read only by the opt-in
// parts platform-headlines@2/@3 and engagement-breakdown@1. The shared tiles (PLATFORM_KPIS),
// which Renaissance reads, are not touched. Keyed by channel name so the TikTok rows can sit
// here before TikTok joins CHANNELS; they switch on when it does.
import { PLATFORM_KPIS, type DashChannel, type KpiSpec } from './metrics'

export type OutlineRow = { key: string; label: string }
export type OutlineVariant = 'standard' | 'profileClicks'

/** Outline rows Dash has but the shared tiles do not. Probed 2026-09-18 in the tiles' own request
 *  shape (TOTAL_GROUPED_METRIC, aggregate_by=BRAND, require_posts, one channel). Each is the only
 *  name Dash accepts for the row, so it fills both basis columns. */
export const OUTLINE_EXTRA_KPIS: Partial<Record<string, KpiSpec[]>> = {
  INSTAGRAM: [{ key: 'profileClicks', label: 'Profile Clicks', format: 'number', metric: { allPosts: 'PROFILE_CLICKS', byPost: 'PROFILE_CLICKS' } }],
  FACEBOOK: [{ key: 'videoViews', label: 'Video Views', format: 'number', metric: { allPosts: 'PAID_AND_ORGANIC_VIDEO_VIEWS', byPost: 'PAID_AND_ORGANIC_VIDEO_VIEWS' } }],
  LINKEDIN: [{ key: 'videoViews', label: 'Video Views', format: 'number', metric: { allPosts: 'VIDEO_VIEWS_BY_POST', byPost: 'VIDEO_VIEWS_BY_POST' } }],
}

const row = (key: string, label: string): OutlineRow => ({ key, label })
const DATA_HEAD = [
  row('followers', 'Total Followers'), row('netNewFollowers', 'Net New Followers'), row('exposure', 'Views'),
  row('engagements', 'Total Engagements'), row('engagementRate', 'Engagement Rate'),
]
const PROFILE_VIEWS = row('profileViews', 'Profile Views')
const VIDEO_VIEWS = row('videoViews', 'Video Views')

const STANDARD: Partial<Record<string, OutlineRow[]>> = {
  INSTAGRAM: [...DATA_HEAD, PROFILE_VIEWS], // Video Views: question 6
  FACEBOOK: [...DATA_HEAD, VIDEO_VIEWS], // Profile Views: question 6
  LINKEDIN: [...DATA_HEAD, PROFILE_VIEWS, VIDEO_VIEWS],
  TIKTOK: [...DATA_HEAD, PROFILE_VIEWS], // Video Views: question 6
}

export const OUTLINE_DATA_ROWS: Record<OutlineVariant, Partial<Record<string, OutlineRow[]>>> = {
  standard: STANDARD,
  // Kenect Nashville's outline: Profile Clicks instead of Video Views. It covers Instagram only,
  // so any other channel the client has keeps the standard rows.
  profileClicks: { ...STANDARD, INSTAGRAM: [...DATA_HEAD, PROFILE_VIEWS, row('profileClicks', 'Profile Clicks')] },
}

const COMMENTS = row('comments', 'Comments')
const SHARES = row('shares', 'Shares')
const PAGE_BREAKDOWN = [row('reactions', 'Reactions'), COMMENTS, SHARES, row('postClicks', 'Post Clicks')]

export const OUTLINE_BREAKDOWN_ROWS: Partial<Record<string, OutlineRow[]>> = {
  INSTAGRAM: [row('likes', 'Likes'), COMMENTS, SHARES, row('saves', 'Saves'), row('reposts', 'Reposts')],
  FACEBOOK: PAGE_BREAKDOWN,
  LINKEDIN: PAGE_BREAKDOWN,
  TIKTOK: [row('likes', 'Likes'), COMMENTS, SHARES, row('completionRate', 'Completion Rate')], // Reposts: question 6
}

/** The outline rows that do not work as written. Jasmine's question 6, sent 2026-09-18. Not
 *  rendered until she answers; each answer is a one-line move into the rows above. */
export const OUTLINE_PENDING_Q6 = [
  { channel: 'INSTAGRAM', block: 'data', label: 'Video Views', why: 'always zero: Instagram folded video views into Views' },
  { channel: 'FACEBOOK', block: 'data', label: 'Profile Views', why: 'Dash counts post views, not profile visits' },
  { channel: 'TIKTOK', block: 'data', label: 'Video Views', why: 'the same number as Views' },
  { channel: 'TIKTOK', block: 'breakdown', label: 'Reposts', why: 'no longer reported by Dash' },
] as const

/** Every tile spec an outline tab requests: the shared tiles, then the extra rows. */
export function outlineSpecsFor(channel: DashChannel): KpiSpec[] {
  return [...PLATFORM_KPIS[channel], ...(OUTLINE_EXTRA_KPIS[channel] ?? [])]
}
```

- [ ] **Step 4: Run it.** Expected: 8 pass. Then the gates; expected 1069.
- [ ] **Step 5: Commit** `feat(organic-social): the outline's rows per tab, as data` (no edge-case list: pure data, no boundary).

### Task 2: One request per tab, built by the tiles' rules

**Files:** Modify `lib/organic-social/headline-build.ts` (`function delta` becomes `export function delta`). Create `lib/organic-social/outline-headlines.ts`, `lib/organic-social/outline-headlines.test.ts`.

**Interfaces:**
- Consumes: `outlineSpecsFor`, `OutlineRow` (Task 1); `delta` (headline-build); `dashClientFor`, `isoRangeTz`, `resolveCompareIso` (base).
- Produces: `type OutlineKpis = { kpis: Record<string, HeadlineKpi>; noData: boolean }`, `buildOutlineKpis(channel: DashChannel, metrics: Record<string, TotalMetric>, specs: readonly KpiSpec[]): OutlineKpis`, `selectOutlineRows(channel: DashChannel, built: OutlineKpis, rows: readonly OutlineRow[]): PlatformHeadline`, `getOutlineKpis(slug: string, dateRange: string, compareRange: string | null, channel: DashChannel): Promise<OutlineKpis>`.

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, expect, test, vi } from 'vitest'

const { getReportsData } = vi.hoisted(() => ({ getReportsData: vi.fn() }))
vi.mock('./base', () => ({
  dashClientFor: vi.fn(async () => ({ client: { getReportsData }, brandId: 1, channels: ['INSTAGRAM', 'FACEBOOK', 'LINKEDIN'] })),
  isoRangeTz: () => ({ start: 'S', end: 'E' }),
  resolveCompareIso: () => ({ start: 'CS', end: 'CE' }),
}))

import { buildOutlineKpis, getOutlineKpis, selectOutlineRows } from './outline-headlines'
import { outlineSpecsFor, OUTLINE_DATA_ROWS } from './outline-layout'
import { PLATFORM_KPIS, metricFor } from './metrics'
import type { TotalMetric } from '@/lib/dash-social/types'

const m = (value: number | null, context: number | null = null): TotalMetric => ({ value, context, context_change: null })
// Every requested metric present with made-up values.
const allOf = (ch: 'INSTAGRAM' | 'FACEBOOK' | 'LINKEDIN', value: number | null = 10) =>
  Object.fromEntries(outlineSpecsFor(ch).map((s) => [metricFor(s), m(value)]))

beforeEach(() => getReportsData.mockReset())

test('one request per tab: shared tile metrics plus the extras, in the tiles request shape', async () => {
  getReportsData.mockResolvedValue({ data: { '1': { metrics: allOf('INSTAGRAM') } } })
  await getOutlineKpis('c', 'range-a', 'previous_period', 'INSTAGRAM')
  expect(getReportsData).toHaveBeenCalledTimes(1)
  const p = getReportsData.mock.calls[0][0]
  expect(p).toMatchObject({
    brandId: 1, channels: ['INSTAGRAM'], reportType: 'TOTAL_GROUPED_METRIC', aggregateBy: 'BRAND', requirePosts: true,
    startDate: 'S', endDate: 'E', contextStartDate: 'CS', contextEndDate: 'CE',
  })
  expect(p.metrics).toEqual([...PLATFORM_KPIS.INSTAGRAM.map(metricFor), 'PROFILE_CLICKS'])
})

test('a tab for a channel outside the client allowlist errors, as the tiles do', async () => {
  await expect(getOutlineKpis('c', 'range-b', 'previous_period', 'TWITTER')).rejects.toThrow(/allowlist/)
  expect(getReportsData).not.toHaveBeenCalled()
})

test('a 200 with no entry for the brand errors instead of showing zeros', async () => {
  getReportsData.mockResolvedValue({ data: {} })
  await expect(getOutlineKpis('c', 'range-c', 'previous_period', 'FACEBOOK')).rejects.toThrow(/no metrics/)
})

test('a requested metric missing from a 200 throws and names it', () => {
  const metrics = allOf('FACEBOOK')
  delete metrics.PAID_AND_ORGANIC_VIDEO_VIEWS
  expect(() => buildOutlineKpis('FACEBOOK', metrics, outlineSpecsFor('FACEBOOK'))).toThrow(/PAID_AND_ORGANIC_VIDEO_VIEWS/)
})

test('every metric null is no data, with zero values', () => {
  const b = buildOutlineKpis('LINKEDIN', allOf('LINKEDIN', null), outlineSpecsFor('LINKEDIN'))
  expect(b.noData).toBe(true)
  expect(b.kpis.videoViews.value).toBe(0)
})

test('percents scale by 100, deltas come from the context value, footnotes carry through', () => {
  const metrics = allOf('FACEBOOK')
  metrics.AVG_ENGAGEMENT_RATE_V2 = m(0.25)
  metrics.PAID_AND_ORGANIC_VIDEO_VIEWS = m(150, 100)
  metrics.REACTIONS = m(5, 0)
  const b = buildOutlineKpis('FACEBOOK', metrics, outlineSpecsFor('FACEBOOK'))
  expect(b.noData).toBe(false)
  expect(b.kpis.engagementRate.value).toBe(25)
  expect(b.kpis.videoViews.delta).toBe(50)
  expect(b.kpis.reactions.delta).toBeUndefined()
  expect(b.kpis.engagements.footnote).toMatch(/Influencer/)
})

test('selectOutlineRows picks the rows in outline order with the outline labels', () => {
  const b = buildOutlineKpis('INSTAGRAM', allOf('INSTAGRAM'), outlineSpecsFor('INSTAGRAM'))
  const h = selectOutlineRows('INSTAGRAM', b, OUTLINE_DATA_ROWS.standard.INSTAGRAM!)
  expect(h).toMatchObject({ channel: 'INSTAGRAM', label: 'Instagram', noData: false })
  expect(h.kpis.map((k) => [k.key, k.label])).toEqual([
    ['followers', 'Total Followers'], ['netNewFollowers', 'Net New Followers'], ['exposure', 'Views'],
    ['engagements', 'Total Engagements'], ['engagementRate', 'Engagement Rate'], ['profileViews', 'Profile Views'],
  ])
})

test('selectOutlineRows throws on a row with no tile', () => {
  const b = buildOutlineKpis('INSTAGRAM', allOf('INSTAGRAM'), outlineSpecsFor('INSTAGRAM'))
  expect(() => selectOutlineRows('INSTAGRAM', b, [{ key: 'nope', label: 'Nope' }])).toThrow(/nope/)
})
```

- [ ] **Step 2: Run it.** `npx vitest run lib/organic-social/outline-headlines.test.ts`. Expected: FAIL, cannot resolve `./outline-headlines`.

- [ ] **Step 3: Implement.** In `headline-build.ts` change `function delta(` to `export function delta(`. Create:

```ts
// The outline parts' data (platform-headlines@2/@3, engagement-breakdown@1). One Dash request per
// tab for the channel's shared tile metrics plus its outline extras, in the same request shape as
// getPlatformHeadlines, and built by the same rules as buildPlatformHeadline. Both parts call
// getOutlineKpis with the same arguments, so React's cache makes it one request per tab.
import { cache } from 'react'
import { dashClientFor, isoRangeTz, resolveCompareIso } from './base'
import { CHANNEL_LABEL, metricFor, resolveTargets, type DashChannel, type KpiSpec } from './metrics'
import { delta } from './headline-build'
import { outlineSpecsFor, type OutlineRow } from './outline-layout'
import type { TotalMetric } from '@/lib/dash-social/types'
import type { HeadlineKpi, PlatformHeadline } from './types'

export type OutlineKpis = { kpis: Record<string, HeadlineKpi>; noData: boolean }

/** Pure. A requested metric missing from a 200 is a malformed payload: throw rather than show a
 *  made-up zero. Every metric present but null is a window with no data. */
export function buildOutlineKpis(
  channel: DashChannel,
  metrics: Record<string, TotalMetric>,
  specs: readonly KpiSpec[],
): OutlineKpis {
  const named = specs.map((spec) => ({ spec, metric: metricFor(spec) }))
  const absent = named.filter(({ metric }) => !(metric in metrics)).map(({ metric }) => metric)
  if (absent.length) throw new Error(`${channel}: Dash omitted requested metric(s): ${absent.join(', ')}`)
  const noData = named.every(({ metric }) => metrics[metric]?.value == null)
  const kpis: Record<string, HeadlineKpi> = {}
  for (const { spec, metric } of named) {
    const m = metrics[metric]
    const raw = m?.value ?? 0
    kpis[spec.key] = {
      key: spec.key,
      label: spec.label,
      format: spec.format,
      value: spec.format === 'percent' ? raw * 100 : raw,
      delta: delta(m),
      footnote: spec.footnote, // outline tabs are always one channel, where footnotes show
    }
  }
  return { kpis, noData }
}

/** The rows, in order, under the outline's labels, as the tile component's PlatformHeadline. */
export function selectOutlineRows(channel: DashChannel, built: OutlineKpis, rows: readonly OutlineRow[]): PlatformHeadline {
  const kpis = rows.map((r) => {
    const k = built.kpis[r.key]
    if (!k) throw new Error(`${channel}: no tile for outline row '${r.key}'`)
    return { ...k, label: r.label }
  })
  return { channel, label: CHANNEL_LABEL[channel], kpis, noData: built.noData }
}

export const getOutlineKpis = cache(async (
  slug: string,
  dateRange: string,
  compareRange: string | null,
  channel: DashChannel,
): Promise<OutlineKpis> => {
  const { client, brandId, channels } = await dashClientFor(slug)
  resolveTargets(channels, channel) // a tab outside the client's allowlist throws, as the tiles do
  const specs = outlineSpecsFor(channel)
  const { start, end } = isoRangeTz(dateRange)
  const ctx = resolveCompareIso(dateRange, compareRange)
  const res = await client.getReportsData<TotalMetric>({
    brandId,
    channels: [channel],
    reportType: 'TOTAL_GROUPED_METRIC',
    aggregateBy: 'BRAND',
    requirePosts: true,
    metrics: specs.map(metricFor),
    startDate: start,
    endDate: end,
    contextStartDate: ctx?.start,
    contextEndDate: ctx?.end,
  })
  const metrics = res.data?.[String(brandId)]?.metrics
  if (!metrics) throw new Error(`${channel}: Dash returned no metrics for this brand`)
  return buildOutlineKpis(channel, metrics, specs)
})
```

- [ ] **Step 4: Run it.** Expected: 8 pass. Gates; expected 1077.
- [ ] **Step 5: Commit** `feat(organic-social): one Dash request per outline tab, built by the tiles' rules`, with the edge-case list from the spec in the body.

### Task 3: The parts

**Files:** Create `components/report-sections/organic-social/outline-tiles.tsx`, `parts/outline-data.tsx`, `parts/engagement-breakdown.tsx`, `parts/outline-parts.test.tsx`. Modify `parts/registry.ts`.

**Interfaces:**
- Consumes: `getOutlineKpis`, `selectOutlineRows` (Task 2); `OUTLINE_DATA_ROWS`, `OUTLINE_BREAKDOWN_ROWS`, `OutlineRow`, `OutlineVariant` (Task 1).
- Produces: `platformHeadlinesV2`, `platformHeadlinesV3`, `OutlineDataSection({ ctx, channel, rows })`, `engagementBreakdownV1`, `BreakdownSection({ ctx, channel, rows })`, `OutlineTiles({ kpis })`.

- [ ] **Step 1: Write the failing test**

```tsx
import { expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('@/lib/organic-social/headlines', () => import('./__mocks__/headlines'))
vi.mock('@/lib/organic-social/trends', () => import('./__mocks__/trends'))
vi.mock('@/lib/organic-social/top-content', () => import('./__mocks__/top-content'))
const { getOutlineKpis } = vi.hoisted(() => ({ getOutlineKpis: vi.fn() }))
vi.mock('@/lib/organic-social/outline-headlines', async () => ({
  ...(await vi.importActual<typeof import('@/lib/organic-social/outline-headlines')>('@/lib/organic-social/outline-headlines')),
  getOutlineKpis,
}))

import { ORGANIC_SOCIAL_PARTS } from './registry'
import { platformHeadlinesV1 } from './platform-headlines'
import { OutlineDataSection } from './outline-data'
import { BreakdownSection } from './engagement-breakdown'
import { buildOutlineKpis } from '@/lib/organic-social/outline-headlines'
import { outlineSpecsFor, OUTLINE_DATA_ROWS, OUTLINE_BREAKDOWN_ROWS } from '@/lib/organic-social/outline-layout'
import { metricFor } from '@/lib/organic-social/metrics'
import { DashTimeoutError } from '@/lib/dash-social/client'
import { FIXTURE_ORGANIC_SOCIAL_CTX } from './__fixtures__/organic-social-ctx'

const IG = { ...FIXTURE_ORGANIC_SOCIAL_CTX, channel: 'INSTAGRAM' as const }
const built = (value: number | null) => buildOutlineKpis('INSTAGRAM',
  Object.fromEntries(outlineSpecsFor('INSTAGRAM').map((s) => [metricFor(s), { value, context: null, context_change: null }])),
  outlineSpecsFor('INSTAGRAM'))
const text = async (node: Promise<React.ReactNode>) => render(<>{await node}</>).container

test('the registry adds three unpublished versions and leaves v1 as it was', () => {
  expect(Object.keys(ORGANIC_SOCIAL_PARTS['platform-headlines'])).toEqual(['1', '2', '3'])
  expect(ORGANIC_SOCIAL_PARTS['platform-headlines'][1]).toBe(platformHeadlinesV1)
  expect(ORGANIC_SOCIAL_PARTS['engagement-breakdown'][1].published).toBe(false)
  expect(ORGANIC_SOCIAL_PARTS['platform-headlines'][2].published).toBe(false)
  expect(ORGANIC_SOCIAL_PARTS['platform-headlines'][3].published).toBe(false)
})

test('the Data part shows the outline rows and none of the breakdown', async () => {
  getOutlineKpis.mockResolvedValueOnce(built(10))
  const c = await text(OutlineDataSection({ ctx: IG, channel: 'INSTAGRAM', rows: OUTLINE_DATA_ROWS.standard.INSTAGRAM! }))
  expect([...c.querySelectorAll('h3')].map((h) => h.textContent)).toEqual(['Instagram'])
  expect(c.textContent).toContain('Total Engagements')
  expect(c.textContent).toContain('Profile Views')
  for (const gone of ['Likes', 'Saves', 'Reposts', 'Video Views']) expect(c.textContent).not.toContain(gone)
})

test('the breakdown shows its rows in order with no heading', async () => {
  getOutlineKpis.mockResolvedValueOnce(built(10))
  const c = await text(BreakdownSection({ ctx: IG, channel: 'INSTAGRAM', rows: OUTLINE_BREAKDOWN_ROWS.INSTAGRAM! }))
  expect(c.querySelectorAll('h3')).toHaveLength(0)
  const t = c.textContent ?? ''
  const at = ['Likes', 'Comments', 'Shares', 'Saves', 'Reposts'].map((l) => t.indexOf(l))
  expect(at.every((i) => i >= 0)).toBe(true)
  expect([...at].sort((a, b) => a - b)).toEqual(at)
})

test('with no data the breakdown renders nothing; the Data block above says so once', async () => {
  getOutlineKpis.mockResolvedValueOnce(built(null))
  const c = await text(BreakdownSection({ ctx: IG, channel: 'INSTAGRAM', rows: OUTLINE_BREAKDOWN_ROWS.INSTAGRAM! }))
  expect(c.innerHTML).toBe('')
})

test('a Dash failure shows the same fallback card as the v1 tiles', async () => {
  getOutlineKpis.mockRejectedValueOnce(new Error('boom'))
  const c = await text(OutlineDataSection({ ctx: IG, channel: 'INSTAGRAM', rows: OUTLINE_DATA_ROWS.standard.INSTAGRAM! }))
  expect(c.textContent).toContain("Couldn't load this section.")
  getOutlineKpis.mockRejectedValueOnce(new DashTimeoutError('slow'))
  const d = await text(BreakdownSection({ ctx: IG, channel: 'INSTAGRAM', rows: OUTLINE_BREAKDOWN_ROWS.INSTAGRAM! }))
  expect(d.textContent).toContain('Taking longer than usual')
})

test('on Overview or an uncovered channel the Data part is v1, and the breakdown is nothing', () => {
  const v2 = ORGANIC_SOCIAL_PARTS['platform-headlines'][2]
  const brk = ORGANIC_SOCIAL_PARTS['engagement-breakdown'][1]
  const r = { id: 'platform-headlines', version: 2, label: 'x' }
  for (const ctx of [FIXTURE_ORGANIC_SOCIAL_CTX, { ...FIXTURE_ORGANIC_SOCIAL_CTX, channel: 'TWITTER' as const }]) {
    expect(v2.render(ctx, r)).toEqual(platformHeadlinesV1.render(ctx, r))
    expect(brk.render(ctx, { id: 'engagement-breakdown', version: 1, label: 'x' })).toBeNull()
  }
})

test('v3 is v2 with Profile Clicks on Instagram', async () => {
  getOutlineKpis.mockResolvedValueOnce(built(10))
  const c = await text(OutlineDataSection({ ctx: IG, channel: 'INSTAGRAM', rows: OUTLINE_DATA_ROWS.profileClicks.INSTAGRAM! }))
  expect(c.textContent).toContain('Profile Clicks')
})
```

Before running, check `DashTimeoutError`'s constructor in `lib/dash-social/client.ts` and match it.

- [ ] **Step 2: Run it.** `npx vitest run components/report-sections/organic-social/parts/outline-parts.test.tsx`. Expected: FAIL, cannot resolve `./outline-data`.

- [ ] **Step 3: Implement.** `outline-tiles.tsx`:

```tsx
import { KpiCard } from '@/components/charts/kpi-card'
import { num } from '@/lib/organic-social/base'
import { pctCompact } from '@/lib/organic-social/format'
import { expectsComparison } from '@/lib/organic-social/metrics'
import type { HeadlineKpi } from '@/lib/organic-social/types'
import { gridColsBase, gridColsMd } from './platform-headlines'

/** Tiles in a grid with no heading, for the metrics directly under the engagement graph. The
 *  cards are drawn exactly as the Data block draws them. */
export function OutlineTiles({ kpis }: { kpis: HeadlineKpi[] }) {
  const n = kpis.length
  return (
    <div className={`grid ${gridColsBase(n)} gap-3 ${gridColsMd(n)}`}>
      {kpis.map((k) => (
        <KpiCard
          key={k.key}
          title={k.label}
          value={k.format === 'percent' ? pctCompact(k.value) : num(k.value)}
          delta={k.delta}
          comparisonExpected={expectsComparison(k.key)}
          subValue={k.footnote}
        />
      ))}
    </div>
  )
}
```

`parts/outline-data.tsx`:

```tsx
import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import type { DashChannel } from '@/lib/organic-social/metrics'
import { getOutlineKpis, selectOutlineRows } from '@/lib/organic-social/outline-headlines'
import { OUTLINE_DATA_ROWS, type OutlineRow, type OutlineVariant } from '@/lib/organic-social/outline-layout'
import { PlatformHeadlines } from '../platform-headlines'
import { HeadlinesSkeleton } from '../skeletons'
import type { OrganicSocialCtx } from '../ctx'
import { platformHeadlinesV1 } from './platform-headlines'
import { safe, Fallback } from './shared'

export async function OutlineDataSection({ ctx, channel, rows }: { ctx: OrganicSocialCtx; channel: DashChannel; rows: readonly OutlineRow[] }) {
  const r = await safe(getOutlineKpis(ctx.clientSlug, ctx.dateRange, ctx.compareRange, channel).then((b) => selectOutlineRows(channel, b, rows)))
  return r.data ? <PlatformHeadlines headlines={[r.data]} /> : <Fallback kind={r.error!} />
}

/** The Data block as a client's outline defines it. On Overview, or a channel no outline covers,
 *  it is v1 unchanged. Unpublished: pinned per client, never promoted into the shared template. */
function outlineData(version: number, variant: OutlineVariant): PartImpl<OrganicSocialCtx> {
  return {
    id: 'platform-headlines',
    version,
    published: false,
    defaultLabel: 'Platform Headlines',
    render: (ctx, resolved) => {
      const rows = ctx.channel ? OUTLINE_DATA_ROWS[variant][ctx.channel] : undefined
      if (!ctx.channel || !rows) return platformHeadlinesV1.render(ctx, resolved)
      return (
        <Suspense fallback={<HeadlinesSkeleton />}>
          <OutlineDataSection ctx={ctx} channel={ctx.channel} rows={rows} />
        </Suspense>
      )
    },
  }
}

/** The outline's standard rows (A Place For Mom, Joy of Life). */
export const platformHeadlinesV2 = outlineData(2, 'standard')
/** The same with Profile Clicks in place of Video Views on Instagram (Kenect Nashville). */
export const platformHeadlinesV3 = outlineData(3, 'profileClicks')
```

`parts/engagement-breakdown.tsx`:

```tsx
import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import type { DashChannel } from '@/lib/organic-social/metrics'
import { getOutlineKpis, selectOutlineRows } from '@/lib/organic-social/outline-headlines'
import { OUTLINE_BREAKDOWN_ROWS, type OutlineRow } from '@/lib/organic-social/outline-layout'
import { OutlineTiles } from '../outline-tiles'
import type { OrganicSocialCtx } from '../ctx'
import { safe, Fallback } from './shared'

export async function BreakdownSection({ ctx, channel, rows }: { ctx: OrganicSocialCtx; channel: DashChannel; rows: readonly OutlineRow[] }) {
  const r = await safe(getOutlineKpis(ctx.clientSlug, ctx.dateRange, ctx.compareRange, channel).then((b) => selectOutlineRows(channel, b, rows)))
  if (!r.data) return <Fallback kind={r.error!} />
  // No data: the Data block above already says so, once.
  return r.data.noData ? null : <OutlineTiles kpis={r.data.kpis} />
}

function BreakdownSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {[0, 1, 2, 3, 4].map((c) => (
        <div key={c} className="h-[76px] animate-pulse rounded-lg border border-white/[0.06] bg-bg-surface" />
      ))}
    </div>
  )
}

/** The engagement metrics the outlines put directly under the engagement graph. Pinned per client
 *  after engagement-trend; unpublished. Renders nothing on Overview or an uncovered channel. */
export const engagementBreakdownV1: PartImpl<OrganicSocialCtx> = {
  id: 'engagement-breakdown',
  version: 1,
  published: false,
  defaultLabel: 'Engagement Breakdown',
  render: (ctx) => {
    const rows = ctx.channel ? OUTLINE_BREAKDOWN_ROWS[ctx.channel] : undefined
    if (!ctx.channel || !rows) return null
    return (
      <Suspense fallback={<BreakdownSkeleton />}>
        <BreakdownSection ctx={ctx} channel={ctx.channel} rows={rows} />
      </Suspense>
    )
  },
}
```

`parts/registry.ts`: import the three and set
`'platform-headlines': { 1: platformHeadlinesV1, 2: platformHeadlinesV2, 3: platformHeadlinesV3 }` and add `'engagement-breakdown': { 1: engagementBreakdownV1 }` after `'engagement-trend'`.

- [ ] **Step 4: Run it.** Expected: 7 pass. Gates; expected 1084. Every existing snapshot unchanged.
- [ ] **Step 5: Commit** `feat(organic-social): the outline's Data block and the breakdown under the engagement graph, as opt-in parts`.

### Task 4: The opt-in, and Renaissance's composition

**Files:** Create `components/report-sections/organic-social/parts/outline-composition.test.tsx`. No production code: this pins what Tasks 1 to 3 made possible.

- [ ] **Step 1: Write the test**

```tsx
import { expect, test, vi } from 'vitest'

vi.mock('@/lib/organic-social/headlines', () => import('./__mocks__/headlines'))
vi.mock('@/lib/organic-social/trends', () => import('./__mocks__/trends'))
vi.mock('@/lib/organic-social/top-content', () => import('./__mocks__/top-content'))

import { resolveSection } from '@/lib/report-sections/resolve'
import { REGISTRIES } from '@/lib/report-sections/registries'
import { promotionViolations, validateSectionOverride } from '@/lib/report-sections/mutations'
import { ORGANIC_SOCIAL_PLATFORM_TEMPLATE } from '../template'

const KEY = 'organic-social:platform'
const optIn = (v: 2 | 3) => ({
  versions: { 'platform-headlines': v },
  extraParts: [{ id: 'engagement-breakdown', version: 1 }],
  order: ['platform-headlines', 'follower-graph', 'engagement-trend', 'engagement-breakdown', 'top-content'],
})
const pins = (o?: object) => resolveSection(ORGANIC_SOCIAL_PLATFORM_TEMPLATE, o).map((p) => `${p.id}@${p.version}`)

test("Renaissance's config (Commentary only, no platform entry) resolves to exactly today's parts", () => {
  const renaissanceShaped = { 'organic-social': { sharedParts: [{ id: 'commentary', version: 1 }] } } as Record<string, object>
  expect(pins(renaissanceShaped[KEY])).toEqual(['platform-headlines@1', 'follower-graph@1', 'engagement-trend@1', 'top-content@2'])
})

test('the opt-in resolves to the outline order, the breakdown directly after the engagement graph', () => {
  expect(pins(optIn(2))).toEqual(['platform-headlines@2', 'follower-graph@1', 'engagement-trend@1', 'engagement-breakdown@1', 'top-content@2'])
  expect(pins(optIn(3))[0]).toBe('platform-headlines@3')
})

test("the opt-in passes the app's own validator with the real registries", () => {
  const ids = ORGANIC_SOCIAL_PLATFORM_TEMPLATE.order.map((p) => p.id)
  for (const v of [2, 3] as const) {
    expect(() => validateSectionOverride(KEY, optIn(v), REGISTRIES, ids)).not.toThrow()
  }
})

test('the new parts can never be promoted into the shared template Renaissance reads', () => {
  const next = { ...ORGANIC_SOCIAL_PLATFORM_TEMPLATE, order: [
    { id: 'platform-headlines', version: 2 }, { id: 'platform-headlines', version: 3 }, { id: 'engagement-breakdown', version: 1 },
  ] }
  expect(promotionViolations(next, REGISTRIES[KEY])).toEqual([
    'referenced part platform-headlines@2 is not published',
    'referenced part platform-headlines@3 is not published',
    'referenced part engagement-breakdown@1 is not published',
  ])
})
```

- [ ] **Step 2: Watch it fail against the parent commit** to prove it tests something: `git stash` is not needed; instead temporarily set `published: true` on `engagementBreakdownV1`, run, see the promotion test fail, revert. Then run for real: 4 pass. Gates; expected 1088.
- [ ] **Step 3: Commit** `test(organic-social): the outline opt-in resolves and validates; Renaissance still resolves to v1`.

### Task 5: Prove, push, update PR 255

- [ ] **Step 1:** `git diff origin/dev -- lib/organic-social/metrics.ts lib/organic-social/headlines.ts components/report-sections/organic-social/platform-headlines.tsx components/report-sections/organic-social/parts/platform-headlines.tsx components/report-sections/organic-social/parts/engagement-trend.tsx` is empty; `git diff origin/dev -- lib/organic-social/headline-build.ts` is the one `export`.
- [ ] **Step 2:** the drift check: surface, row and users, part pins identical in prod, staging and dev.
- [ ] **Step 3:** write the staging opt-in script privately (`~/.claude/organic-social-work/probes/outline-optin-staging.ts`, same guards as the Commentary script: staging host only, dry run by default, NULL-only on the `organic-social:platform` key, in-transaction checks on the three rows and Renaissance's hash). Dry run only. The write waits for this code on staging and my go.
- [ ] **Step 4:** push; retitle PR 255 to cover the three clients' layout; rewrite its description (what, the probe, the Renaissance proof, the opt-in and its undo, overlaps with 247 and 252). Verify it landed.

## Self-Review

- **Spec coverage:** layout module and question 6 (Task 1); extra rows, one request, builder rules, `delta` export (Task 2); three parts, unpublished, fallbacks, no-heading breakdown, registry (Task 3); opt-in shape, validator, Renaissance composition, promotion guard (Task 4); file-level proof, drift check, staging script held, PR (Task 5).
- **Placeholders:** none. The one lookup left to execution is `DashTimeoutError`'s constructor signature, named in Task 3.
- **Types:** `OutlineRow`, `OutlineVariant`, `OutlineKpis`, `getOutlineKpis(slug, dateRange, compareRange, channel)`, `selectOutlineRows(channel, built, rows)`, `OutlineDataSection({ ctx, channel, rows })`, `BreakdownSection({ ctx, channel, rows })` are used with the same names and shapes across tasks.
