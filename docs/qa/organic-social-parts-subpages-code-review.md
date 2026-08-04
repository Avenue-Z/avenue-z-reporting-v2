# Organic Social — M1 (Overview → parts framework) — Code Review Record

**Scope under review:** PR [#168](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/168),
branch `feat/organic-social-parts-subpages`, diff range **`2f62cd1..862f895`** (8 commits,
`e191759`→`862f895`) — the M1 migration only, off `origin/dev` (`2f62cd1`). No unrelated code is in
scope; the branch touches only `components/report-sections/organic-social/**`, `lib/organic-social/**`,
`lib/report-sections/{registries,types}.ts`, `scripts/seed-section-templates.ts`, and `vitest.config.ts`.

**This document changes no code.** It is the comprehension gate for the merge into
`integration/organic-social`. The fixes for the findings below were applied on the feature branch as
follow-up commits (`833c144`, `4b0a5a3`) *after* this review and are cited per-finding in §5 — they are
not part of the reviewed range.

Reviewers: Paul, Thomas.

---

## §1 How it works (comprehension — where every number comes from)

M1 moves the **Overview** body of the Organic Social report from four hand-written `<Suspense>` blocks
onto the shared **parts framework** (the same one peec-ai uses). Nothing a client sees changes on
Overview; this is a structural refactor plus a fetch layer that later modules (M2/M3) can scope by
channel. The only live client, **renaissance**, has `dash_social_config = {"brandId":26952}` with **no
`channels` key**, so the scoping is inert today.

**Composition path (`components/report-sections/organic-social/index.tsx`).**
1. `buildOrganicSocialCtx({ clientSlug, dateRange, compareRange, channel })` builds a cheap, synchronous
   ctx. On Overview `channel = null`; the `compareRange` default `'previous_period'` now lives here
   (it moved out of the old `HeadlinesSection`).
2. `key = channel ? 'organic-social:platform' : 'organic-social'` — Overview uses `'organic-social'`.
3. The composition is `getSectionTemplate(key)` (a `section_templates` DB row) **or**, when no row
   exists, the in-code `CODE_TEMPLATES[key]`. No row is seeded yet (that is M4), so today it is always
   the code template: `[platform-headlines@1, engagement-trend@1, top-content@1]` — the same three
   sections, same order, as the old hardcoded body.
4. `resolveSection(template, override)` applies any per-client `reportSectionConfig[key]` override
   (renaissance has none), and each resolved part's `render(ctx)` returns a `<Suspense>` wrapping an
   **async** section component that fetches its own data. The three sections therefore stream
   independently, exactly as before.

**Where each number comes from** (all via the Dash Social API; wrappers in `lib/organic-social/`):

- **Platform Headlines** (`headlines.ts` → `getPlatformHeadlines`): one `/reports/data` request **per
  channel** (`report_type=TOTAL_GROUPED_METRIC`, `aggregate_by=BRAND`, `require_posts=true`,
  timezone-aware dates at midnight Eastern). Per-channel metric names come from `CHANNEL_METRICS`
  (`metrics.ts`) — Facebook uses the `*_V2` / `*_POSTS_V2` variants; exposure is Views for IG/FB,
  Impressions for X/LinkedIn. A value is `data[brandId].metrics[METRIC].value`; the delta badge is
  `(value − context) / context × 100` (`delta()`), pruned to `undefined` when Dash returns no prior
  context. Engagement rate is Dash's own `AVG_ENGAGEMENT_RATE` (a 0..1 fraction) ×100 — not recomputed.
- **Engagement Over Time** (`trends.ts` → `getEngagementTrend`): one `/reports/data` GRAPH request per
  channel (`time_scale=DAILY`); the daily series is `data.metrics[METRIC].ALL_CHANNELS[date]`.
  `buildTrendSeries` (`trend-series.ts`) merges the per-channel dailies into `{ points, channels }`,
  **drops any channel whose daily is null**, and preserves `CHANNELS` order. Line color is pinned per
  channel by `CHANNEL_COLOR` in the display `trends.tsx` (see finding 4).
- **Top Performing Posts** (`top-content.ts` → `getTopContent`): one Dash `media/v2` request
  (`limit: 100`). `transformTopContent` extracts caption/views/engagements/url per post and sorts by
  engagements desc; `groupByPlatform(rows, 25, allowed)` buckets rows by **display label** (`'X'`,
  `'Instagram'`, …), ordered and filtered by `allowed` (all four on Overview), capped at 25/platform.

**Channel resolution** (`metrics.ts` → `resolveChannels`): an absent/empty/null allowlist ⇒ all four
channels in `CHANNELS` order; a partial list ⇒ the matching subset (case-insensitive, unknown entries
ignored). `dashClientFor` (`base.ts`) returns `channels: DashChannel[]` from it. Overview passes
`channel = null`, so every getter's `targets` = all four = today's behavior.

**Error policy** (`onChannelError` / `onTrendChannelError`): keyed on `channel != null`. On the unscoped
Overview a failed channel is dropped (headlines) / degraded to a null series then filtered (trend) —
identical to the old inline `catch`. Scoped (single-channel) views, which arrive in M3, surface the
error instead of a misleading empty state.

**Seed** (`scripts/seed-section-templates.ts`): still insert-if-absent (`onConflictDoNothing`); M1 adds
parse-before-insert (a code constant referencing a missing/unpublished pin fails loudly before any DB
write) and a `--check` drift report. It writes **no** organic-social row — that is M4.

---

## §2 Verification method

Each finding was probed, not merely read:

- **Static anchors** confirmed at the cited `file:line` in the reviewed tree (`git show 862f895:<file>`).
- **Framework wiring** (`resolveSection` → `lookup` → `registry`) traced by hand for the Overview path,
  and **all four `OrganicSocialReport` call sites** checked (`app/{dashboard,portal}/[clientSlug]/reports/
  page.tsx` and `.../reports/[reportSlug]/page.tsx`) — none passes a `channel`, so `channel` defaults to
  `null` and the scoped branches are dormant.
- **Suite executed** green in the reviewed range (28 tests at review time across the organic-social +
  scope specs); the goldens were confirmed to snapshot the Suspense **skeleton** (mocked data modules),
  not real fetched data.
- **One candidate empirically disproved:** the hardened seed does **not** break under `tsx` the way the
  goldens break under Vitest's ESM resolver — verified by importing `REGISTRIES` with a dummy
  `DATABASE_URL` and observing the parse guard fire (`unknown part …`) before any DB access.
- **External-API triggers flagged, not asserted:** the per-channel Dash request shapes and the
  multi-metric / Data-Cache questions are recorded as runtime probes (deferred — need a live token +
  running app), not claimed as verified.

---

## §3 Findings

Sev: **●** correctness/resilience · **○** cleanup/convention.
Status: **CONFIRMED** (proven in-tree) · **PLAUSIBLE** (code assumption confirmed, external/future
trigger unverified). Locations are as-reviewed (range `2f62cd1..862f895`).

| # | Sev | Status | Location | Finding |
|---|-----|--------|----------|---------|
| 1 | ● | CONFIRMED | `components/report-sections/organic-social/index.tsx:21` | Making the view `async` with a top-level `await getSectionTemplate` (+ `getClientBySlug`) means a template/config-lookup failure blanks the **entire** section, losing the old per-section Suspense isolation. |
| 2 | ● | PLAUSIBLE | `lib/organic-social/headlines.ts:35` (also `trends.ts`, `top-content.ts`) | The scoped branch `channels.filter(c => c === channel)` renders a silent empty page when the requested channel isn't in the client's allowlist. Dormant (no caller passes `channel` until M3); untested against a real mismatch. |
| 3 | ● | CONFIRMED | `lib/organic-social/metrics.ts:35` | `resolveChannels` only guards an *empty* allowlist; an all-unknown allowlist collapses to `[]`, which (now that the value is wired in) blanks the section. Inert today (no client sets `channels`). |
| 4 | ○ | CONFIRMED | `components/report-sections/organic-social/trends.tsx:11` | The "no colors move on Overview" claim is narrower than stated: pin-by-identity diverges from the old pin-by-position whenever a middle channel drops out (null daily). Intended improvement, over-broad claim. |
| 5 | ○ | CONFIRMED | `lib/report-sections/types.ts:42` | Parts cause fetching in the subtree they return, which reads against the documented "no fetching" `render` contract and the sync peec-ai reference pattern. |
| 6 | ○ | CONFIRMED | `components/report-sections/organic-social/parts/composition.golden.test.tsx:25` | The composition golden snapshots `container.firstChild`, covering only 1 of the 3 skeletons. |
| 7 | ○ | CONFIRMED | golden test preamble (5 files) | `vi.mock('@/auth')` is copy-pasted verbatim across 5 test files; a new golden that omits it silently re-arms the next-auth/`next/server` landmine. |

---

## §4 Detail

**1 — Top-level `await` collapses per-section resilience.**
Mechanism: the old `OrganicSocialReport` was synchronous; each of the three sections did its `await`
inside its own `<Suspense>` + `safe()` boundary, so a Dash/DB hiccup degraded one section to its
fallback card. The parts view is `async` and awaits `getSectionTemplate`/`getClientBySlug` at the top,
outside any boundary — a rejection there rejects the whole component into the route `ReportErrorBoundary`,
blanking all three sections at once. This is the same shape peec-ai already ships, but it is stricter
than organic-social's prior behavior. Suggested fix: resolve the template/config defensively (fall back
to `CODE_TEMPLATES[key]` with no override on throw) so each part keeps its own boundary. Happy path
unchanged.

**2 — Scoped channel/allowlist mismatch → silent empty.**
Mechanism: on a scoped (M3) view, `targets = channels.filter(c => c === channel)`. If the routed channel
isn't in the client's resolved allowlist, `targets = []` and the section renders empty rather than a
"not available for this client" signal. Dormant in M1 (Overview always passes `channel = null`).
Suggested fix: decide the mismatch policy (404 / explicit "channel not enabled" state) and add the
getter-level test **in M3**, where the routing that produces the mismatch is built.

**3 — All-unknown allowlist collapses to `[]`.**
Mechanism: `resolveChannels` returns all four only for an absent/empty list; a non-empty list of
unsupported names filters to `[]`, and the section then has no channels to fetch. Suggested fix: treat
`[]` as the intended honest answer ("report only these unsupported channels"), and put the real safeguard
at **config-write validation** — a silent fallback to all four would mask a typo'd config. Documented
with a test.

**4 — Color invariant over-broad.**
Mechanism: old `colorFor = PALETTE[series.channels.indexOf(channel)]` colored by position; when a channel
dropped (null daily), the lines after the gap shifted palette slots. The new `CHANNEL_COLOR` map pins by
identity — byte-identical when all four channels have data, but on the drop case Overview line colors
differ from today (deliberately, toward stability). Suggested fix: none in code (the new behavior is the
intended one); correct the claim to "no **numbers** move" and record the drop-case delta in the spec.

**5 — `render` "no fetching" contract vs. the async child.**
Mechanism: `render` itself stays synchronous and does no `await` — it returns `<Suspense fallback={…}>
<AsyncSection/></Suspense>`, and the fetch happens in the async child when React renders it, behind the
boundary. This is the deliberate design that preserves per-section streaming (and is exactly what
finding 1 protects); it is not the sync peec-ai pattern (which fetches once in the parent and passes data
through ctx). Suggested fix: clarify the `types.ts` contract comment to permit the "Suspense-wrapped
async child" idiom — no architecture change.

**6 — Composition golden covers one skeleton.**
Mechanism: `container.firstChild` is the first resolved node only. Part order is still asserted separately
by `expect(resolved.map(r => r.id)).toEqual([...])` and each part has its own golden, so coverage is not
lost — but the composition snapshot is partial. Suggested fix: snapshot `container`.

**7 — Duplicated `@/auth` landmine mock.**
Mechanism: importing the parts registry reaches the `top-content` display → `DataTable` → `@/auth` →
next-auth → a bare `next/server` import that Vitest's ESM resolver can't satisfy (Next 16 has no
`exports` map; real Next builds strip `'use server'` actions from client bundles). Five test files stub
`@/auth` to dodge it; a sixth that forgets re-arms the landmine. Suggested fix: move the stub to
`vitest.setup.ts` once (safe: no test needs real `@/auth`; a file needing a specific auth overrides the
global with its own file-level `vi.mock`).

---

## §5 Follow-ups (disposition)

Bucketed; fixes were applied on the feature branch after this review (not in this doc).

**Correctness / resilience — fixed (highest value: 1).**
- **1** — FIXED in `833c144`: defensive template/config resolution in `index.tsx`; new `index.test.tsx`
  proves a thrown `getSectionTemplate` resolves (degrades) instead of rejecting. This is the finding that
  most warranted a fix before promotion.
- **3** — FIXED in `833c144`: documenting test locking the all-unknown ⇒ `[]` behavior, with the
  config-write-validation safeguard noted. (No behavior change.)

**Decide together / deferred.**
- **2** — DEFERRED to M3 (agreed): decide the scoped mismatch policy + add the getter-level test where the
  routing that passes `channel` is built. Dormant until then.

**Claim / documentation.**
- **4** — FIXED in the spec (§4.4 "Accepted delta"): the invariant is "no numbers move"; the drop-case
  color delta is now explicit. No code change.
- **5** — Clarified in `833c144`: `types.ts` contract comment now permits the Suspense-wrapped-async idiom.

**Cleanup / test hygiene — fixed.**
- **6** — FIXED in `833c144`: composition golden snapshots the whole `container` (all three skeletons).
- **7** — FIXED in `4b0a5a3`: `@/auth` stub moved to `vitest.setup.ts`; removed from all 5 files; commentary's
  own override still wins (17/17 green).

**Post-fix gate state:** `tsc --noEmit` clean; full suite **42 files / 339 tests** green; eslint clean.
Runtime probes (multi-metric `/reports/data` response; Next Data Cache behavior) and the live `/verify` of
Overview remain deferred (need a live `DASH_API_TOKEN` + running app) and should gate `staging → main`, not
this merge.
