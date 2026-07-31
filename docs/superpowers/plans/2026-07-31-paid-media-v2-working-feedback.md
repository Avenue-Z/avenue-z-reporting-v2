# Paid Media v2 Working Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the buildable Paid Media v2 stakeholder feedback (new Overview subpage, Paid Search table totals + keyword filter, cents precision, Meta labeling, Cost/LPV fix) with blended Leads/CPL fenced off pending a stakeholder answer.

**Architecture:** The Paid Media tab is a `?section=paid-media&subsection=…` surface. We add an Overview subsection (`id:null`) that rolls up the three existing per-channel report-sections, mirroring the AEO/GA4 overview pattern and the `demand-overview` rollup. Paid Search table changes are local edits to existing components plus one data-layer change (uncap the keyword query). Cents is a Paid-Media-scoped formatter, not a change to the shared `usd()`.

**Tech Stack:** Next.js 16 App Router (RSC), TypeScript strict, Tremor + Recharts, Supermetrics Data API (server-side), vitest.

**Companion spec (source of truth trace):** `docs/superpowers/specs/2026-07-31-paid-media-v2-working-feedback-spec.md`. Every task cites the spec item it satisfies. The ultimate source of truth is the Google Doc "Decisions for Approval" tab.

## Global Constraints

- **Doc-traceable only.** Do not add behavior not traceable to a spec item / doc anchor. If the doc is silent, stop and flag (see spec §2), do not invent.
- **Both surfaces.** Every routing/nav/format change lands in BOTH `app/dashboard/[clientSlug]/reports/page.tsx` AND `app/portal/[clientSlug]/reports/page.tsx`, and BOTH `components/layout/sidebar.tsx` AND `components/layout/portal-sidebar.tsx` (spec item 11e).
- **RSC boundary.** Client Components must not receive function props (e.g. formatters) from Server Components. `npm run check:rsc` must stay green (`scripts/check-rsc-props.ts`).
- **Supermetrics server-side only**, `ds_id`s from `lib/supermetrics/constants.ts`, gate on `enabledReports`, one failed query never crashes a section (error boundary / `safe()`), never render an error for an unconnected platform — show `—` or a prompt (`CLAUDE.md` rules).
- **Cents scope = Paid Media only.** Do NOT edit `lib/supermetrics/format.ts` `usd()` (other tabs use it).
- **CI gate:** `npm run check:rsc` + `npm test` green on the PR before it can merge to `dev`.
- **Branch:** `feat/paid-media-v2-working-feedback` (already cut from `dev`, #180 folded in). Commit frequently. Do not merge to `dev`/`main` without Thomas's go-ahead.

---

## Progress (as of handoff)

**DONE** and committed on `feat/paid-media-v2-working-feedback` (full suite green: 39 files / 323 tests, `check:rsc` green, `tsc` clean). Each task below is marked ✅ DONE or ⏳ TODO in its own header too.
- **#180 Cost/LPV fix** folded in (`b1a464a`).
- **✅ Task 1** — Overview subsection, default landing, no commentary box (`5d39df6`). Both dashboard + portal routes. Sidebars needed NO edit (they iterate `PAID_MEDIA_SUBSECTIONS`, so they picked up the new entries automatically). Commentary resolution updated + tested.
- **✅ Task 3** — Total Leads on Leads by Action (`0a6c731`) + test.
- **✅ Task 4** — Region → DMA total over all regions, display top 10 (`0a6c731`) + test. NOTE: the total's Cost is whole-dollar `usd()` for now; cents comes in Task 2 (applied across Paid Media all at once).
- **✅ Task 8 (this branch's part)** — #180's two `lib/meta` tests converted to vitest and wired into CI (`9ae73e9`). The worklist status line lives on the docs branch (PR #175), so update it there, not here.

**Now DONE (Paul's session, commits `c99df48`, `bf88db3`, `bb9bfd9`, `261e26f`; full suite green: 43 files / 334 tests, `check:rsc` + `tsc` clean):**
- **✅ Task 2** — cents across ALL Paid Media money (KPI cards, geo cards + region table, campaign table, both creative tables). Approach B: money KPIs keep a NUMERIC value + `format:'money'` (so the Task 6 rollup reads exact spend); `KpiGrid` renders cents. Shared `usd()` untouched. Scope widened from the plan's bullet list to every money figure per spec §4.C + item 11d ("make them all with cents").
- **✅ Task 5** — keyword data layer uncapped (`getKeywordRows` returned top 50); new `KeywordsTableClient` owns the ≥10-clicks default filter (clearable), totals the full filtered set (CTR/CPL recomputed from summed numerators/denominators), displays top 10, and messages when none reach 10 clicks. Formatters imported from the pure source so no `lib/db` enters the client bundle.
- **✅ Task 6** — `lib/paid-media/overview.ts` rollup via `Promise.allSettled`; blended totals null unless all three channels report (item 4 literal reading — **NEEDS ANSWER 2 still open**, adjust `allOk` if Dianna redefines "missing"); Leads/CPL always null (Blocker 1).
- **✅ Task 7** — Overview section filled: combined Spend/Clicks/Leads/CPL top line + per-channel breakdown; null→`—`; Meta link-clicks note; pending-HubSpot note on Leads/CPL; no `SharedPartsHeader`. Renders on dashboard + portal.
- **⛔ Task 9** — still BLOCKED (spec Blocker 1 — Dianna).

**Test-environment note (Task 5/6/7):** the whole `lib/paid-search` chain (and the per-channel KPI fetchers) import `lib/db` → next-auth, which jsdom/vitest cannot resolve. New tests therefore either test pure helpers (`summarizeKeywords`, `money`) or `vi.mock` the fetcher/rollup modules; `DataTable` is mocked where a render pulls in `editable-text` → a server action. `transformKeywords`' no-cap is asserted in the node:assert `lib/paid-search/keywords.test.ts` (the established paid-search convention — not in the vitest include).

Doc/example caveat carried into Task 2: the doc's specific "Top Regions chart shows cents vs card in whole dollars" example does NOT reproduce in code (that chart plots leads, not cost). Honor the directive ("make them all with cents") across Paid Media money figures; there is no single chart-vs-card mismatch to point at.

---

## Task 1: Overview subsection — registry, routing, sidebars, empty shell, default landing  ✅ DONE (`5d39df6`)

Satisfies spec items **5** (default landing), **6** (no commentary), and the routing half of **1/11b**. Ships the nav change with an empty Overview. **Shipped note:** the sidebars needed no edit; they iterate `PAID_MEDIA_SUBSECTIONS` and picked up Overview + Paid Search automatically. The Overview shell lives at `components/report-sections/paid-media/overview/index.tsx` (Tasks 6-7 fill it).

**Files:**
- Modify: `lib/constants.ts:173-178` (`PAID_MEDIA_SUBSECTIONS`), and the subsection-name map(s)
- Create: `components/report-sections/paid-media/overview/index.tsx` (empty shell RSC)
- Modify: `app/dashboard/[clientSlug]/reports/page.tsx:72-75,167-168`
- Modify: `app/portal/[clientSlug]/reports/page.tsx:87-90,204-205`
- Modify: `components/layout/sidebar.tsx:561-612`
- Modify: `components/layout/portal-sidebar.tsx:220-247`
- Modify: `lib/commentary/views.ts:37-56` + Test: `lib/commentary/views.test.ts`

**Interfaces:**
- Produces: `PaidMediaOverviewReport({ clientSlug, dateRange }: { clientSlug: string; dateRange: string })` — the Overview RSC (empty in this task, filled in Tasks 7-8).
- Produces: subsection ids `null` → Overview, `'paid-search'` → Paid Search (was `null`).

- [ ] **Step 1: Extend the commentary-view test (failing).** In `lib/commentary/views.test.ts`, assert `resolveCommentaryView('paid-media', undefined)` returns `null` (Overview has no box, item 6) and `resolveCommentaryView('paid-media', 'paid-search')` returns `'paid-search'`.
- [ ] **Step 2: Run it, verify it fails.** `npx vitest run lib/commentary/views.test.ts` → FAIL.
- [ ] **Step 3: Update `PAID_MEDIA_SUBSECTIONS`** (`lib/constants.ts:173-178`) to `[{ id: null, label: 'Overview' }, { id: 'paid-search', label: 'Paid Search' }, { id: 'meta', label: 'Meta Advertising' }, { id: 'linkedin', label: 'LinkedIn Advertising' }]`. Add the matching name-map entries used for the page title.
- [ ] **Step 4: Update `resolveCommentaryView`** (`lib/commentary/views.ts:37-41`): `paid-media` + no subsection → `null`; `paid-media` + `'paid-search'` → `'paid-search'`. Leave `meta`/`linkedin` unchanged.
- [ ] **Step 5: Create the empty Overview shell** `components/report-sections/paid-media/overview/index.tsx`: an RSC `PaidMediaOverviewReport({ clientSlug, dateRange })` returning a titled placeholder (`<h2>Overview</h2>` + a "coming together" note). Do NOT mount `SharedPartsHeader` (item 6).
- [ ] **Step 6: Wire the dispatch** in both `page.tsx` files: default (no subsection) `return <PaidMediaOverviewReport clientSlug={…} dateRange={…} />`; add `if (subsection === 'paid-search') return <PaidSearchReport … />`. Update the hardcoded `'Paid Search'` title (`dashboard :167-168`, portal `:204-205`) to derive from the subsection name map so Overview/Paid Search title correctly.
- [ ] **Step 7: Update both sidebars** so the Overview entry renders and its active state resolves (`sidebar.tsx:588` active logic already handles `id === null`; confirm Paid Search now keys off `'paid-search'`).
- [ ] **Step 8: Run tests + RSC + typecheck.** `npx vitest run lib/commentary/views.test.ts` PASS; `npm run check:rsc` PASS; `npx tsc --noEmit` clean.
- [ ] **Step 9: Manual sanity.** `npm run dev`, load a Paid Media client on dashboard and portal: the tab opens on Overview, Paid Search is now its own sub-item, Meta/LinkedIn unchanged, Overview shows no commentary box.
- [ ] **Step 10: Commit.** `git commit -m "feat(paid-media): add Overview subsection, default landing, no commentary box"`

---

## Task 2: Cents across Paid Media  ✅ DONE (`c99df48`)

Satisfies spec item **11d** ("make them all with cents so it's exact"). Cents scope = Paid Media only; do NOT touch the shared `usd()`. **Do this all at once**, not per-component — a partial rollout makes the same figure (e.g. total spend on a KPI card vs a total row) appear at two precisions, which is the exact defect item 11d wants gone. (An earlier geo-only application was reverted for this reason.)

**Already done:** `lib/paid-media/format.ts` `money(n)` is built + tested (`lib/paid-media/format.test.ts`, in the vitest include). `money(n) = '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })`. Just wire it in.

**Files to change:**
- Money in the three KPI transforms — `lib/paid-search/kpis.ts:40` (`key:'cost'`), `lib/meta/kpis.ts:23` (`key:'spend'`), `lib/linkedin/kpis.ts:33` (`key:'spend'`), plus the `cpl`/`costPerLead`/`cpc`/`cpm`/`costPerLpv` money KPIs: today they `Math.round(...)` the value and pass `prefix:'$'`, and `KpiCard` renders `value.toLocaleString()` with no decimal control (so cents are lost).
- Paid Search geo Cost column + total (`components/report-sections/paid-search/geo-section.tsx`, currently `usd()`).
- The inline `usd2` in `meta-ads/creative-table-client.tsx:17` and `linkedin-ads/creative-table-client.tsx:21` (dedupe onto `money`).

**Safe `KpiCard` approach (avoid breaking other tabs):** do NOT change `KpiCard`'s number path (other tabs rely on it). Instead, in the Paid Media KPI transforms, format money KPIs to a **string** via `money(value)` and drop the `prefix:'$'` (KpiCard renders string values verbatim — confirmed in `components/charts/kpi-card.tsx`). That keeps the cents change entirely inside Paid Media. Watch the delta/`invertDelta` logic: it keys off the numeric value, so if you stringify the value, verify deltas still render (or keep the numeric value and add a `format:'money'` opt-in prop to `KpiCard` used only by Paid Media callers — either is fine, pick one and be consistent).

- [ ] **Step 1: Failing test** — a Paid Media KPI/geo test asserting a money figure renders with cents (`$1,234.50`), and a sub-dollar cost does not collapse.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Wire `money` into the three KPI transforms + geo + the two creative tables**, all in one change, per the approach above.
- [ ] **Step 4: Run full suite + `check:rsc` + `tsc` → PASS.**
- [ ] **Step 5: Manual** — every Paid Media money figure (KPI cards, geo, creative tables) shows `$X,XXX.XX`; the same total never appears at two precisions.
- [ ] **Step 6: Commit.**

---

## Task 3: "Total Leads" on Leads by Action  ✅ DONE (`0a6c731`)

Satisfies spec item **7** (Req 2 top). Value already computed; not affected by the keyword filter (spec §4.B, comment `[e][f]`).

**Files:**
- Modify: `components/report-sections/paid-search/leads-section.tsx` (~near `:35`)
- Test: `components/report-sections/paid-search/leads-section.test.tsx` (new vitest suite, path already in include)

**Interfaces:**
- Consumes: `LeadBreakdown.totalLeads` (`lib/paid-search/leads.ts:19`, `lib/paid-search/types.ts:7`).

- [ ] **Step 1: Failing snapshot/DOM test** rendering `LeadsSection` with a fixture where `totalLeads = 128`; assert a "Total Leads" element shows `128` at the top.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Add a "Total Leads" line** at the top of the Leads by Action block using `data.totalLeads`, formatted `.toLocaleString('en-US')` to match the section's existing integer style (`leads-section.tsx:64,74`).
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit.** `git commit -m "feat(paid-search): Total Leads on Leads by Action"`

---

## Task 4: Region → DMA bottom total (all regions, display top 10)  ✅ DONE (`0a6c731`)

Satisfies spec items **7, 8, 9**. Plain sum over the full region set; table still shows top 10. Cost is whole-dollar `usd()` for now; it flips to cents with Task 2.

**Files:**
- Modify: `components/report-sections/paid-search/geo-section.tsx:55-77` (append a total `<tr>` after the `top10.map` at `:64-76`)
- Test: `components/report-sections/paid-search/geo-section.test.tsx` (new)

**Interfaces:**
- Consumes: `rows: GeoRegion[]` (full set, already the prop; top-10 is the local `rows.slice(0,10)` at `:14`).

- [ ] **Step 1: Failing test.** Fixture with 12 regions; assert the table body renders 10 region rows AND a total row whose leads/clicks/cost equal the plain sums over **all 12** (not just the 10 shown).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.** Compute `const totals = rows.reduce(...)` over the full `rows`; render a bottom `<tr>` (heavier top border) with leads/clicks (integer) and cost via `money` (Task 2). Body still maps `top10`.
- [ ] **Step 4: Run → PASS.** Confirm the existing "Total Regions" card (`:33`, `rows.length`) is untouched — count and total now agree with the doc's "both" without an inline annotation (item 8, per Amir line 204).
- [ ] **Step 5: Commit.** `git commit -m "feat(paid-search): Region→DMA total over all regions, display top 10"`

---

## Task 5: Keyword table — full-set data layer + ≥10-clicks filter wrapper + total + top-10  ✅ DONE (`bf88db3`)

Satisfies spec items **10, 11c, 7**. The one task that needs a data-layer change and a client boundary.

**Files:**
- Modify: `lib/paid-search/keywords.ts:29` (remove the `.slice(0, 50)`; return the full transformed, sorted set)
- Create: `components/report-sections/paid-search/keywords-table-client.tsx` (Client Component: filter state + total + top-10 + empty message)
- Modify: `components/report-sections/paid-search/keywords.tsx` (RSC: pass the full rows to the client wrapper; keep server-side fetch)
- Test: `components/report-sections/paid-search/keywords-table-client.test.tsx` + `lib/paid-search/keywords.test.ts` (lib test as a vitest suite under a covered path, or add the path)

**Interfaces:**
- Consumes: `getKeywordRows(slug, dateRange): Promise<KeywordRow[]>` (now full set; `lib/paid-search/types.ts:8`).
- Produces: `KeywordsTableClient({ rows }: { rows: KeywordRow[] })` — applies the ≥10-clicks default filter, totals the filtered set, displays top 10, shows a message when none qualify.

- [ ] **Step 1: Failing lib test.** After removing the cap, `getKeywordRows` (mock `awQuery`) returns >50 rows sorted by leads desc. (If a direct lib call is impractical due to `lib/db` imports, test the pure transform `transformKeywords` instead.)
- [ ] **Step 2: Remove the `.slice(0, 50)`** at `keywords.ts:29`. Run → PASS.
- [ ] **Step 3: Failing client-wrapper tests** (`keywords-table-client.test.tsx`):
  - default view shows only keywords with `clicks >= 10`, at most 10 rows;
  - the total row sums over ALL filtered keywords (not just the 10 displayed) — e.g. 25 keywords ≥10 clicks → total = sum of 25;
  - derived total metrics (CTR, CPL) are recomputed from summed numerators/denominators, NOT summed (mirror `campaign-table.tsx:48-52`);
  - clearing the filter shows the top 10 of ALL keywords and totals over all;
  - when no keyword reaches 10 clicks, a message renders instead of an empty table (item 11c). Do NOT implement the 50-impression fallback.
- [ ] **Step 4: Run → FAIL.**
- [ ] **Step 5: Implement `KeywordsTableClient`** (`'use client'`): `useState` for the ≥10 filter (default on) + a "clear"/toggle control; `filtered = filter ? rows.filter(r => r.clicks >= 10) : rows`; `total` reduced over `filtered` (ratios recomputed); `display = filtered.slice(0, 10)`; render via `DataTable` with `totalsRow` (`components/charts/data-table.tsx:43`) built from `total`; when `filtered.length === 0` render the message. Format money via `money` (Task 2) INSIDE the client (no formatter prop crossing the boundary — RSC gate).
- [ ] **Step 6: Wire `keywords.tsx`** to render `<KeywordsTableClient rows={rows} />` (server fetch unchanged).
- [ ] **Step 7: Run tests + RSC + typecheck.** All PASS; `check:rsc` green (verify no function prop crosses into the client wrapper).
- [ ] **Step 8: Manual.** Keyword table defaults to ≥10 clicks, shows ≤10 rows, total reflects all filtered keywords; clear works; a synthetic low-click range shows the message.
- [ ] **Step 9: Commit.** `git commit -m "feat(paid-search): keyword ≥10-clicks filter, total over filtered set, display top 10"`

---

## Task 6: Overview rollup lib — blended Spend/Clicks + missing-channel rule  ✅ DONE (`bb9bfd9`)

Satisfies spec items **1, 2, 4, 11a**. Leads/CPL are `—` here (Blocker 1); Task 9 fills them once unblocked. **Confirm NEEDS ANSWER 2 (spec §2) before finalizing the missing-channel rule.**

**Files:**
- Create: `lib/paid-media/overview.ts` + Test: `lib/paid-media/overview.test.ts`

**Interfaces:**
- Consumes the three per-channel KPI fetchers (each returns `Promise<Kpi[]>`; each `Kpi` is `{ key, label, value: number | string, ... }`). Read Spend and Clicks by key:
  - `getPaidSearchKpis(slug, dateRange, compareRange)` — Spend key `'cost'`, Clicks key `'clicks'` (`lib/paid-search/kpis.ts:51,40,41`).
  - `getMetaKpis(slug, dateRange, compareRange)` — Spend key `'spend'`, Clicks key `'linkClicks'` (link clicks — item 2), **no leads key** (`lib/meta/kpis.ts:76,23,35`).
  - `getLinkedInKpis(slug, dateRange, compareRange)` — Spend key `'spend'`, Clicks key `'clicks'` (`lib/linkedin/kpis.ts:72,33,42`). Note the capital `I` in `getLinkedInKpis`.
  - Each fetcher throws on a Supermetrics failure — wrap in `Promise.allSettled` / the `safe()` pattern (`components/report-sections/paid-search/index.tsx:16-22`). Values may be `number | string`; coerce before summing.
- Produces:
  ```ts
  type ChannelKey = 'paid-search' | 'meta' | 'linkedin'
  interface ChannelMetrics { key: ChannelKey; spend: number | null; clicks: number | null; ok: boolean }
  interface PaidMediaOverview {
    channels: ChannelMetrics[]              // per-channel breakdown (item 11b)
    blendedSpend: number | null             // null => render '—' (item 4)
    blendedClicks: number | null            // null => render '—'; Meta contributes link clicks (item 2)
    leads: null                             // Blocker 1 — always null until Task 9
    costPerLead: null                       // Blocker 1
  }
  export async function getPaidMediaOverview(clientSlug: string, dateRange: string): Promise<PaidMediaOverview>
  ```

- [ ] **Step 1: Failing tests** (`overview.test.ts`), mocking the three channel fetchers:
  - all three report → `blendedSpend` = sum of spends, `blendedClicks` = PS clicks + Meta link clicks + LinkedIn clicks;
  - one channel throws/absent → `blendedSpend === null` AND `blendedClicks === null` (item 4 literal rule), but `channels` still lists the two that reported with `ok: true` and the absent one `ok: false`;
  - `leads === null` and `costPerLead === null` always (Blocker 1).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement `getPaidMediaOverview`** using `Promise.allSettled` over the three fetchers (pattern: `demand-overview/index.tsx:68-122`, `paid-search/index.tsx:16-31` `safe()`). Build `channels`; set `ok=false` on rejection. `const allOk = channels.every(c => c.ok)`; `blendedSpend = allOk ? sum(spend) : null`; `blendedClicks = allOk ? sum(clicks) : null`; `leads = null`, `costPerLead = null`.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit.** `git commit -m "feat(paid-media): overview rollup (blended spend/clicks, missing-channel rule)"`

> **NEEDS ANSWER 2 (spec §2):** the "missing = all three required" rule is the literal reading of item 4. If Dianna clarifies "missing" means enabled-but-erroring, adjust `allOk` to consider only enabled channels. Do not change it on assumption.

---

## Task 7: Overview section component — combined top line + per-channel breakdown  ✅ DONE (`261e26f`)

Satisfies spec items **1, 2, 11a, 11b, 11d**. Fills the shell at `components/report-sections/paid-media/overview/index.tsx` (created empty in Task 1; the route dispatch already renders it).

**Files:**
- Modify: `components/report-sections/paid-media/overview/index.tsx`
- Test: `components/report-sections/paid-media/overview/index.test.tsx`

**Interfaces:**
- Consumes: `getPaidMediaOverview` (Task 6), `money` (Task 2).

- [ ] **Step 1: Failing test.** Render with a mocked overview where LinkedIn is missing: assert the combined Spend/Clicks tiles show `—`, the per-channel breakdown shows Paid Search and Meta values, and Leads / Cost-per-lead tiles show `—` with a "pending HubSpot lead attribution" note.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** modeled on `demand-overview/index.tsx`: a combined KPI row in order Spend, Clicks, Leads, Cost-per-lead (item 11a; CTR/Conversions excluded); null→`—`; money via `money`. Below it, a per-channel breakdown (cards or a small table) for Spend + Clicks (item 11b). Label the combined Clicks noting Meta counts link clicks (item 2). No `SharedPartsHeader` (item 6). Wrap in the section error boundary.
- [ ] **Step 4: Run → PASS;** `npm run check:rsc` green.
- [ ] **Step 5: Manual.** Overview renders on dashboard + portal; missing channel blanks the blended total; Leads/CPL show `—` with the note.
- [ ] **Step 6: Commit.** `git commit -m "feat(paid-media): Overview section (combined + per-channel), Leads/CPL pending"`

---

## Task 8: Housekeeping — worklist status + #180 lib-test wiring  ✅ DONE on this branch (`9ae73e9`)

Satisfies spec §2 housekeeping + NEEDS ATTENTION 5. #180's two `lib/meta` tests are converted to vitest and wired into CI. The worklist status line lives on the docs branch (PR #175), not here — update it there.

**Files:**
- Modify: `docs/official-feedback/paid-media-v2-merged-worklist.md` (E1/Req 4 → folded in via #180)
- Modify: `lib/meta/kpis.test.ts`, `lib/meta/creative.test.ts` (convert `node:assert` scripts to vitest `describe/it`) + `vitest.config.ts` (ensure `lib/meta/**` covered)

- [ ] **Step 1: Rewrite the two Meta lib asserts as vitest suites** (same assertions, `expect(...)` form) so they run in CI. Confirm `lib/meta/**` is in the include.
- [ ] **Step 2: Run `npm test`** → the Meta lib tests now execute and pass alongside `creative-table.test.tsx`.
- [ ] **Step 3: Update the worklist** status line for Cost/LPV.
- [ ] **Step 4: Commit.** `git commit -m "chore(paid-media): wire #180 meta lib tests into CI, update worklist status"`

---

## Task 9: BLOCKED — blended Leads & Cost-per-lead from HubSpot

**DO NOT START until Blocker 1 (spec §2) is answered by Dianna.** The doc requires blended CPL = total spend ÷ HubSpot leads attributed to AVZ (item 3, comment `[p]`), but the doc does not define "a HubSpot lead attributed to AVZ," no Paid Media client has HubSpot connected (`scripts/seed.ts:78`), and the HubSpot integration is Avenue-Z-hardwired. When the definition and a data path are provided, this task adds the HubSpot leads fetch to `lib/paid-media/overview.ts`, sets `leads`/`costPerLead` (spend ÷ leads), and updates Task 7's tiles. Requires its own sub-spec.

---

## Verify-before-ship (needs a live Supermetrics/Google Ads pull — not doable in this environment)

- **VERIFY 3 (spec §2):** confirm Meta's native `cost_per_landing_page_view` equals `spend ÷ landing_page_views` on a live pull; if not, switch the KPI card + per-ad leaf (`lib/meta/kpis.ts:50-57`, `creative.ts:23`) to compute `spend ÷ lpv` (item 13 / Greg `[i]`).
- **VERIFY 4 (spec §2):** spot-check live Google Ads data confirms one DMA per conversion before relying on the Region plain sum (item 9, Amir line 237).

---

## Self-review (spec coverage)

- Items 1,5,6,11b → Tasks 1,6,7. Item 2 → Tasks 6,7. Item 4 → Task 6. Item 3 → Task 9 (blocked). Item 7 → Tasks 3,4,5. Item 8 → Task 4. Item 9 → Task 4 (+VERIFY 4). Item 10,11c → Task 5. Item 11a → Tasks 6,7. Item 11d → Task 2. Item 11e → Task 1 (both surfaces). Item 13 → #180 done (+VERIFY 3, Task 8 wiring). Every buildable spec item maps to a task; the only unmapped-to-shippable item is item 3, correctly fenced as blocked.
