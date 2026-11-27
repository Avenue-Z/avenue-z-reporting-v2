# Technical Audit snapshot page — Code Review

Reviewed: the monthly Technical Audit snapshot page on branch `feat/technical-audit-snapshots`, opened into `dev`
as **PR #534** (`feat(technical-audit): monthly Technical Audit snapshot page`). It rebuilds the AEO **Technical
Performance** tab as one snapshot per Screaming Frog crawl folder, filled automatically from Screaming Frog and
Ahrefs by a daily sweep, with Google Search Console uploads, a staff "Before you publish" checklist, manual
publish, a merged issue list with strategist hide/annotate, and snapshot-bound commentary. Review scope is
exactly the diff `5c325dd4..94e122b2` (`5c325dd4` is the merge-base with `origin/dev`; the range contains merge
commit `224b4c97` from `dev`, whose own changes are excluded because the review reads `git diff 5c325dd4..94e122b2`)
— 96 files, +10,342 / −2,747, no unrelated code.

This document is the review record (comprehension gate per `CLAUDE.md` §"Branch Flow & Promotion Pipeline",
Stage 1). It captures how the feature works, the findings, and how each finding was verified. **No code is
changed here** — the fixes are tracked as follow-ups in §5.

---

## 1. How it works (comprehension summary)

The page answers three questions top to bottom: how healthy is the site (four tiles), what changed since the last
published month (six KPIs + trend chart), and what to investigate (one merged, ranked issue list). Nothing on the
page is estimated or AI-generated: every number is a count or score read from Ahrefs, a Screaming Frog export or an
uploaded GSC export, stored per snapshot in Neon (migration `drizzle/0033_technical_audit.sql`, five
`tech_audit_*` tables + `clients.sf_drive_folder_id` / `clients.ahrefs_project_id`).

**Snapshot lifecycle.**
- **One snapshot per Screaming Frog run folder.** The daily cron `/api/tech-audit/sweep` (`vercel.json`, `20 6 * * *`
  UTC; `Authorization: Bearer <CRON_SECRET>`, `app/api/tech-audit/sweep/route.ts:21-25`; `maxDuration` 300 s,
  `route.ts:18`) lists the brand folder named by `clients.sf_drive_folder_id` and keeps child folders named
  `YYYY-MM-DD_HHMMSS` (`lib/technical-audit/sf.ts:15-23`, latest name per date `sf.ts:107-119`). Each run folder
  newer than the newest snapshot the brand already has becomes a **draft** (`lib/technical-audit/sweep.ts:96-101`,
  at most 12 new per brand per day `sweep.ts:44`); `snapshot_date` = the folder's date. `ensureSnapshot` inserts the
  snapshot and all five run rows (`sf`, `ahrefs`, `gsc_indexing`, `gsc_cwv_mobile`, `gsc_cwv_desktop`) as `pending`
  (`lib/technical-audit/store.ts:43-68`). A brand whose newest folder is > 35 days old is logged as stale
  (`sweep.ts:91-95`) and the team view shows "No crawl since …" (`lib/technical-audit/view.ts:153`).
- **Only drafts are worked.** For every draft, the sweep atomically claims each source run (`claimRun`,
  `store.ts:76-100`: one `UPDATE … WHERE status IN (pending, failed[, missing]) AND snapshot is draft AND
  (never started OR started > 10 min ago) RETURNING`). `missing` runs are re-checked daily only for drafts dated
  within the last 45 days (`sweep.ts:46,114-118`); `failed` runs are retried every day. Each source result is
  written in one `db.batch` transaction that replaces that source's issue rows, upserts only that source's metric
  columns, stamps the snapshot, and marks the run `complete` (`completeRun`, `store.ts:107-167`); a sweep write
  also requires the snapshot to still be a draft (`requireDraft`, `store.ts:133`). Failures are stored on the run
  as `failed` / `missing` with a fixed-string reason (`failRun`, `store.ts:172-188`; vendor and DB text never
  passed through, `sweep.ts:53-59`). Budget: the sweep stops claiming new work after 240 s
  (`sweep.ts:42,66-70`); 4 brands run concurrently (`sweep.ts:41,187`).
- **Publish is manual and staff-only.** `publishSnapshot` / `unpublishSnapshot` (`app/actions/tech-audit.ts:122-153`)
  set `status`, `published_at`, `published_by` scoped by client (`store.ts:190-204`). "Staff" = an internal role
  (`INTERNAL_ADMIN` or `INTERNAL_ANALYST`) **and** an `@avenuez.com` email (`lib/technical-audit/staff.ts:5-8`). Nothing
  auto-publishes. A published snapshot is never touched by the sweep; a staff GSC re-upload to a published month
  goes live immediately (`tech-audit.ts:109`).

**Ahrefs (health score + Ahrefs issues).** `fetchAhrefs` (`lib/technical-audit/ahrefs.ts:148-165`) calls
`GET https://api.ahrefs.com/v3/site-audit/projects?project_id=<clients.ahrefs_project_id>&date=<snapshot_date>T23:59:59`
(free). It reads `healthscores[0]` (`ahrefs.ts:27-36`) and accepts it only if `status === 'Completed'`, `health_score`
is a number, and the crawl's UTC day is **on or before the snapshot date and at most 7 days earlier**
(`pickAhrefsCrawl`, `ahrefs.ts:18-25`); otherwise the run is `missing` ("No completed Ahrefs crawl within 7 days
before …"). With `project_id` set, the endpoint returns exactly one `healthscores` entry (verified live
2026-11-27), and the `date` parameter pins a past crawl (probes doc). Then
`GET site-audit/issues` with the same parameters (50 API units) returns every tracked issue; rows with
`crawled > 0` are kept, `importance` (Error / Warning / Notice) is the native severity, `crawled` the URL count,
and `is_indexable === false` rows get a ` (not indexable)` name suffix (`ahrefs.ts:38-55`). Each call has a 15 s
deadline covering headers + body + JSON, a 5 MB body cap, and one retry on 429/5xx inside a 35 s budget
(`ahrefs.ts:93-146`). The **Health score** tile is that `health_score` (0–100, integer), drawn as a speedometer
with bands red 0–49 / amber 50–79 / green 80–100 (`components/report-sections/peec-ai/technical-audit/health-tiles.tsx:16-20`);
its delta is in points against the previous published snapshot.

**Screaming Frog Issues Overview.** For the snapshot's run folder, the sweep lists the files and takes the
newest name matching `/^issues_overview.*\.csv$/i` (`sf.ts:121-127`; Drive v3 with the service account,
`drive.readonly`, 15 s deadline per request, 20 MB cap, `sf.ts:52-81`). Absent → `missing` with "Issues Overview
not in this crawl's export" (`sweep.ts:48,141-142`) — never derived from `internal_all.csv`. Parsing
(`sf.ts:133-172`) requires the columns **`Issue Name`, `Issue Type`, `Issue Priority`, `URLs`**; each row's
`Issue Type` (Issue / Warning / Opportunity) picks the bucket, `Issue Priority` (High / Medium / Low) is the native
severity, `URLs` (commas stripped) the URL count. Per bucket it stores **the number of rows (issue types)** and **the
sum of the rows' `URLs`** (`sf.ts:162-163` → `sf_issue_types_*`, `sf_urls_*`, `sweep.ts:154-161`). The **Crawl
issues by type** tile draws the three issue-type counts as bars (previous month as a lighter bar) and prints the
summed URL counts underneath as "URLs affected" (`health-tiles.tsx:125-157`). Today no brand's crawl exports the
Issues Overview yet (Zaf is adding it), so every snapshot's SF run is `missing` (confirmed on the throwaway branch).

**GSC uploads — currently a stub (Task 6 pending).** The page has three upload slots (Page indexing, CWV mobile,
CWV desktop) in the staff checklist (`gsc-upload-slot.tsx`). The server action `uploadGscExport`
(`app/actions/tech-audit.ts:71-120`) checks staff, the slot, the 2 MB cap and that the snapshot belongs to the
client, then parses and writes only that slot's columns (`slotWrite`, `tech-audit.ts:49-64`). **The parsers are
stubs** (`lib/technical-audit/gsc-export.ts:1-18`) that refuse every file with "GSC Excel parsing is not available
yet", so no GSC number can reach the page until Task 6 lands (it is blocked on real GSC Excel exports). Once real:
indexing tile = `indexed / (indexed + not indexed)`; CWV tile = Poor / Needs improvement / Good URL counts per
device, mobile first, side by side so both print; a slot with no upload is blank ("Upload the GSC report…" for
staff, "Not available for this month" for clients and the PDF, `health-tiles.tsx:26-27,85-89`).

**The merged issue list ("Issues to investigate").**
- **Canonical map.** `loadIssueMap` reads the AEO team's Google Sheet (`TECH_AUDIT_ISSUE_MAP_SHEET_ID`, range `A:E`,
  columns `source`, `native_issue_name`, `canonical_issue_key`, `canonical_issue_name`; `reviewed` is not enforced)
  with the service account, cached 1 h, a failure cached 5 min; an unset/unreachable/empty Sheet falls back to the
  built-in 189-row list `issue-map-fallback.ts` (`lib/technical-audit/issue-map.ts:61-107`). Applied at read time, so
  a map edit re-groups past months too. Lookup per source tries the exact name, then without a ` (not indexable)`
  suffix, then without ` (desktop|mobile)`, case/dash/whitespace-insensitive (`lib/technical-audit/issues.ts:73-92`).
  Anything unmapped stays under `source:native name` with a staff-only "Needs mapping" chip.
- **Merge** (`issues.ts:72-125`): rows with `urlCount ≤ 0` are dropped; rows sharing a canonical key form one issue.
  **URLs affected = the max across contributors, never the sum** (`issues.ts:109`). **Severity** = the highest
  contributor after normalization (`issues.ts:47-58`): Ahrefs Error/Warning/Notice and SF High/Medium/Low → High /
  Medium / Low; GSC indexing reasons by the fixed Appendix A.2 list (`issues.ts:26-39`); GSC CWV Poor → High,
  otherwise Medium; anything unrecognised → Medium.
- **Ranking** (`issues.ts:61-63`, confirmed): `priority = weight(sev) × log10(urls + 1) × (1 + 0.25 × (sources − 1))`,
  weights **High 3 / Medium 2 / Low 1** (`issues.ts:4`); ties by URLs, then name, then key (`issues.ts:122-124`). The
  month's ranking depends only on that month. Worked values (executed): High, 872 URLs, 1 source = 8.82; High, 120
  URLs, 3 sources = 9.37 (so a smaller issue every tool agrees on outranks a bigger single-tool one); Low, 5,000 URLs
  = 3.70. The source line under each issue lists every contributing native name with its count, e.g.
  "Ahrefs: 4XX page (57) · SF: … · GSC: Not found (404) (118)" (`issue-list.tsx:50-52`).

**KPIs and deltas** (`lib/technical-audit/kpis.ts:16-51`). Six KPIs: Health Score (Ahrefs, higher better), Issues
(SF Issue-type count only, lower better), Indexed pages and Not indexed pages (GSC), Poor CWV URLs (mobile) and
Good CWV URLs % (mobile) = `good / (poor + ni + good) × 100` (GSC). Every delta and the "Compared with" line use
**the latest *published* snapshot dated before the selected one**, for staff and clients alike, so staff preview
exactly what the client will see once they publish (`view.ts:113-116`). A delta is "—" when either month lacks
the value; sparklines and the trend chart cover the 24 most recent published snapshots (plus a selected draft)
with gaps, never zeros (`view.ts:118-129`, `change-over-time.tsx:16-33,94`). Note the indexing *tile* shows its
delta in percentage points of the indexed share (`health-tiles.tsx:182`), while the strip's "Indexed pages" delta
is a page count.

**Hide / notes** (`app/actions/tech-audit.ts:157-189`, `store.ts:246-266`, `view.ts:71-85`). Staff can hide an issue
row or attach a plain-text note (≤ 280 chars) per brand, keyed by canonical issue key (or `source:native` for an
unmapped row), so they carry across all months. A client never receives hidden rows (removed server-side,
`view.ts:78`) and never receives `noteBy` / `noteAt`; notes themselves are shown to clients. A row hidden or
noted while unmapped keeps that override once the map gives it a canonical key; the canonical key's own override
wins (`view.ts:74-76`) — see finding #1.

**Commentary binding.** New view key `peec-ai:technical-audit` (`lib/commentary/views.ts`), rendered through
`SharedPartsHeader` only when the brand's `report_section_config['peec-ai:technical-audit'].sharedParts` includes
`commentary` (`technical-audit/index.tsx:85-87`). An entry belongs to a snapshot when `period_start = period_end =
snapshot_date` (`components/report-sections/commentary/snapshot.tsx:9-12,29`); the editor hides its date inputs
and shows "Snapshot: Nov 1, 2026". Draft → approved, history and approver rules are the existing commentary
code (same `COMMENTARY_APPROVERS`).

**Client vs staff views and export.** The viewer is derived from the server session only
(`technical-audit/index.tsx:41`). Clients see published snapshots only (`view.ts:109`), the latest by default; an
unknown or draft `snapshot=` falls back to the latest published. Client payloads are projections with no staff
names, timestamps, run errors or hidden rows (`view.ts:12-31,61-67,131-132`). Staff see drafts, the checklist, run
reasons, "Needs mapping" and the Hidden section. **The PDF export always renders the client view, whoever
exports** (`components/export/report-element.tsx:55`, `exporting` → `viewer = 'client'`): a draft date prints the
latest published snapshot instead, and staff-only parts never print.

---

## 2. Verification method

Every finding below was probed against the working tree at `94e122b2`, not just read:

- **Static anchors** — each cited line/symbol confirmed at the stated location in the reviewed tree.
- **Executed logic (throwaway probe spec, deleted after the run, never committed)** — a vitest spec in
  `lib/technical-audit/` running the shipped `mergeIssues`, `priorityOf`, `loadTechAuditView` (store, queries and
  issue map mocked), `pickAhrefsCrawl`, `parseAhrefsProjects` and `parseSfIssuesOverview`. It reproduced #1 (a row
  hidden under its native key is returned to the client view once a canonical-key override with only a note
  exists; a hide-only canonical override drops the native note), #2 (872 + 91 same-source variants → URLs 872),
  #4 (a zero-URL row counted as an issue type) and the priority values quoted in §1. `git status` clean after.
- **Feature test suite** — `npx vitest run lib/technical-audit app/actions/tech-audit.test.ts app/api/tech-audit
  components/report-sections/peec-ai/technical-audit components/report-sections/commentary`: 26 files, 352 tests,
  all green.
- **Read-only DB check** — the DB in this worktree's `.env.local` (the throwaway Neon branch used for the browser
  check) holds 7 Renaissance snapshots (2026-05-22 … 2026-11-01), every `sf` run `missing` with the Issues Overview
  reason, every `ahrefs` run `complete` (health 77/77/77/83/82/82/61), all GSC runs `pending`, Oct and Nov
  published. Renaissance's `hidden_reports` there is `['content-impact']`; the `dev` DB value in #15 is as reported
  in the build ledger, not re-read here.
- **Arithmetic** — #7's worst case computed from the constants at the cited lines.
- **Already verified outside this doc** — the page was checked in a browser on 2026-11-25/27 against a throwaway
  Neon branch (Ahrefs pulled for 7 Renaissance months; SF missing as expected; staff and client views;
  publish/unpublish). Ahrefs `site-audit/projects` with `project_id` returns exactly one `healthscores` entry
  (verified live 2026-11-27), which is why `healthscores[0]` is not a finding.
- **PLAUSIBLE findings (#4, #5, #6)** — the *code assumption* is confirmed; the *trigger* is the shape of a real
  Screaming Frog Issues Overview export (none exists yet) or an Ahrefs response change, so they are flagged as
  needing verification rather than asserted.

---

## 3. Findings

Severity: **●** correctness · **○** cleanup/convention. Status: CONFIRMED (proven in-tree) / PLAUSIBLE (code
assumption confirmed, external trigger unverified).

| # | Sev | Status | Location | Finding |
|---|-----|--------|----------|---------|
| 1 | ● | CONFIRMED | `lib/technical-audit/view.ts:76` | A row hidden while unmapped reappears in the **client view and PDF** after staff add a note to it once it is mapped (and a re-hide drops its note) |
| 2 | ● | CONFIRMED | `lib/technical-audit/issues.ts:109` | Ahrefs indexable and "(not indexable)" variants of one issue are disjoint URL sets but merge by max → URLs affected undercounts (872 shown, 963 real) |
| 3 | ● | CONFIRMED | `lib/technical-audit/sf.ts:163` | SF tile's "URLs affected" is the sum of per-issue URL counts (URL-issue instances), not affected URLs; can exceed the crawl size |
| 4 | ● | PLAUSIBLE | `lib/technical-audit/sf.ts:162` | A zero-URL Issues Overview row counts as an issue type in the KPI/tile while the issue list drops it |
| 5 | ● | PLAUSIBLE | `lib/technical-audit/issue-map-fallback.ts:190` | SF fallback names lack SF's category prefix ("Response Codes: …", as in our own fixture) → SF 4xx/3xx/5xx never merge with Ahrefs/GSC |
| 6 | ● | PLAUSIBLE | `lib/technical-audit/ahrefs.ts:40` | A 200 `issues` body of an unexpected shape stores a `complete` Ahrefs run with zero issues (SF fails closed for the same case) |
| 7 | ○ | CONFIRMED | `lib/technical-audit/sweep.ts:84` | Sweep can run past the 300 s `maxDuration`: Drive listing isn't budget-guarded and the last Ahrefs claim can take 70 s after 240 s |
| 8 | ○ | CONFIRMED | `lib/technical-audit/store.ts:125` | `requireDraft` is check-then-write; a publish in the gap lands sweep data in a published month, or discards it and marks the run failed |
| 9 | ○ | CONFIRMED | `lib/technical-audit/checklist.ts:66` | Publish warning covers GSC only; a month with SF or Ahrefs missing/failed publishes without a confirm (spec-conformant) |
| 10 | ○ | CONFIRMED | `lib/technical-audit/staff.ts:7` | Any internal user (incl. `INTERNAL_ANALYST`) can publish, hide and write client-visible notes; Roles Reference says analysts are read-only on Reports |
| 11 | ○ | CONFIRMED | `components/export/report-element.tsx:55` | Exporting from a draft silently prints a different (latest published) month, or "No Technical Audit snapshot yet." — by design, no notice to staff |
| 12 | ○ | CONFIRMED | `app/actions/tech-audit.ts:111` | One `gsc_export_date` for three uploads: the header's "GSC export" date is whichever slot was uploaded last |
| 13 | ○ | CONFIRMED | `lib/db/schema.ts:803` | `crawl_settings_changed` has no writer; the header flag needs a manual SQL update |
| 14 | ○ | CONFIRMED | `lib/technical-audit/gsc-export.ts:1` | GSC parsers are a stub (Task 6): every upload is refused; property check against `gsc_site_url` not built |
| 15 | ○ | CONFIRMED | `app/portal/[clientSlug]/reports/page.tsx:196` | Rollout: `hidden_reports` containing `technical-audit` makes the tab unreachable for staff, clients and export; plus migration-first ordering and per-client config |
| 16 | ○ | CONFIRMED | `lib/technical-audit/kpis.ts:8` | `toViewMetrics` is a rest-omit, not an allowlist: any future metrics column flows to clients unreviewed |
| 17 | ○ | CONFIRMED | `lib/technical-audit/sweep.ts:103` | Sweep reporting minors: brand-level failures labelled `sf`; store validation errors labelled "database error"; a `claimRun` throw skips the brand's remaining drafts; future folders dropped silently; Ahrefs-only brands listed |
| 18 | ○ | CONFIRMED | `components/report-sections/peec-ai/technical-audit/publish-checklist.tsx:35` | Server-action throws inside `startTransition` go to the section error boundary (checklist replaced); Publish stays enabled during an upload |
| 19 | ○ | CONFIRMED | `lib/technical-audit/issues.ts:85` | Suffix stripping is not source-scoped (` (desktop)` stripped for Ahrefs/SF names too) |
| 20 | ○ | CONFIRMED | `lib/technical-audit/ahrefs.ts:137` | 5xx ignores `Retry-After`; the "budget too small to retry" branch is unreachable with current constants |
| 21 | ○ | CONFIRMED | `components/report-sections/commentary/commentary-panel.tsx:158` | Cosmetics carried from the ledger (staff dropdown "Nov 1 – Nov 1", history entries from `router.push`, UTC note date, off-palette grey, unconfirmed copy, long doc line) |
| 22 | ○ | CONFIRMED | `lib/technical-audit/view.test.ts` | Test gaps: override fallback + write path (#1), same-source variant counts (#2), `db.batch` atomicity on neon-http, route real-deps wiring, fallback CWV rows |

---

## 4. Detail

### 1 · ● Hidden row reappears after a note edit — CONFIRMED
`toViewIssues` picks **one** override row per merged issue: the canonical key's row if it exists, otherwise the
first `source:native` row of a contributor (`view.ts:76`). The staff controls always write to the merged issue's
*current* key (`issue-row-controls.tsx:27` → `setIssueOverride({ issueKey: issue.key })`), and `setOverride`
upserts only the patched fields, so a new row takes the column defaults (`hidden = false`,
`store.ts:259-265`, `schema.ts` default). Sequence: a strategist hides an unmapped row (saved under `sf:Foo`); the
AEO team then maps it in the Sheet (key `foo`); the row is still hidden through the fallback; the strategist opens
the Hidden section and adds a note → a `foo` row `{ hidden: false, note }` is created, it now wins, and **the row is
back in the client view and the PDF**. The mirror case: a note saved under `sf:Foo`, then "Hide" on the mapped row
creates `{ hidden: true, note: null }` under `foo` and the note disappears from every view. **Proven** by the probe
(client view: 0 rows before the note, 1 after). This breaks acceptance criterion 8 / the anti-goal "hidden rows
never reach a client". It needs the Sheet to change while overrides exist — exactly what happens during launch,
while the AEO team is still reviewing the map.
**Suggested fix:** return the key of the override row in effect (`overrideKey`) on `ViewIssue` (team only) and
have the controls write to that key; or, on the first write to a canonical key, copy `hidden`/`note` from the
fallback row in the same upsert. Add a view+action test for both sequences.

### 2 · ● Same-source "(not indexable)" variants merge by max — CONFIRMED
Ahrefs reports the same issue twice, once for indexable pages and once for non-indexable pages
(`is_indexable`); `parseAhrefsIssues` keeps both, suffixing the second (`ahrefs.ts:49`), and the map lookup strips
the suffix so both join one canonical row (`issues.ts:85`) — the intended merge (T11 ruling). But the URL count is
`Math.max` for every contributor (`issues.ts:109`). A page is either indexable or not, so the two sets are
disjoint and the true count is the sum. Renaissance, 18 Nov (probes doc): "Page has links to broken page" 872
indexable + 91 not indexable → the row says **872**, not 963; same for "Meta description tag missing or empty"
(721 + 96) and "Multiple H1 tags" (342 + 40). The source line shows both numbers, so the headline visibly
disagrees with it, and priority is computed from the undercount. Max is right *across* tools (spec §6.4) and for
genuinely overlapping same-tool issues (Ahrefs "404 page" ⊂ "4XX page", both mapped to `broken-internal-4xx`), so
the fix must not simply sum per source. **Proven** by the probe.
**Suggested fix:** in `mergeIssues`, first combine each source's rows that differ only by the ` (not indexable)`
suffix by summing, then take the max across native names and sources as today. Decide with the AEO team whether
any other same-source pairs are disjoint.

### 3 · ● SF "URLs affected" is a sum of per-issue counts — CONFIRMED
`parseSfIssuesOverview` adds every row's `URLs` into its bucket (`sf.ts:163`); the tile prints it as "URLs
affected: Issues N · Warnings N · Opportunities N" (`health-tiles.tsx:150`). One URL with a missing title, a long
meta description and no H2 is counted three times, so "Warnings 1,078" can exceed the number of URLs crawled. A
client asking "how many of our pages have warnings?" gets a URL-issue *instance* count labelled as pages. The
Issues Overview export has no unique-URL total per type, so the true number isn't available from this file.
**Suggested fix:** relabel ("URL-issue instances" / "flagged URLs, counted per issue") and say so in the ⓘ, or
drop the line; decide the wording with Tina.

### 4 · ● Zero-URL rows count as issue types — PLAUSIBLE
`parseSfIssuesOverview` increments the bucket's issue-type count for every row with a recognised `Issue Type`,
including `URLs = 0` (`sf.ts:159-163`), while `mergeIssues` drops zero-count rows (`issues.ts:96`). If Screaming
Frog's Issues Overview export lists zero-URL issues (as Ahrefs' `issues` endpoint does with its 184 tracked rows),
the "Issues (issue types)" KPI and the tile bars would count issues that have no affected URL and don't appear in
the list. **Proven** by the probe on a synthetic file (two rows, one with 0 URLs → `issue: 2`). The trigger
depends on the real export, which doesn't exist yet.
**Verify:** the first real `issues_overview*.csv`. **Suggested fix if it has zero rows:** count only rows with
`URLs > 0`.

### 5 · ● SF fallback names don't match Screaming Frog's names — PLAUSIBLE
The fallback's SF rows mix two conventions: `'Page Titles: Missing'`, `'Directives: Noindex'` carry SF's category
prefix, but `'Internal Client Error (4xx)'`, `'Internal Redirection (3xx)'`, `'Internal Server Error (5xx)'`
don't (`issue-map-fallback.ts:190-195`). Our own fixture models the export with the prefix — `Response
Codes: Internal Client Error (4xx)` (`__fixtures__/sf-issues-overview.csv:3`) — and the lookup only normalises
case, dashes and whitespace (`issues.ts:22-24`). If the real export is prefixed, SF's 4xx/3xx/5xx rows land as
separate "Needs mapping" rows instead of joining "Broken internal pages (4xx)" / "Pages that redirect" / "Server
errors (5xx)" with Ahrefs and GSC, and the merged URL max loses SF's count. The Sheet seed has 0 SF rows (ledger,
T11), so the fallback is all there is.
**Verify:** the first real Issues Overview export. **Suggested fix:** re-run `scripts/tech-audit/build-issue-map.ts`
against real SF names (already planned in the ledger) and correct the three fallback rows.

### 6 · ● A malformed Ahrefs `issues` body completes with no issues — PLAUSIBLE
`parseAhrefsIssues` returns `[]` when `issues` is missing or not an array (`ahrefs.ts:39-40`), and the sweep then
completes the run with the health score and zero Ahrefs issue rows (`sweep.ts:174-181`). The checklist shows
Ahrefs ✓ while every Ahrefs contribution is silently absent from the list. The SF parser deliberately fails closed
for the equivalent case ("No recognised 'Issue Type' values", `sf.ts:171`). Trigger: an Ahrefs response-shape
change or an error object served with 200.
**Suggested fix:** treat a non-array `issues` as a failed run ("Ahrefs issues response unreadable") so it retries
and shows in the checklist.

### 7 · ○ Sweep can exceed the 300 s function limit — CONFIRMED
`outOfTime()` is checked before each new snapshot and before each claim (`sweep.ts:99,137,165`), but not before a
brand's Drive listing (`sweep.ts:84`) or its two `getSnapshots` reads. After the 240 s budget, each remaining
brand still lists Drive (up to 15 s per page, `sf.ts:9`); and a claim taken at 239.9 s can run an Ahrefs pair of
calls with a 35 s budget each (`ahrefs.ts:7,156,160`) = 70 s, on 4 brands at once. Worst case ≈ 310 s plus the
remaining brands' listings, past `maxDuration = 300` (`route.ts:18`). Effect when Vercel kills it: in-flight claims
stay `pending`/`failed` with a fresh `started_at`, are reclaimable after 10 min, and are picked up by the next
day's sweep; `completeRun` is one transaction, so no partial write. Safe and retryable: a one-day delay and no JSON report
for that run, not data damage.
**Suggested fix:** check `outOfTime()` at the top of `sweepBrand`, and stop claiming when less than ~75 s remains
(or lower `TOTAL_BUDGET_MS` near the deadline).

### 8 · ○ `requireDraft` check-then-write — CONFIRMED (parked ruling)
`claimRun` is atomic and re-checks draft status in its `UPDATE` (`store.ts:83-98`). `completeRun`'s
`requireDraft` is a separate `SELECT` (`store.ts:125-136`) followed by the `db.batch` (`store.ts:166`); a publish
committed between them lets sweep data land in a just-published month. If the publish lands between the claim and
the `SELECT`, `completeRun` throws `run not found`, `save()` records the run `failed` with "database error"
(`sweep.ts:128-135`) on the published month, and the fetched data is dropped — the sweep never works published
snapshots, so that source stays empty until someone unpublishes. The window is milliseconds at 06:20 UTC; the
ledger parked it as acceptable.
**Suggested fix (if ever revisited):** put the draft predicate inside each batched statement (`WHERE EXISTS (…
status = 'draft')`) and have the run update return a row count the caller checks.

### 9 · ○ Publish warning covers GSC only — CONFIRMED (Decide together)
`publishWarnings` lists only GSC slots that aren't done (`checklist.ts:66-69`); the inline "Publish with these
missing?" confirm appears only for those (`publish-checklist.tsx:98`). A month whose Screaming Frog or Ahrefs run is
`missing` or `failed` publishes on one click with an empty tile ("No data for this snapshot" for the client). This
matches spec §5.1 ("Publishing warns when a GSC upload is missing"), but today **every** month's SF run is missing,
so every publish would put an empty SF tile in front of a client without a prompt.
**Decide:** extend the confirm to SF/Ahrefs not-complete (one-line change in `publishWarnings`).

### 10 · ○ Who may publish and annotate — CONFIRMED (Decide together)
`isTechAuditStaff` = `INTERNAL_ADMIN` or `INTERNAL_ANALYST` with an `@avenuez.com` email (`staff.ts:5-8`); it gates
publish, unpublish, GSC upload, hide and notes (`tech-audit.ts:28-32`). `CLAUDE.md`'s Roles Reference says
`INTERNAL_ANALYST` is "read-only on the Reports product & admin actions". Publishing is what makes a month
client-visible, and notes are client-visible text with no approval step, whereas the comparable gates — commentary
approval and Social Listening approval — use `COMMENTARY_APPROVERS` (`lib/organic-social/social-listening/capabilities.ts:16-17`).
Spec §6.3 only says "staff action", so this is conformant.
**Decide:** keep, or require `canApproveCommentary(email)` for publish (and possibly notes); then update the Roles
Reference either way.

### 11 · ○ Exporting a draft prints another month — CONFIRMED (Decide together)
Export always renders the client view (`report-element.tsx:55`, `index.tsx:41`), so a staff member on a draft who
clicks Export gets the latest *published* month's PDF (correctly labelled with its date), or "No Technical Audit
snapshot yet." when nothing is published. This is the intended ruling (a PDF is always what the client sees), but
nothing on the button says so.
**Decide:** hide/disable Export on a draft with a one-line reason, or keep as is.

### 12 · ○ One GSC export date for three uploads — CONFIRMED
Each upload writes `snapshot.gsc_export_date` (`tech-audit.ts:111`), so the header's "GSC export: <date>"
(`snapshot-header.tsx:63`) is the date of whichever of the three reports was uploaded last; the indexing and CWV
reports update on different days (11/15 vs 11/21 in the probes). Spec §6.2 has a single column, so conformant.
**Decide (with Task 6):** keep one date (say "latest GSC export"), or show per-slot dates from the run rows.

### 13 · ○ `crawl_settings_changed` has no writer — CONFIRMED
The column is read (`view.ts:64,154`) and drawn as the "Crawl settings changed" flag (`snapshot-header.tsx:100`),
but nothing in the app sets it (only `schema.ts:803` and the migration). Spec §12 expects the first deeper
Renaissance crawl to carry it.
**Suggested fix:** record the manual `UPDATE tech_audit_snapshots SET crawl_settings_changed = true …` in the
rollout runbook, or add a staff toggle later.

### 14 · ○ GSC parsing is a stub — CONFIRMED (Task 6)
`detectGscReport` returns `null` and both parsers return `{ ok: false, reason: 'GSC Excel parsing is not available
yet' }` (`gsc-export.ts:8-18`), so every upload is refused and the GSC tiles, the four GSC KPIs, the GSC issue rows and
the property check (`gsc_site_url`, spec §6.3.4) don't exist yet. Acceptance criteria 3, 6 and 7 are only partly
met. Fine for `dev` per the plan; not fine for a client.
**Suggested fix:** Task 6 (needs the Renaissance GSC Excel exports as fixtures).

### 15 · ○ Rollout prerequisites — CONFIRMED
The tab is gated by `hidden_reports` in the portal (`app/portal/[clientSlug]/reports/page.tsx:196`), the dashboard
(`app/dashboard/[clientSlug]/reports/page.tsx:164`) and export (`lib/export/report-view.ts:24`). Per the ledger,
Renaissance's `hidden_reports` in the `dev` DB contains `technical-audit`, so after merge neither staff nor clients
can reach the page there until it is removed (not re-read here: the `.env.local` DB is the throwaway branch, where
it is absent). Removing it exposes the tab to clients at once; with nothing published they see "No Technical Audit
snapshot yet." Other ordering: migration `0033` must be applied (via `scripts/migrate-http.ts`) **before** the code
deploys, because `getClientBySlug` now selects the two new `clients` columns and every page would fail without
them; `sf_drive_folder_id` / `ahrefs_project_id` must be set; the commentary opt-in lives in
`report_section_config`; `AHREFS_API_KEY` and `TECH_AUDIT_ISSUE_MAP_SHEET_ID` must be in Vercel.
**Suggested fix:** a rollout checklist in the PR (order: migrate → env → client columns → publish a first month →
unhide).

### 16 · ○ `toViewMetrics` is a rest-omit — CONFIRMED (ledger, T9)
`toViewMetrics` strips `id` and `snapshotId` and passes every other column (`kpis.ts:6-10`) to both viewers. Today
all columns are client-safe; a future staff-only column (e.g. a note or uploader) added to `tech_audit_metrics`
would reach clients without review. **Suggested fix:** an explicit allowlist of metric keys.

### 17 · ○ Sweep reporting minors — CONFIRMED (ledger, T5)
Brand-level failures (Drive listing aside) are reported with source `sf` (`sweep.ts:103,111,192`); `completeRun`'s
own validation errors ("raw file too large") are stored as "database error" (`sweep.ts:133`); a throwing
`claimRun` (`sweep.ts:137,165`) exits `sweepBrand`, skipping the brand's remaining drafts that day; a folder dated
after tomorrow is dropped without a log line (`sweep.ts:85`); `listClients` includes Ahrefs-only brands, which can
never get a snapshot (`route.ts:32`). None changes data.
**Suggested fix:** a `brand` source label in the report, distinct store-error reasons, per-draft try/catch, a log
line for future folders, filter `listClients` on `sf_drive_folder_id`.

### 18 · ○ Server-action throws inside transitions — CONFIRMED (ledger, T8)
`publish-checklist.tsx:35`, `gsc-upload-slot.tsx:22` and `issue-row-controls.tsx:26` await the server action inside
`startTransition` with no `try/catch`. On React 19.2 a throw there (network failure, deploy mid-click) is rethrown
to the nearest error boundary, replacing the whole "Before you publish" section with the error card instead of an
inline message. Separately, Publish stays enabled while an upload is pending (separate transitions), so the
confirm can list a slot that is about to be filled.
**Suggested fix:** wrap each action call and set the inline error; disable Publish while any slot is pending.

### 19 · ○ Suffix stripping not source-scoped — CONFIRMED (ledger, T11)
`lookup` strips ` (not indexable)` and ` (desktop|mobile)` from every source's names (`issues.ts:85-86`). Harmless
today (no Ahrefs/SF names end in ` (mobile)`), but an Ahrefs issue genuinely named "… (mobile)" would silently map
to its base. **Suggested fix:** strip `(not indexable)` only for `ahrefs`, device only for `gsc_cwv`.

### 20 · ○ Ahrefs retry details — CONFIRMED (ledger, T3)
A 5xx retry waits the fixed 2 s and ignores `Retry-After` (`ahrefs.ts:137`). With a 15 s first attempt and ≤ 5 s
delay inside a 35 s budget, `remaining > 0` (`ahrefs.ts:139`) is always true, so the skip branch is dead defensive
code. **Suggested fix:** honour `Retry-After` for 503; drop or comment the branch.

### 21 · ○ Cosmetics — CONFIRMED (ledger)
Staff commentary dropdown prints "Nov 1, 2026 – Nov 1, 2026" for snapshot entries (`commentary-panel.tsx:158`);
the snapshot select uses `router.push`, adding a history entry per change (`snapshot-header.tsx:57`); a note's date
prints in UTC (`issue-list.tsx:57`); notes written before the `note_by` column show no author (`view.ts:83`);
`#3a3a3a` buttons are off-palette (`publish-checklist.tsx:82`); copy not in the spec ("No data for this snapshot",
"No Technical Audit snapshot yet.", "Pick a KPI above to chart it.", " (draft)") is unconfirmed with Paul;
`store.ts:105` is a 168-character doc line.

### 22 · ○ Test gaps — CONFIRMED
No test covers #1 (an override saved under the native key, then a write under the canonical key) or #2
(same-source variants); `db.batch` atomicity is only tested on PGlite, not neon-http; the sweep route's real
dependency wiring is only type-checked (`route.test.ts` mocks `runSweep`); the fallback's CWV rows are untested; the
index test "a staff export prints the client blank copy" (`technical-audit/index.test.tsx:115`) doesn't pass
`exporting`, so it exercises `PrintAsClient`, not the export path (that path is covered at `:140`).

---

## 5. Follow-ups (not fixed here)

Tracked separately so this stays a pure review record:

- **Correctness (block the merge to `dev`):** #1 (hidden row leaks to clients after a note edit) and #2
  (same-source "(not indexable)" URL undercount). Both are client-facing, both have small fixes plus a test.
- **Correctness (before a client sees the page):** #3 (SF "URLs affected" label), #14 (Task 6 GSC parsers).
- **Needs a live file/call first:** #4 (zero-URL SF rows), #5 (SF issue names in the map) — both on the first real
  Issues Overview export; #6 (Ahrefs `issues` shape — decide fail-closed now, cheap).
- **Decide together:** #9 (publish warning for SF/Ahrefs), #10 (who may publish and annotate; update the Roles
  Reference), #11 (Export on a draft), #12 (one GSC export date), #13 (how `crawl_settings_changed` gets set).
- **Rollout:** #15 — migrate `0033` first, env vars, client columns, commentary opt-in, publish a first month, then
  remove `technical-audit` from Renaissance's `hidden_reports`.
- **Cleanup:** #7 (sweep budget guard), #8 (parked race), #16 (metrics allowlist), #17 (sweep labels), #18
  (transition error handling), #19, #20, #21, #22 (tests for #1 and #2 land with their fixes).

#1 and #2 block the merge to `dev`; #1 is the highest-value fix, because it is the only path by which content a
strategist hid reaches a client view and the PDF.
