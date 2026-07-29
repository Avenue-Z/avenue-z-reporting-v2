# Organic Social — Module M2 (reporting-basis migration) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Organic Social metric map from a fixed per-channel struct to a declarative, two-basis KPI table, then flip the active reporting basis from `allPosts` to `byPost` so Overview counts *posts published in the window* (decisions 3 & 4) — a change that also makes the engagement graph and the engagement KPI card agree.

**Architecture:** M2 replaces `CHANNEL_METRICS` (`metrics.ts`) with `PLATFORM_KPIS` — a `Record<DashChannel, KpiSpec[]>` where each KPI carries its metric name under *both* bases plus a single module constant `REPORTING_BASIS` that selects the active column. The migration is delivered in two independently-reviewable commits: **M2a** is a pure refactor (basis stays `allPosts`, no number moves), **M2b** flips the one constant (numbers move on LinkedIn and X). The blast radius is exactly three files — `metrics.ts` and its only two consumers, `headlines.ts` and `trends.ts`.

**Tech Stack:** TypeScript (strict), Vitest, Next.js RSC. No new dependencies.

## Global Constraints

- **This is M2 of Spec 1** (`docs/superpowers/specs/2026-07-21-organic-social-parts-subpages-design.md`, §4.7 and §Module M2). It builds on **M1**, which is **merged into `integration/organic-social`** (PR #168, squash-merged as `3f3ba61`; review record PR #169). Spec 2 (Top Content, PR #172) is also on that branch. **Cut the M2 feature branch off `integration/organic-social`** — its `metrics.ts` already carries M1's `resolveChannels`/`resolveTargets`/`channelErrorPolicy`, and M2's two consumers sit at `headlines.ts:40` and `trends.ts:28` there.
- **Gate A is satisfied** (Tina approved decisions 3 & 4 = by-post, 2026-07-23). M2 is unblocked and independent of Spec 2, M3, and M4 — Spec 2 being already present on integration does not couple to M2.
- **Branch flow (CLAUDE.md):** feature branch → its own code-review PR → `dev`. M2a and M2b are two commits on the same feature branch; the whole branch is one Stage-1 PR.
- **M2b changes numbers on a page a client has already seen.** Per decision 3 it **must be communicated as a correction before it ships** (see Task 2, Step 9). The visible change must be one revertable commit (the `REPORTING_BASIS` flip).
- **No value may move in M2a.** The M2a "identical resolution" test is the guard: every Overview KPI must resolve, under `allPosts`, to the *exact* metric name the shipped code uses today.
- **Metric names are never guessed.** Findings §3a records that these names were mis-guessed twice. All-posts names are copied verbatim from the current `metrics.ts`; by-post names are taken from findings §6.2/§7.1; the two by-post names the findings do not spell out unambiguously (X and LinkedIn `IMPRESSIONS_BY_POST`) are **probe-confirmed against live Dash before they are written** (Task 2, Step 1).
- **`PlatformHeadline` does NOT widen in M2.** Widening the headline to a KPI list is **M3**. M2 keeps the fixed five-field headline shape in `types.ts` unchanged; it only changes *where the five metric names come from*.
- **Source of truth for numbers:** `docs/qa/organic-social-dash-findings.md` (§6.2 the by-post metric map; §7.1 the engagement-graph metrics; §6.3 the X-Impressions / LinkedIn anomaly; §3a the `_ALL_POSTS`/`_BY_POST` naming convention, incl. line 394: bare `IMPRESSIONS` ≡ `IMPRESSIONS_ALL_POSTS`).

---

## Metric-name reference (the data these tasks encode)

The five Overview KPIs, per channel, under each basis. **All-posts** column is copied verbatim from the current `lib/organic-social/metrics.ts` (`CHANNEL_METRICS`). **By-post** column is from findings §6.2 (values) + §7.1 (engagement metric names); the two starred cells are confirmed live in Task 2 Step 1.

| KPI (`key`) | Channel | `allPosts` name (today) | `byPost` name | Moves? |
|---|---|---|---|---|
| `followers` | all four | `TOTAL_FOLLOWERS` | `TOTAL_FOLLOWERS` | no (basis-neutral count) |
| `netNewFollowers` | all four | `NET_NEW_FOLLOWERS` | `NET_NEW_FOLLOWERS` | no (basis-neutral count) |
| `engagementRate` | IG / X / LI | `AVG_ENGAGEMENT_RATE` | `AVG_ENGAGEMENT_RATE` | no (see Step 8 caveat) |
| `engagementRate` | FB | `AVG_ENGAGEMENT_RATE_V2` | `AVG_ENGAGEMENT_RATE_V2` | no |
| `exposure` | Instagram | `VIEWS` | `VIEWS` | no (IG already by-post family) |
| `exposure` | Facebook | `PAID_AND_ORGANIC_VIEWS_BY_POST` | `PAID_AND_ORGANIC_VIEWS_BY_POST` | no (already by-post name) |
| `exposure` | X (`TWITTER`) | `IMPRESSIONS` | `IMPRESSIONS_BY_POST` ★ | **yes** 176 → 289 |
| `exposure` | LinkedIn | `IMPRESSIONS` | `IMPRESSIONS_BY_POST` ★ | value unchanged (10 746); name made family-consistent |
| `engagements` | Instagram | `TOTAL_ENGAGEMENTS` | `TOTAL_ENGAGEMENTS` | no |
| `engagements` | Facebook | `TOTAL_ENGAGEMENTS_POSTS_V2` | `TOTAL_ENGAGEMENTS_POSTS_V2` | no |
| `engagements` | X (`TWITTER`) | `TOTAL_ENGAGEMENTS` | `TOTAL_ENGAGEMENTS_POSTS` | **yes** (§7.1) |
| `engagements` | LinkedIn | `ENGAGEMENTS` | `ENGAGEMENTS_BY_POST` | **yes** 1861 → 1486 (§7.1) |

Per-channel `exposure` **label** (the `KpiSpec.label` for `key:'exposure'`, preserving today's `exposureLabel`): Instagram `Views`, Facebook `Views`, X `Impressions`, LinkedIn `Impressions`.

The `/verify` figures for Task 2 Step 8 (findings §6.2, 30-day window, brand 26952): X exposure **289**, LinkedIn engagements **1486** (and the daily engagement series now sums to that card, §7.1: LinkedIn 1486 = 1486).

---

## File Structure

- `lib/organic-social/metrics.ts` — **modified in both tasks.** M2a: add `ReportingBasis`, `REPORTING_BASIS`, `KpiSpec`, `PLATFORM_KPIS`, `OVERVIEW_KPI_KEYS`, `metricFor`, `kpiFor`, `metricForKey`; delete `ChannelMetricMap` and `CHANNEL_METRICS`. M2b: flip `REPORTING_BASIS` and write the two probe-confirmed by-post names.
- `lib/organic-social/headlines.ts` — **modified in M2a.** Read the five metric names via `metricForKey(channel, key)` and the exposure label via `kpiFor(channel,'exposure').label`, instead of `CHANNEL_METRICS[channel]`.
- `lib/organic-social/trends.ts` — **modified in M2a.** Read the engagement metric via `metricForKey(channel,'engagements')` instead of `CHANNEL_METRICS[channel].engagements`.
- `lib/organic-social/metrics.test.ts` — **created in M2a, extended in M2b.** Vitest. Pins both basis columns for every Overview KPI (survives the flip), proves `metricFor` honors `REPORTING_BASIS`, and (M2b) asserts the flip happened.
- `lib/organic-social/types.ts` — **untouched.** `PlatformHeadline` stays as-is (widening is M3).
- `components/report-sections/organic-social/platform-headlines.tsx` — **untouched.** It reads `h.exposureLabel`, which M2a keeps populating.

---

### Task 1 — M2a: declarative KPI table, pure refactor (no numbers move)

**Files:**
- Modify: `lib/organic-social/metrics.ts` (replace `ChannelMetricMap`/`CHANNEL_METRICS` at the bottom of the file — the M1 branch shows them at lines 63–106; the helpers above them, `resolveChannels`/`resolveTargets`/`channelErrorPolicy`, stay untouched)
- Modify: `lib/organic-social/headlines.ts:40,48,60-67,74`
- Modify: `lib/organic-social/trends.ts:28`
- Create: `lib/organic-social/metrics.test.ts`

**Interfaces:**
- Consumes (from M1, unchanged): `CHANNELS`, `CHANNEL_LABEL`, `DashChannel`, `resolveTargets`, `channelErrorPolicy` in `metrics.ts`.
- Produces (relied on by `headlines.ts`, `trends.ts`, and later M3):
  - `type ReportingBasis = 'allPosts' | 'byPost'`
  - `const REPORTING_BASIS: ReportingBasis` (value `'allPosts'` after this task)
  - `interface KpiSpec { key: string; label: string; metric: Record<ReportingBasis, string>; format: 'number' | 'percent'; footnote?: string }`
  - `const PLATFORM_KPIS: Record<DashChannel, KpiSpec[]>`
  - `const OVERVIEW_KPI_KEYS: readonly ['followers','netNewFollowers','exposure','engagements','engagementRate']`
  - `metricFor(k: KpiSpec): string` — `k.metric[REPORTING_BASIS]`
  - `kpiFor(channel: DashChannel, key: string): KpiSpec` — throws if the key is absent
  - `metricForKey(channel: DashChannel, key: string): string` — `metricFor(kpiFor(channel, key))`

- [ ] **Step 1: Write the failing test** — `lib/organic-social/metrics.test.ts`

```ts
import { expect, test } from 'vitest'
import {
  PLATFORM_KPIS, OVERVIEW_KPI_KEYS, REPORTING_BASIS,
  kpiFor, metricFor, metricForKey, CHANNELS, type DashChannel,
} from './metrics'

// The all-posts column MUST equal the exact metric names the shipped code used
// (copied from the pre-M2 CHANNEL_METRICS). This is the "no numbers move" guard
// for M2a; it also pins the by-post column so M2b's flip is a data change, not a
// name discovery. Source: findings §6.2 / §7.1 (see the plan's reference table).
const EXPECTED: Record<DashChannel, Record<string, { allPosts: string; byPost: string }>> = {
  INSTAGRAM: {
    followers:       { allPosts: 'TOTAL_FOLLOWERS',   byPost: 'TOTAL_FOLLOWERS' },
    netNewFollowers: { allPosts: 'NET_NEW_FOLLOWERS', byPost: 'NET_NEW_FOLLOWERS' },
    exposure:        { allPosts: 'VIEWS',             byPost: 'VIEWS' },
    engagements:     { allPosts: 'TOTAL_ENGAGEMENTS', byPost: 'TOTAL_ENGAGEMENTS' },
    engagementRate:  { allPosts: 'AVG_ENGAGEMENT_RATE', byPost: 'AVG_ENGAGEMENT_RATE' },
  },
  FACEBOOK: {
    followers:       { allPosts: 'TOTAL_FOLLOWERS',   byPost: 'TOTAL_FOLLOWERS' },
    netNewFollowers: { allPosts: 'NET_NEW_FOLLOWERS', byPost: 'NET_NEW_FOLLOWERS' },
    exposure:        { allPosts: 'PAID_AND_ORGANIC_VIEWS_BY_POST', byPost: 'PAID_AND_ORGANIC_VIEWS_BY_POST' },
    engagements:     { allPosts: 'TOTAL_ENGAGEMENTS_POSTS_V2', byPost: 'TOTAL_ENGAGEMENTS_POSTS_V2' },
    engagementRate:  { allPosts: 'AVG_ENGAGEMENT_RATE_V2', byPost: 'AVG_ENGAGEMENT_RATE_V2' },
  },
  TWITTER: {
    followers:       { allPosts: 'TOTAL_FOLLOWERS',   byPost: 'TOTAL_FOLLOWERS' },
    netNewFollowers: { allPosts: 'NET_NEW_FOLLOWERS', byPost: 'NET_NEW_FOLLOWERS' },
    // X exposure/engagements move under by-post. by-post names are placeholders in
    // M2a (the allPosts column is what M2a proves); M2b Step 1 probe-confirms them.
    exposure:        { allPosts: 'IMPRESSIONS',       byPost: 'IMPRESSIONS_BY_POST' },
    engagements:     { allPosts: 'TOTAL_ENGAGEMENTS', byPost: 'TOTAL_ENGAGEMENTS_POSTS' },
    engagementRate:  { allPosts: 'AVG_ENGAGEMENT_RATE', byPost: 'AVG_ENGAGEMENT_RATE' },
  },
  LINKEDIN: {
    followers:       { allPosts: 'TOTAL_FOLLOWERS',   byPost: 'TOTAL_FOLLOWERS' },
    netNewFollowers: { allPosts: 'NET_NEW_FOLLOWERS', byPost: 'NET_NEW_FOLLOWERS' },
    exposure:        { allPosts: 'IMPRESSIONS',       byPost: 'IMPRESSIONS_BY_POST' },
    engagements:     { allPosts: 'ENGAGEMENTS',       byPost: 'ENGAGEMENTS_BY_POST' },
    engagementRate:  { allPosts: 'AVG_ENGAGEMENT_RATE', byPost: 'AVG_ENGAGEMENT_RATE' },
  },
}

// (A) Both basis columns are pinned data — this test never changes at the flip.
test('PLATFORM_KPIS pins both basis columns for every Overview KPI', () => {
  for (const channel of CHANNELS) {
    for (const key of OVERVIEW_KPI_KEYS) {
      const spec = kpiFor(channel, key)
      expect(spec.metric.allPosts).toBe(EXPECTED[channel][key].allPosts)
      expect(spec.metric.byPost).toBe(EXPECTED[channel][key].byPost)
    }
  }
})

// (B) Overview asks for exactly its five keys, and every channel supplies them.
test('every channel supplies all five Overview KPIs', () => {
  expect(OVERVIEW_KPI_KEYS).toEqual(['followers','netNewFollowers','exposure','engagements','engagementRate'])
  for (const channel of CHANNELS) {
    for (const key of OVERVIEW_KPI_KEYS) expect(() => kpiFor(channel, key)).not.toThrow()
  }
})

// (C) The resolver honors the active basis — basis-agnostic, survives the flip.
test('metricForKey resolves through the active REPORTING_BASIS', () => {
  for (const channel of CHANNELS) {
    for (const key of OVERVIEW_KPI_KEYS) {
      expect(metricForKey(channel, key)).toBe(kpiFor(channel, key).metric[REPORTING_BASIS])
      expect(metricFor(kpiFor(channel, key))).toBe(kpiFor(channel, key).metric[REPORTING_BASIS])
    }
  }
})

// (D) M2a guard: the ACTIVE resolution is still all-posts (no numbers move yet).
test('M2a: active basis is allPosts and resolves to today\'s names', () => {
  expect(REPORTING_BASIS).toBe('allPosts')
  for (const channel of CHANNELS) {
    for (const key of OVERVIEW_KPI_KEYS) {
      expect(metricForKey(channel, key)).toBe(EXPECTED[channel][key].allPosts)
    }
  }
})

// (E) The exposure label the headline still renders (preserves today's exposureLabel).
test('exposure label is Views for IG/FB, Impressions for X/LI', () => {
  expect(kpiFor('INSTAGRAM', 'exposure').label).toBe('Views')
  expect(kpiFor('FACEBOOK', 'exposure').label).toBe('Views')
  expect(kpiFor('TWITTER', 'exposure').label).toBe('Impressions')
  expect(kpiFor('LINKEDIN', 'exposure').label).toBe('Impressions')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/organic-social/metrics.test.ts`
Expected: FAIL — `PLATFORM_KPIS`, `OVERVIEW_KPI_KEYS`, `kpiFor`, `metricFor`, `metricForKey`, `REPORTING_BASIS` are not exported yet.

- [ ] **Step 3: Add the table + helpers to `metrics.ts`; delete the old struct**

Delete the `ChannelMetricMap` interface and the `CHANNEL_METRICS` constant (M1 branch lines 63–106). Leave the file header comment and the `resolveChannels`/`resolveTargets`/`channelErrorPolicy` helpers exactly as they are. Append:

```ts
export type ReportingBasis = 'allPosts' | 'byPost'

/** The active reporting basis. M2b flips this one constant — decisions 3 & 4.
 *  'allPosts'  = every post active in the window (older posts still accruing).
 *  'byPost'    = only posts published in the window (findings §3a, §6.2). */
export const REPORTING_BASIS: ReportingBasis = 'allPosts'

export interface KpiSpec {
  key: string                              // stable id: 'followers', 'exposure'
  label: string                            // display label ('Total Followers', 'Views')
  /** Metric name per basis. Identical entries are deliberate, not duplication. */
  metric: Record<ReportingBasis, string>
  format: 'number' | 'percent'
  /** Rendered as a caveat under the card (used by M3 — decision 6, Facebook). */
  footnote?: string
}

// Overview shows five KPIs, un-aggregated. M3 extends each channel's list to the
// full 10–11; M2 carries only the five Overview keys. Names: all-posts copied from
// the pre-M2 CHANNEL_METRICS; by-post from findings §6.2 / §7.1. `followers`,
// `netNewFollowers`, `engagementRate` are basis-neutral (identical both columns).
export const PLATFORM_KPIS: Record<DashChannel, KpiSpec[]> = {
  INSTAGRAM: [
    { key: 'followers',       label: 'Total Followers', format: 'number',  metric: { allPosts: 'TOTAL_FOLLOWERS',   byPost: 'TOTAL_FOLLOWERS' } },
    { key: 'netNewFollowers', label: 'Net New Followers', format: 'number', metric: { allPosts: 'NET_NEW_FOLLOWERS', byPost: 'NET_NEW_FOLLOWERS' } },
    { key: 'exposure',        label: 'Views',           format: 'number',  metric: { allPosts: 'VIEWS',             byPost: 'VIEWS' } },
    { key: 'engagements',     label: 'Engagements',     format: 'number',  metric: { allPosts: 'TOTAL_ENGAGEMENTS', byPost: 'TOTAL_ENGAGEMENTS' } },
    { key: 'engagementRate',  label: 'Engagement Rate', format: 'percent', metric: { allPosts: 'AVG_ENGAGEMENT_RATE', byPost: 'AVG_ENGAGEMENT_RATE' } },
  ],
  FACEBOOK: [
    { key: 'followers',       label: 'Total Followers', format: 'number',  metric: { allPosts: 'TOTAL_FOLLOWERS',   byPost: 'TOTAL_FOLLOWERS' } },
    { key: 'netNewFollowers', label: 'Net New Followers', format: 'number', metric: { allPosts: 'NET_NEW_FOLLOWERS', byPost: 'NET_NEW_FOLLOWERS' } },
    { key: 'exposure',        label: 'Views',           format: 'number',  metric: { allPosts: 'PAID_AND_ORGANIC_VIEWS_BY_POST', byPost: 'PAID_AND_ORGANIC_VIEWS_BY_POST' } },
    { key: 'engagements',     label: 'Engagements',     format: 'number',  metric: { allPosts: 'TOTAL_ENGAGEMENTS_POSTS_V2', byPost: 'TOTAL_ENGAGEMENTS_POSTS_V2' } },
    { key: 'engagementRate',  label: 'Engagement Rate', format: 'percent', metric: { allPosts: 'AVG_ENGAGEMENT_RATE_V2', byPost: 'AVG_ENGAGEMENT_RATE_V2' } },
  ],
  TWITTER: [
    { key: 'followers',       label: 'Total Followers', format: 'number',  metric: { allPosts: 'TOTAL_FOLLOWERS',   byPost: 'TOTAL_FOLLOWERS' } },
    { key: 'netNewFollowers', label: 'Net New Followers', format: 'number', metric: { allPosts: 'NET_NEW_FOLLOWERS', byPost: 'NET_NEW_FOLLOWERS' } },
    // by-post names confirmed live in M2b Step 1 before the flip.
    { key: 'exposure',        label: 'Impressions',     format: 'number',  metric: { allPosts: 'IMPRESSIONS',       byPost: 'IMPRESSIONS_BY_POST' } },
    { key: 'engagements',     label: 'Engagements',     format: 'number',  metric: { allPosts: 'TOTAL_ENGAGEMENTS', byPost: 'TOTAL_ENGAGEMENTS_POSTS' } },
    { key: 'engagementRate',  label: 'Engagement Rate', format: 'percent', metric: { allPosts: 'AVG_ENGAGEMENT_RATE', byPost: 'AVG_ENGAGEMENT_RATE' } },
  ],
  LINKEDIN: [
    { key: 'followers',       label: 'Total Followers', format: 'number',  metric: { allPosts: 'TOTAL_FOLLOWERS',   byPost: 'TOTAL_FOLLOWERS' } },
    { key: 'netNewFollowers', label: 'Net New Followers', format: 'number', metric: { allPosts: 'NET_NEW_FOLLOWERS', byPost: 'NET_NEW_FOLLOWERS' } },
    { key: 'exposure',        label: 'Impressions',     format: 'number',  metric: { allPosts: 'IMPRESSIONS',       byPost: 'IMPRESSIONS_BY_POST' } },
    { key: 'engagements',     label: 'Engagements',     format: 'number',  metric: { allPosts: 'ENGAGEMENTS',       byPost: 'ENGAGEMENTS_BY_POST' } },
    { key: 'engagementRate',  label: 'Engagement Rate', format: 'percent', metric: { allPosts: 'AVG_ENGAGEMENT_RATE', byPost: 'AVG_ENGAGEMENT_RATE' } },
  ],
}

/** The subset Overview shows, by key, in display order. Overview stays 5-up. */
export const OVERVIEW_KPI_KEYS = ['followers', 'netNewFollowers', 'exposure',
                                  'engagements', 'engagementRate'] as const

/** The metric name for a KPI under the active basis. */
export const metricFor = (k: KpiSpec): string => k.metric[REPORTING_BASIS]

/** The KpiSpec for a key on a channel. Throws if absent — a missing Overview key is a bug. */
export function kpiFor(channel: DashChannel, key: string): KpiSpec {
  const spec = PLATFORM_KPIS[channel].find((k) => k.key === key)
  if (!spec) throw new Error(`no KPI '${key}' for channel ${channel}`)
  return spec
}

/** Convenience: the active-basis metric name for a channel+key. */
export const metricForKey = (channel: DashChannel, key: string): string => metricFor(kpiFor(channel, key))
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/organic-social/metrics.test.ts`
Expected: PASS (all five tests).

- [ ] **Step 5: Rewire `headlines.ts` to the new table**

In `lib/organic-social/headlines.ts`, change the import (line 3) from `CHANNEL_METRICS` to the new helpers, and replace the body inside `targets.map(async (channel) => { ... })`. Concretely:

Import line becomes:
```ts
import { CHANNEL_LABEL, kpiFor, metricForKey, resolveTargets, channelErrorPolicy, type DashChannel } from './metrics'
```

Replace `const map = CHANNEL_METRICS[channel]` (line 40) with:
```ts
const followersMetric = metricForKey(channel, 'followers')
const netNewMetric = metricForKey(channel, 'netNewFollowers')
const exposureMetric = metricForKey(channel, 'exposure')
const engagementsMetric = metricForKey(channel, 'engagements')
const engagementRateMetric = metricForKey(channel, 'engagementRate')
```

Replace the request `metrics:` array (line 48) with:
```ts
          metrics: [followersMetric, netNewMetric, exposureMetric, engagementsMetric, engagementRateMetric],
```

Replace the metric reads (lines 60–64) with:
```ts
        const followers = metrics[followersMetric]
        const netNew = metrics[netNewMetric]
        const exposure = metrics[exposureMetric]
        const engagements = metrics[engagementsMetric]
        const engagementRate = metrics[engagementRateMetric]
```

Replace `exposureLabel: map.exposureLabel,` (line 74) with:
```ts
          exposureLabel: kpiFor(channel, 'exposure').label,
```

Leave everything else (the `delta`/`pruneDeltas` helpers, the returned `PlatformHeadline` shape, `onChannelError`) exactly as-is.

- [ ] **Step 6: Rewire `trends.ts` to the new table**

In `lib/organic-social/trends.ts`, change the import (line 4) from `CHANNEL_METRICS` to `metricForKey`:
```ts
import { CHANNEL_LABEL, metricForKey, resolveTargets, channelErrorPolicy, type DashChannel } from './metrics'
```
Replace `const metric = CHANNEL_METRICS[channel].engagements` (line 28) with:
```ts
      const metric = metricForKey(channel, 'engagements')
```

- [ ] **Step 7: Type-check and run the full organic-social suite**

Run: `npx tsc --noEmit`
Expected: PASS — no references to `CHANNEL_METRICS` or `ChannelMetricMap` remain (a stale import would fail here).

Run: `npx vitest run lib/organic-social`
Expected: PASS — `metrics.test.ts`, `trends-build.test.ts`, `top-content.test.ts`, `synopsis-context.test.ts` all green. `trends-build`/`top-content` are unchanged and prove the refactor did not disturb their code paths.

- [ ] **Step 8: Confirm no other consumer references the deleted symbols**

Run: `git grep -n "CHANNEL_METRICS\|ChannelMetricMap" -- lib components`
Expected: no output. (The pre-M2 blast-radius sweep found exactly two consumers, `headlines.ts` and `trends.ts`; this confirms both are migrated and nothing else referenced them.)

- [ ] **Step 9: Commit**

```bash
git add lib/organic-social/metrics.ts lib/organic-social/headlines.ts lib/organic-social/trends.ts lib/organic-social/metrics.test.ts
git commit -m "refactor(organic-social): M2a — declarative PLATFORM_KPIS table, basis=allPosts (no value change)"
```

---

### Task 2 — M2b: flip the reporting basis to by-post (numbers move on LinkedIn & X)

**Files:**
- Modify: `lib/organic-social/metrics.ts` — flip `REPORTING_BASIS`; overwrite the two starred by-post names only if Step 1 finds them wrong.
- Modify: `lib/organic-social/metrics.test.ts` — add the flip-assertion.

**Interfaces:**
- Consumes: everything Task 1 produced.
- Produces: no new symbols. `REPORTING_BASIS === 'byPost'`; `metricForKey(...)` now returns the by-post column.

- [ ] **Step 1: Probe-confirm the two uncertain by-post metric names against live Dash**

The findings name the by-post engagement metrics explicitly (§7.1) but do **not** unambiguously name the by-post *exposure* metric for X and LinkedIn — findings §3a line 394 states bare `IMPRESSIONS` ≡ `IMPRESSIONS_ALL_POSTS`, and the `_BY_POST` variant name must be confirmed, not assumed (§3a: these names were mis-guessed twice).

Using the same method §6 used — a `TOTAL_GROUPED_METRIC`, `aggregate_by=BRAND`, `require_posts=true`, 30-day-window `/reports/data` call against brand 26952 (via the Dash MCP `data_query`, or the repo's `DashSocialClient` in a throwaway `tsx` script with `DASH_API_TOKEN`) — request metric `IMPRESSIONS_BY_POST` for `channels: ['TWITTER']` and for `channels: ['LINKEDIN']`.

Acceptance:
- `IMPRESSIONS_BY_POST` for X returns **289** (findings §6.2/§6.3). If the metric 400s or returns a different number, **stop** — do not flip. Find the correct by-post impression metric name from Dash's catalog (§3b, `developer.dashsocial.com`) and record it in `metrics.ts` `TWITTER.exposure.metric.byPost` and in the test's `EXPECTED` table before continuing.
- `IMPRESSIONS_BY_POST` for LinkedIn returns **10746** (findings §6.2). Same stop-and-correct rule.

Record the confirmed names + observed values in a one-line comment on the PR. **Do not skip this step** — it is the guard the findings doc's "wrong twice" warning demands.

- [ ] **Step 2: Write the failing flip-assertion** — append to `lib/organic-social/metrics.test.ts`

```ts
// M2b: the basis has been flipped. This is the single revertable assertion that
// pins the visible change. Test (A) already pins the by-post NAMES; this pins the
// active BASIS. Reverting the one-line flip in metrics.ts makes exactly this fail.
test('M2b: active basis is byPost', () => {
  expect(REPORTING_BASIS).toBe('byPost')
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run lib/organic-social/metrics.test.ts -t "M2b"`
Expected: FAIL — `REPORTING_BASIS` is still `'allPosts'`.

Note: test (D) from Task 1 (`M2a: active basis is allPosts...`) will also fail once Step 4 flips the constant — that is expected and correct. Update it in Step 4.

- [ ] **Step 4: Flip the constant and retire the M2a active-basis guard**

In `lib/organic-social/metrics.ts`, change the one line:
```ts
export const REPORTING_BASIS: ReportingBasis = 'byPost'
```
In `lib/organic-social/metrics.test.ts`, delete test **(D)** (`M2a: active basis is allPosts and resolves to today's names`) — it asserted the pre-flip active basis and is now superseded by the M2b assertion in Step 2. Tests (A), (B), (C), (E) stay: (A) still pins both columns, (C) still proves the resolver honors whatever basis is active.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run lib/organic-social/metrics.test.ts`
Expected: PASS.

- [ ] **Step 6: Type-check and full suite**

Run: `npx tsc --noEmit && npx vitest run lib/organic-social`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/organic-social/metrics.ts lib/organic-social/metrics.test.ts
git commit -m "feat(organic-social): M2b — flip REPORTING_BASIS to byPost (LinkedIn/X move; graph now sums to card)"
```

- [ ] **Step 8: `/verify` the live figures (manual, requires a real Dash call)**

This is the spec's `/verify` gate — the static test pins names; this confirms the numbers actually moved as decided. Run the Organic Social Overview for Renaissance (brand 26952, 30-day window) — via the running app on the M2 branch, or a `tsx` script calling `getPlatformHeadlines('renaissance', 'last_30_days', null)` and `getEngagementTrend('renaissance', 'last_30_days')`. Confirm:
  - **X exposure (Impressions) = 289** (was 176 under all-posts) — decision-3 movement.
  - **LinkedIn engagements = 1486** (was 1861) — decision-3 movement.
  - **The LinkedIn engagement graph now sums to the LinkedIn engagement KPI card** (both 1486) — the bug fix riding along (§7.1). Under the old all-posts combination the card read 1861 while the graph read 1486; they now agree.
  - **Instagram and Facebook Overview numbers are unchanged** (their five metric names are identical across bases — the reference table's "Moves? no" rows).
  - **`followers`, `netNewFollowers`, `engagementRate` are unchanged on all four channels.** engagementRate in particular has no distinct by-post metric name in Dash's catalog for this brand; if the `/verify` shows any engagement-rate value moved, stop and investigate before shipping — it would mean a by-post rate metric exists and the table's basis-neutral assumption for `engagementRate` is wrong.

Record the observed before/after numbers on the PR.

- [ ] **Step 9: Communicate the correction before shipping (decision 3 — required)**

M2b changes numbers on a page clients have already seen. Per decision 3 this must be **communicated as a correction before it ships**, not discovered by a client. On the Stage-1 PR, state plainly: which platforms move (LinkedIn engagements 1861→1486; X impressions 176→289), why (posts-published-in-window is the correct, post-level-reconciled basis — findings §6.3), and that the engagement graph and card now agree. Flag to Tina/Thomas that the stakeholder-facing correction note must go out before this promotes past `staging`. The flip is one revertable commit if the timing needs to change.

---

## Self-Review

**1. Spec coverage (Spec 1 §Module M2 + §4.7):**
- M2a "restructure `CHANNEL_METRICS` into `PLATFORM_KPIS` + two basis maps, `REPORTING_BASIS='allPosts'`, pure refactor" → Task 1. ✅
- M2a "Unit test: every KPI resolves to the identical metric name it resolves to today" → Task 1 test (D) + (A). ✅
- M2b "Flip `REPORTING_BASIS` to `'byPost'`. One constant." → Task 2 Step 4. ✅
- M2b "Unit test pins the expected metric names per platform against findings §6.2" → Task 1 test (A) pins both columns (written in M2a, survives the flip; this is the name-pinning test the spec asks for). ✅
- M2b "`/verify` that LinkedIn and X move to the decision-3 figures and that the engagement graph now sums to the KPI card" → Task 2 Step 8. ✅
- §4.7 blast radius "two consumers — `headlines.ts`, `trends.ts`" → Tasks 1 Steps 5–6, verified by Step 8's `git grep`. ✅
- §4.7 "`trends.ts` is inside M2's blast radius, easy to miss" → explicitly handled (Task 1 Step 6). ✅
- §4.7 the graph-sum bug fix rides along → verified in Task 2 Step 8. ✅
- M2b "must be communicated as a correction before it ships" → Task 2 Step 9. ✅
- **Deliberately deferred to M3 (not M2):** widening `PlatformHeadline` to a KPI list, populating `PLATFORM_KPIS` to the full 10–11, `follower-graph`, `footnote` population for Facebook. `types.ts` and `platform-headlines.tsx` are correctly untouched here. ✅

**2. Placeholder scan:** No TBD/TODO/"add error handling"/"similar to". Every code and test step shows literal content. The only intentionally-conditional value — X/LinkedIn by-post `IMPRESSIONS_BY_POST` — is written concretely *and* gated behind a live probe (Task 2 Step 1) with an explicit stop-and-correct rule, per the findings doc's "never guess a metric name" mandate. ✅

**3. Type consistency:** `KpiSpec`, `PLATFORM_KPIS`, `REPORTING_BASIS`, `metricFor`, `kpiFor`, `metricForKey`, `OVERVIEW_KPI_KEYS` are used identically in the test (Task 1 Step 1), the implementation (Step 3), and the consumers (Steps 5–6). `metricForKey(channel, key)` signature matches every call site. `kpiFor(channel,'exposure').label` supplies the `exposureLabel` string the unchanged `PlatformHeadline`/`platform-headlines.tsx` still expect. ✅
