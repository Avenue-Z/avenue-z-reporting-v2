# AEO Informed Social Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (subagents are off for this repo's work, see Global Constraints). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the read-only Peec adapter in `lib/organic-social/aeo-informed/` into a new, opt-in Organic Social tab, "AEO Informed Social", with the team's 2026-11-12 feedback applied.

**Architecture:** The adapter gains the feedback outputs (citation rate, totals, brand colors and ids, a min-competitors input, a choosable fourth graph). A small pure module `lib/organic-social/aeo-tab/` holds the setting parser, the tab rule, the URL params, the windows and a cached loader. A server section in `components/report-sections/organic-social/aeo-informed/` renders Insights (shared header), graphs, tiles and three tables. The report pages, export and warmer pass the two new URL params through. For a client on locked months, a window that ends on or before its last locked day is answered from the existing lock store (`dash_response_locks`, through `readLock`/`writeLock`), captured once from Peec and served from then on, exactly as the Dash numbers are; every other window is read live through the cache.

**Tech Stack:** Next.js 16 App Router (RSC), TypeScript strict, vitest + Testing Library, Recharts via `components/charts/line-chart.tsx`, `cached()` from `lib/cache.ts`.

**Spec:** `docs/superpowers/specs/2026-11-12-aeo-informed-social-tab-design.md` (minors still open: `...-review-log.md`, items 7 to 15). Time limit finding: `docs/findings/2026-11-12-aeo-tab-page-time-limit.md`.

## Global Constraints

- Organic Social only. No client gets the tab from this PR: no DB write in any environment. Renaissance's tabs, titles, pages and Suspense keys must be byte-identical (golden rule).
- Nothing client-specific in code: no slug, brand name or project id in any branch.
- Tab id `organic-aeo-informed`, label `AEO Informed Social`, `channel: null`, `view: 'aeo-informed'`, last tab.
- Setting: `dash_social_config.aeoInformedSocial = { enabled: true, allTimeFrom: "YYYY-MM-DD", selector?: string, fourthGraph?: "instagram" | "tiktok" }`; selector default `"Organic Social"`, fourthGraph default `"instagram"`. Plus `peec_customer_project_id`. Key from `PEEC_AI_CUSTOMER_TOKEN`.
- URL params: `aeo=month|ytd|all` (anything else `month`); `aeomin=1..5` (anything else `2`).
- Deadlines: page 120 000 ms, export 30 000 ms. Cache: windows ending before the current UTC month 21 600 s, otherwise 3 600 s.
- Locking (Thomas, 2026-11-12: "locked months. yes do that and turn it on"): on for every client with `reportingMonths` (`hasReportingMonths`), no new setting. A window locks when its end is on or before `settledThrough(rm, today)` and on or after `lockedFrom(rm)` (`lib/organic-social/lock-day.ts:32,46`), the same rule as Dash (`locking-client.ts:79`). Same table, same store functions, no migration. Fail closed: a lock store failure is an error card, never live numbers.
- Colors from constants only: used-as-source `var(--color-brand-green)`; all-platform `CHART_COLORS.blended`; LinkedIn `CHANNEL_COLOR.LinkedIn`; fourth graph `CHANNEL_COLOR.Instagram` or `CHANNEL_COLOR.TikTok`. `CHANNEL_COLOR` lives in a `'use client'` file (`trends.tsx:1`), so only client components import it.
- Never log the API key or the project id. Log lines start `[aeo-informed]` and carry slug, view, min, error name.
- Copy: no em or en dashes anywhere, sentence case.
- Every task commits and pushes to `feat/os-aeo-informed-social`. Commands bounded with `perl -e 'alarm N; exec @ARGV or die "exec failed: $!\n"' --`.
- No subagents (standing rule; the only exception, the spec review, is used up). The final review is a self-review.

## Review Focus

1. A viewer picks YTD on a locked-months client whose URL range gets replaced: the locked-month redirect must keep `aeo` and `aeomin`, not bounce them to Month. Test in Task 9.
2. Switching Month to YTD on the same tab: the page Suspense key must change so the skeleton shows instead of stale numbers, and the key for every other tab must stay byte-identical. Test in Task 9.
3. All time for a project whose previous window lies wholly before its first data day: the result must still return (previous-window no-chats is a warning, not an error). Test in Task 3.
4. PDF export of a 987-row table: it prints the page the table opens on and says "Showing 1 to 14 of 987", never a blank or every row. Test in Task 8.
5. A Peec brand with no color: its Mentions dot is the muted grey (`CHART_COLORS.neutral`), never a crash. Tests in Tasks 1 and 8.

---

### Task 1: Adapter rows: citation rate, brand ids, brand colors

**Files:**
- Modify: `lib/organic-social/aeo-informed/shape.ts:85-91` (parseBrands reads optional `color`), `types.ts` (PeecBrand), `ownership.ts:11` (BrandChannels gains `color`), `tables.ts:7-42` and its builders, `index.ts` (meta.brands), `contract.ts:25-80`, `gate.ts`, `column-map.ts`, `unverified.ts` (unchanged, see Step 3)
- Test: `tables.test.ts`, `shape.test.ts`, `gate.test.ts`, `column-map.test.ts`, `contract.test.ts`, `contract-yaml.test.ts`, `index.test.ts`

**Interfaces:**
- Produces: `SocialsRow` and `GapRow` gain `citationRate: number | null`, `citationRateDelta: number | null` (percentage points as a fraction, e.g. 0.12), `mentionedBrandIds: string[]` (same order as `mentionedBrandNames`). `Meta.brands: { id: string; name: string; color: string | null; isOwn: boolean }[]`. `CONTRACT_VERSION = '1.1.0'`.

- [ ] **Step 1: Failing tests.** In `tables.test.ts`: `citation rate is citations over retrievals` (220 citations, 145 retrievals gives `220/145`, about 1.517, not capped); `citation rate is null at 0 retrievals and its change is null`; `rate change is current rate minus previous rate, null for a new URL or a previous rate of null`; `mentionedBrandIds follows the names order, own brand first`. In `shape.test.ts`: `parseBrands keeps a hex color and gives null when color is absent or not a string`. In `gate.test.ts`, through `inspect.ts` as the file already does: rules `socials-all.citation-rate` and `url-gaps.citation-rate` each fire on a tampered row (rate off by 0.01; rate set while retrievals are 0). In `column-map.test.ts`: the socials `Total` entry has status `derived`; there are entries for `citationRate` and `citationRateDelta` (socials and gaps, status `derived`). In `contract.test.ts`: `citationRate` is `float`, nullable, `min: 0`, no `max`.
- [ ] **Step 2: Run, expect FAIL.** `npx vitest run lib/organic-social/aeo-informed` → failures name the missing fields and rules.
- [ ] **Step 3: Implement.** Rate on the row's own window totals; change = `rate - priorRate` when both exist. Add the two gate rules to `GATE_RULES` with plain English ("Citation rate equals the row's citations divided by its retrievals, and is empty when there are no retrievals."). Contract: add the three fields to both tables (`mentionedBrandIds` kind `idList`), `citationRateDelta` nullable float with no min or max; bump `CONTRACT_VERSION` to `'1.1.0'`. `pdf_columns_cropped` stays in `UNVERIFIED`; change the column-map socials Total note to "Named total citations by the team (2026-11-12); not reproduced to the digit" and keep the two change entries `unverified`.
- [ ] **Step 4: Regenerate YAML.** `npx tsx scripts/gen-aeo-contract.ts`, then delete the `1.0.0.yaml` files it no longer writes (the stray-file test lists them).
- [ ] **Step 5: Run, expect PASS.** `npx vitest run lib/organic-social/aeo-informed` → all pass; `npx tsc --noEmit` → no errors.
- [ ] **Step 6: Commit and push.** `feat(organic-social): AEO adapter citation rate, brand ids and colors`.

### Task 2: Adapter totals

**Files:**
- Modify: `lib/organic-social/aeo-informed/index.ts:73-80,198-236`, `tables.ts` (new `buildTotals`), `contract.ts` (new `totals` output), `gate.ts`, `contract-yaml.ts` only if it needs the new output registered
- Test: `tables.test.ts`, `gate.test.ts`, `contract-yaml.test.ts`

**Interfaces:**
- Consumes: `SocialsRow` from Task 1.
- Produces: `export type AeoTotals = { urlsCited: number; retrievals: number; citations: number; citationRate: number | null; prior: { urlsCited: number; retrievals: number; citations: number; citationRate: number | null } | null }`; `buildTotals(current: SocialsRow[], priorRows: { retrievals: number; citations: number; cited: boolean }[] | null): AeoTotals`; `AeoInformedResult.totals: AeoTotals` (over `socialsOwn`).

- [ ] **Step 1: Failing tests.** `totals count URLs with at least one citation` (rows with 0, 1, 3 citations gives `urlsCited: 2`); `totals rate is total citations over total retrievals` (rows 10/5 and 0/95 gives `5/105`, not the mean of 0.5 and 0); `rate is null at 0 retrievals`; `prior is the same sums over the own rows of the previous window`. Gate: `totals.recount` fires when any total differs from a recount of `socialsOwn`; `totals.prior-recount` fires when the prior differs from a recount of the previous-window own rows.
- [ ] **Step 2: Run, expect FAIL.** `npx vitest run lib/organic-social/aeo-informed/tables.test.ts lib/organic-social/aeo-informed/gate.test.ts`.
- [ ] **Step 3: Implement.** Prior own rows come from the same `aggregateByUrl(rowsIn(selRows, socialsPrior))` already computed at `index.ts:199`, filtered to own channels with the same `ownerOf` rule `splitSocials` uses. `prior` is `null` when `chats.socialsPrior` is 0. Contract `totals` output: the four fields plus `prior` (nullable). Regenerate YAML as in Task 1.
- [ ] **Step 4: Run, expect PASS.** `npx vitest run lib/organic-social/aeo-informed && npx tsc --noEmit`.
- [ ] **Step 5: Commit and push.** `feat(organic-social): AEO adapter totals over own channels`.

### Task 3: Adapter inputs: minCompetitors and fourthGraph

**Files:**
- Modify: `lib/organic-social/aeo-informed/index.ts:37-54,82,89-101,156,170,212`, `graphs.ts:10`, `contract.ts:29`, `gate.ts` (`GRAPH_PLATFORMS`, `graphs.complete`), `test-world.ts` if it pins the gap filter body
- Test: `index.test.ts`, `gate.test.ts`, `contract-yaml.test.ts`

**Interfaces:**
- Produces: `AeoInformedInput.minCompetitors?: number` (integer 1 to 5, default 1); `AeoInformedInput.fourthGraph?: 'instagram' | 'tiktok'` (default `'instagram'`); `GraphId` adds `'citations_tiktok'`; `views.graphs` is keyed by the four ids actually drawn (`used_as_source_all`, `citations_all`, `citations_linkedin`, and `citations_${fourthGraph}`). `Meta.minCompetitors: number`, `Meta.fourthGraph`.

- [ ] **Step 1: Failing tests.** `index.test.ts` against the fake Peec server: `minCompetitors 2 sends gap gte 2 in both gap pulls`; `default sends gap gte 1` (today's request bodies unchanged); `minCompetitors 0, 6 or 2.5 is a RangeError before any request`; `fourthGraph tiktok builds citations_tiktok fourth from TikTok rows and no citations_instagram`; `fourthGraph linkedin is a RangeError`; `All time whose previous window has no chats returns a result with a view.no-chats-previous warning` (Review Focus 3). `gate.test.ts`: `graphs.complete` passes for the tiktok order and fires when the fourth id does not match `meta.fourthGraph`.
- [ ] **Step 2: Run, expect FAIL.** `npx vitest run lib/organic-social/aeo-informed/index.test.ts lib/organic-social/aeo-informed/gate.test.ts`.
- [ ] **Step 3: Implement.** Replace the fixed `GRAPH_ORDER` with `graphOrder(fourth)`; `citationIds` at `:156` uses it; `gapFilters` at `:170` uses `value: minCompetitors`. `GRAPH_IDS` in the contract gains `'citations_tiktok'`. The gate's graph section loops over every id in `GRAPH_IDS` (`gate.ts:272-276`), so with TikTok added a default Instagram result would fail `graphs.complete`: change those loops to the ids the result was asked for (`Object.keys(m.graphs)` in `graphOrder` order), and give `GRAPH_PLATFORMS` a `citations_tiktok: ['tiktok']` entry. The existing gate tests must stay green unchanged. If the Review Focus 3 test fails on `view.chat-days`, rule on it in the ledger before changing the gate (that rule's exemption for days before the project's first data is the place to look).
- [ ] **Step 4: Run, expect PASS.** Regenerate YAML; `npx vitest run lib/organic-social/aeo-informed && npx tsc --noEmit`.
- [ ] **Step 5: Commit and push.** `feat(organic-social): AEO adapter min competitors and fourth graph`.

### Task 4: Setting, tab rule, and every place that lists or names a tab

**Files:**
- Create: `lib/organic-social/aeo-tab/setting.ts`, `setting.test.ts`, `tab-list.test.ts` (modeled on `lib/organic-social/influencer-tab-list.test.ts`)
- Modify: `lib/db/schema.ts:132` (`DashSocialConfig` gains `aeoInformedSocial?: unknown`, validated at runtime like `kpiSheets`), `lib/constants.ts:200-249` (entry, `OrganicView`, `OrganicTabsClient`, filter), `lib/portal/sidebar-client.ts:9-32`, `lib/commentary/views.ts:16-26,101-114`, `components/report-sections/organic-social/index.tsx:35,68`, title rules at `app/dashboard/[clientSlug]/reports/page.tsx:195-198`, `app/portal/[clientSlug]/reports/page.tsx:238-241`, `lib/export/report-view.ts:36`, deep links `app/dashboard/[clientSlug]/reports/[reportSlug]/page.tsx:112`, `app/portal/[clientSlug]/reports/[reportSlug]/page.tsx:133`
- Test: the new `tab-list.test.ts`, the existing `lib/organic-social/no-overview.test.ts` and `default-channels.test.ts` (stay green unchanged), `lib/portal/sidebar-client.test.ts`, `lib/commentary/views.test.ts`, `components/export/report-views.pages.test.tsx`

**Interfaces:**
- Produces: `export const AEO_TAB_ID = 'organic-aeo-informed'`; `export type AeoInformedSetting = { allTimeFrom: string; selector: string; fourthGraph: 'instagram' | 'tiktok' }`; `parseAeoInformedSetting(raw: unknown): { kind: 'off' } | { kind: 'ok'; setting: AeoInformedSetting } | { kind: 'malformed'; reason: string }`; `hasAeoInformedTab(client: { aeoInformedTab?: boolean; dashSocialConfig?: { aeoInformedSocial?: unknown } | null; peecCustomerProjectId?: string | null; hiddenReports?: readonly string[] | null }): boolean` (pure, no logging); `logMalformedAeoSetting(slug: string, reason: string): void`; `OrganicView = 'influencer' | 'aeo-informed' | null`; `PortalSidebarClient.aeoInformedTab: boolean`; `CommentaryViewKey` adds `'organic-social:aeo-informed'`.

- [ ] **Step 1: Failing tests.** `setting.test.ts`: absent or `enabled` not `true` gives `off`; valid gives `ok` with defaults filled; `allTimeFrom` not an ISO date, `selector` empty or not a string, `fourthGraph` `"linkedin"`/`"youtube"`/`"reddit"` give `malformed` with a reason naming the key. `hasAeoInformedTab`: true only with `ok` and a non-empty project id; a record carrying `aeoInformedTab` returns it without reading the setting; `hidden_reports` containing `organic-aeo-informed` gives false. Tab list: `AEO Informed Social is last`; `a full row and its toPortalSidebarClient record give the same tab ids` (a fixture with the setting, one without, one malformed); `with Overview hidden the report still opens on a platform tab`; `no fixture without the setting changes its tab list` (snapshot of today's lists for the existing fixtures). Sidebar record: `aeoInformedTab` present and `peecCustomerProjectId` absent from `Object.keys(toPortalSidebarClient(row))`. Commentary: `recommendationsViewKeyFor('organic-social:aeo-informed')` is `null`; the label is `Organic Social, AEO Informed Social`. Titles: every route and `resolveExportView` title the tab `AEO Informed Social`, and every other tab's title is unchanged.
- [ ] **Step 2: Run, expect FAIL.** `npx vitest run lib/organic-social/aeo-tab lib/portal lib/commentary components/export/report-views.pages.test.tsx`.
- [ ] **Step 3: Implement.** Filter in `organicSocialSubsections`: `s.view === 'aeo-informed' ? hasAeoInformedTab(client) : ...`. Title rules: `organicEntry.view != null ? organicEntry.label : ...` in all five places plus `report-view.ts:36`. Section `index.tsx`: the commentary key and template key map `'aeo-informed'` to `'organic-social:aeo-informed'` (Body routing is Task 9). `toPortalSidebarClient` sets `aeoInformedTab: hasAeoInformedTab(client)` and calls `logMalformedAeoSetting` on `malformed`.
- [ ] **Step 4: Run, expect PASS.** Same command, then `npm test` and `npx tsc --noEmit`.
- [ ] **Step 5: Commit and push.** `feat(organic-social): AEO Informed Social tab, setting and tab rule`.

### Task 5: URL params and windows

**Files:**
- Create: `lib/organic-social/aeo-tab/params.ts`, `params.test.ts`

**Interfaces:**
- Produces: `type AeoRange = 'month' | 'ytd' | 'all'`; `parseAeoRange(raw: unknown): AeoRange`; `parseAeoMin(raw: unknown): number`; `aeoWindow({ servedRange, range, allTimeFrom, today }: { servedRange: string; range: AeoRange; allTimeFrom: string; today: string }): { kind: 'ok'; window: { start: string; end: string }; asOf: string; monthLabel: string; previousDays: number | null } | { kind: 'not-started'; monthLabel: string }`; `graphViews(window): { from: string; weeks: number }` (weeks = ceil(days / 7)).

- [ ] **Step 1: Failing tests.** `parseAeoRange`: `'ytd'`, `'all'`, `'month'` pass; `undefined`, `''`, `'YTD'`, `['ytd']` give `'month'`. `parseAeoMin`: `'1'` to `'5'` pass; `'0'`, `'6'`, `'2.5'`, `'abc'`, missing give `2`. `aeoWindow` with `today '2026-11-12'`: served `custom:2026-10-01,2026-10-31`, month gives `2026-10-01..2026-10-31`, asOf `2026-10-31`, `previousDays 31`; ytd gives `2026-01-01..2026-10-31`, `previousDays null`; all with `allTimeFrom '2026-01-22'` gives `2026-01-22..2026-10-31`; served `last_30_days` (end 2026-11-12) gives month `2026-11-01..2026-11-11` (clamped to yesterday, review-log minor 8); `today '2026-11-01'` with served November gives `not-started`, `monthLabel 'November 2026'`.
- [ ] **Step 2: Run, expect FAIL.** `npx vitest run lib/organic-social/aeo-tab/params.test.ts`.
- [ ] **Step 3: Implement.** The served month is the month of `resolveDateRange(servedRange).endDate` (`lib/date-range.ts:43`). End = min(month end, yesterday UTC).
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit and push.** `feat(organic-social): AEO tab range and min params and windows`.

### Task 6: Cached loader

**Files:**
- Create: `lib/organic-social/aeo-tab/load.ts`, `load.test.ts`

**Interfaces:**
- Consumes: `getAeoInformedSocial` (Tasks 1 to 3), `AeoInformedSetting` (Task 4), `aeoWindow`/`graphViews` (Task 5).
- Produces: `loadAeoTab(a: { slug: string; projectId: string; setting: AeoInformedSetting; window: { start: string; end: string }; asOf: string; min: number; range: AeoRange; deadlineMs: number; today: string }): Promise<{ kind: 'ok'; result: AeoInformedResult } | { kind: 'no-chats' } | { kind: 'error'; reason: 'timeout' | 'error' }>`; test seam `__setAeoPullForTest(fn | null)`.

- [ ] **Step 0: Measure first (read-only).** One live YTD call for Renaissance's project through a private probe (`~/.claude/organic-social-work/probes/`, bounded to 120 s), printing only the JSON byte size of the full result and of the result with `socialsOwn` and `socialsCompetitor` emptied. Next's data cache refuses an item over 2 MB and the page would then pull cold every time; the same limit applies to a locked answer, which the lock store also keeps in the data cache (`response-lock-store.ts:22`), or every view of a locked month would pull the whole answer from Neon. For reference, the mock-up's trimmed YTD data was 756 KB on 2026-11-09. If the emptied size is still over 1.5 MB, stop and bring the number to Thomas before Step 3.
- [ ] **Step 1: Failing tests.** `the cached value holds empty socialsOwn and socialsCompetitor, and the loader rebuilds them with splitSocials (tables.ts) to equal the adapter's own split` (they are subsets of `socialsAll`, which the gate already proves, so caching them doubles the size for nothing); `the cached call's arguments never contain the API key` (spy on the pull: args are projectId, selector, window, asOf, min, fourthGraph); `a window ending before this month uses the 6 hour cache, the current month the 1 hour cache`; `a different min or fourthGraph is a different cache argument list`; `AeoGateError with an error coded view.no-chats gives kind no-chats`; `a pull slower than deadlineMs gives kind error, reason timeout`; `any other throw gives kind error, reason error`; `the log line on failure names slug, range, min and the error name, and contains neither the project id nor the key` (spy on `console.error`); `missing PEEC_AI_CUSTOMER_TOKEN gives kind error and a log line`.
- [ ] **Step 2: Run, expect FAIL.** `npx vitest run lib/organic-social/aeo-tab/load.test.ts`.
- [ ] **Step 3: Implement.** Two `cached('peec', 'aeoInformedSocial:6h' | ':1h', impl, { ttlSeconds, healthCritical: true })` instances. The impl reads the key from `process.env.PEEC_AI_CUSTOMER_TOKEN` and calls the adapter with an internal `deadlineMs: 240_000`, so a page that stops waiting does not cut off a pull the cache still wants. The caller's `deadlineMs` is a `Promise.race` with a timer around the cached call (clear the timer; swallow the loser's rejection).
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit and push.** `feat(organic-social): AEO tab cached loader with deadline`.

### Task 7: Locked months

**Files:**
- Create: `lib/organic-social/aeo-tab/data.ts`, `data.test.ts`, `aeo-lock-key-pin.test.ts` (modeled on `lib/organic-social/lock-key-pin.test.ts`)
- Modify: `lib/organic-social/lock-sweep.ts:29-34`, `lib/organic-social/lock-sweep.test.ts`, the comment above `dashResponseLocks` (`lib/db/schema.ts:470`, now "one row per exact request, Dash or Peec")

**Interfaces:**
- Consumes: `loadAeoTab` (Task 6, for windows that do not lock); `getAeoInformedSocial` (Tasks 1 to 3, called directly to capture: Peec reads are already `cache: 'no-store'`, `aeo-informed/peec-read.ts:97`, so a capture is what Peec says now); `readLock`, `writeLock` (`lib/organic-social/response-lock-store.ts:24,32`); `requestKey`, `settledThrough`, `lockedFrom`, `isLateLock` (`lib/organic-social/lock-day.ts:93,32,46,99`); `hasReportingMonths` (`lib/organic-social/reporting-months.ts`).
- Produces: `aeoLockKey(a: { projectId: string; selector: string; window: { start: string; end: string }; asOf: string; min: number; fourthGraph: 'instagram' | 'tiktok' }): string` = `requestKey('aeoInformedSocial', { ...a, contract: CONTRACT_VERSION })`; `getAeoTabData(a: { client: { id: string; slug: string; dashSocialConfig: unknown }; projectId: string; setting: AeoInformedSetting; window: { start: string; end: string }; asOf: string; min: number; range: AeoRange; deadlineMs: number; today: string }): Promise<{ kind: 'ok'; result: AeoInformedResult; locked: boolean } | { kind: 'no-chats' } | { kind: 'error'; reason: 'timeout' | 'error' }>`. `today` is the New York date, `requestClock().today` (`locked-range.ts:8`), as Dash's lock uses (`base.ts:29`).

- [ ] **Step 1: Failing tests** (store and adapter injected). `a client without reportingMonths never touches the lock store`; `a window ending after settledThrough goes through loadAeoTab`; `a window ending before lockedFrom goes through loadAeoTab`; `Month, YTD and All time of a settled month all lock (each window ends on the month's last day)`; `a lock hit is served without calling Peec and with locked true`; `a miss captures from the adapter directly, never through the cache, and writes once with period_end = window end`; `the stored value has empty socialsOwn and socialsCompetitor and the read rebuilds them`; `a result whose socialsAll is empty is served but not stored, and logs lock skipped (incomplete answer)`; `a no-chats gate error is not stored and gives kind no-chats`; `a capture after the month's lock day logs late lock` (`isLateLock`); `a lock store read or write failure gives kind error and logs [aeo-informed] lock store <read|write> failed slug=<slug> period_end=<day> key=<first 12>`, with no project id; `two captures racing store one answer and both return it` (`writeLock` returns the stored one, `response-lock-store.ts:32-37`). `aeo-lock-key-pin.test.ts`: the key of one fixed request is pinned, so any change to the key's inputs fails CI and becomes a deliberate decision (the same rule as the Dash keys, CLAUDE.md "Changing any getter's request shape"). `lock-sweep.test.ts`: for a client with the tab, each swept month gets three AEO URLs, `&subsection=organic-aeo-informed&aeo=month|ytd|all`, and no client without the tab gets one; every other URL is unchanged.
- [ ] **Step 2: Run, expect FAIL.** `npx vitest run lib/organic-social/aeo-tab lib/organic-social/lock-sweep.test.ts`.
- [ ] **Step 3: Implement.** The lock rule is the one at `locking-client.ts:79` applied to the window end. Change values are kept as captured: the AEO change compares with the same-length window before (Peec's default), not the previous calendar month, so Dash's locked-baseline swap (`withLockedBaseline`) does not apply. `lockSweepUrls` maps the AEO tab to its three range URLs.
- [ ] **Step 4: Run, expect PASS.** `npx vitest run lib/organic-social && npx tsc --noEmit`.
- [ ] **Step 5: Commit and push.** `feat(organic-social): lock AEO Informed Social numbers with the month`.

### Task 8: The section

**Files:**
- Create in `components/report-sections/organic-social/aeo-informed/`: `section.tsx` (server), `controls.tsx` (client: range and min), `graphs.tsx` (client), `tiles.tsx`, `aeo-table.tsx` (client), `copy.ts`, and `section.test.tsx`, `graphs.test.tsx`, `aeo-table.test.tsx`, `tiles.test.tsx`
- Modify: `lib/organic-social/metric-definitions.ts` only if the tile tooltips belong there (follow how `metricDefinition` is keyed)

**Interfaces:**
- Consumes: `getAeoTabData` (Task 7), `aeoWindow`, `parseAeoRange`, `parseAeoMin` (Task 5), `parseAeoInformedSetting` (Task 4), `AeoInformedResult` (Tasks 1 to 3).
- Produces: `AeoInformedSection({ clientSlug, servedRange, aeo, aeoMin, role, deadlineMs }: { clientSlug: string; servedRange: string; aeo: AeoRange; aeoMin: number; role: string | undefined; deadlineMs: number }): Promise<JSX.Element>`.

Copy (exact, in `copy.ts`): range labels `Month`, `YTD`, `All time`; `Min competitors`; tiles `Total URLs cited`, `Total retrievals`, `Total citations`, `Average citation rate`, group label `Your channels`; tile delta label `vs previous ${n} days`; rate tooltip `Total citations divided by total retrievals across your channels, so a URL retrieved once can't swing it. Can be above 100% when a source is cited more than once per retrieval.`; tables `${ownBrandName} Only Socials`, `Competitor Socials`, `URL Gaps`; switch `Your channels only` / `All tagged URLs`; competitor line `Channels Peec has registered to a competitor brand.`; graph titles from spec P018 to P021 with the fourth `Citations on ${'Instagram' | 'TikTok'}`; empty graph `No source data`; `No data for ${monthLabel} yet.`; `No data for this window.`; timeout `Peec is taking longer than usual. Try again in a minute.`; pager `Showing ${a} to ${b} of ${n}`.

- [ ] **Step 1: Failing tests.** `section.test.tsx` (loader stubbed): blocks in order graphs, tiles, own table, competitor table, URL gaps; `not-started` shows the day-1 copy to staff and is never reached for a client role; `no-chats` shows `No data for this window.`; timeout shows the timeout copy and other errors `Couldn't load this section.` through `Fallback` (`parts/shared.tsx:12`); a locked and a live result render the same way (no extra line, as the Dash tabs); YTD and All time show no change on tiles or tables; tiles do not change when the own table's switch flips. `graphs.test.tsx`: four titles, four distinct stroke colors equal to `var(--color-brand-green)`, `CHART_COLORS.blended`, `CHANNEL_COLOR.LinkedIn` and the fourth graph's channel color; tiktok draws TikTok's color; an all-null graph renders `No source data`. `aeo-table.test.tsx`: socials column order ends Retrievals, Total citations, Citation rate and has no `Retrieved`; URL Gaps ends Citation share, Citation position, Retrievals, Total citations, Citation rate; 14 rows per page; search narrows by URL, title and channel; sort arrows sort numerically; rate 1.517 renders `152%`; null rate renders the table's empty mark; the own table opens on `Your channels only` and the min control on 2; Mentions shows one dot per id in `mentionedBrandIds`, in that brand's `meta.brands` color, own brand first; a brand with `color: null` gets `CHART_COLORS.neutral` (Review Focus 5); under export mode the first page prints with `Showing 1 to 14 of 987` and no pager buttons (Review Focus 4).
- [ ] **Step 2: Run, expect FAIL.** `npx vitest run components/report-sections/organic-social/aeo-informed`.
- [ ] **Step 3: Implement.** Section reads the client (`getClientBySlug`), parses the setting (`malformed` logs and renders nothing), computes the window, calls `getAeoTabData` with `requestClock().today`, and renders. Controls set `aeo` and `aeomin` with `useRouter`/`usePathname`/`useSearchParams`, as `month-picker.tsx:11-25` sets its param. Graphs use `LineChart` (`components/charts/line-chart.tsx:48`) with a percent axis for used-as-source. Tiles use `KpiCard` (`components/charts/kpi-card.tsx:27`) with `wholeDelta` and `deltaLabel`. Wrap graphs, tiles and each table in `data-export-block`.
- [ ] **Step 4: Run, expect PASS.** Then `npm run check:rsc` (props crossing to client components must be serializable).
- [ ] **Step 5: Commit and push.** `feat(organic-social): AEO Informed Social section`.

### Task 9: Routing and page wiring

**Files:**
- Modify: `components/report-sections/organic-social/index.tsx:20-29,97-108` (props and Body branch), `app/dashboard/[clientSlug]/reports/page.tsx:46-57,94,127-131,212-230,317-318`, `app/portal/[clientSlug]/reports/page.tsx` (the same places)
- Test: `components/report-sections/organic-social/index.test.tsx`, `components/export/report-views.pages.test.tsx`, the reports page tests that pin redirects

**Interfaces:**
- Consumes: `AeoInformedSection` (Task 8), `parseAeoRange`, `parseAeoMin` (Task 5).
- Produces: `OrganicSocialReport` props gain `aeo?: AeoRange` (default `'month'`), `aeoMin?: number` (default 2), `aeoDeadlineMs?: number` (default 120 000). `getReportComponent` passes them.

- [ ] **Step 1: Failing tests.** Body with `view 'aeo-informed'` renders `AeoInformedSection` with the locked month's range when the client is on locked months, and renders no template parts; every other view renders as today (the existing index tests stay green unchanged). Pages: the locked-month redirect keeps `aeo` and `aeomin` (Review Focus 1); the Suspense key on the AEO tab includes `aeo` and `aeomin`, and on every other tab equals today's string byte for byte (Review Focus 2).
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Read `aeo` and `aeomin` from `searchParams` on both pages; add them to the redirect `URLSearchParams` only when present; append `:aeo=${aeo}:${aeoMin}` to the key only when `organicEntry?.view === 'aeo-informed'`.
- [ ] **Step 4: Run, expect PASS.** `npm test && npx tsc --noEmit`.
- [ ] **Step 5: Commit and push.** `feat(organic-social): route the AEO Informed Social tab`.

### Task 10: Export and the cache warmer

**Files:**
- Modify: `lib/export/request.ts:6-63`, `lib/export/bulk.ts:13-38`, `components/export/report-element.tsx:18-29`, `app/export/[clientSlug]/[section]/page.tsx:43-71`, the two pages' `ExportPdfButton` props, `app/api/cache-warm/route.ts:52-68`
- Create: `lib/organic-social/aeo-tab/warm.ts`, `warm.test.ts`
- Test: `lib/export/request.test.ts`, `lib/export/bulk.test.ts`, `components/export/report-views.pages.test.tsx`

**Interfaces:**
- Produces: `ExportRequest.aeo: AeoRange | null`, `ExportRequest.aeoMin: number | null`; `BulkRanges.aeo`, `BulkRanges.aeoMin` (applied only to the page whose subsection is `organic-aeo-informed`); `aeoWarmUrls(baseUrl: string, client: Client, clock: Clock): string[]`; `aeoStampLabel(range: AeoRange, window: { start: string; end: string }): string`.

- [ ] **Step 1: Failing tests.** `parseExportRequest` accepts `aeo` in the three values and `aeoMin` 1 to 5, and returns `null` for any other value (strict, like `models` at `:43`); `exportPagePath` writes `aeo` and `aeomin` only when set; `bulkRequest` gives them to the AEO page only. Export page passes `aeo`, `aeoMin` and a 30 000 ms deadline; its stamp for YTD is `YTD, ` followed by `exportPeriodLabel('custom:2026-01-01,2026-10-31')` (`lib/export-period.ts:6`, so the date format matches every other stamp; `aeoStampLabel`), and every other section's stamp is unchanged. `aeoWarmUrls`: no URLs for a client without the tab; three portal URLs (`aeo=month|ytd|all`, default min) for one with it, on the client viewer's newest month (`lockedRangeFor(client, 'CLIENT_VIEWER', undefined, clock)` for locked-months clients, `last_30_days` otherwise).
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** `Clock` is `lib/organic-social/reporting-months.ts:8`; the warmer passes `requestClock()` (`lib/organic-social/locked-range.ts:8`) and appends `aeoWarmUrls` for each client after the existing loop.
- [ ] **Step 4: Run, expect PASS.** `npm test && npx tsc --noEmit`.
- [ ] **Step 5: Commit and push.** `feat(organic-social): export and warm the AEO Informed Social tab`.

### Task 11: Docs, proofs and the PR

**Files:**
- Modify: the spec (review-log minors 7, 11, 12, 13, 14 as targeted edits), `lib/organic-social/aeo-informed/ENGINEERS.md` (new inputs and outputs), `CLAUDE.md` Known Follow-ups (health sweep does not probe the tab; AEO locks live in `dash_response_locks`, so the existing "no way to undo a bad lock" entry and its delete-by-`period_end` way out cover them too; the AEO lock key is pinned like the Dash keys; months already settled when a client's tab is switched on lock on first view, as late locks; staff sidebar note)
- Create (private, never in the repo): `~/.claude/organic-social-work/probes/aeo-tab-2026-11-12-checks.mts`

- [ ] **Step 1: Read-only probe on staging and production** listing every client whose Organic Social tab list changes under this code. Expected: none.
- [ ] **Step 2: Full local gate.** `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run check:rsc`, plus the repo-template checks the CLAUDE.md "When CI is out" section lists. Expected: all clean.
- [ ] **Step 3: Local app check (needs Thomas's go).** Seeing the tab locally needs the setting on a dev client row, a dev DB write. Ask first; if he says no, the first live look is staging after Paul's review.
- [ ] **Step 4: Self-review of the whole branch** against the spec and this plan's Review Focus (subagents are off). Fix Critical and Important findings test-first.
- [ ] **Step 5: PR #444.** Retitle `feat(organic-social): AEO Informed Social tab → dev`, rewrite the body in my voice, post the self-review comment with the local check output (CI minutes are out), keep `self-reviewed`, mark ready. Do not add Paul as a reviewer; Thomas sends the Slack request.
