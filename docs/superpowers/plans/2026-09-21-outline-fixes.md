# Outline Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. No subagents and no background commands (standing rule, 2026-09-21).

**Goal:** Close the last gaps between Jasmine's three outlines and the outline tabs: Instagram "Video Views" (Views on Reels), TikTok "Video Views", 5 top posts per platform row, the collab rule that matches the decks, and a views-based engagement rate on Instagram post cards. Every change is opt-in per client; Renaissance renders and stores exactly what it does today.

**Architecture:** Stacked on PR 255 (`feat/organic-social-no-overview`, head `94b1708`), which owns the outline layout and the outline Data part. The Data block gains one optional second Dash request (Reels views) and an alias row (TikTok). Top Content gains an unpublished `top-content@3` part, pinned per client like 255's outline parts, which wraps today's @2 flow with three client-scoped changes. It is pinned on the platform tabs' config key, `report_section_config['organic-social:platform']` (`components/report-sections/organic-social/index.tsx:51`), the same override object PR 255's opt-in writes. The shared @2 part, the shared tiles (`PLATFORM_KPIS`) and the snapshot code stay as they are.

**Tech Stack:** Next.js 16 App Router (RSC), React 19, TypeScript strict, Vitest 3 (jsdom).

## Sources (the premise; the reviewer checks the plan against these, not against this plan's summary)

- Jasmine's three outlines (2026-09-18): the Data rows per platform tab, including Instagram and TikTok "Video Views"; Kenect Nashville's Instagram has Profile Clicks in that place.
- Her 2026-09-21 answers: Engagement Rate follows the decks, views basis (D25). Missing data is shown blank and flagged.
- Decision register (private): D16 (5 posts per tab for the three clients; Renaissance keeps 15), D21 superseded by the Q6 docs sweep (Instagram Video Views = Views on Reels, `MULTI_METRIC_MEDIA_TYPE`, `reel` VIEWS), D25 (deck basis, outline scope only), the collab posts check (rule "author is not the client's own handle" matches APFM's August deck 9 of 9 with 0 extras; today's #ad rule gets 7 of 9).
- Handoff section 8 items 6, 7, 10, 11 and the item 12 follow-up (post cards still show Instagram's rate on the followers basis).
- Standing rules: Renaissance untouched (stored config AND rendered output), client agnostic (config, never a slug), zero conflicts with every open PR in any order, Dash GET only, no client identifiers in the repo.

## Evidence for every Dash claim (read-only probes, private folder `~/.claude/organic-social-work/probes/`)

| Claim | Probe output |
|---|---|
| Views on Reels comes from `report_type=MULTI_METRIC_MEDIA_TYPE`, `metrics=VIEWS`, at `data.reel.metrics.VIEWS.ALL_CHANNELS` | `q6-media-type-2026-09-21.out` |
| With `context_start_date`/`context_end_date` in the tiles' Eastern-midnight shape, that entry is `{ value, context, context_change }`, the `TotalMetric` shape `delta()` already reads | `reel-views-compare-2026-09-21.out` |
| The response also carries the brand key and other media types (`carousel`, `image`, `COLLABORATOR_<handle>`); a media type with no posts is absent | same |
| TikTok's Views tile is the post-based `TOTAL_VIDEO_VIEWS` (byPost basis) on PR 247; TikTok has no separate video views | `q6-four-rows-2026-09-21.out`, 247 `lib/organic-social/metrics.ts:184` |
| Instagram per-post `engagement_rate_views` equals `sum_total_engagements / views` exactly (24 of 24 posts carrying both; 9 posts carry neither) | `post-rate-views-basis-2026-09-21.out` |
| Instagram CONTENT posts on the OWNED feed carry the author at `instagram_user.handle` (or `.username`) and collaborators at `instagram.collaborators[].username`. UGC posts were not checked, and the repo's UGC fixture has no user fields | `collab-posts-authors-2026-09-21.out` (loops over the owned feed only) |
| Views on Reels accepts `require_posts=true` (the tiles send it) and returns the same value as without it on APFM August | `reel-views-require-posts-2026-09-21.out` |
| Instagram Video Views is in no August deck, so there is no deck number to reconcile it against | `deck-to-dash-mapping-2026-09-21.md:41` |

## Before (the pre-change snapshot of what this touches, at base `94b1708`)

- `lib/organic-social/outline-layout.ts:53` Instagram standard Data rows end at Profile Views; `:56` TikTok ends at Profile Views; `:81-84` `OUTLINE_PENDING_Q6` lists both Video Views rows as not built.
- `lib/organic-social/outline-headlines.ts:60-86` one `TOTAL_GROUPED_METRIC` request per tab; `:50-58` `selectOutlineRows` reads `built.kpis[r.key]`.
- `components/report-sections/organic-social/parts/outline-data.tsx:12-15` the Data section awaits only `getOutlineKpis`.
- `lib/organic-social/top-content.ts:131-186` `fetchTopContent(slug, dateRange, channel)` returns normalized posts with no author.
- `lib/organic-social/content-types.ts:15-27` `TopContentPost` has no author; `:121` Instagram card rate is the `engagement` field (followers basis).
- `lib/organic-social/designations/suggest.ts` #ad/#sponsored caption rule; `partition.ts` stored designation first.
- `components/report-sections/organic-social/parts/top-content.tsx:66-86` `top-content@2` (published) passes no `pageSize`, so `sortable-top-content.tsx:75` defaults to 15.
- `components/report-sections/organic-social/parts/registry.ts:21-24` `OUTLINE_PARTS` holds the unpublished outline parts.
- Pinned by tests today: `outline-layout.test.ts`, `outline-headlines.test.ts`, `parts/outline-parts.test.tsx`, `parts/top-content-v2.golden.test.tsx`, `lib/organic-social/fetch-top-content.test.ts`.

## Global Constraints

- Renaissance (and any client without the new pins or keys) renders and stores byte-for-byte what it does today. It never pins `top-content@3` or the outline Data parts, so neither path can reach it; Task 0's snapshots prove the shared paths are unchanged.
- Never edit: `lib/organic-social/metrics.ts` (`PLATFORM_KPIS`), `lib/organic-social/frozen.ts`, `lib/organic-social/snapshot.ts`, `lib/db/schema.ts`, `lib/constants.ts`, the `normalizePost`/`subObject`/`captionUrl` bodies and the field maps in `content-types.ts` (PR 247 edits those lines), `parts/top-content.tsx`'s @1/@2 definitions, `designations/suggest.ts`.
- In `parts/registry.ts` add only one import line directly after line 9 (`import { topContentV1, topContentV2 } from './top-content'`) and one entry inside `OUTLINE_PARTS`; PR 252 edits lines 7-8 and 13-14.
- In `lib/dash-social/types.ts` change only line 8 (the `reportType` union); PR 247 edits line 70.
- Config is read at runtime from `dash_social_config` as `unknown` (no schema edit): `ownHandles` = `{ instagram?: string }`. The owned posts per platform row are capped at the part pin's threshold, `report_section_config['organic-social:platform'].thresholds['top-content']`, default 5, whole numbers 1 to 50. Influencer Posts keep today's paging (15 per page).
- In `sortable-top-content.tsx` add only one optional prop, `ownedLimit`, threaded to the owned rows; absent means today's behaviour exactly. No open PR edits this file.
- New test files only for Top Content fetch tests: PR 247 appends to `lib/organic-social/fetch-top-content.test.ts` (a 3-way merge of an appended test conflicts), so that file is never edited here.
- Copy, exactly: row labels `Video Views`; failure flag `Could not load from Dash`.
- No client handles, figures or brand ids in the repo; tests use invented handles (`brand_handle`, `creator_one`).
- No em or en dashes in added lines. Tests first. Every commit ends with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Decisions made overnight (flagged for my yes; each follows the outline or the evidence)

1. **5 top posts per platform row, a cap by the active sort.** D16 and PR 250's doc say "5 posts per tab" (the decks show five). Influencer Posts are NOT capped: APFM's August deck has 9 collab posts, so they keep today's paging (15 per page). Flag for my yes: whether Influencer Posts should also be capped.
2. **Collab rule replaces the #ad suggestion for pinned clients**, only when the author and the client's own handle are both known; otherwise it falls back to today's #ad rule. A stored designation (a team member's manual choice) still wins, as today.
3. **Any Top Content window frozen before `top-content@3` is pinned has no authors** (snapshots are keyed by client, channel and window only, `frozen.ts:54`, and a frozen window never calls the live fetch, `frozen.ts:67`), so the author rule would fall back to #ad for it with no signal. So the rollout re-freezes the three clients' closed Instagram windows in the same go as the pin, right after it, and @3 logs a warning whenever it has an own handle but no Instagram post carries an author.
4. **Instagram only** for the author rule and the views-basis card rate: the evidence covers Instagram; Facebook's and LinkedIn's card rates already match their tile basis (D25), TikTok's is set by PR 247.

## File Structure

| File | Change |
|---|---|
| `lib/organic-social/outline-layout.ts` | `OutlineRow.from`; Instagram standard gains Video Views (a media row); TikTok gains Video Views (alias of Views); `OUTLINE_MEDIA_KPIS`; remove `OUTLINE_PENDING_Q6` |
| `lib/organic-social/outline-media.ts` (new) | `buildMediaKpis` (pure) and `getOutlineMediaKpis` (cached request) |
| `lib/organic-social/outline-headlines.ts` | `selectOutlineRows` reads `built.kpis[r.from ?? r.key]` and keeps `r.key` |
| `components/report-sections/organic-social/parts/outline-data.tsx` | fetch media kpis when the rows need them; a failed media request flags only its row |
| `lib/dash-social/types.ts` | `reportType` union gains `'MULTI_METRIC_MEDIA_TYPE'` |
| `lib/organic-social/content-types.ts` | `TopContentPost.author?: string` (optional; never set on today's path) |
| `lib/organic-social/post-author.ts` (new) | `authorOf(raw, channel)` |
| `lib/organic-social/top-content.ts` | `fetchTopContent(..., opts?: { withAuthor?: boolean })`; the OWNED `content.map(normalizePost)` line attaches the author only when asked; the UGC line is untouched |
| `lib/organic-social/outline-top-content.ts` (new) | `parseOwnHandles`, `partitionByAuthor`, `withViewsBasisRate`, `ownedPostLimit`, `missingAuthors` (pure) |
| `components/report-sections/organic-social/parts/top-content.tsx` | export `groupPostsByPlatform` and `loadDesignations` (no behaviour change) |
| `components/report-sections/organic-social/parts/top-content-outline.tsx` (new) | `top-content@3`, unpublished |
| `components/report-sections/organic-social/parts/registry.ts` | register `top-content@3` in `OUTLINE_PARTS` |
| `components/report-sections/organic-social/sortable-top-content.tsx` | optional `ownedLimit` prop (owned rows show the top N by the active sort, no pager) |

---

### Task 0: Pre-change snapshots

**Files:** Test: `lib/organic-social/outline-fixes-parity.test.ts`, `lib/organic-social/fetch-top-content-parity.test.ts` (both new)

- [ ] **Step 1: Write the characterisation tests** (pass on today's code; must never move, including after PR 247 merges)

`lib/organic-social/outline-fixes-parity.test.ts`:

```ts
import { expect, test } from 'vitest'
import { outlineSpecsFor, OUTLINE_DATA_ROWS, OUTLINE_BREAKDOWN_ROWS } from './outline-layout'
import { metricFor, PLATFORM_KPIS } from './metrics'

// Pre-change record for the outline fixes: what IG, FB and LI request in the outline Data block,
// the shared tiles of the channels that exist today (TikTok is added by PR 247, so it is left out
// on purpose to keep this record true in any merge order), Kenect's variant, FB, LI and the breakdown.
test('requests, shared tiles and rows that must not move', () => {
  const channels = ['INSTAGRAM', 'FACEBOOK', 'LINKEDIN'] as const
  expect({
    requests: Object.fromEntries(channels.map((c) => [c, outlineSpecsFor(c).map(metricFor)])),
    shared: Object.fromEntries((['INSTAGRAM', 'FACEBOOK', 'TWITTER', 'LINKEDIN'] as const).map((c) => [c, PLATFORM_KPIS[c]])),
    kenect: OUTLINE_DATA_ROWS.profileClicks.INSTAGRAM,
    facebook: OUTLINE_DATA_ROWS.standard.FACEBOOK,
    linkedin: OUTLINE_DATA_ROWS.standard.LINKEDIN,
    breakdown: OUTLINE_BREAKDOWN_ROWS,
  }).toMatchSnapshot()
})
```

`lib/organic-social/fetch-top-content-parity.test.ts`: copy the `./base` mock from `lib/organic-social/fetch-top-content.orchestration.test.ts:3-17` exactly. `getContent` answers: INSTAGRAM with two owned posts carrying `instagram_user: { handle: 'brand_handle' }` and `instagram_user: { handle: 'creator_one' }` (engagements 10 and 20, views 100 and 50); INSTAGRAM_UGC with the `content` of `__fixtures__/content-instagram-ugc.json`; FACEBOOK, LINKEDIN, TWITTER with one post each as in `contentRes`. Then:

```ts
test("today's fetchTopContent output (Overview and Instagram) is pinned, with no author key anywhere", async () => {
  const overview = await fetchTopContent('c', 'june', null)
  const instagram = await fetchTopContent('c', 'june', 'INSTAGRAM')
  for (const p of [...overview, ...instagram]) expect('author' in p).toBe(false)
  expect({ overview, instagram }).toMatchSnapshot()
})
```

- [ ] **Step 2: Run both twice; confirm PASS and stable snapshots.** Also run the existing pins: `npx vitest run lib/organic-social/outline-fixes-parity.test.ts lib/organic-social/fetch-top-content-parity.test.ts components/report-sections/organic-social/parts/top-content-v2.golden.test.tsx lib/organic-social/fetch-top-content.test.ts lib/organic-social/fetch-top-content.orchestration.test.ts` (all PASS).

- [ ] **Step 3: Commit** `test(organic-social): pre-change snapshots for the outline fixes`.

### Task 1: Outline rows (Instagram and TikTok Video Views)

**Files:** Modify `lib/organic-social/outline-layout.ts`, `lib/organic-social/outline-headlines.ts`; Test `outline-layout.test.ts`, `outline-headlines.test.ts`

**Interfaces produced:** `OutlineRow = { key; label; unavailable?: string; from?: string }`; `MediaKpiSpec = { key: string; label: string; mediaType: string; metric: string }`; `OUTLINE_MEDIA_KPIS: Partial<Record<string, MediaKpiSpec[]>>`; `mediaRowsFor(channel: string, rows: readonly OutlineRow[]): MediaKpiSpec[]`.

- [ ] **Step 1: Failing tests.** In `outline-layout.test.ts`: update `:13` (standard Instagram) and `:16` (TikTok), which assert the rows end at `'Profile Views'`, to end at `'Profile Views', 'Video Views'`; replace the `OUTLINE_PENDING_Q6` test (lines 38-58 today) and its import with:

```ts
test("question 6 is closed: Instagram Video Views is Views on Reels, TikTok's is its Views tile", () => {
  expect(labels(OUTLINE_DATA_ROWS.standard.INSTAGRAM)).toEqual([...DATA, 'Profile Views', 'Video Views'])
  expect(labels(OUTLINE_DATA_ROWS.standard.TIKTOK)).toEqual([...DATA, 'Profile Views', 'Video Views'])
  expect(OUTLINE_MEDIA_KPIS.INSTAGRAM).toEqual([{ key: 'videoViews', label: 'Video Views', mediaType: 'reel', metric: 'VIEWS' }])
  expect(OUTLINE_DATA_ROWS.standard.TIKTOK!.find((r) => r.key === 'videoViews')).toEqual({ key: 'videoViews', label: 'Video Views', from: 'exposure' })
  expect(mediaRowsFor('INSTAGRAM', OUTLINE_DATA_ROWS.standard.INSTAGRAM!).map((m) => m.key)).toEqual(['videoViews'])
  expect(mediaRowsFor('INSTAGRAM', OUTLINE_DATA_ROWS.profileClicks.INSTAGRAM!)).toEqual([])
})

(The tiles request staying the same is proven by Task 0's `requests` snapshot.)
```

Also update the test at line 83 ("every row resolves to a tile spec") so a row resolves when it is flagged, or its `from` or `key` is a tile spec key, or it is in `mediaRowsFor`. In `outline-headlines.test.ts` add:

```ts
test('an alias row reads the tile it names and keeps its own key and label', () => {
  const built = buildOutlineKpis('INSTAGRAM', { A: { value: 7, context: 5, context_change: null } } as never,
    [{ key: 'exposure', label: 'Views', format: 'number', metric: { allPosts: 'A', byPost: 'A' } }] as never)
  const h = selectOutlineRows('INSTAGRAM', built, [{ key: 'videoViews', label: 'Video Views', from: 'exposure' }])
  expect(h.kpis[0]).toMatchObject({ key: 'videoViews', label: 'Video Views', value: 7 })
})
```

- [ ] **Step 2: Run, see FAIL** (`OUTLINE_MEDIA_KPIS` / `mediaRowsFor` not exported; rows unchanged).

- [ ] **Step 3: Implement.** In `outline-layout.ts`: change the type to `export type OutlineRow = { key: string; label: string; unavailable?: string; from?: string }` (doc: "`from` reads another tile of the same tab"); set `INSTAGRAM: [...DATA_HEAD, PROFILE_VIEWS, VIDEO_VIEWS]` and `TIKTOK: [...DATA_HEAD, PROFILE_VIEWS, { key: 'videoViews', label: 'Video Views', from: 'exposure' }]` in `STANDARD` (the `profileClicks` variant is unchanged); delete `OUTLINE_PENDING_Q6` and its comment; add:

```ts
/** A Data row that comes from its own Dash request, not the tiles' one. Instagram "Video Views"
 *  is Views on Reels: Meta retired organic video views and Dash reports Reels views under
 *  MULTI_METRIC_MEDIA_TYPE (probed 2026-09-21, with a compare value in the tiles' shape). */
export type MediaKpiSpec = { key: string; label: string; mediaType: string; metric: string }
export const OUTLINE_MEDIA_KPIS: Partial<Record<string, MediaKpiSpec[]>> = {
  INSTAGRAM: [{ key: 'videoViews', label: 'Video Views', mediaType: 'reel', metric: 'VIEWS' }],
}
/** The media rows a tab's outline rows actually show (none for Kenect's Instagram). */
export function mediaRowsFor(channel: string, rows: readonly OutlineRow[]): MediaKpiSpec[] {
  const keys = new Set(rows.filter((r) => !r.unavailable).map((r) => r.key))
  return (OUTLINE_MEDIA_KPIS[channel] ?? []).filter((m) => keys.has(m.key))
}
```

In `outline-headlines.ts` `selectOutlineRows`: `const k = built.kpis[r.from ?? r.key]` and `return { ...k, key: r.key, label: r.label }`.

- [ ] **Step 4: Run PASS** for both files; Task 0 snapshot unchanged.
- [ ] **Step 5: Commit** `feat(organic-social): outline Video Views rows for Instagram and TikTok` (edge table: none identified beyond Task 2).

### Task 2: Views on Reels request

**Files:** Create `lib/organic-social/outline-media.ts`; modify `lib/dash-social/types.ts:8`; Test `lib/organic-social/outline-media.test.ts`

**Interfaces produced:** `buildMediaKpis(channel: DashChannel, data: Record<string, { metrics?: Record<string, { ALL_CHANNELS?: TotalMetric }> }> | undefined, brandId: number, specs: MediaKpiSpec[]): Record<string, HeadlineKpi>`; `getOutlineMediaKpis(slug, dateRange, compareRange, channel)` (React `cache`; all arguments are strings, so it dedupes within a request; the specs are `OUTLINE_MEDIA_KPIS[channel]`).

- [ ] **Step 1: Failing tests** (`outline-media.test.ts`):

```ts
import { expect, test, vi } from 'vitest'
import { buildMediaKpis } from './outline-media'

const SPEC = [{ key: 'videoViews', label: 'Video Views', mediaType: 'reel', metric: 'VIEWS' }]
const brand = { 42: { metrics: {} } }

test('reads Views on Reels with its change from the context value', () => {
  const k = buildMediaKpis('INSTAGRAM', { ...brand, reel: { metrics: { VIEWS: { ALL_CHANNELS: { value: 150, context: 100, context_change: 50 } } } } }, 42, SPEC)
  expect(k.videoViews).toMatchObject({ key: 'videoViews', label: 'Video Views', format: 'number', value: 150, delta: 50 })
})
test('no reels in the window is zero, with no arrow', () => {
  expect(buildMediaKpis('INSTAGRAM', brand, 42, SPEC).videoViews).toMatchObject({ value: 0, delta: undefined })
})
test('a 200 without the brand entry throws rather than showing zero', () => {
  expect(() => buildMediaKpis('INSTAGRAM', { reel: { metrics: {} } }, 42, SPEC)).toThrow('INSTAGRAM: Dash returned no media data for this brand')
})
```

Plus a request-shape test mocking `./base` (`dashClientFor` returning a client whose `getReportsData` is a `vi.fn`), asserting one call with `{ channels: ['INSTAGRAM'], reportType: 'MULTI_METRIC_MEDIA_TYPE', metrics: ['VIEWS'], startDate: '2026-08-01T04:00:00Z', endDate: '2026-08-31T04:00:00Z', contextStartDate: '2026-07-01T04:00:00Z', contextEndDate: '2026-07-31T04:00:00Z', requirePosts: true }` for `dateRange 'custom:2026-08-01,2026-08-31'`, `compareRange 'custom:2026-07-01,2026-07-31'`, and no `aggregateBy`.

- [ ] **Step 2: Run, see FAIL** (module missing).
- [ ] **Step 3: Implement.** `lib/dash-social/types.ts:8` becomes `reportType?: 'GRAPH' | 'TOTAL_METRIC' | 'TOTAL_GROUPED_METRIC' | 'CONTENT' | 'MULTI_METRIC_MEDIA_TYPE'`. `outline-media.ts`:

```ts
// The outline Data rows that need their own Dash request (Views on Reels today). One request per
// tab, only when the tab's rows show such a row; the tiles' request is unchanged.
import { cache } from 'react'
import { dashClientFor, isoRangeTz, resolveCompareIso } from './base'
import { resolveTargets, type DashChannel } from './metrics'
import { delta } from './headline-build'
import { OUTLINE_MEDIA_KPIS, type MediaKpiSpec } from './outline-layout'
import type { TotalMetric } from '@/lib/dash-social/types'
import type { HeadlineKpi } from './types'

type MediaData = Record<string, { metrics?: Record<string, { ALL_CHANNELS?: TotalMetric }> }> | undefined

/** Pure. A media type with no posts in the window is absent from Dash's answer: zero, no arrow.
 *  A 200 without the brand entry is a malformed answer: throw rather than show zero. */
export function buildMediaKpis(channel: DashChannel, data: MediaData, brandId: number, specs: MediaKpiSpec[]): Record<string, HeadlineKpi> {
  if (!data?.[String(brandId)]) throw new Error(`${channel}: Dash returned no media data for this brand`)
  const out: Record<string, HeadlineKpi> = {}
  for (const s of specs) {
    const m = data[s.mediaType]?.metrics?.[s.metric]?.ALL_CHANNELS
    out[s.key] = { key: s.key, label: s.label, format: 'number', value: m?.value ?? 0, delta: delta(m) }
  }
  return out
}

export const getOutlineMediaKpis = cache(async (
  slug: string, dateRange: string, compareRange: string | null, channel: DashChannel,
): Promise<Record<string, HeadlineKpi>> => {
  const specs = OUTLINE_MEDIA_KPIS[channel] ?? []
  const { client, brandId, channels } = await dashClientFor(slug)
  resolveTargets(channels, channel)
  const { start, end } = isoRangeTz(dateRange)
  const ctx = resolveCompareIso(dateRange, compareRange)
  const res = await client.getReportsData<{ ALL_CHANNELS?: TotalMetric }>({
    brandId, channels: [channel], reportType: 'MULTI_METRIC_MEDIA_TYPE', requirePosts: true, // as the tiles; same value (probed)
    metrics: [...new Set(specs.map((s) => s.metric))],
    startDate: start, endDate: end, contextStartDate: ctx?.start, contextEndDate: ctx?.end,
  })
  return buildMediaKpis(channel, res.data as MediaData, brandId, specs)
})
```

Check at build time that `HeadlineKpi` accepts `{ key, label, format, value, delta }` without `footnote` (it is optional today); adjust only the object literal if not.

- [ ] **Step 4: Run PASS**; `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** `feat(organic-social): Views on Reels request for the outline Data block` (edge table below).

| # | Category | What breaks | Where | Disposition |
|---|---|---|---|---|
| 1 | external failure | the Reels request fails, times out or 4xx/5xx | `outline-media.ts` request | fix: Task 3 flags only that row |
| 2 | input boundary | a 200 with no brand entry | `buildMediaKpis` | fix: throws; test |
| 3 | input boundary | no reels in the window (media type absent) | `buildMediaKpis` | fix: zero, no arrow; test. Known limit: a month with no reels after a month with some shows 0 with no arrow, not -100% (Dash omits the block, so its context value is gone too) |
| 4 | bounds | request count | one extra request per Instagram standard tab | accept: only when the row shows; string arguments, so React's cache dedupes it within a request |
| 5 | security | brand id or config in logs | none logged here | none identified |

### Task 3: The Data part shows the Reels row, isolated

**Files:** Modify `components/report-sections/organic-social/parts/outline-data.tsx`; Test `parts/outline-parts.test.tsx`

- [ ] **Step 1: Failing tests** in `outline-parts.test.tsx` (mock `@/lib/organic-social/outline-media` with `getOutlineMediaKpis: vi.fn()` beside the existing mocks):
  - the Instagram standard Data part now shows "Video Views" with the Reels value (update line 53's list: drop `'Video Views'` from the "gone" list for Instagram standard; keep it gone for the breakdown);
  - v3 (Kenect) never calls `getOutlineMediaKpis` and shows no Video Views;
  - when `getOutlineMediaKpis` rejects, the other tiles still render and Video Views is a blank tile with the flag `Could not load from Dash`, and `console.error` is called once with `[organic-social] Views on Reels failed slug=<slug> channel=INSTAGRAM kind=error` (`kind=timeout` for a timeout);
  - when the tiles request fails, the whole block shows today's fallback card (unchanged).
- [ ] **Step 2: Run, see FAIL.**
- [ ] **Step 3: Implement** `OutlineDataSection`:

```tsx
export async function OutlineDataSection({ ctx, channel, rows }: { ctx: OrganicSocialCtx; channel: DashChannel; rows: readonly OutlineRow[] }) {
  const media = mediaRowsFor(channel, rows)
  const [r, m] = await Promise.all([
    safe(getOutlineKpis(ctx.clientSlug, ctx.dateRange, ctx.compareRange, channel)),
    media.length ? safe(getOutlineMediaKpis(ctx.clientSlug, ctx.dateRange, ctx.compareRange, channel)) : Promise.resolve({ data: {} }),
  ])
  if (!r.data) return <Fallback kind={r.error!} />
  if (!m.data) console.error(`[organic-social] Views on Reels failed slug=${ctx.clientSlug} channel=${channel} kind=${m.error}`)
  const failed = new Set(m.data ? [] : media.map((x) => x.key))
  const shown = rows.map((row) => (failed.has(row.key) ? { ...row, unavailable: MEDIA_FAILED } : row))
  const built = { ...r.data, kpis: { ...r.data.kpis, ...(m.data ?? {}) } }
  return <OutlineHeadlines headline={selectOutlineRows(channel, built, shown)} />
}
```

with `const MEDIA_FAILED = 'Could not load from Dash'` exported from `outline-layout.ts` next to `NOT_IN_DASH`, and imports of `mediaRowsFor`, `getOutlineMediaKpis`. `selectOutlineRows` throwing (a missing tile) keeps today's behaviour: wrap it in the same `safe` pattern as today by computing inside a `try` that returns `<Fallback kind="error" />`.
- [ ] **Step 4: Run PASS** (whole `components/report-sections/organic-social`), tsc, `npm run -s check:rsc`.
- [ ] **Step 5: Commit** `feat(organic-social): outline Data block shows Views on Reels, a failure flags only its row`.

### Task 4: The post author, on request only

**Files:** Create `lib/organic-social/post-author.ts`; modify `lib/organic-social/content-types.ts` (the `TopContentPost` interface only, after `sourceType`), `lib/organic-social/top-content.ts` (signature and the owned `content.map` line only); Test `lib/organic-social/post-author.test.ts`, `lib/organic-social/fetch-top-content-author.test.ts` (new; never edit `fetch-top-content.test.ts`, PR 247 appends to it)

- [ ] **Step 1: Failing tests:** `authorOf` returns the lowercased handle without `@` from `instagram_user.handle`, else `.username`, else `null`; `null` for non-Instagram channels. In `fetch-top-content-author.test.ts` (the Task 0 mock setup): with `{ withAuthor: true }` each OWNED Instagram post has `author` from its raw record, and every UGC post (the real `__fixtures__/content-instagram-ugc.json`) has no `author`, so it keeps the #ad rule; without the option the output deep-equals Task 0's snapshot.
- [ ] **Step 2: Run, see FAIL.**
- [ ] **Step 3: Implement.** `post-author.ts`:

```ts
import type { DashContentPost } from '@/lib/dash-social/types'
import type { DashChannel } from './metrics'

/** The account that published a post, lowercased, without '@'. Instagram only: probed 2026-09-21 on
 *  CONTENT (`instagram_user.handle`, else `.username`). Read through a narrow cast so the shared
 *  DashContentPost type (edited by PR 247) is not touched. */
export function authorOf(raw: DashContentPost, channel: DashChannel): string | null {
  if (channel !== 'INSTAGRAM') return null
  const u = (raw as unknown as { instagram_user?: { handle?: unknown; username?: unknown } }).instagram_user
  const h = typeof u?.handle === 'string' ? u.handle : typeof u?.username === 'string' ? u.username : null
  return h ? h.replace(/^@/, '').toLowerCase() : null
}
```

`content-types.ts`: add `author?: string  // set only when the caller asks (outline Top Content); absent otherwise` as the last member of `TopContentPost`. `top-content.ts`: signature gains `opts: { withAuthor?: boolean } = {}`; add above `fetchTopContent`:

```ts
const withAuthorIf = (post: TopContentPost, raw: DashContentPost, ch: DashChannel, on: boolean | undefined): TopContentPost => {
  const a = on ? authorOf(raw, ch) : null
  return a ? { ...post, author: a } : post
}
```

and the owned line (`:156` today) becomes `content.map((p) => withAuthorIf(normalizePost(p, ch), p, ch, opts.withAuthor))`. The UGC line (`:181`) is not changed: UGC author fields are unproven. `toPayload` (unchanged) stores `author` only when present, so no existing caller's snapshot rows change.
- [ ] **Step 4: Run PASS** incl. Task 0 and `fetch-top-content.test.ts`, `parts/top-content-v2.golden.test.tsx`.
- [ ] **Step 5: Commit** `feat(organic-social): Top Content can carry the post author, only when asked`.

### Task 5: `top-content@3` (top 5 per platform row, collab by author, views-basis Instagram rate)

**Files:** Create `lib/organic-social/outline-top-content.ts`, `components/report-sections/organic-social/parts/top-content-outline.tsx`; modify `parts/top-content.tsx` (add `export` to `groupPostsByPlatform` and `loadDesignations` only), `parts/registry.ts`, `sortable-top-content.tsx` (`ownedLimit` only); Test `lib/organic-social/outline-top-content.test.ts`, `parts/top-content-outline.test.tsx`, `components/report-sections/organic-social/sortable-top-content.test.tsx` (new)

- [ ] **Step 1: Failing tests** (pure, `outline-top-content.test.ts`):

```ts
import { expect, test } from 'vitest'
import { missingAuthors, ownedPostLimit, parseOwnHandles, partitionByAuthor, withViewsBasisRate } from './outline-top-content'

const P = (id: number, over: Record<string, unknown> = {}) => ({ id, channel: 'INSTAGRAM', platform: 'Instagram', publishedAt: '2026-08-02',
  caption: '', url: null, mediaType: 'IMAGE', mediaGroup: null, creative: null, sourceType: 'organic',
  metrics: { effectiveness: null, engagementRate: 0.01, engagements: 3, impressions: 30 }, ...over }) as never

test('own handles are read from config as lowercase without @; anything else is none', () => {
  expect(parseOwnHandles({ brandId: 1, ownHandles: { instagram: '@Brand_Handle' } })).toEqual({ INSTAGRAM: 'brand_handle' })
  for (const c of [{ brandId: 1 }, null, { ownHandles: 'x' }, { ownHandles: { instagram: 5 } }]) expect(parseOwnHandles(c)).toEqual({})
})
test('author rule: another author is a collab post; the client itself is not; unknown falls back to #ad', () => {
  const own = { INSTAGRAM: 'brand_handle' }
  const posts = [P(1, { author: 'creator_one' }), P(2, { author: 'brand_handle' }), P(3, { caption: 'yay #ad' }), P(4)]
  const { owned, influencer } = partitionByAuthor(posts, new Map(), own)
  expect(influencer.map((p: { id: number }) => p.id)).toEqual([1, 3])
  expect(owned.map((p: { id: number }) => p.id)).toEqual([2, 4])
  expect(partitionByAuthor([P(1, { author: 'creator_one' })], new Map([[1, 'organic']]), own).owned.map((p: { id: number }) => p.id)).toEqual([1])
  expect(partitionByAuthor([P(1, { author: 'creator_one' })], new Map(), {}).owned.map((p: { id: number }) => p.id)).toEqual([1])
})
test('Instagram card rate is engagements over views; no views is no rate; other channels untouched', () => {
  const [ig, igNoViews, fb] = withViewsBasisRate([P(1), P(2, { metrics: { effectiveness: null, engagementRate: 0.5, engagements: 3, impressions: 0 } }), P(3, { channel: 'FACEBOOK' })])
  expect([ig.metrics.engagementRate, igNoViews.metrics.engagementRate, fb.metrics.engagementRate]).toEqual([0.1, null, 0.01])
})
test('owned posts per row: the pin threshold, default 5, whole numbers 1 to 50 only', () => {
  expect([ownedPostLimit(undefined), ownedPostLimit(6), ownedPostLimit(0), ownedPostLimit(51), ownedPostLimit(4.5)]).toEqual([5, 6, 5, 5, 5])
})
test('missing authors: an own handle is set, Instagram posts exist, none carries an author', () => {
  expect(missingAuthors([P(1)], { INSTAGRAM: 'brand_handle' })).toBe(true)
  expect(missingAuthors([P(1, { author: 'brand_handle' })], { INSTAGRAM: 'brand_handle' })).toBe(false)
  expect(missingAuthors([P(1)], {})).toBe(false)
  expect(missingAuthors([], { INSTAGRAM: 'brand_handle' })).toBe(false)
})
```

Part test (`top-content-outline.test.tsx`, mocks as in `top-content-v2.golden.test.tsx`): `top-content@3` is registered unpublished; it calls `fetchTopContentFrozen` with an injected `fetchLive` that asks `fetchTopContent` for authors; passes `ownedLimit` 5 (or the pin threshold) and no `pageSize` to `SortableTopContent`; an author post lands in the Influencer section; Instagram cards carry the views-basis rate; with an own handle set and frozen posts without authors it logs `[organic-social] top content has no post authors slug=<slug> channel=<channel>; collab rule fell back to #ad` once. A registry test: `top-content@1` and `@2` are the same objects as before (`toBe`). `sortable-top-content.test.tsx`: without `ownedLimit` the owned rows page at `pageSize` exactly as today (6 posts, pageSize 5: pager shown, page 1 has 5); with `ownedLimit` 5 the owned row shows the top 5 by the active sort and no pager, re-sorting changes which 5, and the influencer row still pages at 15.
- [ ] **Step 2: Run, see FAIL.**
- [ ] **Step 3: Implement** `outline-top-content.ts`:

```ts
// Outline Top Content rules (top-content@3), per client and opt-in. Pure.
import type { TopContentPost } from './content-types'
import type { SourceType } from './types'
import { resolveDesignation } from './designations/partition'

export type OwnHandles = Partial<Record<'INSTAGRAM', string>>

/** dash_social_config.ownHandles.instagram, validated at runtime (the jsonb is untrusted). */
export function parseOwnHandles(cfg: unknown): OwnHandles {
  const h = (cfg as { ownHandles?: { instagram?: unknown } } | null)?.ownHandles
  const ig = h && typeof h === 'object' ? (h as { instagram?: unknown }).instagram : undefined
  return typeof ig === 'string' && ig.trim() ? { INSTAGRAM: ig.trim().replace(/^@/, '').toLowerCase() } : {}
}

/** Stored designation first (a team member's choice), then the author rule when both the author and
 *  the client's own handle are known (matches the decks: a post authored by someone else is a collab
 *  post), otherwise today's #ad suggestion. */
export function partitionByAuthor(posts: TopContentPost[], stored: Map<number, SourceType>, own: OwnHandles) {
  const owned: TopContentPost[] = []
  const influencer: TopContentPost[] = []
  for (const post of posts) {
    const mine = own[post.channel as 'INSTAGRAM']
    const sourceType: SourceType = stored.get(post.id)
      ?? (post.author && mine ? (post.author !== mine ? 'influencer' : 'organic') : resolveDesignation(post, stored))
    ;(sourceType === 'influencer' ? influencer : owned).push({ ...post, sourceType })
  }
  return { owned, influencer }
}

/** Instagram cards on the deck basis (D25): engagements / views, which equals Dash's per-post
 *  engagement_rate_views (probed 2026-09-21, 24 of 24). Works on frozen posts too. */
export function withViewsBasisRate(posts: TopContentPost[]): TopContentPost[] {
  return posts.map((p) => p.channel !== 'INSTAGRAM' ? p
    : { ...p, metrics: { ...p.metrics, engagementRate: p.metrics.impressions > 0 ? p.metrics.engagements / p.metrics.impressions : null } })
}

/** Owned posts per platform row (D16: five per tab), from the part pin's threshold. */
export function ownedPostLimit(threshold: number | undefined): number {
  return typeof threshold === 'number' && Number.isInteger(threshold) && threshold >= 1 && threshold <= 50 ? threshold : 5
}

/** True when the author rule cannot run: an own handle is set, Instagram posts exist, and none has an
 *  author (a window frozen before top-content@3 was pinned). The caller logs it. */
export function missingAuthors(posts: TopContentPost[], own: OwnHandles): boolean {
  const ig = posts.filter((p) => p.channel === 'INSTAGRAM')
  return Boolean(own.INSTAGRAM) && ig.length > 0 && ig.every((p) => !p.author)
}
```

`top-content-outline.tsx`:

```tsx
import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import { fetchTopContentFrozen } from '@/lib/organic-social/frozen'
import { fetchTopContent } from '@/lib/organic-social/top-content'
import { canSetDesignation } from '@/lib/organic-social/designations/permissions'
import { getClientBySlug } from '@/lib/db/queries'
import { missingAuthors, ownedPostLimit, parseOwnHandles, partitionByAuthor, withViewsBasisRate } from '@/lib/organic-social/outline-top-content'
import { SortableTopContent } from '../sortable-top-content'
import { TopContentSkeleton } from '../skeletons'
import type { OrganicSocialCtx } from '../ctx'
import { safe, Fallback } from './shared'
import { groupPostsByPlatform, loadDesignations } from './top-content'

/** top-content@3: @2 plus the outline's rules (5 per page, collab by author, deck-basis Instagram
 *  rate). Unpublished: pinned per client. */
export async function TopContentOutlineSection({ ctx, ownedLimit }: { ctx: OrganicSocialCtx; ownedLimit: number }) {
  const { clientSlug, dateRange, channel, role } = ctx
  const r = await safe(fetchTopContentFrozen(clientSlug, dateRange, channel, {
    fetchLive: (s, d, c) => fetchTopContent(s, d, c, { withAuthor: true }),
  }))
  if (!r.data) return <Fallback kind={r.error!} />
  let own = {}
  try { own = parseOwnHandles((await getClientBySlug(clientSlug))?.dashSocialConfig) } catch { own = {} }
  if (missingAuthors(r.data, own)) {
    console.warn(`[organic-social] top content has no post authors slug=${clientSlug} channel=${channel ?? 'ALL'}; collab rule fell back to #ad`)
  }
  const posts = withViewsBasisRate(r.data)
  const stored = await loadDesignations(clientSlug, posts.map((p) => p.id))
  const { owned, influencer } = partitionByAuthor(posts, stored, own)
  return (
    <section className="space-y-6">
      <h2 className="text-sm font-extrabold uppercase tracking-widest text-text-muted">Top Content</h2>
      <SortableTopContent owned={groupPostsByPlatform(owned, channel)} influencer={groupPostsByPlatform(influencer, channel)}
        clientSlug={clientSlug} canEdit={canSetDesignation(role)} ownedLimit={ownedLimit} />
    </section>
  )
}

export const topContentV3: PartImpl<OrganicSocialCtx> = {
  id: 'top-content',
  version: 3,
  published: false,
  defaultLabel: 'Top Performing Posts',
  render: (ctx, resolved) => (
    <Suspense fallback={<TopContentSkeleton />}>
      <TopContentOutlineSection ctx={ctx} ownedLimit={ownedPostLimit(resolved.threshold)} />
    </Suspense>
  ),
}
```

`sortable-top-content.tsx`: `PlatformCardRow` gains `limit?: number`; its body becomes `const sorted = sortPosts(posts, sortKey, dir)` then `const pg = limit ? paginate(sorted.slice(0, limit), 0, limit) : paginate(sorted, page, pageSize)` (one page, so the pager's `pageCount > 1` guard hides it); `SortableTopContent` gains `ownedLimit?: number` in its props and passes `limit={section === 'owned' ? ownedLimit : undefined}` from `rows`. Absent `ownedLimit` leaves every row exactly as today.

`registry.ts`: one line after line 9 `import { topContentV3 } from './top-content-outline'`, and inside `OUTLINE_PARTS` `'top-content': { 3: topContentV3 },`. Check at build time that `mergeRegistries` merges versions of one id across the two registries (it does for `platform-headlines`); prove it with the registry test.
- [ ] **Step 4: Run PASS**; whole suite; tsc; `check:rsc`.
- [ ] **Step 5: Commit** `feat(organic-social): top-content@3 for outline clients (5 per page, collab by author, deck-basis rate)` (edge table below).

| # | Category | What breaks | Where | Disposition |
|---|---|---|---|---|
| 1 | input boundary | `ownHandles` malformed or missing | `parseOwnHandles` | fix: none means today's #ad rule; test |
| 2 | input boundary | a post with no author (frozen before this change, UGC without `instagram_user`) | `partitionByAuthor` | fix: #ad rule; test |
| 3 | state | frozen staging windows lack authors | rollout | decline in code: re-freeze with my go (Decision 3) |
| 4 | external failure | the config read fails | part | fix: empty handles, #ad rule |
| 5 | bounds | a bad threshold | `ownedPostLimit` | fix: default 5, 1 to 50; test |
| 7 | operator visibility | a frozen window without authors silently uses #ad | `missingAuthors` + warn | fix: one warning per render with slug and channel; rollout re-freezes (Decision 3) |
| 8 | state | the pin written to the wrong config key, so @3 never renders | rollout | fix: `organic-social:platform`, merged into 255's override object, not frozen; checked after the write by reading the resolved section |
| 6 | security | handles in logs or repo | nowhere logged; tests invent handles | none identified |

### Task 6: Prove it

- [ ] Full suite, `npx tsc --noEmit`, `npm run -s check:rsc` on the branch; Task 0 snapshot files unchanged since Task 0.
- [ ] Renaissance drift check (`REPO=$PWD bash ~/.claude/renaissance-baseline/check-drift.sh`): RESULT no drift.
- [ ] Zero conflicts: `git merge-tree --write-tree` of this branch with each of 247, 250, 252, 253, 254, 256 (255 is its base), then all merged in two orders on a scratch worktree off `origin/dev`, same tree, tests, tsc and `check:rsc` green there. Task 0's snapshots must pass on that merged build unchanged (they exclude TikTok on purpose). TikTok's Video Views row is exercised only there.
- [ ] Nothing pushed without my go. Then a stacked PR into `feat/organic-social-no-overview`, retargeted to `organic-social-october` once 255 merges.

## Rollout (each step waits for my go; staging only)

1. After 255 and this are on staging, in ONE go: pin `top-content@3` for the three clients in `report_section_config['organic-social:platform']` (merge `versions['top-content'] = 3` and `thresholds['top-content'] = 5` into the same override object PR 255's opt-in writes; assert that override has no `frozen` base, since `resolve.ts` ignores `versions` on a frozen base), and set `dash_social_config.ownHandles.instagram` for each (values read from Dash, never committed). Pre-change snapshot, dry run, write, then read back the resolved section for one tab of each client and confirm it resolves to `top-content@3` with threshold 5; drift check after.
2. In the same go, right after step 1: delete the three clients' CLOSED Instagram Top Content snapshot rows on staging so they re-freeze with authors (Decision 3). Coordinate with the lock-every-number rollout if it lands first.

## Review record

Fresh adversarial review of `db00b79` (one reviewer, read only). Every finding was checked against the code and accepted.

| # | Sev | Finding | Disposition |
|---|---|---|---|
| B1 | BLOCKER | The pin and threshold were written to `organic-social`; platform tabs resolve `organic-social:platform` (`index.tsx:51`), so @3 would never render; `versions` is ignored on a frozen base | Fixed: key, merge into 255's override, not frozen, read-back check (Rollout 1, edge 8) |
| B2 | BLOCKER | Task 0 snapshotted all of `PLATFORM_KPIS`; PR 247 adds TikTok, so the merged build fails the snapshot | Fixed: only the four existing channels |
| B3 | BLOCKER | Extending `fetch-top-content.test.ts` conflicts with PR 247's append (3-way merge proved it) | Fixed: new test files only (constraint added) |
| M1 | MAJOR | "5 per page, paging kept" did not match "5 posts per tab"; `pageSize` also paged Influencer Posts (9 in APFM's deck) | Fixed: owned rows capped at 5 via `ownedLimit`; Influencer keeps paging; flagged for my yes |
| M2 | MAJOR | Any window frozen before the pin has no authors; the rule silently falls back | Fixed: re-freeze in the same go; `missingAuthors` warning; edge 7 |
| M3 | MAJOR | Author evidence covers the owned feed only; the UGC fixture has no user fields | Fixed: author attached on the owned line only; UGC tested to keep #ad |
| M4 | MAJOR | `outline-layout.test.ts:13` and `:16` would break unlisted | Fixed: listed in Task 1 Step 1 |
| m1 | MINOR | A Task 1 test could not fail | Removed; Task 0's snapshot covers it |
| m2 | MINOR | "cached per request" was false with an array argument | Fixed: specs derived inside, string arguments only |
| m3 | MINOR | No reels after some reels shows 0 with no arrow | Documented (Task 2 edge 3) |
| m4 | MINOR | Reels request omitted `require_posts` | Probed: accepted, same value; now sent, as the tiles do |
| m5 | MINOR | The failure log dropped the failure kind | Fixed: `kind=` |
| m6 | MINOR | Render-path proof rested on tests that mock the fetch | Fixed: Task 0 deep-snapshots `fetchTopContent`'s default output |
| m7 | MINOR | Unused `vi` import | Removed |
