# AEO Content Impact Redesign and Competitors on Overview: Code Review Record

**Scope.** PR #482, branch `feat/aeo-content-tab-redesign`. Feature diff `dc633812..beb5d25d`
(`git diff origin/dev...beb5d25d`): 30 commits, 72 files, +6,663 / -1,151, under
`lib/peec/`, `lib/ga4/`, `lib/content-calendar/`, `lib/report-sections/`, `app/actions/report-sections.ts`,
`components/report-sections/peec-ai/` (Content Impact, the Overview parts, the template), the four
report callers (`app/dashboard/…/reports/page.tsx`, both `app/portal/…` report pages,
`components/export/report-element.tsx`), their tests, `vitest.config.ts`, four read-only scripts
(`scripts/v2-calendar-audit.ts`, `scripts/measure-coverage-walk.ts`, `scripts/list-peec-clients.ts`,
`scripts/content-impact-before-after.ts`) and `docs/qa/aeo-content-impact-verifications.md`. No unrelated code.

**This document changes no code.** Every finding the per-task reviews, the whole-branch review and
Thomas's review of #482 (2026-11-23) raised as Critical or Important was fixed on the feature branch.
What is left is in §5.

Context: the Renaissance AEO dashboard training produced a list of changes. Spec and plan:
`docs/superpowers/specs/2026-11-17-aeo-content-tab-redesign-design.md` and
`docs/superpowers/plans/2026-11-17-aeo-content-tab-redesign.md` (PR #464). Decisions D-1 to D-21;
stakeholder sign-off from Tina Fleming and Danielle Lopez on 2026-11-19 (F-1 to F-6) and from Paul on
2026-11-20 (F-7).

---

## 1. How it works

### 1.1 Two Peec fetches made complete

Both were silently cut short for large accounts. That is why the client-visible numbers move.

- **Prompt coverage** (which tracked prompts cite which pages and domains). The old `getDomainCoverage`
  made one `/reports/urls` request dimensioned by prompt × model with `limit: 10000`. Renaissance's
  30-day set is 48,478 rows, so about 80% was dropped. The new `getCoverageProjection`
  (`lib/peec/coverage-projection.ts:218`) walks every page with `fetchAllPagesChecked` and caches only
  what these views read (D-20). Measured for Renaissance: the full aggregate is 5.75 MB, over Next's
  2 MB data-cache limit; the projection is **530 KB**. It keeps:
  - prompt ids citing the client's own pages, overall and per AI engine (`ownedPromptIds`, `ownedPromptIdsByModel`);
  - per-URL prompt ids for owned pages and for the top 50 competitor pages that don't mention the brand
    (`topGapUrlKeys`, `:50`; the Overview gap table shows the top 10 of the same ranking);
  - per-domain prompt ids for owned and Competitor-classified domains;
  - the top 3 other sites per prompt, competitor-naming first (`otherSitesByPrompt`);
  - the tag maps as before (still one 2,000-row request; Finding 23).

  `getDomainCoverage` is unchanged, because PR Influence reads it for arbitrary domains (§5).
- **Owned cited pages.** `getUrlCitations` stays capped at 2,000 URLs across the whole web (FB-069).
  The new `getOwnedUrlCitations` (`lib/peec/url-citations.ts`) walks every page, keeps only owned hosts
  (FB-050 subdomain rule, `lib/peec/owned-hosts.ts`), and sums `citation_count` over every walked row
  as the citation-share denominator. Measured: 135 owned rows, 66 KB.

**Walk completeness (D-21, as amended by F-8).** Peec only sorts `/reports/urls` by `citation_count`, so pages
can reorder mid-walk. Measured on 2026-11-23 (Renaissance, last 30 days, 6 walks of each kind): the prompt × model
walk returned 1–2 duplicate rows every time, while rows + duplicates stayed at 48,699, so **each duplicate displaces a
distinct row**: a walk with N duplicates may be missing up to N rows. A second walk came back clean 0 of 5 times; the two
owned-citation walks never had duplicates. So there is no retry: `walkReportingDuplicates` (`url-citations.ts:287`)
de-duplicates, logs the count, and accepts the result. `complete: true` means the walk ran out of pages, not that it
saw every row. Only a walk that runs out of pages (or fails) is incomplete, and an incomplete walk shows `--`, never
"not cited". A missed row matters only if it was a prompt's sole citation of the client's site.
Concurrent requests for the same window share one walk (in-flight map,
`coverage-projection.ts:222`), and a Peec 429 is retried once, honouring `Retry-After` capped at 10 s
(`with429Retry`, `url-citations.ts:167`).

### 1.2 Content Impact

Order (spec "Content Impact, new order"): KPI strip, Content performance, time-to-first cards, Movers,
bot vs human chart, Prompt gaps. The competitor section is gone (it moved to Overview).

- **Content performance.** One table replaces Watched Pages and the site-wide cited-pages table.
  - **Rows.** One row builder (`lib/peec/content-performance-rows.ts`) computes every column for both
    scopes. *Avenue Z content* (the default) = calendar pages whose Status is exactly "Published"
    (trimmed, case-insensitive; V1). *All cited pages* = those plus every owned page AI cited (D-5).
  - **Calendar pages** (`lib/content-calendar/pages.ts`). Rows are merged per URL (`urlJoinKey`), bare
    slugs are resolved against the client's owned domain, and the badge is New, Optimized or
    New · Optimized. Dates come from **Published rows only**: "Published" is the earliest Publish Date
    of a New row; "Last optimized" is the latest Publish Date of an Optimized row (D-19; the sheet has
    no update column).
  - **Missing data is `--`** (D-17): a failed or incomplete source never reads as 0 or 0%. Engagement
    rate is session-weighted across `/page` and `/page/`.
  - **Citation share** = the page's citations ÷ the all-sites total. If the client has no Own domain in
    Peec, both owned-citation fetches are skipped and the column is `--`
    (`lib/peec/owned-citations-plan.ts:24`). Its Δ shows only on "Last 30 days", because the current
    window is fixed at 30 days (D-10, ruling R8).
- **Time-to-first** (D-1, D-9). New, published pages only. "Days to first search visit" is the first day
  with an Organic Search session on or after the page's publish date; "Days to first AI-referred visit"
  is the first day with a session from an AI source (`isAiSource`). The GA4 data comes from two filtered
  queries (pagePath × date), and only the derived first-visit dates per (path, publish date) are cached
  (`getFirstVisitDates`, `lib/ga4/first-visit.ts:133`): 27 KB for avenue-z, versus 3.06 MB for the
  single raw query it replaces. If GA4 reports more rows than it returned, the cards show `--`
  (`:126`). Empty states name the cause (GA4 not connected / no new published content / couldn't load).
- **Labels.** Movers shows "All site pages" on its traffic views and "All cited pages across the web" on
  Citation Share, with the spec's descriptions (D-13). The bot chart's axes are "AI crawler visits
  (last 30 days)" and "Human sessions (GA4, excluding AI-referred)", plus a one-line quadrant guide
  (draft wording for Tina).
- **Prompt gaps** (D-4, D-16). For each tracked prompt (`computePromptGaps`, `lib/peec/prompt-gaps.ts`):
  - **Not cited:** no owned page cites it now or in the previous period.
  - **Lost:** an owned page cited it in the previous period and doesn't now.
  - **Declining:** still cited, but the brand's mean position over the selected models worsened by at
    least the threshold (default 1, F-6), counting only models ranked in both periods.

  Comparisons are always against the previous period. Each row lists up to 3 other sites cited for that
  prompt, competitor-naming first.

### 1.3 Who sees prompt gaps

- **The switch.** `report_section_config['peec-ai:content-impact'].clientVisible` holds the blocks opened
  to that client; absent means internal-only. The only writer is `setClientVisible`
  (`app/actions/report-sections.ts:~100`), which requires `INTERNAL_ADMIN`, a boolean `visible`, and the
  block's own view key, before any DB access. `saveReportSectionConfig` rejects a body containing
  `clientVisible` and carries the stored value forward, so a commentary opt-in can't open or wipe it.
- **The audience.** `ContentImpactReport` and `PeecAIReport` take a required `audience`. The dashboard
  passes `'internal'`; both portal routes and the PDF export pass `'client'`.
- **The gate is on the data, not the render.** `gatedPromptGaps` (`prompt-gaps.tsx:15`) never runs the
  computation for a client while the switch is off; if the client row fails to load, the switch reads
  as off. A client with the switch on but an incomplete result sees nothing rather than an error
  (`prompt-gaps.tsx:43`). The table itself is a client component that receives only plain rows.

### 1.4 Competitors on the AEO Overview

Two new versioned parts, `competitor-visibility@1` and `competitor-gaps@1`, are in `PEEC_TEMPLATE`
immediately before `footer` (`components/report-sections/peec-ai/template.ts:17-18`; D-11, F-1).

- **The math moved unchanged** into `lib/peec/competitor-tables.ts`, pinned by characterization tests
  taken from the old inline code: the competitor-only citation-share denominator, FB-058 prior share,
  prompt coverage %, the 25-row and 10-row caps, and the brand-absent row rule.
- **Deltas (D-8).** Always against the previous period; all hidden under a model filter (FB-063). The
  gap table's citation-share Δ shows only on "Last 30 days".
- **Prompts citing it (D-15).** Clients get a count, computed server-side over tracked prompts only;
  internal users can expand the prompt text. No prompt ids or text are serialized for a client.
- **Page type** is Peec's `classification`, humanised; null renders `--`.
- **Isolation.** Each part renders `<Suspense>` → `ReportErrorBoundary` → async child, so a failure
  blanks one card and the rest of Overview still renders. Under Profound both parts render nothing (D-7).

---

## 2. Verification method

**Gates, local** (at `ea87c50c`, re-run after Thomas's fixes at `445cfa0f`):
- `npx vitest run`: **438 files, 5,423 tests passed** (at `445cfa0f`). `npm run typecheck` clean.
- **RSC boundary.** `npm run check:rsc` skips any path containing `/.claude/` (`scripts/check-rsc-props.ts:74`),
  so inside a `.claude/worktrees` checkout it scans nothing. It was run as a copy with that line
  removed: passed. A real violation it would have caught is Finding 1.
- **Lint.** 0 new errors in the 64 changed `.ts/.tsx` files compared with the same files at `dc633812`
  (6 there before, 6 after). Repo-wide lint already fails on `dev` (71 errors).
- **CI on #482:** checks, ci, rsc-boundary, test, Vercel all green.

**Tests that pin the important behaviour:**
- Data boundary: `prompt-gaps.test.tsx` (client + switch off never calls compute; config failure hides
  it), `competitor-gaps.golden.test.tsx` (no prompt text, ids or `promptIds` in the props passed to the
  client table for `'client'`), `report-element.audience.test.tsx` (PDF export renders as client).
- Authorization: `app/actions/report-sections.test.ts` (analyst and client admin refused; no DB write on
  refusal; a commentary save keeps `clientVisible`).
- Completeness and size: `coverage-projection.test.ts`, `url-citations.test.ts` (walk past 10,000 rows,
  retry once on duplicates, maxPages → incomplete, in-flight dedupe, 429 retry), `first-visit.test.ts`.
- Unchanged formulas: `competitor-tables.test.ts` (characterization numbers, checked by hand against the
  old inline expressions in review).

**Live, read-only, against the dev database** (`.env.local`):
- `scripts/measure-coverage-walk.ts`: the row counts and payload sizes in §1.1.
- `scripts/v2-calendar-audit.ts` on Renaissance's sheet: Publish Date is column F on all 4 tabs; every
  real date parses ("TBD" and blanks are null); Content Types map correctly ("Existing Blog
  Optimization" → Optimized); 44 rows are Published; 3 URLs appear on more than one tab.
- `scripts/content-impact-before-after.ts renaissance` (last 30 days):
  - Prompt Coverage KPI **91% → 97%**; per-URL coverage differs on 91 of 100 rows.
  - Citation-share denominator 37,353 → 49,606; owned share 16.37% → 12.51%. "Before" counted exact-host
    matches in the top 2,000 URLs; "after" uses the full total and includes subdomains.
  - Engagement rate: 0 of 100 pages change.
  - Blank cells: All cited pages (100 rows): AI-referred Δ 89%, Last optimized 89%, Published 67%,
    Organic Δ 48%; Avenue Z content (44 rows): AI-referred Δ 89%, Last optimized 75%, Organic Δ 27%,
    Published 25%. Measured before the "Published rows only" date rule (§1.2), which may shift the
    date counts slightly.
- `scripts/list-peec-clients.ts`: avenue-z and renaissance have Peec set up (exit 1; see Finding 13).

**In the browser** (local dev server, dev database, client avenue-z, an `INTERNAL_ADMIN` service cookie
from a temporary page deleted after use):
- `/dashboard/…/content-impact`: blocks in the spec's order; Published and Last optimized; no "Last
  updated"; no competitor section; prompt gaps with the Internal chip and "Visible to client" (off).
- `/portal/…/content-impact`: no prompt-gaps heading or switch, and none of its strings anywhere in the
  HTML or RSC payload.
- Load time after the final fixes: 16.3 s cold, **258 ms** warm; no new "over 2MB" cache errors.
- **Not seen live:** the Overview Competitors parts. The dev `section_templates` row for `peec-ai`
  predates them and overrides the code template, and no shared database was written to.

**Reviews.** Each of the 16 implementation tasks (Task 15 was dropped by F-1) had a spec-and-quality
review; 6 needed one fix round, none a second.
A whole-branch review (given the diff, not these conclusions) returned "ready with fixes"; one fix wave
followed and its re-review was clean.

**Thomas's review of #482** (2026-11-23, separate clone at `ea87c50c`): typecheck, the full suite and `check:rsc`
from a normal path all pass; a 17-mutant pass on the data boundary killed 13, two survivors were equivalent and two were
real test gaps (Finding 21). Findings 20–23 come from that review. Fixes are in `4d298228`, `1a47677d`, `445cfa0f`,
reviewed before push.

**Read, not triggered:** a Peec 429 during a walk (one was seen on `/reports/domains` during
measurement; the retry is tested with a mocked fetch), GA4 truncation in the first-visit queries, and
a walk that exhausts `maxPages`.

---

## 3. Findings

Sev: **●** correctness · **○** cleanup/convention. Status: CONFIRMED (proven in-tree) / PLAUSIBLE
(code assumption confirmed, external trigger unverified).

| # | Sev | Status | Location | Finding |
|---|---|---|---|---|
| 1 | ● | CONFIRMED | `components/report-sections/peec-ai/prompt-gaps.tsx`, `prompt-gaps-table.tsx:1` | A server component passed functions (`rowKey`, column renderers) to the client `SortableTable`, which would crash Content Impact for every viewer allowed to see prompt gaps. **Fixed on the branch**: the table is its own client component receiving plain rows; the gate stays server-side. |
| 2 | ● | CONFIRMED | `lib/peec/owned-citations-plan.ts:24` | With no Own domain in Peec, the uncapped walk ran, kept nothing, and every Avenue Z row showed a 0.0% citation share. **Fixed on the branch**: no owned hosts → no fetch → `--`. |
| 3 | ● | CONFIRMED | `lib/ga4/first-visit.ts:133` | The time-to-first GA4 query (path × date × source × channel) returned 3.06 MB for avenue-z: never cached, re-run on every load (35.9 s), and growing daily. **Fixed on the branch**: two filtered queries; only first-visit dates cached (27 KB); truncation → `--`. |
| 4 | ● | PLAUSIBLE | `lib/peec/competitor-tables.ts:148` | `humanisePageType` dereferenced Peec's `classification`, which the repo's own contract marks nullable; with no per-part boundary one unclassified page would have blanked the whole client Overview. **Fixed on the branch**: null-safe, types widened to `string | null`, and each Competitors part has its own error boundary. |
| 5 | ● | CONFIRMED | `lib/peec/coverage-projection.ts` | The projection's gap-page keys followed the picker range while the gap table is fixed at the last 30 days (D-10), so "prompts citing it" went empty on other ranges. **Fixed on the branch**. |
| 6 | ● | CONFIRMED | `coverage-projection.ts:218`, `url-citations.ts:167` | On a cold cache Overview ran the same coverage walk twice, and one 429 discarded a whole walk. **Fixed on the branch**: in-flight dedupe; one 429 retry. |
| 7 | ● | CONFIRMED | `lib/content-calendar/pages.ts:85` | Dates could come from planned rows, so a future optimization showed as "Last optimized". **Fixed on the branch**: Published rows only. |
| 8 | ● | CONFIRMED | `components/report-sections/peec-ai/content-impact.tsx:571` | The Prompt Coverage KPI ignored an incomplete walk and showed a short %. **Fixed on the branch**: `--`. |
| 9 | ○ | CONFIRMED | `prompt-gaps.tsx:43` | A client with the switch on saw error copy when Peec data was incomplete. **Fixed on the branch**: renders nothing for clients. |
| 10 | ○ | CONFIRMED | `app/actions/report-sections.ts:109-110` | `setClientVisible` accepted any view key and a non-boolean `visible` (admin-only). **Fixed on the branch**. |
| 11 | ○ | CONFIRMED | `lib/peec/url-citations.ts:272` | The D-21 retry was duplicated in two fetchers. **Fixed on the branch**: one shared helper. |
| 12 | ○ | CONFIRMED | `scripts/content-impact-before-after.ts` | The evidence script used a 5,000-row GA4 limit where the page uses 2,000, which could understate blanks shown to Danielle. **Fixed on the branch**; the counts didn't change. |
| 13 | ● | CONFIRMED | `components/report-sections/peec-ai/template.ts:17` | The Competitors parts are template defaults on Tina's word that only Renaissance has AEO access (F-1). On dev, avenue-z also has Peec set up and Content Impact visible. Production is unchecked. **Decide together** before release. |
| 14 | ○ | CONFIRMED | `lib/content-calendar/pages.ts:67` | Only when Peec's overview fails: a page listed once as an absolute URL and once as a bare path gives two rows, and an unlinked slug is lowercased, so its GA4 cells can miss a mixed-case path. |
| 15 | ○ | CONFIRMED | `content-impact.tsx:286` | The first-visit fetch runs for clients with no GA4 property and logs an error each load (the card correctly says "Connect GA4"). Same as before the branch. |
| 16 | ○ | CONFIRMED | `lib/peec/coverage-projection.ts:109` | `namesCompetitor` was true for all 300 top other-site URLs for Renaissance. It reads "any non-you brand mentioned in the answer", which may make the marker uninformative. |
| 17 | ○ | CONFIRMED | `lib/peec/competitor-tables.ts:53` | `buildCompetitorDomainRows`'s own availability check ignores `.complete`. Masked today: the Overview part passes coverage through `usable()`, so H1 already shows `--`. |
| 18 | ○ | CONFIRMED | `parts/competitor-gaps.tsx:15`, `parts/competitor-visibility.tsx` | Card titles are constants, so a per-client label override can't rename these two parts (other parts honour `resolved.label`). |
| 19 | ○ | CONFIRMED | `content-impact.tsx` | `ContentImpactReport` has no render test; the fetch chaining added by Finding 3's fix is covered only through its pure helpers. |
| 20 | ● | CONFIRMED | `lib/content-calendar/pages.ts:95` | Finding 7 fixed the dates but the New/Optimized badge (and topic) still read every row: a Published New row plus an in-progress Optimized row showed "New · Optimized" with `--` under Last optimized; clients see it. **Fixed on the branch** (`4d298228`): badge and topic follow Published rows; Thomas's two cases are tests. |
| 21 | ● | CONFIRMED | `app/portal/[clientSlug]/reports/[reportSlug]/page.tsx:90` | The one client-facing report caller had no test behind its `audience="client"` (flipping it passed all tests), and nothing tested that a non-admin internal user doesn't see the switch. **Fixed on the branch** (`1a47677d`): a source test pins the audience at every portal, export and dashboard caller (with call-site floors), and `canToggleClientVisibility` is tested. |
| 22 | ○ | CONFIRMED | `lib/peec/url-citations.ts:287` | The duplicate-row retry ran a second full walk (~50 s cold) and never came back clean (0 of 5 measured). **Fixed on the branch** (`445cfa0f`, F-8): no retry; `complete` documented as "ran out of pages". |
| 23 | ○ | CONFIRMED | `lib/peec/coverage-projection.ts` | The theme (tag) maps still come from one 2,000-row request, unwalked (as before), so `complete: true` covers the prompt walk only. Known issue in the spec. |

---

## 4. Detail

### Finding 1: functions across the server/client boundary

**Mechanism.** `PromptGapsBlock` is a server component (it applies the audience gate). It rendered
`SortableTable`, a client component, with `rowKey` and column `accessor`/`render` functions. Next refuses
to serialize functions to a client component and throws, and the section boundary then blanks Content
Impact. The repo's checker should catch this, but `npm run check:rsc` skips `/.claude/` paths, so the
per-task "passed" inside the worktree was vacuous.

**Fix (on the branch).** Columns and the table call moved to `prompt-gaps-table.tsx` (`'use client'`),
which receives `PromptGapRow[]` only. Making the whole file a client component was rejected, because it
would serialize the result before the component's own gate runs. A follow-up fixes the checker (§5).

### Finding 3: the 2 MB data-cache limit

**Mechanism.** `cached()` wraps `unstable_cache`, which refuses entries over 2 MB, so the fetch runs
uncached on every render and Next logs an `unhandledRejection`. The added channel-group dimension
multiplied rows, and the window (earliest publish date → today) grows every day, so splitting the query
alone would only have delayed it.

**Fix (on the branch).** Search and AI visits are separate queries filtered server-side
(`sessionDefaultChannelGroup EXACT 'Organic Search'`; `sessionSource CONTAINS` each AI referrer domain,
case-insensitive, which is exactly `isAiSource`). The cache holds `{ [path + publish date]: { firstSearch,
firstAi } }`, so it grows with pages, not days. The days arithmetic still runs through `computeUrlTiming`.

**Size watch.** The projection (530 KB for Renaissance) has a `console.warn` above 1.5 MB. It grows with
tracked prompts × kept URLs; a client with about 4× Renaissance's prompts would approach the limit.

### Finding 4: one vendor null blanking Overview

**Mechanism.** `toCompetitorGapRows` runs outside the fetches' `allSettled`, and `ProviderSection` renders
parts without a per-part boundary, so a `TypeError` reached the report-level boundary.

**Fix (on the branch).** Null-safe humanising, `ApiUrlRow.classification` / `UrlCitation.classification`
typed `string | null` (the typecheck found no other unsafe reader), and a `ReportErrorBoundary` inside
each part's `Suspense`. A test proves the fallback renders for one part while the footer still renders.

### Finding 13: who gets the Competitors parts

**Mechanism.** In the template, the parts reach every Peec client whose `peec-ai` override isn't frozen.
A client whose override has a custom `order` that lists `footer` would get them after the footer.
`scripts/list-peec-clients.ts` prints, for every client with Peec set up, whether Content Impact is
hidden, whether the layout is frozen, and its `order`/`hidden`; it exits 1 if anyone besides Renaissance
is listed.

**Options.** If production lists only Renaissance, nothing to decide. If it lists another client (on dev,
avenue-z, Avenue Z's own account), either accept that it sees competitor data, or hide the two parts for
that client through its override `hidden` list. That is Tina's and Thomas's call, before the production
template append.

### Finding 16: the "names a competitor" marker

**Mechanism.** The flag comes from the row's `mentioned_brands` containing any brand other than the
client's. On prompt × model rows this appears to describe the AI answer, not the cited page, and every
top-3 URL had it. Ranking "competitor-naming first" is then a no-op.

**Suggested next step.** Ask Tina whether the marker should mean "the page names a competitor" (needs a
page-level source) or be dropped from the prompt-gaps column.

---

## 5. Follow-ups

**Before the production release (blocks it, not the merge to dev):**
- Finding 13: run `scripts/list-peec-clients.ts` against production; Tina and Thomas decide on any
  client besides Renaissance.
- Append `{"id":"competitor-visibility","version":1}` and `{"id":"competitor-gaps","version":1}` before
  `{"id":"footer","version":1}` in the `peec-ai` `section_templates` row: staging after promotion, then
  production at release. Read the row first. Until then the code template is overridden and Overview
  shows no Competitors parts.
- View the Competitors parts on staging before Tina's QA; they have not rendered anywhere yet. On the client Overview,
  check that no prompt text appears anywhere in the HTML or RSC payload (the check already run on Content Impact).

**Decide together (does not block the merge):**
- Finding 16: what the competitor marker in prompt gaps should mean.
- Danielle (F-5): whether any mostly-blank column (AI-referred Δ is `--` on 89% of rows) should go,
  once she has seen it on staging.
- Tina: the bot-chart quadrant wording, and whether the gap table's inner heading is redundant under
  the new card title.

**Later, separate PRs:**
- D-10: URL citations ignore the date picker (fixed last 30 days); includes a one-day mismatch between
  `last30()` and `parseDateRange('last_30_days')`.
- PR Influence still reads the truncated `getDomainCoverage` (D-20).
- `scripts/check-rsc-props.ts:74`: make the `/.claude/` skip relative to the working directory, so a
  worktree checks itself.
- `vitest.config.ts`: `lib/content-calendar/merge-tabs.test.ts` and `date.test.ts` are not in the
  include allowlist and have never run.

**Cleanup (no urgency):** Findings 14, 15, 17, 18, 19; switch accessibility polish (focus ring,
`role="alert"` on its error); edge-case tests for the competitor builders (row caps, zero denominators);
stale "§H" comments in `content-impact.tsx`.

**Closed on the branch:** Findings 1–12 and 20–22.
