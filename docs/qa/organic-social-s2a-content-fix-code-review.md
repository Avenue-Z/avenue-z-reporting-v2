# S2-A — Organic Social Top Content CONTENT fix — code review record

> **Scope.** Reviews module **S2-A** of the Organic Social Top Content overhaul
> (plan `docs/superpowers/plans/2026-07-23-organic-social-spec2-top-content.md`,
> tasks A1–A4). Feature branch `feat/organic-social-top-content`, cut from
> `feat/organic-social-parts-subpages` (= `integration/organic-social` + Spec 1's M1).
>
> **Diff range under review:** `4b0a5a3..974f3e9` (`03e727b^..974f3e9`) — four commits,
> no unrelated code:
> - `03e727b` feat(dash-social): add CONTENT report type + normalized TopContentPost model
> - `0905568` feat(dash-social): getContent() with mandatory limit; getReportsData emits limit
> - `7950253` feat(organic-social): fetchTopContent() via CONTENT; Facebook engagements use *_public
> - `974f3e9` feat(organic-social): route Top Content table through fetchTopContent (interim)
>
> **This document changes no code.** Every fix listed in §5 is a follow-up, tracked
> separately, not applied here. Reviewers: **Paul** and **Thomas**.

---

## §1 How it works

**The problem S2-A fixes.** Top Content previously sourced posts from the Dash
`library-backend .../media/v2` endpoint (`getMedia`, `limit: 100`), which has **no
date parameter on the query** — it returned the brand's most-recent ~100 posts and
the transform date-filtered nothing. On any *historical* window that showed **zero
in-window posts**, and it silently truncated at 100. S2-A replaces that source with
Dash's `report_type=CONTENT` report, which filters server-side by `start_date`/`end_date`.

**Where each number now comes from.**

- **The posts** — `fetchTopContent(slug, dateRange, channel)`
  ([top-content.ts:120](../../lib/organic-social/top-content.ts#L120)) issues one
  `GET /reports/data?report_type=CONTENT` per allowlisted channel via
  `DashSocialClient.getContent` ([client.ts:88](../../lib/dash-social/client.ts#L88)).
  The response is a **flat** post array under `data.content` (`ContentResponse`),
  *not* the channel-keyed `ReportsDataResponse` used elsewhere — hence the separate
  `DashContentPost`/`ContentResponse` types.
- **The per-channel metric** — `CONTENT_METRIC`
  ([content-types.ts](../../lib/organic-social/content-types.ts)) maps each channel to
  the metric that is *valid on CONTENT*: Instagram/Facebook/X → `TOTAL_ENGAGEMENTS`,
  LinkedIn → `ENGAGEMENTS_BY_POST`. Two documented traps: Facebook's KPI metric
  `TOTAL_ENGAGEMENTS_POSTS_V2` returns **400** on CONTENT, and LinkedIn `ENGAGEMENTS`
  returns a **403 "You do not have access to the topics required"** that reads like an
  entitlement error but is not — `ENGAGEMENTS_BY_POST` is the working metric.
- **`limit` is mandatory** — omitted, CONTENT returns only **6 posts**. `getContent`
  always sends `limit` (fetchTopContent passes `500`, ~16× headroom over the largest
  channel's true set of 31). `getContent` also **never** sends `aggregate_by`, which
  returns **0 items** on CONTENT. Both are pinned by query-string unit tests
  ([content.test.ts](../../lib/dash-social/content.test.ts)).
- **Engagements** — `normalizePost`
  ([top-content.ts:91](../../lib/organic-social/top-content.ts#L91)) reads the
  **`total_engagements_public`** variant (excludes post clicks), matching what Dash's
  own card displays. The prior code read `fb.organic_engagements` for Facebook — a
  Facebook-only bug producing an inflated number; this is the corrected read.
- **Ranking** — posts are flattened across channels and sorted **descending by
  `engagements`**. The interim table then groups them per platform via M1's
  `groupByPlatform(rows, 25, allowed)`.

**Scoped vs Overview error policy** (inherited from M1, spec 1 §4.3): a single-channel
("scoped") view **re-throws** a channel's error so the section surfaces it; the
Overview (channel `null`) **drops** a failing channel (`return []`) so one bad channel
doesn't blank the whole section
([top-content.ts:139–141](../../lib/organic-social/top-content.ts#L139)).

**Interim rendering** — S2-A ships correct *data* through the *existing* table. The
card gallery is S2-C. `getTopContent` is now a thin adapter: `fetchTopContent` →
`toTopContentRows` → `groupByPlatform`. The old `media/v2` path (`getMedia`,
`transformTopContent`, `metricsFor`) is bypassed but **left in place** (surgical-changes
rule; `getMedia` is earmarked for S2-B's Instagram UGC path).

---

## §2 Verification method

- **Static anchors** — every `file:line` in §3/§4 was confirmed against the branch
  working tree at the stated line.
- **Executed logic** — the query-string contract (`limit` present, `aggregate_by`
  absent, `report_type=CONTENT`, single channel+metric) and the normalized model
  (including the Facebook `*_public` engagement fix and carousel media-type/media-group
  handling) are proven by unit tests, not just read:
  `npx vitest run lib/organic-social lib/dash-social/content.test.ts` → **30 passed**.
  Full suite `npx vitest run` → **346 passed (44 files)**; `npx tsc --noEmit` clean.
- **M1 non-regression** — the M1 golden/composition/guard tests for the `top-content`
  part still pass; they `vi.mock('@/lib/organic-social/top-content')`, so this internal
  rewrite is invisible to them (confirmed by run, not assumption).
- **External-API triggers are flagged, not asserted.** Every claim that depends on the
  live Dash API — that a historical window now renders in-window posts, that per-channel
  counts equal Dash (IG 19 · FB 26 · LI 31 · X 29), that post `699150694` displays `2`
  not `3`, and *which* engagement-rate field Dash's card uses — is **unverified in-tree**
  and is the subject of task A5's live `/verify`. Findings below mark these PLAUSIBLE.

---

## §3 Findings

Sev: **●** correctness · **○** cleanup/convention.
Status: **CONFIRMED** (proven in-tree) · **PLAUSIBLE** (code assumption confirmed,
external trigger unverified).

| # | Sev | Status | Location | Finding |
|---|-----|--------|----------|---------|
| 1 | ● | CONFIRMED | [top-content.ts:151](../../lib/organic-social/top-content.ts#L151) + `components/report-sections/organic-social/top-content.tsx:11,20,36` | Interim table keeps its **"Views / Impr." column and "Top 5 by Views" sort**, but `toTopContentRows` sets `views: 0` for every row (CONTENT has no media/v2 views metric) — the interim table now shows an all-zero Views column and a meaningless by-Views tab until S2-C's gallery replaces it. |
| 2 | ● | PLAUSIBLE | [top-content.ts:95](../../lib/organic-social/top-content.ts#L95) | Engagement-**rate** variant `engagement_rate_public` is an **unverified prior** (spec 2 §3.2). It is *not displayed* in the interim table, so it is dormant in S2-A — but it must be confirmed against the Dash UI before S2-C's card ships (gate C1). |
| 3 | ● | PLAUSIBLE | whole module | Core correctness — historical windows render in-window posts; per-channel counts match Dash; FB `*_public` value — is verified against Dash **only in A5's live `/verify`**, not yet run. This is the ship gate for S2-A. |
| 4 | ○ | CONFIRMED | [top-content.ts:141](../../lib/organic-social/top-content.ts#L141) | Overview **silently drops** a failing channel (`return []`) with no log/telemetry. Intended per M1 (spec 1 §4.3), but a channel-wide Dash outage would look like "that platform had no posts." |
| 5 | ○ | PLAUSIBLE | [top-content.ts:136](../../lib/organic-social/top-content.ts#L136) | `limit: 500` is a **hard cap with no pagination and no log** on truncation. Safe today (largest true set is 31), but a future high-volume channel/window would silently truncate. |
| 6 | ○ | CONFIRMED | [top-content.ts:96](../../lib/organic-social/top-content.ts#L96) | Unknown `post.type` falls back to `'IMAGE'`. Benign in S2-A (mediaType is unused by the interim table) but will mis-badge in S2-C's carousel/video card if an unexpected type appears. |
| 7 | ○ | PLAUSIBLE | [fetch-top-content.test.ts:7](../../lib/organic-social/fetch-top-content.test.ts#L7) | The `total_engagements_public` field name is pinned by a **hand-authored** fixture, not a captured Dash response. Confirmed only in the spec's live probe; a captured fixture would harden it (S2-B/C capture fixtures anyway). |

---

## §4 Detail

**#1 — Interim table's Views column/sort is now all zeros.**
`components/report-sections/organic-social/top-content.tsx` renders a `Views / Impr.`
column (`viewsRaw` sort key) and a `Top 5 by Views / Impressions` toggle. A4's
`toTopContentRows` hard-codes `views: 0` because CONTENT does not carry the media/v2
views/reach fields the old `metricsFor` read. Requirements Change 3 *drops* Views from
the final metric set, and S2-C removes this table entirely — but **S2-A ships alone**,
so in the interim window a client sees a zero-filled column and a sort that does nothing.
*Suggested fix (decide together):* for the interim window only, hide the Views column and
the by-Views toggle in `top-content.tsx` (rank by engagements only), or explicitly accept
the cosmetic gap and note it on the PR since S2-C supersedes it. This is the
highest-value follow-up because it is the one client-visible artifact of S2-A.

**#2 — Engagement-rate variant is an unconfirmed prior.**
`normalizePost` reads `sub?.engagement_rate_public`. The spec flags three candidates
(`engagement_rate_public`, `_impressions`, `_views`) with none compared to the Dash UI.
The interim table does not display rate, so this cannot be wrong *in S2-A*. It becomes a
correctness issue at S2-C. *Suggested fix:* keep as-is for S2-A; resolve in A5 Step 4 /
C1 (record the matching field in the spec appendix), then align the read if it differs.

**#3 — Live reconciliation outstanding.**
The value of S2-A is that historical ranges stop showing zero in-window posts and that
the numbers equal Dash. That is a live-API claim and is unproven in-tree by design.
*Suggested fix:* run A5 (`/verify` a fixed past month for `renaissance`; reconcile
per-channel counts against Dash's Top Performing Posts; confirm FB `699150694` = `2`).
Blocks merge.

**#4 — Silent channel drop in Overview.**
The `catch` returns `[]` for the non-scoped path. This is the agreed M1 resilience
policy, so it is not a defect — noting it so that if a client asks "why did Instagram
show nothing last month," the answer (a dropped channel error vs a genuinely empty
window) is not currently distinguishable without logs. *Suggested fix (optional):* add a
server-side `console.warn`/telemetry on the dropped-channel branch.

**#5 — `limit: 500` bounded assumption.**
No pagination; a window exceeding 500 posts on one channel would truncate silently.
16× current headroom. *Suggested fix (optional):* log when `data.content.length === 500`
(the "we may have hit the cap" signal), or revisit if a high-volume brand is onboarded.

**#6 — mediaType fallback.**
`MEDIA_TYPES.has(post.type) ? post.type : 'IMAGE'`. Correct for the known set; the
fallback is the safe default. Flagged because S2-C's card uses `mediaType` for the
carousel badge, where a mislabel would be visible. *Suggested fix:* revisit in C3/C7
against the captured creative fixture.

**#7 — Synthetic engagement fixture.**
`fbPost` in the test is hand-built to encode `total_engagements: 3` /
`total_engagements_public: 2`. It proves `normalizePost` reads the right *key*, but the
key itself is asserted from the spec's live probe, not a committed Dash response.
*Suggested fix:* none required for S2-A; S2-B (B7) and S2-C (C2) commit real captured
fixtures that will incidentally harden this.

---

## §5 Follow-ups

Tracked separately; **not** applied in this review.

**Decide together (highest value — blocks a clean interim ship):**
- **#1** — interim Views column/sort is all zeros. Choose: hide it for the interim
  window, or accept-and-note (S2-C removes the table). Whichever is chosen, it belongs on
  the S2-A PR, not deferred silently.

**Needs a live call first (blocks merge):**
- **#3** — run A5 `/verify` (historical window + per-channel Dash reconciliation + FB
  `699150694` value).
- **#2** — record the engagement-rate variant that matches the Dash card (A5 Step 4),
  unblocking C1. (Does not block S2-A merge on its own, since rate is not displayed here,
  but must be captured while doing A5.)

**Correctness (later modules):**
- **#6** — verify mediaType against the real creative fixture in C3/C7.

**Cleanup (optional, non-blocking):**
- **#4** — optional dropped-channel telemetry.
- **#5** — optional truncation log at `length === 500`.
- **#7** — real captured fixture (arrives naturally in B7/C2).

**Newly-orphaned by S2-A** (left in place per surgical-changes rule — reviewer decides
whether to prune now or when S2-B lands):
- `DashSocialClient.getMedia` ([client.ts:88](../../lib/dash-social/client.ts#L88)) — no
  callers after A4; the plan earmarks it for S2-B's Instagram UGC path.
- `transformTopContent` / `metricsFor`
  ([top-content.ts:20](../../lib/organic-social/top-content.ts#L20)) — now only reached by
  `top-content.test.ts`.

---

## §6 Post-review update (2026-07-24 — independent review + live probe)

An independent review pass plus a **live CONTENT probe** (brand 26952, window
2026-04-01..2026-07-24) resolved several items:

- **NEW ● CONFIRMED → FIXED — per-channel engagement field.** The engagement value is keyed
  under a **different field per channel** on CONTENT; only Facebook uses
  `total_engagements_public`. Reading that key uniformly returned **0 for Instagram,
  LinkedIn, and X** via `n()`'s falsy fallback — **live-confirmed** on the page (engagement
  `0` everywhere except Facebook). This was the review's most-severe finding and was broader
  than first flagged (Instagram too, not just LinkedIn/X). **Fixed** by
  `CONTENT_ENGAGEMENT_FIELD` (`content-types.ts`) read per-channel in `normalizePost`: IG
  `engagements_public`, FB `total_engagements_public`, LI/X `engagements`. Regression tests
  added for IG (must ignore a stray `total_engagements_public`), LinkedIn, and X.
  *(Supersedes the old finding #7: the field is now confirmed against live data, not synthetic.)*
- **#1 Views column — RESOLVED as accept-and-note (owner decision).** The interim all-zero
  Views column/toggle stays; S2-C removes the table. Documented here and on the PR; no code change.
- **Test-coverage gap — CLOSED.** Added `fetch-top-content.orchestration.test.ts` (cross-channel
  fan-out + sort, Overview drops a failing channel, scoped re-throw, scoped queries only its
  channel with the right metric+limit) and the LinkedIn/X `normalizePost` tests above.
- **Efficiency — FIXED.** `dashClientFor` is now `React.cache`-wrapped, so `getTopContent`
  resolves the client/channels once, not twice.
- **#2 engagement-RATE variant — still open, now known to be per-channel too.** The probe shows
  `engagement_rate_public` exists on IG/FB but **not** LinkedIn/X (which expose `engagement_rate`).
  Dormant in S2-A (rate isn't displayed). C1 must map the rate field **per channel**, not assume
  one key. Recorded for A5 Step 4 / C1.
- **Still blocks merge:** the live A5 `/verify` — now especially confirming LinkedIn/X show real
  non-zero engagement and reconcile against Dash's card values (and whether X should use
  `engagements` vs `engagements_organic` when a post has paid).

### Views / Impressions — kept, not dropped (owner decision, 2026-07-24)

The interim `Views / Impr.` column read `0` (finding #1). On review of the source, **dropping
Views was never a stakeholder decision** — Change 3 (requirements) asked only to *show the
creative*, and Tina's note on the metric breakdown was *"a metric breakdown would be interesting,
but show a proposal first."* The S2-C card's three-metric list (Effectiveness · Engagement Rate ·
Engagements) was a **design proposal mirroring Dash's card**, which happens to omit impressions.
Owner decision: **keep Views/Impressions.**

- **Interim table — populated.** `TopContentPost.metrics` gains `impressions`; `normalizePost`
  reads it per channel via `CONTENT_IMPRESSIONS_FIELD` (all four channels expose `impressions`;
  kept as a per-channel map for future narrowing, e.g. FB `organic_impressions` / X
  `impressions_organic`). `toTopContentRows` maps it to the row's `views`, so the column shows
  real numbers. Per-channel tests added.
- **Definition caveat.** Unlike engagements, **Dash's card shows no impressions figure**, so there
  is no Dash-card value to reconcile against — A5 sanity-checks magnitude only. The exact
  "impressions vs reach vs video-views" definition (and per-post-type behaviour) is a **proposal
  for Tina**, not a matched number.
- **S2-C follow-up (forward note — the S2-C design doc lives on the `docs/…-parts-spec` branch,
  not this PR):** add **Impressions** to the S2-C card metric list and to the proposal Tina signs
  off on, so the card carries Effectiveness · Engagement Rate · Engagements · **Impressions**.
