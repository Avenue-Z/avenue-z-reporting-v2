# Organic Social — M3 (platform subpages) — Code Review Record

**Scope under review:** PR [#174](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/174),
branch `feat/organic-social-m3-platform-subpages`, diff range **`842b32e..a70df7d`** (7 commits,
`ae1011d`→`a70df7d`) off `origin/integration/organic-social` (`842b32e` = the M2 merge). No
unrelated code is in scope; the branch touches only `components/report-sections/organic-social/**`,
`components/{layout/{sidebar,portal-sidebar}.tsx,charts/kpi-card.tsx}`, `lib/organic-social/**`,
`lib/constants.ts`, `app/{dashboard,portal}/[clientSlug]/reports/**`, and
`scripts/probe-m3-kpi-names.ts`.

**This document changes no code.** Review happened as 18 inline comments on PR #174 from Paul
across two rounds (2026-07-30 15:00 and 15:43 UTC), against intermediate commits `34f56aa` and
`d5fdf8c`. All fixes are already applied on the feature branch — `d5fdf8c` (round-1 fixes) and
`a70df7d` (round-2 fixes, applied in this session) — and are cited per-finding in §5; this doc
is the closing comprehension-gate record consolidating that review before the merge into
`integration/organic-social`.

Reviewers: Paul.

---

## §1 How it works (comprehension — where every number comes from)

M3 adds a **platform subpage** per channel (Instagram / Facebook / LinkedIn / X) alongside the
existing 5-KPI, all-channels **Overview**, reusing the M1 parts framework and M2's by-post
reporting basis. Nothing about Overview's numbers or layout changes except one relabel
("Followers" → "Total Followers", for consistency with the platform pages).

**Composition path** (`components/report-sections/organic-social/index.tsx`, unchanged from M1):
`OrganicSocialReport` builds a synchronous `ctx` via `buildOrganicSocialCtx`, then
`OrganicSocialBody` resolves `key = ctx.channel ? 'organic-social:platform' : 'organic-social'`
against `CODE_TEMPLATES[key]` (no `section_templates` DB rows are seeded yet — M4) and renders
each resolved part behind its own `<Suspense>`. M3's only change to this path is the `channel`
value that flows in and the two templates it now selects between:

- `ORGANIC_SOCIAL_TEMPLATE` (Overview): `[platform-headlines@1, engagement-trend@1, top-content@2]`.
- `ORGANIC_SOCIAL_PLATFORM_TEMPLATE`: the same order with `follower-graph@1` spliced in as the
  2nd part — **derived from `ORGANIC_SOCIAL_TEMPLATE.order`** (`template.ts`), not hand-typed, so
  a future Overview-only edit can't silently diverge between the two (PR #168 review R2 #3 /
  this review's finding #6).

**Routing → `channel`.** Both report pages
(`app/{dashboard,portal}/[clientSlug]/reports/page.tsx`) resolve the URL's `?subsection=` through
`resolveOrganicSubsection(client, subsectionParam)` (`lib/constants.ts`) — **the single source of
truth for "which view is this?"**. It filters `ORGANIC_SOCIAL_SUBSECTIONS` through
`visibleSubsections` (client's `hiddenReports`) and the client's `dashSocialConfig.channels`
allowlist, then falls back to the first entry (Overview, `channel: null`) on no match — so an
unknown, hidden, or unconfigured `subsection` **degrades to Overview, never a 404**. The resolved
entry's `.channel` is what's actually passed to `OrganicSocialReport`/`getReportComponent`; the
sidebar highlight and the report's `<Suspense>` remount key are both keyed on this **resolved**
value too, not the raw query param (finding #3, #5) — a stale bookmark to a hidden/removed tab
degrades silently instead of desyncing the UI or forcing a needless remount.

**Where each number comes from** (all via Dash Social; `lib/organic-social/`):

- **Platform Headlines** (`headlines.ts` → `getPlatformHeadlines`): one `TOTAL_GROUPED_METRIC`
  request per channel, same as M1/M2, but the **key set now varies by scope** —
  `scoped ? platformKpiKeys(channel) : OVERVIEW_KPI_KEYS` (5). `platformKpiKeys` reads
  `PLATFORM_KPIS[channel]` (`metrics.ts`) — 11 for Instagram, 9 for Facebook, 10 each for
  X/LinkedIn — hand-curated and **confirmed live** against Dash (brand 26952) via
  `scripts/probe-m3-kpi-names.ts`, including the exact shipped scoped batch
  (`metricNamesFor(channel, platformKpiKeys(channel))`) as one request per channel. Two decisions
  are encoded directly in `PLATFORM_KPIS`: Facebook's `engagements` carries a footnote ("includes
  engagement on posts marked Influencer") that **only renders when `scoped` is true** — Overview
  requests the same key but `buildPlatformHeadline`'s `footnote: scoped ? spec.footnote :
  undefined` drops it there, keeping Overview byte-identical (finding #1); and Facebook has no
  Profile Views KPI at all (omitted from its `PLATFORM_KPIS` entry), while X's "Profile Views"
  slot is actually Profile *Clicks*.
- **Follower Graph** (`followers.ts` → `getFollowerGraph`, new part, platform-only): one GRAPH
  request per channel for `TOTAL_FOLLOWERS` (`DAILY`). `TOTAL_FOLLOWERS` is a **stock**, not a
  flow — `buildTrendSeries(..., { gapFill: 'carry' })` holds the last known count through a null
  day instead of the `'zero'` fill Engagement Over Time uses, so a data gap can't plot a
  fabricated drop to zero. `FollowerSection` refuses to render (and never fetches) when
  `ctx.channel` is `null` — `validate.ts`'s `extraParts` check has no channel-scoping concept, so
  without this guard an admin override could reach this platform-only part on Overview and
  silently overlay every channel's follower count on one chart (finding #10, the highest-severity
  finding in this review).
- **Engagement Over Time / Top Performing Posts** — unchanged from M1/M2 (`trends.ts`,
  `top-content.ts`); M3 touches neither.

**Layout.** `PlatformHeadlines` picks a grid column count by KPI count so a 9/10/11-KPI subpage
doesn't end with a lonely single card in the last row: `gridColsMd` gives 9→3×3, 10→2×5, 11→4/4/3
(vs. Overview's fixed 5-wide single row), and `gridColsBase` picks a matching mobile-width
column count. Both were originally tuned only to today's four live counts; this review's finding
#13 flagged that the fallback for an untested count could still orphan a row (verified true for
n=13/17), and separately surfaced a live bug in `gridColsBase`'s mobile branch (a `n%5===0` check
that's wrong for odd multiples of 5, e.g. 15). Both are now general: `gridColsMd` falls through
4→5→3→2, and `gridColsBase`'s condition is the correct `n%2===0`; neither change moves any of the
four live counts, pinned by a `n=6..25` sweep test.

---

## §2 Verification method

- **Static anchors** confirmed at the cited `file:line` in the reviewed tree (`git show
  a70df7d:<file>`), for both the original findings and each fix.
- **`buildPlatformHeadline`'s scoping** (finding #1) verified with a direct unit test asserting
  `buildPlatformHeadline('FACEBOOK', metrics, OVERVIEW_KPI_KEYS, false)` carries no footnote —
  the exact call shape the reviewer flagged as untested (`lib/organic-social/headline-build.test.ts`).
- **The `extraParts` overlay hole** (finding #10) traced end-to-end: `validate.ts`'s
  `parseOverride` only checks a pin exists in the registry and isn't already in the template — no
  channel concept anywhere in that path — confirmed by reading `lib/report-sections/validate.ts`
  in full. The fix was verified both by unit test (`follower-graph.golden.test.tsx`: `channel:
  null` → `null` render, `getFollowerGraph` never called) and by confirming the one real call site
  (`FollowerSection`) is the only caller of `getFollowerGraph` in the tree (`grep`).
  Not reachable via the product UI today (no admin UI calls `saveReportSectionConfig` with a
  channel-scoped part yet) — consistent with the reviewer's own "not exploitable via the product
  UI today" framing; the fix closes the hole at the server-action layer regardless.
- **The `gridCols` fallback** (finding #13) was not just read — it was **exercised**: a new sweep
  test enumerates n=6..25 through both `gridColsMd`/`gridColsBase` and asserts no count produces
  an orphaned last-row card, which is what caught the sibling `gridColsBase` bug (n=15) that
  wasn't in the reviewer's original finding. A second test pins the four live counts (5/9/10/11)
  to their exact intended layout, so the generalization couldn't silently change today's rendered
  output — confirmed by re-running the existing `platform-headlines.golden.test.tsx` and
  `composition.golden.test.tsx` snapshots unchanged.
- **The `pct()` dedup** (finding #12) DOM-level change (one text node vs. two) was caught by
  `render-invariant.test.tsx`'s existing snapshot, which was updated after confirming the
  underlying `getByText('3.5%')` assertion in that same test still passes — i.e., the visible
  text is unchanged, only its node structure is.
- **Suite executed** green in the final range: `npx tsc --noEmit` clean; `npx vitest run` — 60
  files, 438 tests, all passing; `npx eslint` clean on every touched file.
- **Manual `/verify` — DONE 2026-07-30.** Verified by Paul against the `integration/organic-social`
  Vercel preview (`b87c0a5`) using renaissance (multi-channel). Overview unchanged (5 KPIs, no
  Follower Graph); the LinkedIn subpage rendered the full 10-KPI headline, Follower Graph, and
  scoped Engagement Over Time / Top Content; a stale/unknown `?subsection=` degraded to Overview
  with no 404 and the sidebar correctly showing no highlighted tab. Not runnable from within this
  review session itself (no authenticated internal session there) — recorded here from the live
  check.

---

## §3 Findings

Sev: **●** correctness · **○** cleanup/convention/efficiency.
Status: **CONFIRMED** (proven in-tree) · **PLAUSIBLE** (code assumption confirmed, external
trigger unverified). Locations are as-reviewed (commits `34f56aa`/`d5fdf8c`, prior to this
review's fixes); three findings were raised in both review rounds and are consolidated here.

| # | Sev | Status | Location | Finding |
|---|-----|--------|----------|---------|
| 1 | ● | CONFIRMED | `lib/organic-social/headline-build.ts:53` | Facebook's `engagements` footnote was attached unconditionally, so it leaked onto the unscoped Overview build (which includes `engagements` in `OVERVIEW_KPI_KEYS`) — contradicting the PR's own "Overview stays byte-identical" claim. |
| 2 | ● | CONFIRMED / PLAUSIBLE | `lib/constants.ts:188` | `ORGANIC_SOCIAL_SUBSECTIONS` reused the bare id `'linkedin'`, already used by `PAID_MEDIA_SUBSECTIONS` — since `hiddenReports` is one flat, unscoped array, hiding one section's LinkedIn tab would silently hide the other's too. Raised in both rounds. |
| 3 | ● | CONFIRMED | `components/layout/sidebar.tsx:642`, `app/dashboard/[clientSlug]/reports/page.tsx:156` | The sidebar's `activeSubsection` and the route's channel resolution used two different filters (raw param vs. `resolveOrganicSubsection`'s hidden+allowlist filtering), so a stale/hand-typed `?subsection=` outside a client's allowlist rendered Overview but highlighted no tab. Raised in both rounds. |
| 4 | ● | CONFIRMED | `components/report-sections/organic-social/platform-headlines.tsx:20` | `gridCols` only had a `md:` override, no mobile-aware base class, so a 9- or 11-KPI subpage still orphaned a card below `md:`. |
| 5 | ● | CONFIRMED | `app/dashboard/[clientSlug]/reports/page.tsx:238` (same pattern in the portal route) | The report `<Suspense>` key interpolated the raw `subsection` param, not the resolved value — a disallowed subsection that degrades to Overview still produced a different key, forcing an unnecessary remount/skeleton flash. |
| 6 | ○ | CONFIRMED | `components/report-sections/organic-social/template.ts:17` | `ORGANIC_SOCIAL_PLATFORM_TEMPLATE` was de-aliased from `ORGANIC_SOCIAL_TEMPLATE` (PR #168 review R2 #3) back into a hand-typed literal duplicating three shared entries, with no test cross-checking the two templates — reintroducing the exact drift risk that alias had closed. Raised in both rounds. |
| 7 | ○ | CONFIRMED | `components/layout/sidebar.tsx:615` | The Organic Social sub-nav block is a near-verbatim structural copy of the existing Paid Media block (URLSearchParams, JSX, classNames) — the Nth near-identical copy in this file. |
| 8 | ○ | CONFIRMED | `components/charts/kpi-card.tsx:14` | `footnote` prop rendered the same output as the existing `subValue` prop; no caller passed both. |
| 9 | ○ | CONFIRMED | `lib/organic-social/followers.ts:29,35` | `getFollowerGraph` and `getEngagementTrend` each issue a separate GRAPH request per channel differing only by metric name — could be one request, at the cost of their independent Suspense/error-boundary isolation. Raised in both rounds (round 2 adds: no call site proves the endpoint accepts a multi-metric GRAPH request). |
| 10 | ● | CONFIRMED | `components/report-sections/organic-social/parts/follower-graph.tsx:10` | `follower-graph` is documented "platform-only, never on Overview" but nothing enforced it: `validate.ts`'s `extraParts` check has no channel-scoping concept, so an authorized `saveReportSectionConfig(..., { extraParts: [{ id: 'follower-graph', version: 1 }] })` on Overview would reach `getFollowerGraph(slug, dateRange, null)`, which treats `null` as "all channels" and silently overlays every configured channel's follower count on one chart. Highest-severity finding in this review. |
| 11 | ○ | CONFIRMED | `lib/organic-social/followers.ts:17` | `getFollowerGraph` duplicates `getEngagementTrend`'s fetch pipeline (`dashClientFor`/`resolveTargets`/`isoRangeTz`/`Promise.all`/GRAPH-fetch/`channelErrorPolicy`/`buildTrendSeries`) almost line-for-line, plus a duplicated `GraphData` type — a shared-pipeline fix has to be applied twice by hand. |
| 12 | ○ | CONFIRMED | `components/report-sections/organic-social/platform-headlines.tsx:25` | Percent formatting (`k.value.toFixed(1)` + separate `suffix: '%'`) duplicated the existing `pct()` helper, already re-exported from `lib/organic-social/base` and already used the same way by `post-card.tsx`. |
| 13 | ● | CONFIRMED | `components/report-sections/organic-social/platform-headlines.tsx:9` | `gridCols(n)` was tuned only to today's four live counts (5, 9, 10, 11) and silently regressed for untested counts — verified for n=13/17 (falls to `md:grid-cols-4`, producing a 4/4/4/1 orphan). No test pinned the behavior. |
| 14 | ○ | CONFIRMED | `lib/organic-social/headline-build.ts:32` | `buildPlatformHeadline` resolved `kpiFor(channel, key)` twice per KPI key — once directly, once again inside `metricForKey`, which itself calls `kpiFor`. |

---

## §4 Detail

**1 — Overview footnote leak.**
Mechanism: `buildPlatformHeadline` attached `footnote: spec.footnote` unconditionally; Facebook's
`engagements` `KpiSpec` carries an influencer-inclusion caveat, and `engagements` is one of the
five `OVERVIEW_KPI_KEYS`, so the caveat rendered on Overview too. Fix (`d5fdf8c`): a `scoped`
parameter gates it — `footnote: scoped ? spec.footnote : undefined` — with a direct regression
test calling the exact unscoped shape the reviewer flagged as missing.

**2 — Cross-feature subsection id collision.**
Mechanism: `hiddenReports` is one flat `text[]` DB column with no per-section namespace, and both
`ORGANIC_SOCIAL_SUBSECTIONS` and `PAID_MEDIA_SUBSECTIONS` are filtered through the same
`visibleSubsections`. Fix (`d5fdf8c`): Organic Social's subsection ids are namespaced
(`organic-instagram`/`organic-facebook`/`organic-linkedin`/`organic-x`).

**3 — Sidebar/route active-tab desync.**
Mechanism: the sidebar computed `activeSubsection` from the raw query param while the route
resolved the actual rendered channel through `resolveOrganicSubsection`'s hidden+allowlist
filtering — two different answers to "what's active" that could diverge on a stale or
out-of-allowlist URL. Fix (`d5fdf8c`): the sidebar now derives its active state through the same
`resolveOrganicSubsection` call the route uses.

**4 — Mobile grid orphan.**
Mechanism: only a `md:` column override existed; below that breakpoint every KPI count fell back
to a single fixed base class regardless of count. Fix (`d5fdf8c`): added `gridColsBase(n)`,
mirroring `gridColsMd`'s per-count logic at the mobile breakpoint.

**5 — Unnecessary Suspense remount.**
Mechanism: the report page's `<Suspense key>` interpolated the raw `subsection` search param;
since `resolveOrganicSubsection` can silently degrade an invalid subsection to Overview, two URLs
that render identical content (`?subsection=bogus` and no param at all) produced different keys,
forcing React to discard and remount instead of treating it as a no-op. Fix (`d5fdf8c`): the key
now uses the resolved `organicEntry?.id` for Organic Social, on both the dashboard and portal
report pages.

**6 — Template drift risk reintroduced.**
Mechanism: `ORGANIC_SOCIAL_PLATFORM_TEMPLATE` used to be a plain alias of
`ORGANIC_SOCIAL_TEMPLATE` (closed by PR #168's review specifically to prevent silent drift); M3
necessarily broke the alias to insert `follower-graph`, replacing it with an independent
hand-typed literal. Fix (`d5fdf8c`): derives the platform template from
`ORGANIC_SOCIAL_TEMPLATE.order` with `follower-graph` spliced in, restoring the "can't drift"
property without losing the insertion.

**7 — Sidebar sub-nav duplication.**
Mechanism: the new Organic Social sub-nav block structurally repeats the existing Paid Media
block. **Deferred** (see §5) — extracting a shared component touches working code across two
files (`sidebar.tsx`, `portal-sidebar.tsx`) and four other near-identical blocks; out of scope
for this PR.

**8 — KpiCard duplicate prop.**
Mechanism: `footnote` and the existing `subValue` prop rendered the identical
`<p className="mt-0.5 text-xs text-text-muted">` caption line. Fix (`d5fdf8c`): removed
`footnote`; all callers use `subValue`.

**9/11 — `getFollowerGraph`/`getEngagementTrend` overlap (two angles, one root cause).**
Mechanism: both getters run the same `dashClientFor` → `resolveTargets` → `isoRangeTz` →
`Promise.all` → GRAPH-fetch → `channelErrorPolicy` → `buildTrendSeries` pipeline per channel,
differing only in the metric requested — meaning both an extra Dash round trip per platform-
subpage view (#9) and a duplicated implementation to maintain (#11). **Deferred** (see §5):
combining the requests loses the two parts' independent Suspense/error-boundary isolation
(a Follower Graph failure currently can't take down Engagement Over Time, or vice versa), and no
call site in the repo proves the GRAPH endpoint accepts a multi-metric request the way
`TOTAL_GROUPED_METRIC` is proven to.

**10 — Follower Graph reachable on Overview via `extraParts`.**
Mechanism: `template.ts` documents `follower-graph` as platform-only in a comment, but
`lib/report-sections/validate.ts`'s `parseOverride` has no concept of channel scoping — it only
checks a pin exists in the registry and isn't already in the template. An authorized
`saveReportSectionConfig(clientSlug, 'organic-social', { extraParts: [{ id: 'follower-graph',
version: 1 }] })` would pass validation, and on the next Overview render `getFollowerGraph(slug,
dateRange, null)` — where `resolveTargets` treats `null` as "every channel" — would silently
overlay every configured channel's follower count on one chart instead of erroring or being
blocked. Not reachable via the product UI today (no admin UI calls this action with a
channel-scoped part), but the server action itself is real. Fix (`a70df7d`): guarded in
`FollowerSection` itself — `if (!channel) return null` before any fetch — rather than teaching the
generic, cross-section `validate.ts` a channel-scoping concept it has no model for anywhere else;
lower blast radius for a hole with one call site. Regression test added
(`follower-graph.golden.test.tsx`) asserting both the null render and that `getFollowerGraph` is
never called.

**12 — `pct()` duplication.**
Mechanism: `platform-headlines.tsx`'s percent branch computed `k.value.toFixed(1)` plus a
separate `suffix: '%'` KpiCard prop, duplicating the existing `pct()` helper `post-card.tsx`
already uses for the same job. Fix (`a70df7d`): collapsed to `pct(k.value)` as the single `value`
string. The DOM changes from two adjacent text nodes to one (visible in the `render-invariant`
snapshot diff), which is a formatting-only change — confirmed via that same test's
`getByText('3.5%')` assertion, unaffected by the change.

**13 — `gridCols(n)` doesn't generalize.**
Mechanism: `gridColsMd`'s fallback branch returned a fixed `md:grid-cols-4` for any count not
divisible by 3 or 5 — correct for 11 (4/4/3) but wrong for any count where `n % 4 === 1` (13, 17,
...), which produces the exact orphaned-last-row defect the function exists to avoid. Fix
(`a70df7d`): chained fallback (4→5→3→2), verified with a sweep test over n=6..25 that also
surfaced a live sibling bug in `gridColsBase` — its mobile-width branch checked `n % 5 === 0`
(true for 10, but also true for the odd 15, which still orphans a 2-column mobile grid); corrected
to the actually-safe `n % 2 === 0`. Neither fix moves any of today's four live counts, confirmed
by both the sweep test and the unchanged `platform-headlines`/`composition` golden snapshots.

**14 — `kpiFor` double lookup.**
Mechanism: `buildPlatformHeadline` computed `kpiFor(channel, key)` directly for `spec`, then again
implicitly inside `metricForKey(channel, key)` (`metricFor(kpiFor(channel, key))`). Fix
(`a70df7d`): reuses the already-resolved `spec` via `metricFor(spec)`.

---

## §5 Follow-ups (disposition)

**Correctness — fixed (highest value: 10, then 1/2/3/5/6/13 as the routing/layout cluster).**
- **10** — FIXED in `a70df7d`: null-channel guard in `FollowerSection`; regression test added.
- **1** — FIXED in `d5fdf8c`: `scoped` flag on `buildPlatformHeadline`; regression test added.
- **2** — FIXED in `d5fdf8c`: namespaced subsection ids.
- **3** — FIXED in `d5fdf8c`: sidebar highlight derives from `resolveOrganicSubsection`.
- **4** — FIXED in `d5fdf8c`: `gridColsBase` mobile-aware column count.
- **5** — FIXED in `d5fdf8c`: Suspense key uses the resolved subsection.
- **6** — FIXED in `d5fdf8c`: platform template derived from Overview's, not hand-typed.
- **13** — FIXED in `a70df7d`: generalized `gridColsMd` fallback + fixed sibling `gridColsBase`
  bug it surfaced; pinned with a sweep test.

**Cleanup — fixed.**
- **8** — FIXED in `d5fdf8c`: `KpiCard.footnote` removed in favor of `subValue`.
- **12** — FIXED in `a70df7d`: `pct()` reused instead of duplicated.
- **14** — FIXED in `a70df7d`: `kpiFor` resolved once, reused via `metricFor(spec)`.

**Deferred (agreed, non-blocking per the review itself).**
- **7** — Sidebar sub-nav duplication: extracting a shared component touches working code across
  two files and five near-identical blocks; revisit if a 6th copy appears or one needs a
  synchronized behavior change.
- **9 / 11** — `getFollowerGraph`/`getEngagementTrend` overlap: combining the requests loses
  independent Suspense/error-boundary isolation and needs a probe proving the GRAPH endpoint
  accepts multi-metric requests first; extracting the shared pipeline into a
  `fetchDailyChannelSeries` helper is the lower-risk half of this and a reasonable near-term
  follow-up on its own.

**Post-fix gate state:** `tsc --noEmit` clean; full suite **60 files / 438 tests** green; eslint
clean on every touched file. The manual `/verify` against a live, running Dash-backed app (multi-
channel client, `?section=organic-social` and `&subsection=<platform>`) is **DONE** — verified
2026-07-30 by Paul against the `integration/organic-social` Vercel preview. Nothing outstanding
gates `staging → main` from this PR.
