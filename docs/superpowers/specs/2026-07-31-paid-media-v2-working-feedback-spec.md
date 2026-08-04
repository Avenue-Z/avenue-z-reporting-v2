# Paid Media v2 Working Feedback — Spec

**Status:** working spec for handoff to Paul
**Branch:** `feat/paid-media-v2-working-feedback` (off `dev`)
**Author:** Thomas (builder) — executing stakeholder decisions, not making them
**Date:** 2026-07-31

## Source of truth

The single source of truth is the Google Doc **"Paid Media Reporting Dashboard v2"**
(id `1WNa3zDAkFss3Cx5EYBrfENJnYfOZOX-PfWqdbVLXyMQ`), tab **"Decisions for Approval — Paid Media"**,
and its 20 comment threads. Stakeholders (Dianna Gatto, Amir Eldick, Greg Huepler, Tina Fleming)
left the decisions there. Everything in this spec traces to a specific anchor in that doc:
an **item number** (1–11), a **comment letter** (`[a]`–`[ah]`), or a **line** in the verbatim capture.

Verbatim captures already in the repo (do not re-derive):
- `docs/official-feedback/paid-media-v2-doc2-decisions-scorecard.md` — 1:1 map of the Decisions tab.
- `docs/official-feedback/paid-media-v2-doc1-questions-scorecard.md` — 1:1 map of the older Q&A tab (historical record, not current decisions).
- `docs/official-feedback/paid-media-v2-merged-worklist.md` — the derived build list.

**No assumptions.** Where the doc is silent or ambiguous, this spec does not invent an answer.
It routes the gap to the stakeholder who owns it (see §2 Blockers). Nothing in the buildable
scope (§4) rests on an assumption.

---

## 1. What this delivers (grounded scope)

A working iteration of the **Paid Media** reporting tab, covering every decision in the
"Decisions for Approval" tab that is buildable today, plus the Cost/LPV fix (PR #180) folded in.
Applies to **both** the internal dashboard and the client portal (item 11e, line 229).

Buckets:
- **A. Overview subpage** — new rollup subpage; default landing; no commentary box (items 1, 2, 4, 5, 6, 11a, 11b).
- **B. Paid Search tables** — totals on all tables; keyword ≥10-clicks filter (items 7, 8, 9, 10, 11c).
- **C. Meta + precision** — Cost/LPV fix (#180); cents within Paid Media; Meta link-clicks labeling (items 2, 11d, 13).
- **D. Cross-cutting** — dashboard + portal parity; RSC boundary; enabledReports gating.

---

## 2. Blockers & needs-attention (READ FIRST — some need answers today)

Time-critical items are marked. "Owner" is who must answer; it is a stakeholder question, not the builder's call.

### 🔴 BLOCKER 1 — "a HubSpot lead attributed to AVZ" is undefined (gates blended Leads & Cost-per-lead)
- **Doc:** item 3, comment `[p]` (Dianna): blended Cost per lead = *"spend across all platforms / hubspot leads attributed to AVZ."*
- **Gap:** the doc never defines which HubSpot figure counts as "a lead attributed to AVZ." The code exposes several non-equivalent candidates (`getContactStatsForRange` created-contacts, `getLifecyclestageCounts` `lifecyclestage='lead'`, ICP contacts) in `lib/hubspot/client.ts:881-926,1087-1125`. Separately, **no Paid Media client has HubSpot connected** (`renaissance.hubspotTokenEnvVar = null`, `scripts/seed.ts:78`), and the HubSpot integration is hardwired to Avenue Z (pipeline `714699412`, ICP/MCP buckets, fixed 2025/26 windows), so there is no generic per-client "leads in range" path.
- **Effect:** blended **Leads** and **Cost-per-lead** cannot be built until this is answered. The doc itself acknowledges this state (item 1: *"the Overview can't show Leads or Cost per lead ... until it's answered"*).
- **Interim behavior (grounded, not a product choice):** the Overview ships with blended **Spend** and **Clicks** only. Leads and Cost-per-lead are **omitted from the Overview** (not rendered as blank `—` tiles) because the defining fact is missing.
- **Decision (2026-08-04, Paul).** HubSpot lead attribution is confirmed **not obtainable right now** (no per-client HubSpot path exists; the integration is Avenue-Z-hardwired). Two consequences:
  1. **Now:** the Leads and Cost-per-lead tiles are dropped from the Overview UI rather than shown blank, so a client is not presented two permanently empty headline metrics. `getPaidMediaOverview` still returns `leads: null` / `costPerLead: null`, so the data contract and tests are unchanged and re-adding is a UI-only change.
  2. **Eventual answer (option 3).** Source blended Leads from **paid-conversion actions** (Google Ads / Meta / LinkedIn conversion actions — the same lead-action data that already powers Paid Search "Total Leads" / "Leads by Action" in `lib/paid-search/leads.ts`), with blended Cost-per-lead = blended Spend ÷ those leads. This is a *different definition* than "HubSpot leads attributed to AVZ" and needs Dianna's sign-off before build. The definition question is written up in `docs/official-feedback/paid-media-v2-leads-cpl-definition-question.md`.
- **Owner:** Dianna. Still gates the headline Leads/CPL metric, but no longer blocks the Overview from shipping (the tiles are simply absent until answered).

### 🟠 NEEDS ANSWER 2 — what counts as a "missing channel" (item 4)
- **Doc:** item 4, comment `[r]` (Dianna): *"a missing channel should make the whole total unavailable."* The doc calls a missing channel *"the normal case, not an edge case"* (line 157).
- **Gap:** "missing" is not defined as (a) a channel that errors/is disconnected vs (b) a channel the client simply does not run.
- **Interim behavior (literal reading, implemented):** the blended Spend/Clicks total shows `—` unless **all three** channels (Paid Search, Meta, LinkedIn) report. The per-channel breakdown still shows what is present.
- **Flag:** taken literally this makes the blended total unavailable for any client not running all three channels. Confirm the intended trigger.
- **Owner:** Dianna.

### 🟡 VERIFY BEFORE SHIP 3 — Cost/LPV source basis (item 13 / Q&A Req 4)
- **Doc:** Q&A Req 4, comment `[i]` (Greg): Cost/LPV = *Spend ÷ Landing Page Views.*
- **Gap:** the KPI card and per-ad leaf rows read Supermetrics' native `cost_per_landing_page_view` field; only the aggregate rows literally divide `spend / lpv` (`lib/meta/kpis.ts:50-57`, `lib/meta/creative.ts:23,50`). #180 fixes the rounding but keeps the native-field basis on KPI/leaf. Whether the native field equals `spend ÷ lpv` was never verified (no Supermetrics key in this environment).
- **Action:** verify against one live Supermetrics pull; if they differ, switch KPI/leaf to compute `spend ÷ lpv` to match Greg's formula.
- **Owner:** engineering (Paul), needs a live call.

### 🟡 VERIFY BEFORE SHIP 4 — Region plain-sum double-count (item 9)
- **Doc:** item 9 (line 209): *"we'd sum plainly and check it against live data before building"*; comment `[z]`; and Amir (line 237): *"if it is coming from Google Ads, it should only define one DMA per conversion."*
- **Action:** spot-check live Google Ads data confirms one DMA per conversion before relying on the plain sum. Low risk (Amir confirmed), but the doc explicitly asks for the check.
- **Owner:** engineering (Paul).

### ✅ RESOLVED 5 — #180's lib tests now run in CI
- PR #180 had added `lib/meta/kpis.test.ts` and `lib/meta/creative.test.ts` as `node:assert` scripts that ran nowhere. **Fixed on this branch (`9ae73e9`):** both converted to vitest suites and added to the `vitest.config.ts` include, so #180's Cost/LPV fix is now fully gated (7 lib tests + the component test). The pre-existing `lib/meta/base.test.ts` / `geo.test.ts` node-assert files are left as-is (out of scope).

### ⚪ Housekeeping
- `docs/official-feedback/paid-media-v2-merged-worklist.md` still lists Cost/LPV (E1/Req 4) as "ready to build"; it is now folded in via #180. Update the worklist status.

---

## 3. Requirement → design traceability matrix

Every row cites its doc anchor. Status: **BUILD** (grounded, buildable now) / **BLOCKED** (needs a §2 answer) / **DONE** (folded in).

| # | Decision (anchor) | Resolver | Design | Status |
|---|---|---|---|---|
| 1 | Hold Meta Leads & Cost-per-lead (item 1, `[l]`) | Greg | Meta has no leads field; not surfaced. Blended Leads/CPL deferred (Blocker 1). | BUILD (no-op) |
| 2 | Keep Meta **link clicks**, label it (item 2, `[n]`) | Dianna | Meta stays link clicks (already labeled "Link Clicks", `lib/meta/kpis.ts:35-38`). Blended clicks sums all three and labels the Meta definition. | BUILD |
| 3 | Blended CPL = total spend ÷ **HubSpot** leads attributed to AVZ (item 3, `[p]`) | Dianna | See Blocker 1. Formula recorded verbatim for the follow-up. | BLOCKED |
| 4 | Missing channel → **whole total unavailable** (item 4, `[r]`) | Dianna | Blended Spend/Clicks total `—` unless all three channels report; breakdown still shows present ones. | BUILD (+ NEEDS ANSWER 2) |
| 5 | Overview = default landing (item 5, `[t]`) | Dianna | `id:null` becomes Overview; Paid Search moves to its own id (`lib/constants.ts:173-178`), matching AEO/GA4 (`:159-171`). | BUILD |
| 6 | No commentary box on Overview (item 6, `[v]`) | Dianna | Overview RSC does not mount `SharedPartsHeader`; `resolveCommentaryView` returns no key for Overview (`lib/commentary/views.ts:37-56`). | BUILD |
| 7 | Totals on **all** Paid Search tables (item 7, line 180) | Amir | Totals added to Leads by Action, Region→DMA, Keyword; Campaign already has one (`campaign-table.tsx:42-61`). | BUILD |
| 8 | Region total = **all regions**, display top 10 (item 8, line 204) | Amir | Bottom total sums the full region set (available client-side, `geo-section.tsx:14`); display stays top 10. The existing "Total Regions" card (`geo-section.tsx:33`) already shows the true count. No inline "X across top 10 of N" annotation (not adopted by Amir). | BUILD |
| 9 | Plain sum OK; one DMA per conversion (item 9, `[z]`, line 237) | Amir | Region total is a plain sum. | BUILD (+ VERIFY 4) |
| 10 | Keyword total = **all keywords behind the filter**, display top 10 (item 10, line 220) | Amir | Lib returns full set (remove the `keywords.ts:29` top-50 cap); client wrapper totals the filtered set and displays top 10; CTR/CPL recomputed from summed numerators/denominators (mirror `campaign-table.tsx:48-52`). | BUILD |
| 11a | Spend, Clicks, Leads, CPL in that order; drop CTR + Conversions (item 11, line 225) | Amir/Greg | Overview cards in that exact order; CTR + Conversions excluded. | BUILD |
| 11b | Both combined top line **and** per-channel breakdown (item 11, line 226, `[ad]`) | Dianna | Overview renders both, modeled on `demand-overview/index.tsx`. | BUILD |
| 11c | Keyword ≥10 default, clearable, message when none; skip 50-impression fallback (item 11, line 227) | Dianna | Client wrapper: ≥10 default, clearable, empty-state message. 50-impression fallback not built (line 227 says only if easier — it is not). | BUILD |
| 11d | Cents so figures match; Top Regions chart vs card (item 11, line 228, `[ae]`) | Dianna | Cents money formatter used within Paid Media; Top Regions chart + the card above it both cents. Shared `usd()` untouched (other tabs unaffected). | BUILD |
| 11e | Applies to internal AND client portal (item 11, line 229) | Dianna | Every route/sidebar/format change lands in dashboard + portal. | BUILD |
| Q1 | Meta bids a single optimization event per ad set, client-specific (Questions, `[ah]`) | Greg | Supports holding Meta leads (item 1) + the HubSpot approach (item 3); per-client lead definition recorded for the follow-up. | context |
| Q2 | One lead → one DMA for Google Ads (Questions, line 237) | Amir | Settles item 9's plain sum. | context |
| 13 | Cost/LPV = Spend ÷ LPV (Q&A Req 4, `[i]`) | Greg | #180 fixes 2-dp rounding; source-basis verify open (VERIFY 3). | DONE (+ VERIFY 3) |

**Q&A-tab comments also accounted for:** `[a][b]` metric set/CTR → 11a; `[c][d]` Total Leads math → item 9/Req 2; `[e][f]` keyword filter does not affect the Leads-by-Action total → §4.B; `[g][h][i]` Cost/LPV formula → item 13. Process-only note `[j]` ("requirements in Asana") needs no build.

---

## 4. Design detail (grounded, with code touchpoints)

Repo conventions (from `CLAUDE.md`): each report section is a self-contained RSC in
`components/report-sections/<slug>/` taking `clientSlug` + `dateRange`; Supermetrics calls are
server-side only; `ds_id`s live in `lib/supermetrics/constants.ts`; gate on `enabledReports`;
wrap each section in an error boundary; never show an error for an unconnected platform (show `—`/a prompt).

### A. Overview subpage
- **Registry** (`lib/constants.ts:173-178`): change to `[{id:null,'Overview'}, {id:'paid-search','Paid Search'}, {id:'meta','Meta Advertising'}, {id:'linkedin','LinkedIn Advertising'}]`. This makes Overview the `id:null` default landing (item 5), matching `AEO_SUBSECTIONS`/`GA4_SUBSECTIONS` (`lib/constants.ts:159-171`).
- **Dispatch** (BOTH `app/dashboard/[clientSlug]/reports/page.tsx:72-75` AND `app/portal/[clientSlug]/reports/page.tsx:87-90`): default `return <PaidMediaOverviewReport/>`; add `if (subsection === 'paid-search') return <PaidSearchReport/>`. Update the title maps (`page.tsx:167-168`, portal `:204-205`) and the subsection-name maps.
- **Sidebars** (BOTH `components/layout/sidebar.tsx:561-612` AND `components/layout/portal-sidebar.tsx:220-247`): render the new Overview entry and its active state.
- **New rollup lib** `lib/paid-media/overview.ts`: fetch the three channels' Spend and Clicks via the existing per-channel fetchers (`lib/paid-search/kpis.ts`, `lib/meta/kpis.ts`, `lib/linkedin/kpis.ts`) using `Promise.allSettled`/a `safe()` wrapper (pattern in `paid-search/index.tsx:16-31`). Sum Spend; sum Clicks = Paid Search all-clicks + Meta `inline_link_clicks` + LinkedIn all-clicks (item 2 — label the mix). Leads/CPL = `—` (Blocker 1).
- **Missing-channel rule** (item 4): if any of the three channels fails/does not report, the blended Spend and Clicks totals are `—`; the per-channel breakdown still renders each channel. (See NEEDS ANSWER 2.)
- **New section** `components/report-sections/paid-media/overview/index.tsx` modeled on `components/report-sections/demand-overview/index.tsx` (combined top line + per-channel breakdown; null→`—` formatters). Metric order: Spend, Clicks, Leads, Cost-per-lead (11a). **Does not mount `SharedPartsHeader`** (item 6).
- **Commentary** (item 6): update `lib/commentary/views.ts:37-56` so `paid-media` with no subsection resolves to no commentary key, and `paid-media`+`paid-search` resolves to `'paid-search'` (so Paid Search keeps its box). There is an existing test at `lib/commentary/views.test.ts` — extend it.

### B. Paid Search tables
- **Leads by Action** (`components/report-sections/paid-search/leads-section.tsx`): add a "Total Leads" line at the **top**, value = `data.totalLeads` (already computed, `lib/paid-search/leads.ts:19`). Hand-rolled markup, so a bespoke line (~near `:35`). Not affected by the keyword filter — different fetcher (confirms `[e][f]`).
- **Region → DMA** (`components/report-sections/paid-search/geo-section.tsx`): add a bespoke bottom total row after the `top10.map` (`:64-76`), summing over the **full** `rows` (all regions, item 8); table still displays `top10` (`:14`). Plain sum (item 9). Columns: leads, clicks, cost.
- **Keyword** (`components/report-sections/paid-search/keywords.tsx` + `lib/paid-search/keywords.ts`):
  - Lib: remove/raise the `keywords.ts:29` `.slice(0, 50)` so the component receives the full keyword set (needed to total "all keywords behind the filter", item 10). Payload size is a risk — see plan.
  - New **client wrapper** around the keyword `DataTable`: holds the ≥10-clicks filter (default on, clearable, item 11c), computes the total over the **filtered** set (item 10), displays the **top 10** of the filtered set, and shows a **message** when nothing reaches 10 clicks. Derived total metrics (CTR/CPL) recomputed from summed numerators/denominators, not summed (mirror `campaign-table.tsx:48-52`).
  - **RSC boundary:** the wrapper is a Client Component; it must not receive formatter **function** props from a Server Component (the `check:rsc` gate, `scripts/check-rsc-props.ts`). Format to strings inside the client wrapper or pass pre-formatted values.
- **Campaign** (`components/report-sections/paid-search/campaign-table.tsx`): already has a total via `DataTable.totalsRow` (`:42-61`). No change (item 7).

### C. Meta + precision
- **Cost/LPV (#180, DONE):** cherry-picked onto this branch (commit folds `lib/meta/kpis.ts:53`, `creative.ts:23,50` to 2-dp; `creative-table-client.tsx:35` to `usd2`). Component test `creative-table.test.tsx` green in CI. Open: VERIFY 3 (source basis) + NEEDS ATTENTION 5 (lib-test wiring).
- **Cents within Paid Media (item 11d):** introduce a single Paid Media cents money formatter (e.g. `money(n) = '$' + n.toFixed(2)` with thousands separators) and use it in Paid Media components: the KPI spend/cost cards (stop the `Math.round` on money in `lib/paid-search/kpis.ts:40`, `lib/meta/kpis.ts:23`, `lib/linkedin/kpis.ts:33`), the geo cards, and the tables. Reconcile the duplicated inline `usd2` in the creative tables (`meta-ads/creative-table-client.tsx:17`, `linkedin-ads/creative-table-client.tsx:21`). **Do not** change the shared `usd()` in `lib/supermetrics/format.ts:1` (other tabs use it — cents scope is Paid Media only, item 11 is a Paid Media discussion). Concretely fix Dianna's exact complaint: the Top Regions chart and the card above it must both show cents.
- **Meta link-clicks label (item 2):** the Meta column already reads "Link Clicks" (`lib/meta/kpis.ts:36`, `creative-table-client.tsx:31`), satisfying "label it that way." On the **blended Overview**, label/footnote the combined Clicks noting Meta counts link clicks. No Meta-subpage rename needed.

### D. Cross-cutting
- **Dashboard + portal parity:** the `paid-media` dispatch, title maps, date-picker gate, and both sidebars are duplicated by hand across dashboard and portal (explicit drift warning at portal `reports/page.tsx:60-65`). Every change in bucket A lands in both. There is also a legacy flat route (`.../reports/[reportSlug]/page.tsx`) with `meta-ads`/`google-ads` cases and no `paid-media` case — deep-links only, out of scope unless a link points at it.
- **enabledReports gating** and **error boundaries** per `CLAUDE.md` rules 5 & 7.
- Applies to internal AND portal (item 11e).

---

## 5. Test plan & gates

CI on every PR (`.github/workflows/checks.yml`): `npm run check:rsc` + `npm test` (vitest). Both must be green.

New/updated tests (vitest, in the config's include paths — put lib logic tests under a covered path or add the path to `vitest.config.ts`):
- Rollup summing + the missing-channel `—` rule (Spend/Clicks totals go unavailable when a channel is absent).
- Keyword total over the filtered set + derived-metric recompute (CTR/CPL from sums, not summed) + the top-10 display + the "none reach 10 clicks" message.
- Region total over all regions while displaying top 10.
- The Paid Media cents formatter (Top Regions chart == card at cents).
- Commentary: `lib/commentary/views.test.ts` extended for the Overview-no-box + Paid-Search-keeps-box resolution.
- Snapshot tests for the new Overview section and the updated Paid Search tables.
- Fix NEEDS ATTENTION 5 so #180's lib asserts run.

Manual/live checks (no Supermetrics key locally): VERIFY 3 (Cost/LPV basis) and VERIFY 4 (region double-count).

---

## 6. Handoff to Paul

- **Branch:** `feat/paid-media-v2-working-feedback`, cut from `dev`, #180 folded in (1 commit), full suite green (34 files / 310 tests) + `check:rsc` green.
- **Flow (per `CLAUDE.md`):** feature branch → its own PR → code review by Paul & Thomas → `dev`. The dev-merge gate needs the standalone review-record doc at `docs/qa/paid-media-v2-working-feedback-code-review.md` (FB-065/FB-066 template). Then `dev → staging → main`, each with Thomas's explicit go-ahead. Never merge to `main` without it.
- **Build order:** see the companion plan `docs/superpowers/plans/2026-07-31-paid-media-v2-working-feedback-plan.md`.
- **Do first (today):** get answers to Blocker 1 (Dianna) and NEEDS ANSWER 2 (Dianna). Everything else is buildable without them.
- **What is already done:** #180 folded in and verified in CI.
