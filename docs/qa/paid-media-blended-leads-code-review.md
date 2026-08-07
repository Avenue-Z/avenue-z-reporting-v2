# Paid Media — blended Leads/CPL + null-safe Cost per Lead — code review record

> **Scope.** PR **#204** (`feat/paid-media-blended-leads` → `dev`). Re-adds blended
> **Leads / Cost-per-lead** to the Paid Media Overview, then — as a direct result of this
> review — **scraps that metric again** and lands the uncontroversial remainder: null-safe
> Cost per Lead everywhere, prior-period deltas on the Overview tiles, and a daily blended
> trend chart. Reads first: spec `docs/superpowers/specs/2026-08-06-paid-media-blended-leads-design.md`,
> plan `docs/superpowers/plans/2026-08-06-paid-media-blended-leads.md`.
>
> **Diff range under review:** `440167d..b2ba3fa` (39 files). Key commits: `374d725`/`9a59634`
> costPerLead + money-KPI null convention · `2d19330`/`e83f627`/`ca88c77` per-channel `—` · the
> blended-leads add (`3307c98`/`7f40610`) then its **revert** (`b2ba3fa`) · `b7e5764` CPL-sort /
> date-validity / KpiGrid guard fixes · `539f69b`/`b77dac8` compare-gating · the KPI-delta
> (`99ec728`/`a79109a`/`d6f15a5`) and UI-iteration/trend (`b006c7d`/`351f0fd`/`8c9d848`) stacks.
>
> **This document changes no code.** Reviewer: **Thomas** (adversarial 4-dimension pass +
> per-finding hand-verification, rounds 3–4; round 4 **APPROVED**). Paul co-reviewing.

---

## §1 How it works

The Paid Media **Overview** rolls three per-channel KPI fetchers up into a blended top line and
a per-channel breakdown; a separate daily trend chart plots each channel over time.

- **Per-channel KPIs** — `getPaidSearchKpis`, `getMetaKpis`, `getLinkedInKpis` each fetch a
  current-period query plus, when a `compareRange` resolves, a **best-effort** prior-period query
  (`.catch(() => null)` — `lib/meta/kpis.ts:101`, `lib/paid-search/kpis.ts:58-59`,
  `lib/linkedin/kpis.ts:99`). A failed *compare* drops the delta + `compareValue` but keeps the
  current values; a failed *current* query fails the channel. Each returns a `Kpi[]` carrying
  `value`, `delta`, `compareValue`.
- **Blended Spend / Clicks** (`getPaidMediaOverview`, `lib/paid-media/overview.ts`) — sums Spend and
  Clicks over **every channel the client is configured for** (Paid Search `cost`/`clicks`, Meta
  `spend`/**`linkClicks`**, LinkedIn `spend`/`clicks`), so "Blended Spend" equals total paid spend.
  Gate (`allOk`, `overview.ts:174-177`): the blend is `null` → renders `—` **unless every
  *configured* channel reports**. A channel the client does not run is excluded from the gate and
  the sum entirely, so its absence never blanks or lowers the total (`configured` flags from
  `getClientBySlug`, `overview.ts:113-117`); only a *configured* channel that fails blanks it.
- **Shape-drift guard** (`readKpi`, `overview.ts:57-61`, gate at `:145`) — an **absent** expected
  KPI key (metric renamed upstream) returns `null` and fails the channel, rather than coercing to a
  silent `0` that would understate the confident-looking total. A present-but-empty value is genuine
  `0`. Meta has **no `leadsKey`** by construction (`overview.ts:86`), so its null leads is expected,
  not a drift.
- **No blended Leads / Cost-per-lead** (`overview.ts:101-105`, doc comment) — **scrapped**
  (2026-08-06, re-affirming the 2026-08-04 team decision). Meta has no lead data and LinkedIn reports
  0 leads today (landing-page traffic), so a blended lead figure would mislead and a blended CPL would
  charge lead-less spend against Paid Search's leads. **Per-channel** Leads still show for Paid Search
  and LinkedIn; Meta shows `—`.
- **Prior-period deltas** — per-channel deltas come straight off each `Kpi.delta`. The **blended**
  delta sums each channel's `compareValue` over the same all-configured base and is `undefined`
  unless the value is available **and** every contributing channel has a defined prior
  (all-or-nothing, `overview.ts:181-189`) — value-shows / delta-hides.
- **Null-safe Cost per Lead** — a 0-lead denominator makes CPL undefined; rendering `$0.00` wrongly
  implies free leads, so it renders `—` instead. Two mechanisms: the `costPerLead(cost, leads)` table
  helper (`lib/paid-media/format.ts:21-23`) for Paid Search campaign/keyword + LinkedIn creative
  cells, and a money-KPI `null → —` convention in the shared `KpiGrid` (`kpi-grid.tsx:11-17`) for
  the Paid Search / LinkedIn KPI tiles. A legitimate `$0.00` (cost 0, leads > 0) still renders `$0.00`.
- **Blended trend** (`getPaidMediaTrend`/`blendDaily`, `lib/paid-media/trend.ts`) — per-channel daily
  series merged into date-keyed points, aligned by **date string** never array index
  (`trend.ts:15-28`), at daily granularity to match Organic Social. Dates are validated by
  **calendar round-trip** (`isValidDate`, `trend.ts:36-43`) and LinkedIn's lowercase `date` key is
  handled (`trend.ts:48`).

## §2 Verification method

- Static anchors confirmed at the cited lines. Pure logic executed: `npx vitest run` →
  **560 passed (88 files)**; `npx tsc --noEmit` clean; `check:rsc` clean per the PR.
- The rollup gate (all-or-nothing over *configured* channels, shape-drift → fail, non-run channel
  excluded) is unit-tested with the three fetchers + `getClientBySlug` mocked
  (`lib/paid-media/overview.test.ts`). The null-safe CPL convention, the LinkedIn CPL sort, the
  date-validity round-trip, and the date-keyed blend are each unit-tested. The best-effort
  compare-failure path is tested per channel (LinkedIn `kpis.dash.test.ts`; Meta + Paid Search added
  as a review follow-up).
- The blended-Leads/CPL revert was verified by asserting the keys are **absent** from the rollup
  output (`overview.test.ts` — `'blendedLeads' in o` is false), not merely zeroed.
- Deferred to a live call (flagged, not asserted): that Renaissance's LinkedIn connection actually
  returns data before `paid-media` is enabled for it; the external Supermetrics trend responses.

## §3 Findings

Sev: **●** correctness / governance · **○** cleanup/convention.
Status: RESOLVED / FIXED (proven in-tree at `b2ba3fa`) · OPEN · CONFIRMED · PLAUSIBLE.

| # | Sev | Status | Location | Finding |
|---|-----|--------|----------|---------|
| 1 | ● | RESOLVED | spec `2026-08-06-paid-media-blended-leads-design.md:209` | **GATE — re-adding a dropped, closed decision.** Blended Leads/CPL renders on the client portal; the team had decided (2026-08-04, RESOLVED 1) to permanently drop it. Reversal rested on the builder's investigation, not a cited Dianna/Amir/Greg sign-off. **Cleared by scrapping the metric** — nothing to approve; governance doc updated to "stays dropped." |
| 2 | ● | RESOLVED | `lib/paid-media/overview.ts` | **GATE — lead source.** Blended leads came from ad platforms (PS `leads` + LinkedIn `oneClickLeads`); Dianna's item 3 `[p]` said leads should come from **HubSpot**, spend across all platforms. A stakeholder-owned definitional change. **Moot** — no blended lead figure ships; per-channel Leads unchanged from the #188 baseline. |
| 3 | ● | RESOLVED | `overview/index.tsx` (headline) | **Headline didn't reconcile** — Spend summed all channels incl. Meta, CPL denominator excluded Meta spend, so `Spend ÷ Leads ≠ CPL` when Meta spends (probed: $320 vs $160). **Resolved** — no CPL tile; blended Spend/Clicks now sum all configured channels. |
| 4 | ● | RESOLVED | `lib/paid-media/overview.ts` | **LinkedIn 0-lead spend inflated CPL** — blended CPL charged LinkedIn's (0-lead) spend against Paid Search's leads. **Resolved** — no blended CPL. |
| 5 | ● | RESOLVED | `lib/paid-media/overview.ts` | **Independent failure gates** — the leads gate was independent of the Spend/Clicks gate, so a failed Meta could show Spend `—` beside a live CPL. **Resolved** — one all-or-nothing gate over configured channels (`overview.ts:174-177`); no separate CPL gate. |
| 6 | ● | FIXED | `linkedin-ads/creative-table-client.tsx:42-43` | **CPL sort bug** — leadless rows stored `costPerLead = 0` and sorted as the *cheapest*, though the column shows `—`. **Fixed** — `sortValue` returns `Infinity` for `leads === 0` so they sort last (asc), matching the `—`. |
| 7 | ● | FIXED | `lib/paid-media/trend.ts:36-43` | **Ineffective date validation** — shape + finiteness accepted rollover dates (`2026-02-30` → Mar 2), silently mis-bucketing a row. **Fixed** — calendar round-trip `d.toISOString().slice(0,10) === date`. |
| 8 | ● | OPEN (decision) | `overview/index.tsx`; `components/charts/line-chart.tsx` | **Scope / blast radius.** PR bundles a net-new blended trend chart + Overview UI restyle outside the stated leads scope. The shared `AreaChart` change (~15 sections) was **reverted entirely**, shrinking the radius; the trend + restyle remain in-PR. **Decision:** split them into a follow-up PR, or accept in-scope. |
| 9 | ○ | OPEN | `scripts/seed.ts:114` | **Seed reconciliation half-done.** Renaissance `linkedinConfig` added, but `enabledReports` (`paid-media`) reconciliation deferred to a manual live-DB check. Once LinkedIn is configured the Overview fetches it (0 leads today) — and a LinkedIn *fetch failure* would blank the whole blend (finding 5's gate). **Confirm the LinkedIn connection returns data before enabling.** |
| 10 | ○ | RESOLVED | `paid-search/kpi-grid.tsx:11-17` | **KpiGrid string guard.** The money path keeps `k.value == null ? DASH : typeof number ? money() : String()`, so a string-valued money KPI is not passed to `money()` and mangled. |
| 11 | ○ | RESOLVED | `lib/paid-media/overview.test.ts` | **Test mock field names** aligned to the real `paidSearchConfig`/`metaConfig`/`linkedinConfig` shapes. |
| 12 | ○ | OPEN → addressed in follow-up | `lib/meta/kpis.test.ts`, `lib/paid-search/kpis.test.ts`, `lib/paid-media/overview.test.ts` | **Round-4 optional test coverage.** (a) The best-effort compare-failure path was tested for LinkedIn only, though Meta + Paid Search carry the same `.catch`; (b) the all-or-nothing prior test asserted the delta hides but not that the blended **value** survives. Non-blocking. Implemented in follow-up `fix/pr-204-review-followups` (`db69c8c`). |

## §4 Detail

**#1–#5 (governance + lead correctness).** All five collapse to one decision: the blended Leads/CPL
metric was scrapped (`b2ba3fa`). The revert is proven by the rollup output omitting the keys
(`overview.test.ts` asserts `'blendedLeads' in o === false`), and blended Spend/Clicks now sum every
configured channel so "Blended Spend" is honest total paid spend. *No live call or stakeholder
sign-off is required to merge*, because the client-facing lead figure no longer exists.

**#6 (CPL sort).** The display already showed `—` for 0-lead creatives, but the comparator keyed off
the stored `0`. `sortValue(item, 'costPerLead')` now returns `Infinity` when `item.leads === 0`
(`creative-table-client.tsx:42-43`), ranking those rows last in an ascending sort — consistent with
the `—`. *Fix landed; unit-tested.*

**#7 (date validity).** `isValidDate` re-serialises the parsed date and compares to the input, so any
date JS rolled over is rejected before it reaches `blendDaily` (`trend.ts:41-42`). Low trigger
likelihood (Supermetrics returns valid dates) but now correct as the commit claimed. *Fix landed.*

**#8 (scope).** The stakeholder-sensitive metric is gone, so the residual out-of-scope work is the
by-channel card restyle + the daily trend chart. The highest-risk piece — the shared `AreaChart`
signature — was reverted, so the blast radius is contained. *Decision for Paul/Thomas:* split the
trend + restyle into their own PR for isolated review, or accept them here.

**#9 (seed).** `linkedinConfig` (account `503368877`) is added to reconcile `seed.ts` with the live
DB, but enabling `paid-media` for Renaissance is left to a human live-DB check. *Fix:* before enabling,
confirm the LinkedIn query returns rows — a failure would null the blend for Renaissance (finding 5).

**#12 (test coverage).** *Fix:* mirror the LinkedIn compare-failure test in `lib/meta/kpis.test.ts`
and `lib/paid-search/kpis.test.ts` (reject the compare query; assert current values present,
delta/`compareValue` undefined), and assert `blendedSpend`/`blendedClicks` survive in the
all-or-nothing prior test. Done in the follow-up commit; both suites green.

## §5 Follow-ups

**Correctness — landed in this PR (verify at merge):**
- **#6** CPL sort → `Infinity` for leadless rows · **#7** calendar-round-trip date validity.

**Decide together (not code):**
- **#8** — split the blended trend + by-channel restyle into a follow-up PR, or keep in-scope.
- **#1/#2** — although the metric is dropped, loop Dianna in for staging QA / awareness of the
  Overview (she reverses no decision now, but should see the restyle).

**Needs a live call first:**
- **#9** — confirm Renaissance's LinkedIn connection returns data, then reconcile `enabledReports`
  (`paid-media`) in the live DB. Until then, leaving `paid-media` off for Renaissance is safe.

**Cleanup (non-blocking):**
- **#12** — Meta + Paid Search compare-failure tests and the blended-value assertion
  (implemented in `fix/pr-204-review-followups` `db69c8c`).
