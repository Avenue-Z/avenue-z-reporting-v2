# Code Review Record — `feat/organic-social-pdf-export-v2` (PR #332)

**Feature under review:** PR #332 — `feat(export): server-rendered Organic Social PDF export (v2)`
**Diff range reviewed:** `0b5a0a9..60dc6ee`: #320's three commits (`9139d53`, `4cf432b`, `4a62416`), the v2 commits
(`bc146d3`..`5f0a882`, `b2f00d2`, `e4f4729`, `565c45b` for Thomas's first review, `2a9bbe8`..`5e84ac4` for his
second, and `60dc6ee` for his third), and the merge of `dev` (`750065e`) that cleared a conflict. The merge
brings in other merged work from `dev`, which is out of scope here except where it touched this feature (§3 #3).
**Supersedes:** PR #320 and its record PR #321 (`docs/qa/organic-social-pdf-export-code-review.md`), whose findings
carry forward where still relevant. **#321 merges alongside this record** (decided on #321, 2026-10-08), so that path
resolves and the v1 record stays next to this one in `docs/qa/`. #320 itself closes unmerged: its commits arrive
through #332.
**Reviewers:** Paul, Thomas.
**This document changes no code.**

Files in scope (v2; #320's are listed in #321):

| File | Change |
|---|---|
| `app/api/export/pdf/route.ts` | new — POST: validate, authorise (portal rule), render, respond, log |
| `app/export/[clientSlug]/organic-social/page.tsx` | new — the export page |
| `app/export/export-theme.css` | new — scoped light theme + `[data-export-block]` / `[data-export-hide]` / `[data-export-keep-with-next]`, `.no-print` backstop |
| `lib/export/{readiness,request,filename,organic-social-view,render-pdf}.ts` | new — readiness, request validation, filename/stamp, view, Chromium rendering |
| `components/export/export-mode.tsx` | new — `ExportModeProvider`, `useExportMode`, `ExportReadyReporter` |
| `components/charts/line-chart.tsx` | `ChartMark.label`; export: no animation, dark-panel marker |
| `components/report-sections/organic-social/{trends,export-annotations,annotation-callouts}.tsx` | export rendering of charts + annotations; `safeHref`/`Thumb` exported |
| `components/report-sections/organic-social/{sortable-top-content,post-card}.tsx`, `parts/top-content.tsx` | export rendering of Top Content |
| `components/report-sections/organic-social/{skeletons,platform-headlines,outline-tiles}.tsx`, `shared/shared-parts-header.tsx` | pending + block markers |
| `components/report-sections/commentary/{commentary-panel,index,monthly}.tsx`, `lib/commentary/month.ts` | export: the client's entry, chosen server-side (`clientEntryId`, `clientMonthEntry`) |
| `components/report-sections/organic-social/ytd-notes-panel.tsx` | export form: approved notes only, numbered like their marks |
| `components/report-sections/organic-social/{index.tsx,parts/export-layout.ts}`, `parts/ytd-review{,-sheet}.tsx` | how each part pages: own blocks, or wrapped whole; YTD cards as blocks, title kept with the first |
| `components/export-pdf-button.tsx`, `app/{portal,dashboard}/[clientSlug]/reports/page.tsx` | server export on Organic Social |
| `lib/organic-social/annotations.ts` | `isClientVisible` |
| `lib/auth/route-access.ts`, `proxy.ts` | `/export/<slug>` under the portal rule |
| `next.config.ts`, `package.json`, `.env.example`, `vitest.config.ts` | deps, external packages + file tracing, env doc, test registration |
| `e2e/export/{acceptance.mts,pdf-check.ts}` | local acceptance script (`npm run e2e:export`) |

---

## §1 How it works

**The request.** On Organic Social, Export PDF POSTs `{ clientSlug, subsection, dateRange, compareRange, tz }` to
`/api/export/pdf` (`components/export-pdf-button.tsx`). The report pages fill it with the *served* view: the
resolved tab and the locked-month-aware ranges. Every other section keeps #320's `window.print()` button.

**Who may export what.** The route (`app/api/export/pdf/route.ts`) validates the body (`lib/export/request.ts`:
slug and tab `[a-z0-9-]{1,64}`, ranges `[A-Za-z0-9_:,-]{1,64}`, an unknown timezone → UTC; any other field is
dropped), then applies `canOpenPortal(slug, session.user)`: staff may export any client, a client only its own.
**Role and client never come from the body.** A client without Organic Social is a 404. The export page applies
the same rule again on its own slug (`requirePortalAccess`), and `/export/<slug>` sits under the proxy with the
portal's rule (`lib/auth/route-access.ts`), so no single check is the only one.

**Rendering.** `renderPdf` (`lib/export/render-pdf.ts`) launches Chromium (`@sparticuz/chromium` when `VERCEL` is
set, else `CHROME_EXECUTABLE_PATH`), sets **only the requester's Auth.js session cookie(s)** on the browser (no
cookie is minted, so the export can never see more than its requester), opens
`/export/<slug>/organic-social?…` on this deployment (`VERCEL_URL` → `APP_URL` → request origin, cache-warm's
rule) at a **979 × 739** viewport, the content box of an 11 × 8.5 in page with 0.4 in margins, waits for
`window.__exportReady`, switches to **screen** media (the app's global `@media print` rules are for printing the
live page and must not apply), and prints Letter landscape. Launch, navigation and the ready wait share one **40 s**
budget that starts before launch; out of time → `ExportNotReadyError` → **504**, and nothing is printed. `page.pdf()`
has its own deadline, 55 s from the same start. The setup calls and the switch to screen media take no timeout of their
own, so they are raced against the same budgets (`60dc6ee`). Every step is bounded, and the whole render stays inside
the route's `maxDuration = 60` with room for the response. The browser closes in `finally`, killed if closing takes
over 3 s. A PDF over 4 MB is refused (413 `too-large`) before Vercel's
4.5 MB response limit would reject it.

**The export page** (`app/export/[clientSlug]/organic-social/page.tsx`) renders the **same `OrganicSocialReport`**
as the live page with the URL's raw range. `OrganicSocialBody` resolves the locked month from that range itself,
so the served range is the live page's by construction. The header names client and view and stamps
`Exported <time> <tz> · Reporting period <served range>`, the time in the requester's timezone.

**When is the page "ready"?** `ExportReadyReporter` sets the flag after two consecutive frames (after
`document.fonts.ready`) on which `isDocumentReady` holds (`lib/export/readiness.ts`):
- no `[data-export-pending]`: every Organic Social skeleton shares one `Pulse` that carries it, and the shared
  parts (Commentary) header's fallback is a hidden marker instead of `null`;
- every `<img>` complete;
- every Recharts container has drawn its surface.

**Page breaks.** `[data-export-block]` is `break-inside: avoid` (`app/export/export-theme.css`). The blocks are:
- each platform's label + KPI row;
- a chart's title + legend + chart;
- each annotation;
- each row of five Top Content cards;
- Commentary.

Every title sits inside its first block, so it cannot end a page alone. The page lays out at the paper's width,
so nothing overflows and Chrome never shrinks the page (the accident behind #320's regressions).

**Annotations.** `isClientVisible` (not hidden, not a draft-only day) is now the one rule behind the live chart's
dots, the callout row's print rule and the export. Export mode numbers the visible annotations in date order,
draws each number at its point (`ChartMark.label`), and lists them under the chart with their date, label, full
approved note and linked post thumbnails. No hover cards, toggles or note editors print.

**Links.** Each Top Content card is one link to its post through `safeHref` (http(s) only; `javascript:` and
others are not linked), with "View post ↗" styled as a link.

**What staff see in an export.** Exactly what the client sees:
- hidden and draft annotations are excluded by the data rule above;
- Commentary prints the approved entry for the page's period (never a draft, never another period's);
- hidden influencer rows and designation toggles are not rendered.

---

## §2 Verification method

- **Unit / route (executed):** `npx vitest run` 2300/2300 on the merged branch, `npx tsc --noEmit` clean, lint 0 errors. Each new test
  was watched failing first.
- **Mutation-checked** (code broken on purpose, the matching test failed):
  - the route's access guard;
  - the readiness check;
  - the export view's title;
  - the `isClientVisible` filter;
  - the approved-only commentary rule;
  - the chart's animation-off flag;
  - the `break-inside` rule (in the acceptance script, below).
- **Parity (T16, probed):** every `locked-months-parity` hash changed, because each hashes a whole route tree and
  the Export PDF button is in every tree (#320's `periodLabel`/`pageTitle`, #320 adding it to the staff dashboard
  SPA, then `serverExport`). A throwaway probe hashed every case with the `ExportPdfButton` element removed, on this
  branch and on `dev`'s merge-base (`4a46956`), with the same pinned clock. All 232 cases, both representative trees,
  and the other-section case were identical. Organic Social skeleton goldens change only by the new attributes
  (checked line by line). `commentary-parity` gained 48 lines, all `"clientEntryId": "sep"`, and nothing else.
- **Acceptance, real Chromium** (`npm run e2e:export`, local):
  - Fixture through the real `renderPdf` and theme: every block on one page, every title with its first block,
    nothing outside the content box (2 pt glyph tolerance, measured), an oversized block split, never-ready →
    `ExportNotReadyError` with no PDF. With `break-inside` removed, 7 blocks split and fail.
  - Live route on a local production build as a Renaissance client: 200 in ~3.5 s,
    `Renaissance – Organic Social – <date>.pdf`, stamped, inside the box, **66/66 posts linked**, 11 pages,
    **2.50 MB** (gated under Vercel's 4.5 MB; all 67 images embedded as JPEG).
- **Round 2, executed at `5e84ac4`:** `npx vitest run` 2327/2327, `tsc` clean, no lint errors in changed files.
  `npm run e2e:export` was run on **Node 26.7.0**. On Node 20 (CI's) the script fails at launch under `tsx`, which
  is the script runner and not the product (now noted in the script). Thomas independently confirmed these numbers on
  Node 20 in a clean worktree, plus `check:rsc` and `next build`, and the merge `dev` + #337 + #332.
- **Round 3, executed at `60dc6ee`:** `npx vitest run` 2329/2329, `tsc` clean, `next build`, and `npm run e2e:export`
  all green (Node 26.7.0), live run included. The two new tests (a setup call and a media switch that never answer)
  fail on `5e84ac4` and pass on `60dc6ee`.
  - `npm run e2e:export` adds a keep-with-next fixture with a control. Without the attribute, the title ends page 1
    alone (1 / 2); with it, the title moves with its card (2 / 2).
  - The live run adds A Place for Mom's Instagram tab (locked months, YTD v1, breakdown, annotations; August,
    which both roles can see) as a staff editor and as a client. Both returned 200 in ~1.9 s, 8 pages, 1.16 MB,
    inside the box, with no editor, draft or button text (`Draft|Approve|Revoke|Add annotation|Add commentary|Edit|Hidden`).
  - The two print the same glyphs in order, with every page starting at the same y. Extracted word splits differ
    only by sub-pixel placement (max 0.07 pt).
  - Component tests as staff with every control: trend chart (list and marks equal the client's), YTD notes,
    commentary, Top Content.
- **Real click** (Chrome, client session, `/portal/renaissance/reports?section=organic-social`): "Preparing PDF…",
  then the named PDF downloaded in 5.5 s. Staff export of the LinkedIn tab checked visually (KPIs 5 across,
  follower graph in its dark panel).
- **Vercel preview** (`avenue-z-reporting-v2-rihse4lqe…`): the build with `@sparticuz/chromium` and its file
  tracing succeeded. Previews are **not** behind Vercel deployment protection (`/login` → 200, no SSO), so no
  bypass is needed. The deployed route answers an unauthenticated POST with its own 403.
- **Independent review (executed):** a separate reviewer agent read the full diff for correctness and security
  and probed its findings. 2 confirmed correctness defects, 3 plausible, 5 cleanups; security clean. All are
  in §3 (R-series) with what was done.
- **Real export on Vercel (executed):** Paul, signed in on the `565c45b` preview, exported Renaissance's Overview.
  The function logged `[export] client=renaissance view=overview outcome=ok ms=9183` (9.2 s including the cold
  start). The PDF: 11 Letter-landscape pages, 2.47 MB, 69 JPEG images, 68 links, producer `Skia/PDF m153`
  (`@sparticuz/chromium`'s Chromium 153, so it launched inside the function).
- **Not verified (flagged, not asserted):** the function's memory under that export (the Observability tab only),
  and Safari/Firefox. The render runs on the server, but the download runs in the user's browser:
  the link is now attached to the page for the click (`565c45b`), which older Firefox needed. Neither current
  Firefox nor Safari has been run.

---

## §3 Findings

Sev: **●** correctness · **○** cleanup/convention.
Status: CONFIRMED (proven in-tree) · PLAUSIBLE (code confirmed, external trigger unverified).
R = raised by the independent reviewer agent; T = raised by Thomas on #332; others found while building or verifying.

| # | Sev | Status | Location | Finding | Outcome |
|---|-----|--------|----------|---------|---------|
| R1 | ● | CONFIRMED | `app/api/export/pdf/route.ts`; post images | The PDF was **31 MB**, over Vercel's 4.5 MB function response limit: a deploy blocker. Dash serves 640 px WebP and Chromium stores WebP losslessly. | **Fixed** `b2f00d2` + `e4f4729`: 2.50 MB |
| R2 | ● | CONFIRMED | `commentary-panel.tsx` (export) | A staff export printed no commentary when staff had a newer draft for another period, though the client sees an approved one. | **Fixed** `e4f4729` |
| R3 | ● | PLAUSIBLE | `lib/export/render-pdf.ts` | Navigation got the full 45 s after launch, so launch + navigation + `pdf()` could exceed `maxDuration = 60`. | **Fixed** `e4f4729` (one 40 s budget) + `565c45b` (`pdf()` deadline, T1) |
| R4 | ● | PLAUSIBLE | `post-card.tsx` (export) | An image that failed before hydration printed as a broken icon, not the placeholder. | **Fixed** `b2f00d2` |
| R5 | ○ | PLAUSIBLE | `parts/engagement-breakdown.tsx` | Its skeleton had no pending marker. | **Fixed** `e4f4729` |
| R6 | ○ | CONFIRMED | `parts/top-content-outline.tsx` | `top-content@3`'s title could end a page alone. | **Fixed** `e4f4729` |
| R7 | ○ | CONFIRMED | `trends.tsx` (export) | An annotation on a day with no point on the series is numbered in the list but has no mark on the chart. | **Fixed** `2a9bbe8` (T10): listed, unnumbered |
| R8 | ○ | PLAUSIBLE | `export-pdf-button.tsx` | The blob URL was revoked right after `click()`. | **Fixed** `e4f4729` |
| R9 | ○ | PLAUSIBLE | `render-pdf.ts` `launchChromium` | Launch options differed from `@sparticuz/chromium`'s README (`headless: true`). | **Fixed** `e4f4729` (README form) |
| R10 | ○ | PLAUSIBLE | route `baseUrl` | Off Vercel without `APP_URL`, the self-load trusted the request's Host header. | **Fixed** `e4f4729`: not in production |
| T1 | ● | CONFIRMED | `render-pdf.ts:96` | `page.pdf()` ran on puppeteer's default 30 s timeout after the 40 s budget: a worst case of 70 s against `maxDuration = 60`, where a platform kill skips the log line and Chromium's close. R3 was only partly fixed without it. | **Fixed** `565c45b` |
| T2 | ○ | PLAUSIBLE | `route.ts:69` | No runtime guard on the 4.5 MB response limit, and `outcome=ok` was logged before the platform rejected the response. | **Fixed** `565c45b`: 413 `too-large` over 4 MB |
| T3 | ○ | CONFIRMED | `export-pdf-button.tsx:82` | No request timeout: a silently dropped connection left the button on "Preparing PDF…". | **Fixed** `565c45b`: gives up at 70 s |
| T4 | ○ | PLAUSIBLE | `export-pdf-button.tsx:95` | A malformed `filename*` made `decodeURIComponent` throw, reporting a finished PDF as a failure. | **Fixed** `565c45b`: falls back to the ASCII name |
| T5 | ○ | PLAUSIBLE | `export-pdf-button.tsx:94` | The download link was clicked detached from the page, which older Firefox does not download. | **Fixed** `565c45b`; current Firefox not run |
| T6 | ○ | CONFIRMED | `app/export/…/page.tsx:41` | The export page resolved the tab twice (correctness-neutral). | **Fixed** `565c45b`: one lookup returns the channel |
| T7 | ● | CONFIRMED | `ytd-notes-panel.tsx:30`, `export-theme.css:31` | **Blocker.** A staff export printed the YTD notes editor: `Draft: <text>` and Approve/Delete. Its wrapper is `no-print`, which applies only under `@media print`, and the export renders in screen media. | **Fixed** `2a9bbe8`: export form + `.no-print` backstop |
| T8 | ● | CONFIRMED | `organic-social/index.tsx:103` | Parts with no export form were not unbreakable blocks: a YTD title could end a page alone, and a card or tile row could split. | **Fixed** `e08da91`: `parts/export-layout.ts` (supersedes #5) |
| T9 | ● | CONFIRMED | `commentary-panel.tsx:227` | The export re-picked the newest approved entry. A locked-months client opens on `pickMonthDefault` (a whole-month entry wins), so Sep 15–30 printed where the client sees Sep 1–30. | **Fixed** `b5c8b3d`: chosen server-side |
| T10 | ○ | CONFIRMED | `trends.tsx:258` | Marker numbers could skip on the chart while the list ran 1 to n. | **Fixed** `2a9bbe8` |
| T11 | ● | CONFIRMED | `ytd-notes.ts` | An approved YTD note on a data point went only to the chart's hover, so it printed as a bare dot. | **Fixed** `2a9bbe8`: numbered marks + list |
| T12 | ● | CONFIRMED | `e2e/export/acceptance.mts:1` | The tests missed the paths above: live run on Overview only, no staff export, no platform tab, YTD or locked month. | **Fixed** `782a8a7` (§2) |
| T13 | ○ | PLAUSIBLE | `render-pdf.ts:17`, `:109` | The budgets started after auth and the DB read, and `browser.close()` had no bound. | **Fixed** `5e84ac4`: `startedAt`; close raced 3 s, then SIGKILL |
| T14 | ○ | CONFIRMED | `route.ts:89` | Setup calls logged `step=unknown`; a not-ready export logged no step. | **Fixed** `5e84ac4`: `step=setup`; `step=navigate`/`ready` |
| T15 | ○ | PLAUSIBLE | `route.ts:40` | No per-user concurrency or rate limit; each request holds a Chromium for up to ~58 s. | Follow-up (§5) |
| T17 | ○ | CONFIRMED | `render-pdf.ts:92` | The setup calls and `emulateMediaType` had no deadline: puppeteer's 180 s protocol default applied, past `maxDuration`. | **Fixed** `60dc6ee`: raced against the ready budget / print deadline |
| T16 | ○ | CONFIRMED | `locked-months-parity.test.tsx.snap` | Every hash was re-baselined, which could hide another change. | **Verified safe** (§2): identical to `dev` with the button removed |
| 10 | ● | CONFIRMED | `export-annotations.tsx:24` | Found by T12's live run: the export list printed each annotation's day twice (`8/25 · 8/25 \| +42 Followers`), because a label already starts with its day. Unit fixtures used invented labels. | **Fixed** `782a8a7` |
| 1 | ● | CONFIRMED | `post-card.tsx` (export) | Square images made a card row 387 px, so every row took a page (16 pages). | **Fixed** `bd10390`: 4:3, 11 pages |
| 2 | ● | CONFIRMED | route, local runs | The local self-load followed `.env.local`'s `APP_URL=:3000` to the wrong port. | Operator note |
| 3 | ● | CONFIRMED | merge with `dev` | `dev`'s month/day graph dates were not in the export path. | **Fixed** in merge `750065e` |
| 4 | ● | CONFIRMED | `launchChromium` on Vercel | Chromium had not been launched inside a Vercel function. | **Verified** on the `565c45b` preview: `outcome=ok ms=9183`, producer `Skia/PDF m153` |
| 5 | ○ | CONFIRMED | outline parts | `ytd-review*`, `engagement-breakdown`, outline `platform-headlines` have no block structure. | **Fixed** `e08da91` (T8) |
| 6 | ○ | CONFIRMED | `sortable-top-content.tsx` | The export prints each platform's first carousel page in the default sort. | By design (spec) |
| 7 | ○ | CONFIRMED | Renaissance config | Renaissance shows no annotations until `engagement-trend@2` / `follower-graph@2` are pinned. | Config follow-up |
| 8 | ○ | CONFIRMED | `e2e/export/acceptance.mts` | The acceptance run is local only (no Chromium in CI). | Recorded in §2 |
| 9 | ○ | CONFIRMED | `export-theme.css` | The light theme remaps a fixed list of baked-in utilities. | Follow-up when one is added |

---

## §4 Detail

**R1 — 31 MB PDF.** `pdfimages -list` on the live export: 67 images, each 640 × 640, Flate-encoded at 450–660 KB.
Two causes, two fixes:
1. *Size.* `lib/export/print-image.ts` rewrites a post image's URL to Dash's own resizing service as
   `w=360&h=270&fit=cover&format=jpeg&quality=70` (annotation thumbnails 160 × 160). It only applies to
   `https://images.dashsocial.com`; any other URL is left untouched, so there is no proxy and no new fetch surface.
   The service answers 301 without `quality`.
2. *Format.* The service negotiates on `Accept`: Chrome's own header (it lists `image/webp`) still got WebP for
   `format=jpeg`, and the images stayed Flate at 400 × 300 (11.5 MB). `renderPdf` now sends `Accept: */*`, and the
   service serves the JPEG, which Chromium embeds as is.

Result: 2.50 MB, all 67 images JPEG. `npm run e2e:export` fails above 4.5 MB.

**R2 — Staff commentary.** For staff, `initialId` is the newest entry including drafts; the export printed only an
approved entry with that draft's exact period, so an October draft hid September's approved commentary.
*Fixed:* the export picks what a client sees, `pickDefaultEntry` over approved entries only. On a locked month the
entries are already that month's (`monthly.tsx`). Tested with the reviewer's scenario.

**R3 / T1 — Time budget.** `renderPdf` gives navigation and the ready wait whatever is left of one 40 s budget that
starts before launch (tested with a 10 s launch: navigation gets 30 s). That alone did not bound the render: Thomas
found `page.pdf()` still ran on puppeteer's default 30 s timeout (worst case 70 s). It now has its own deadline, 55 s
from the same start, measured against the function's limit rather than what is left of the ready budget, so a page
ready at 38 s still gets 17 s to print (tested). The render stays inside `maxDuration = 60` with room for the response.

**R7 — Off-chart annotations.** A client-visible annotation on a day with no point on the series (e.g. just before
the month) is still listed and numbered, but has no mark. Dropping it would hide what the client sees on the live
page (the live chart shows it in the row above the chart). *Kept* in the list. Since `2a9bbe8` (T10), only marked annotations are numbered and an off-chart one is listed
without a number, so the chart's numbers never skip.

**T7 / T11 — YTD notes in the export.** `YtdNotesPanel` returns an export form whenever export mode is on, whatever
the role. It lists the approved notes on points, numbered in mark order (the chart numbers its unlabelled marks the
same way), then approved notes that aren't on a point, unnumbered. Each note is a block. `.export-theme .no-print`
hides anything else marked live-only.

**T8 — Paging every part.** `parts/export-layout.ts` classifies every registered part as `own` (it marks its own
blocks) or `block` (wrapped whole; an unknown part is wrapped, fail-safe). A test holds the map to the registry, so a
part can't be registered without a decision. YTD Review's cards are blocks and its title carries
`data-export-keep-with-next` (`break-after: avoid`), verified in Chromium 153 against a control.

**T9 — Commentary.** The server passes `clientEntryId`. Without locked months it is `pickDefaultEntry` over what a
client gets. With them it is `clientMonthEntry`: none unless the served month is in the client's own list
(`lockedRangeFor` with a client role), else `pickMonthDefault` with the client cutoff. For a client viewer it equals
`initialId`. A month clients can't see yet prints no commentary.

**#1 — One card row per page.** Measured at 979 px: card rows 387 px; two rows plus the gap (794 px) exceed the
739 px page. *Fixed (`bd10390`):* 4:3 export images (rows 341 px); the same export went from 16 to 11 pages.

**#2 — Local self-load origin.** The route loads the export page from `VERCEL_URL`, else `APP_URL`, else (not in
production) the request origin. Locally `APP_URL=http://localhost:3000` sent Chromium to the wrong port and the
route answered `render-failed step=navigate`. The step in the log line is what found it. *Resolution:* correct on
Vercel; local runs set `APP_URL` to the port they serve on.

**#3 — Month/day dates.** `dev` moved Organic Social graph dates to `9/16` (opt-in `xFormat="month-day"`, shared
`dayLabel`). The export chart is its own render path, so the merge was textually clean but the export would have
kept ISO ticks and `Sep 10`. *Fixed in the merge commit;* the export annotation test pins both.

**#4 — Chromium on Vercel.** The preview build traced `@sparticuz/chromium`'s binary into the route and kept both
packages external. *Verified (2026-10-07):* a signed-in export on the `565c45b` preview logged `outcome=ok ms=9183`,
and the PDF's producer is `Skia/PDF m153`, the serverless Chromium. Still to read: the function's memory on the
Observability tab (Thomas: Fluid compute can put two concurrent exports, two Chromiums, on one 2 GB instance).

---

## §5 Follow-ups

**Done**
- **#4:** a signed-in Export PDF on the `565c45b` preview: `outcome=ok` in 9.2 s, the named PDF downloaded.

**Needs a live call first**
- One signed-in Export PDF on the preview of `60dc6ee`, as a client and as staff on a tab with YTD notes. The round-2
  and round-3 commits have only run locally.

**Follow-up (filed, not in #332)**
- **T15:** one export at a time per user. This needs state shared across function instances (an in-memory lock holds
  per instance only). Until then the cost is capped by `maxDuration` and the auth gate.

**Needs a look (does not block)**
- The export function's memory on Vercel's Observability tab, for the concurrent-exports question.

**Decide together**
- **#7:** pin `engagement-trend@2` / `follower-graph@2` for Renaissance if its exports should carry annotations
  (config, not code).
- **#6:** whether the export should follow the on-screen carousel sort and page (would need the button to send them).

**Cleanup**
- **#9:** add any new dark utility an Organic Social component gains to `export-theme.css`.
- **#2:** note on `.env.example`'s `APP_URL` line that the PDF export's server browser loads from it, so a local
  server on another port needs it set to that port.

**Carried from #321 (#320's record), now resolved by v2 on Organic Social:** export while loading (#7 there) is
closed by the readiness signal; the clipped chart (#8) by laying out at paper width; print regeneration (#9) no
longer applies (no browser print on Organic Social). They remain as described there for the other sections, which
still use browser print.
