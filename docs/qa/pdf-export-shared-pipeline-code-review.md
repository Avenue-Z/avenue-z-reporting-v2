# Code Review Record — `feat/pdf-export-shared-pipeline` (PR #348)

**Feature under review:** PR #348 — `feat(export): one export pipeline for any section (PDF export PR 1 of 3)`
**Diff range reviewed:** `e659cfb..b9e9fd0` (`origin/dev` → PR head; six commits, `f253156`..`b9e9fd0`). No unrelated code.
**Spec / plan:** `docs/superpowers/specs/2026-10-08-pdf-export-all-reports-design.md`,
`docs/superpowers/plans/2026-10-08-pdf-export-pr1-shared-pipeline.md` (branch `docs/pdf-export-all-reports-spec`).
**Reviewers:** Paul, Thomas.
**This document changes no code.**

| File | Change |
|---|---|
| `lib/export/sections.ts` | new — `ServerExportSection`, `SERVER_EXPORT_SECTIONS = ['organic-social']`, `isServerExportSection` |
| `lib/export/request.ts` | `section` (default `organic-social`) and `models`; the path is `/export/<slug>/<section>` |
| `lib/export/report-view.ts` | new — `resolveExportView`, pure: tab, title, channel, view |
| `components/export/report-element.tsx` | new — `exportReportElement`: the live report component and its props |
| `app/export/[clientSlug]/[section]/page.tsx` | replaces `…/organic-social`; 404 unless the section is switched on and enabled |
| `app/api/export/pdf/route.ts` | 404 per section; `section=` in the log line |
| `components/export-pdf-button.tsx`, both `reports/page.tsx` | `serverExport` gains `section`/`models`, is offered only for switched-on sections, and sends the resolved tab |
| `components/charts/{bar,combo}-chart.tsx` | no animation in export mode; `BarChart`'s panel stays dark |
| tests | the parity and button-payload tests, request, route, page and chart tests, the acceptance run, and the re-baselined locked-months snapshot |
| deleted | `lib/export/organic-social-view.ts` and its pages test (folded into the above) |

---

## §1 How it works

**What users see:** nothing new. Only Organic Social is in `SERVER_EXPORT_SECTIONS`, so every other section's Export
PDF button keeps printing in the browser. PR 2 adds `peec-ai` and PR 3 adds `paid-media`, each once its components
have export forms.

**The request.** The button POSTs `{ clientSlug, section, subsection, dateRange, compareRange, models, tz }`.
- `parseExportRequest` (`lib/export/request.ts:41`) treats a missing `section` as `organic-social`. A page opened
  before this deploy posts no section, and its button was Organic Social's.
- Any section outside the allow-list makes the parser return null, which the route answers with **400** before auth,
  the DB or Chromium.
- `models` must match `^[A-Za-z,]{1,128}$` (`:21`).
- Role and client still come only from the session.

**Which view.** `resolveExportView(client, section, subsection)` returns the page's resolution.
- **Organic Social:** `resolveOrganicSubsection`, including #334's Influencer tab (no channel, `view: 'influencer'`,
  titled "Influencer").
- **AEO and Paid Media:** the tab from `AEO_SUBSECTIONS` / `PAID_MEDIA_SUBSECTIONS` unless the client hides it.
  Unknown or hidden means Overview, titled "Answer Engine Optimization" or "Overview" respectively.
- It's pure. The route imports only this module, so it never imports a report component.

**What renders.** The export page (`app/export/[clientSlug]/[section]/page.tsx:40`):
- 404s unless the section is switched on and enabled for the client;
- calls `exportReportElement(view, params)`, which returns exactly the component and props each report page renders
  for that tab;
- prints it inside `ExportModeProvider`, as before;
- applies locked months (Organic Social only) inside `OrganicSocialReport`, unchanged.

**The button.** Both report pages pass `serverExport` only when `isServerExportSection(activeSection)`. They send
`resolveExportView(...).subsectionId` (portal `page.tsx:297`, dashboard `page.tsx:282`), so the tab the export
renders is the tab the page resolved, never the raw URL param. `models` is serialized only for AEO.

**Charts.** In export mode `BarChart` and `ComboChart` pass `isAnimationActive: false`, so a PDF can't catch a bar
mid-animation. `BarChart` marks its own panel `data-export-chart` so it stays dark, as the line chart does.

---

## §2 Verification method

- **Unit, executed:** `npx vitest run` 2516/2516, `tsc` clean, lint 0 errors in changed files, and `next build`
  compiles both routes. Every new test was run failing before its code existed.
- **Parity, executed** (`components/export/report-views.pages.test.tsx`):
  - runs both real report routes (portal and dashboard) for Organic Social (Overview, LinkedIn, Influencer, unknown),
    AEO (Overview, PR Influence, Content Impact, Technical Audit, unknown) and Paid Media (Overview, Paid Search,
    Meta, LinkedIn, unknown), plus a hidden tab;
  - asserts the export element's component and props, and the title, equal the page's;
  - the one difference is named in the test (#1 below).
- **Button payload, executed** (`components/export/report-views.button.test.tsx`): with the allow-list mocked to all
  three sections, the button sends the resolved tab (raw `Technical-Audit`, `pr_influence`, unknown or hidden → null)
  and the route's parser accepts the payload. Written for the final review's Important finding (#2), failing 6/12
  before the fix.
- **Snapshot probe, executed:** `locked-months-parity` changes for every case because each digest hashes the whole
  route tree, including the button. A throwaway probe hashed every case with `ExportPdfButton` removed, on this branch
  and on `origin/dev` `e659cfb`, with the same pinned clock. All 232 cases, both representative trees and the
  other-section case were identical.
- **Acceptance, real Chrome** (`npm run e2e:export`, production build, Node 26.7.0, live data), all green:
  - Renaissance as a client;
  - a body with **no section** (deploy skew) → 200, Organic Social;
  - A Place for Mom Instagram as staff and as a client, printing the same.

  The log lines read `section=organic-social`.
- **Final review, executed:** a fresh reviewer on the whole branch, with the plan's five Review Focus items. All five
  held. No Critical, one Important (fixed, #2), four Minor (#3–#6).

---

## §3 Findings

Sev: **●** correctness · **○** cleanup/convention. Status: CONFIRMED (proven in-tree) · PLAUSIBLE (code confirmed,
external trigger unverified).

| # | Sev | Status | Location | Finding | Outcome |
|---|-----|--------|----------|---------|---------|
| 1 | ● | CONFIRMED | `app/dashboard/[clientSlug]/reports/page.tsx:91` | Live-page drift: the dashboard renders Paid Media Overview without `compareRange`; the portal passes it. The export follows the portal. | Named in the parity test; live page not changed here (§5) |
| 2 | ● | CONFIRMED | both `reports/page.tsx` (`serverExport`) | Final review, Important: for AEO and Paid Media the button sent the raw `?subsection=`, so a tab the page shows as Overview (`Technical-Audit`, `pr_influence`, unknown) would 400 once those sections are switched on. | **Fixed** `b9e9fd0` |
| 3 | ○ | CONFIRMED | `components/export/report-views.pages.test.tsx:75` | AEO with an unknown tab: the page shows no period (its `usesPageRange` is false) but the export stamps one. The test skips the case instead of naming it. | Follow-up (§5) |
| 4 | ○ | CONFIRMED | `components/charts/bar-chart.tsx:38` | A change to the Organic Social PDF: a single-month YTD Review graph (`ytd-review.tsx:47`, a `BarChart`) now prints in the dark chart panel, unanimated, as the multi-month line chart does. | Accepted; stated in the PR |
| 5 | ○ | CONFIRMED | `app/export/[clientSlug]/[section]/page.test.tsx:44` | Stale comment citing the deleted `organic-social-view.pages.test.tsx`. | Follow-up |
| 6 | ○ | CONFIRMED | `components/export/report-views.pages.test.tsx` | The hidden-tab parity case covers AEO only. Paid Media's hidden tab is covered by the button test (#2), not the parity test. | Follow-up |
| 7 | ○ | CONFIRMED | `lib/export/request.ts:41` | Deploy skew: a body with no `section` is Organic Social. Pinned by unit, route and acceptance tests. | By design |

---

## §4 Detail

**#1 — Paid Media Overview `compareRange`.** `getReportComponent` is duplicated in the portal and dashboard routes
(tracked tech debt), and the dashboard's Paid Media Overview case dropped `compareRange`. The export has one builder,
so it can match only one of them. It follows the portal: the report does take the comparison, and clients see the
portal. The parity test asserts the dashboard's props plus `compareRange`, so it would fail if either side changed.
*Suggested:* pass `compareRange` in the dashboard route, a one-line live-page fix as its own PR.

**#2 — The resolved tab.** Organic Social already sent the resolved `organicEntry.id`. AEO and Paid Media sent the raw
param, which the route validates as a slug (`^[a-z0-9-]{1,64}$`). An unusual URL the page tolerates (it falls back to
Overview) would have failed the export with "The PDF couldn't be created." *Fixed:* both pages send
`resolveExportView(client, activeSection, subsectionParam ?? null).subsectionId` for every section.

**#3 — The AEO unknown-tab stamp.** Both pages compute `usesPageRange` with
`!subsection || !!AEO_SUBSECTION_NAMES[subsection]`, so a bogus tab shows no date picker or period, though the
Overview it renders does use the range. The export resolves the tab first and stamps the period. Arguably the export
is the more correct one. *Suggested:* name the case in the parity test (assert `periodLabel === null` for AEO's
unknown tab, with a comment) when PR 2 touches it.

**#4 — The YTD bar panel.** It's consistent with every other Organic Social chart in the PDF, which keep their dark
panel because the brand colours are unreadable on white. *Accepted.*

---

## §5 Follow-ups

**Needs a live call first**
- None for this PR: nothing users see changes. PR 2's switch-on is the first live check for AEO.

**Before PR 2 switches AEO on**
- #3: name the AEO unknown-tab stamp case in the parity test.

**Decide together**
- #1: fix the dashboard's Paid Media Overview `compareRange` (live page, its own PR).

**Cleanup**
- #5: update the stale comment.
- #6: add a Paid Media hidden-tab parity case.
