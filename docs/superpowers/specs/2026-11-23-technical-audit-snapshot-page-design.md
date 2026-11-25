# Technical Audit snapshot page — design

**Date:** 2026-11-23 · revised 2026-11-25 with Tina's answers to the decisions doc
**Status:** Approved by Paul 2026-11-25
**Brief:** "Technical Audit Page Build Brief" (Tina Fleming, Glean) + "Technical Audit Page Mockup" (Glean, sample data)
**Build owners:** Thomas Chang, Paul Ramirez
**Branch:** `feat/technical-audit-snapshots` (off `dev`)
**Decisions doc:** "Decisions for Approval — Technical Audit Page" (Drive), answered by Tina 2026-11-24; local copy
`docs/official-feedback/technical-audit-decisions-for-approval.{md,docx}`. Probe evidence:
`docs/qa/technical-audit-source-probes.md`.

---

## 1. Intent

Rebuild the AEO **Technical Performance** tab (`?section=peec-ai&subsection=technical-audit`) as a
**monthly snapshot of each brand's technical health**, answering top to bottom:

1. How healthy is the site right now? (health scores)
2. What changed since the last snapshot? (change over time)
3. What should we investigate next? (one merged list of issues)

Sources: **Ahrefs Site Audit** and **Screaming Frog**, pulled automatically each month; **Google Search
Console** Page Indexing and Core Web Vitals, **uploaded by the strategist** each month (GSC has no API for
these reports, and Tina ruled out estimates). Each month is a draft until the **strategist reviews it,
uploads the GSC reports, writes commentary, and publishes it**. Commentary works as on Renaissance's AEO
Overview.

**Why:** today's tab is AI-crawler oriented, reads one Screaming Frog CSV pinned by file ID (a May 21 file for
Renaissance), and can't show a health score, indexing, CWV, history, or a cross-tool issue list. No clients
have access to the tab today (Tina, DFA item 11).

## 2. Goals, non-goals, anti-goals

**Goals**
- Ahrefs and Screaming Frog data arrive monthly with no manual steps.
- The page **tells the strategist what's left** before a month can be published (GSC uploads, review,
  commentary), and nothing reaches a client until they publish.
- Snapshot drop-down (no date picker), newest first; switching updates every section.
- Brief §2.3 health tiles, §2.4 delta strip + trend chart, §2.5 merged issue table (simplified per Tina),
  §2.2 snapshot-bound commentary. Brief §6 acceptance criteria are the definition of done, as amended in
  Appendix A.4.
- Existing app branding; the mockup for layout only.

**Non-goals (v1)**
- **Any GSC estimate** (URL Inspection, CrUX, Ahrefs PSI fields). GSC tiles are blank until uploaded.
- **Issue movement tags** (New / Worsening / Improving / Unchanged) and the "resolved since" counter.
- **The current AI-crawler sections** (bot activity, AI-activity/issue overlap, crawler waste, fix list,
  Sitebulb AEO checklist) — removed from this tab.
- The Technical Audit Log Sheet as a dependency; Sitebulb as a source; multi-domain brands.

**Anti-goals** (failure even if it technically works)
- Any GSC number on the page that didn't come from a GSC export.
- A month reaching a client before the strategist publishes it.
- A missing source shown as 0, or older data carried forward without a label.
- Issue-list framing that alarms a client ("worsening", "new") — the list is "issues to investigate"; the
  strategist decides what's truly critical (Tina, DFA comment on intentional noindex pages).
- Unmapped issues silently dropped; URLs double counted.
- Drafts, staff timestamps or the Approved badge reaching a client (view or PDF).

## 3. Decisions and probe results

Probes (2026-11-23, details in `docs/qa/technical-audit-source-probes.md`) and Tina's answers (2026-11-24):

| Topic | Evidence | Decision |
|---|---|---|
| Snapshot source | SF scheduled crawls write a timestamped folder per brand to Drive monthly (`Screaming Frog Exports/<Brand>/2026-11-01_030106/`), readable by our service account; Jun, Jul, Sep, Oct, Nov exist, **no August**. The Technical Audit Log workflow is manual-only and last ran 2026-06-02. | **One snapshot per monthly SF crawl folder** (Tina: confirmed). |
| Screaming Frog data | Only `internal_all.csv` is exported. | Add the **Issues Overview** report to the scheduled export (Tina: work with **Zaf**). |
| Ahrefs | Advanced plan, 2M units/mo; Site Audit API works with the app key (`AHREFS_API_KEY` in `.env.local`); `date` returns past crawls; `issues` returns all 184 tracked issues (incl. zero-count) for 50 units; 24 projects, weekly crawls, Renaissance = `9371114`. | **Pull automatically**, crawl on or before the SF crawl within 7 days (Tina: confirmed). |
| GSC Page Indexing + CWV | No API returns these reports. | **Strategist uploads the GSC exports each month; uploads are the only GSC source.** No estimates (Tina: "No estimates"; "rather it just be blank and have our team import the data"). The page instructs the strategist to upload. |
| Publishing | — | **Manual.** The strategist reviews, uploads GSC, publishes (Tina). |
| Issue movement tags | — | **Removed** (Tina: false flags would alarm clients). |
| Issue map | Ahrefs exposes its full tracked catalog via API; SF's Issues list and GSC's indexing reasons / CWV issues are fixed, documented lists. | **Pre-build a map of every issue from every tool**, reviewed by the AEO team, so new issues are already mapped (Tina). |
| AI-crawler sections | — | **Removed** (Tina). |
| Commentary | — | Same logic as Renaissance's AEO Overview commentary; **Renaissance only** to start (Tina). |
| CWV devices | — | Mobile matters most, **show both mobile and desktop** (Tina). |

Approaches considered for intake: all-upload (rejected: Ahrefs/SF can be automatic); fully automatic incl.
GSC estimates (rejected by Tina); **automatic SF + Ahrefs, uploaded GSC (chosen)**.

## 4. Constraints

- Server-side data only; each section in the existing error boundary.
- Data in **Neon** (the BigQuery spec defers crawl tools).
- Both report routes render this tab (`app/dashboard/...`, `app/portal/...`) — wire both.
- Export PDF is rendered server-side at `app/export/[clientSlug]/[section]` via
  `components/export/report-element.tsx` — a **third** render site. The `snapshot` param passes through
  `ExportRequest` / `parseExportRequest` (`lib/export/request.ts`) and `lib/export/bulk.ts`. Export mode prints
  approved commentary only; staff-only UI must not render there.
- The date picker and PDF header date (`AEO_SUBSECTION_NAMES`, `usesPageRange`) must exclude
  `technical-audit` in both routes.
- Background work on **Vercel cron** like `/api/health/sweep` (`mapWithConcurrency`, `maxDuration` ≤ 300 s).
- Upload body cap 3 MB (`next.config.ts`), as Social Listening.
- Migrations in `drizzle/`, applied with `scripts/migrate-http.ts` before the code that reads them ships.
- Env: `AHREFS_API_KEY` and `TECH_AUDIT_ISSUE_MAP_SHEET_ID` in `.env.example`, `.env.local`, Vercel.
  (`CRUX_API_KEY` is no longer needed. `GSC_IMPERSONATE_EMAIL=google@avenuez.com` stays — it fixes the
  existing Search Console tab — but this feature doesn't use the GSC API.)
- Branding: `frontend:brand-coherence` during the build; existing tokens, `SectionHeader`, AEO card style;
  Recharts.

## 5. Page layout

1. **Header + snapshot selector.** `SectionHeader`; a select of snapshots ("Nov 1, 2026 (latest)"); "Compared
   with: Oct 1, 2026" or "Baseline — first snapshot"; one "data as of" line per source (SF crawl date, Ahrefs
   crawl date, GSC export date) with a status dot. Selection is the URL param `snapshot=YYYY-MM-DD`; absent →
   latest published (client) or latest (team). Clients only ever see published snapshots.
   **Team view — "Before you publish" checklist** for the selected snapshot, top of page, print-hidden:
   - Screaming Frog ✓ / missing (with reason, e.g. "Issues Overview not in this crawl's export")
   - Ahrefs ✓ / missing / failed (reason)
   - **Upload GSC Page indexing** — not yet uploaded → upload button + how-to ("Search Console → Indexing →
     Pages → All known pages → Export → Download CSV; upload the .zip")
   - **Upload GSC Core Web Vitals — mobile** and **— desktop** (same pattern, per device)
   - Review the issues list
   - Commentary: none / draft / approved
   - **Publish** (and **Unpublish** once published). Publishing warns when a GSC upload is missing but
     doesn't block it; those tiles stay blank.
2. **Commentary** (§7).
3. **01 · Health scores** — 2×2 tiles, each with source path, ⓘ, value, delta vs previous:
   - Site health score (Ahrefs) — speedometer 0–100, red/amber/green bands; delta in points.
   - Crawl issues by type (SF Issues Overview) — bars Issues / Warnings / Opportunities, previous as a lighter
     bar; URLs affected underneath. Bars count **issue types**.
   - Indexing coverage (GSC upload) — half-donut "% indexed of known URLs", neutral color; indexed / not
     indexed counts.
   - Core Web Vitals (GSC uploads) — **mobile and desktop side by side, mobile first**: Poor / NI / Good URL
     counts each. (Side by side rather than a toggle so both print in the PDF.)
   A GSC tile with no upload is **blank**: team view says "Upload the GSC report to fill this tile"; client
   view says "Not available for this month".
4. **02 · Change over time** — delta strip of six KPIs (Appendix A.1), each with value, good/bad-colored delta
   vs the previous snapshot and a sparkline across snapshots; clicking one selects it in the **trend chart**
   (one KPI, own axis, selected and previous marked). Months without the needed upload are gaps, never zeros;
   a delta is "—" when either month lacks the data.
5. **03 · Issues to investigate** — the merged list (§6.4): columns **#**, **Issue** (with the per-tool source
   line), **Severity**, **URLs affected**, **Sources**. Filters by source and severity (default All, ranked).
   No change column, no status tags, no resolved/new counts.
   **Strategist controls (team view, per brand):** each row can be **hidden** or **annotated**. A hidden row
   disappears from the client view and the PDF; in the team view hidden rows collapse into "Hidden by strategist
   (N)" with Unhide. An annotation is a short plain-text note shown under the row in every view, e.g.
   "Intentional — member-only pages". Both apply to the brand, keyed by canonical issue, so they carry across
   months (including past ones, like the issue map). Each shows who set it and when (team view only).

The current tab's sections — SF KPI cards, "What changed since the last crawl?", "How are technical issues
trending?", AI bot activity, AI-activity/issue overlap, crawler waste, fix list (+ its scoring card), Sitebulb
AEO checklist — are **all removed**. Code that only they use (and `clients.sf_csv_file_id` /
`sf_prev_csv_file_id` reads) is deleted in the same change if nothing else imports it; anything shared stays.

## 6. Data

### 6.1 Client config (new columns on `clients`)

`sf_drive_folder_id` (brand folder under `Screaming Frog Exports`), `ahrefs_project_id`. `gsc_site_url`
exists and is used to check an upload belongs to the brand where the export says so. Onboarding = setting the
two IDs (Renaissance: Ahrefs `9371114`; IDs for all 24 projects in the probes doc).

### 6.2 Tables (Neon, new migration)

- `tech_audit_snapshots` — `id`, `client_id`, `snapshot_date` (= SF run date, unique per client),
  `sf_run_folder_id`, `sf_crawl_date`, `ahrefs_crawl_date`, `gsc_export_date`, `ahrefs_health_score`,
  `crawl_settings_changed`, `status` (`draft` | `published`), `published_at`, `published_by`, timestamps.
- `tech_audit_source_runs` — one row per (snapshot, source), source ∈ `sf`, `ahrefs`, `gsc_indexing`,
  `gsc_cwv_mobile`, `gsc_cwv_desktop`: `status` (`pending` | `complete` | `failed` | `missing`), `attempts`,
  `last_error`, `uploaded_by` (GSC), timestamps, `raw` (bytea ≤ 2 MB: SF CSV, Ahrefs JSON, uploaded GSC file)
  so parsers can re-derive.
- `tech_audit_metrics` — per snapshot: SF issue-type counts + URL totals per category; Ahrefs health score;
  GSC indexed / not indexed; CWV poor / NI / good per device. Nullable per source.
- `tech_audit_source_issues` — `snapshot_id`, `source` (`ahrefs` | `sf` | `gsc_indexing` | `gsc_cwv`),
  `native_issue_name`, `native_severity`, `url_count`, `device` (CWV).
- `tech_audit_issue_overrides` — `client_id`, `issue_key` (canonical key, or `source:native_name` for an
  unmapped issue), `hidden` (bool), `note` (plain text ≤ 280 chars, rendered as text, never HTML),
  `updated_by`, `updated_at`; unique (`client_id`, `issue_key`). Staff-only writes via a server action.

### 6.3 Monthly pipeline (Vercel cron, daily) + uploads

`/api/tech-audit/sweep`, daily, cron-secret protected, bounded fan-out over configured brands; idempotent and
resumable per (snapshot, source); one failure never blocks another.

1. **Discover.** New SF run folder → draft snapshot. No new folder ≥ 35 days after the last → team-view warning
   ("No crawl since Oct 1") and a log line naming the brand.
2. **Screaming Frog.** Parse `issues_overview.csv` from the run folder; absent → `missing` with "Issues
   Overview not in this crawl's export" (never derived from Internal: All).
3. **Ahrefs.** `/site-audit/projects` (`date` = snapshot date) → health score + crawl date, taking the latest
   completed crawl on or before the snapshot date within 7 days; none → `missing`. Then `/site-audit/issues`
   for that crawl. Backoff on 429/5xx; 401/403 → `failed` with reason.
4. **GSC uploads (team view).** Server action per file, modeled on `uploadSocialListeningExport`: auth (staff),
   size check, parse, validate (report type matches the slot — Page indexing vs CWV, and device for CWV;
   property matches the brand when the export names it), transactional write replacing that slot,
   `revalidate`. A wrong file is refused with a named reason and writes nothing. `gsc_export_date` = the
   export's "last updated" date when present, else upload date.
5. **Publish** is a staff action only. Nothing auto-publishes.

Operator visibility: every failure logs brand, snapshot date, source and reason, and shows in the checklist.
No secrets in logs.

### 6.4 Issue list: merge, severity, ranking

Pure functions in `lib/technical-audit/`; weights and severity map in one config module.

- **Canonical map, pre-built.** A Google Sheet (`TECH_AUDIT_ISSUE_MAP_SHEET_ID`; columns `source`,
  `native_issue_name`, `canonical_issue_key`, `canonical_issue_name`, `reviewed`) seeded **before launch with
  every issue each tool can report**: Ahrefs' full tracked catalog (from `site-audit/issues`, which returns
  all tracked issues incl. zero-count, unioned across projects), Screaming Frog's documented Issues list, GSC's
  "Why pages aren't indexed" reasons and CWV issue names. The builder drafts the mapping; the AEO team reviews
  it. Read with the existing service account, cached 1 h; a repo copy is the test fixture and fallback.
  Applied at read time. Anything still unmapped appears under its native name with "Needs mapping".
- **URLs affected:** max across contributing sources, never the sum (Tina: confirmed).
- **Severity:** brief normalization (Appendix A.2); canonical = highest among contributors. The brief's
  "raise to High when in the sitemap" rule is **dropped** (exports don't say which URLs are in the sitemap;
  Tina didn't want it explained further).
- **Priority (ranking only):** `weight(sev) × log10(urls + 1) × (1 + 0.25 × (sources − 1))`, weights High 3 /
  Medium 2 / Low 1, in config. The brief's ×1.15 growth factor is dropped with the movement tags, so a month's
  ranking depends only on that month.
- Source detail line under each issue: "Ahrefs: 4XX page (132) · SF: Internal Client Error (4xx) (148) · GSC:
  Not found (404) (121)".

## 7. Commentary

Same logic as Renaissance's AEO Overview commentary (Tina): new view key `peec-ai:technical-audit` in
`CommentaryViewKey` / `COMMENTARY_VIEWS`, rendered via `SharedPartsHeader` when the brand's
`report_section_config['peec-ai:technical-audit'].sharedParts` has `{ id: 'commentary' }` — **Renaissance
only** at launch; same approver list (`COMMENTARY_APPROVERS`). Snapshot binding without a schema change:
`periodStart = periodEnd = snapshot_date`; the editor shows "Snapshot: Nov 1, 2026" instead of date inputs.
Draft → approved, edit-as-new-draft, revoke, soft-delete, approver history, client view hides drafts /
timestamps / badge — as shipped. No commentary: team view "Add commentary"; client view hidden.

## 8. Edge cases

| Case | Behavior |
|---|---|
| First snapshot | No deltas; "Baseline". |
| SF / Ahrefs missing or failed | Tile empty state with reason (team); left out of the merge. |
| GSC not uploaded | Tiles blank; GSC rows absent from the issue list; KPI gaps. |
| Wrong GSC file uploaded | Refused with a named reason; nothing written. |
| GSC re-uploaded | Replaces that slot only. |
| Publish with GSC missing | Allowed after a warning; tiles stay blank. |
| Missed monthly crawl | No snapshot; team warning after 35 days. |
| Ahrefs crawl > 7 days before the SF run | Ahrefs `missing`. |
| Sweep re-runs / overlaps | Idempotent; lock as `/api/lock-sweep`. |
| Canonical-map Sheet unreachable | Repo copy; logged. |
| Snapshot param not found / unpublished for a client | Latest published. |

## 9. Testing

- Parser tests on real files from Renaissance: SF Issues Overview CSV, Ahrefs `projects` + `issues` JSON, and
  **GSC exports: Page indexing (All known pages) and CWV mobile + desktop** — needed as fixtures before PR 2.
- Pure-function tests: merge, severity, priority, deltas with gaps, upload validation (wrong report / device /
  property), publish visibility, commentary period filter.
- Pipeline tests with fakes: idempotent re-run, one source failing.
- Render tests: checklist states; blank GSC tiles (team vs client wording); both CWV devices; client view never
  sees drafts or the checklist.
- Manual QA on Renaissance: Ahrefs health score, SF Issues tab and uploaded GSC totals match the tools
  (reference: 1.08K indexed / 934 not indexed; CWV mobile 0/0/172, desktop 0/8/164 as of 2026-11-15/21).

## 10. Delivery

Feature PRs into `dev`, each reviewed: (1) tables + client config + SF + Ahrefs pull + sweep, (2) GSC uploads
+ parsers + "Before you publish" checklist + manual publish, (3) header + health tiles + delta strip + trend
chart, (4) issue list + pre-built canonical map + hide/annotate, (5) commentary binding + PDF + removal of the old sections.
Outside this repo: Issues Overview added to the SF scheduled export (with Zaf); `AHREFS_API_KEY` and
`GSC_IMPERSONATE_EMAIL` in Vercel; AEO team review of the issue map.

## 11. Left to the builder

Component layout under `components/report-sections/peec-ai/technical-audit/`; gauge implementation; exact
parser column handling once sample files are in hand; ⓘ and checklist copy.

## 12. Resolved at approval (Paul, 2026-11-25)

- **Strategist judgment on issues:** strategists can hide or annotate a row per brand (§5, §6.2) — Tina's
  "open to interpretation of the strategist".
- **Ahrefs crawl depth (Renaissance):** raise the project's max depth so the crawl covers the whole site
  (2,620 URLs; 1.48M of 1.5M monthly crawl credits unused). Counts will jump on the first deeper crawl, so
  that snapshot gets `crawl_settings_changed` and the header flag. The settings change is made in Ahrefs by
  the AEO team / Paul, not by this build.
- **Issue map review:** the AEO team.

---

## Appendix A — rules (brief, as amended)

### A.1 KPIs (delta strip + trend chart)

| KPI | Source | Better when |
|---|---|---|
| Health Score | Ahrefs | Higher |
| Issues (issue types) | Screaming Frog | Lower |
| Indexed pages | GSC Page indexing upload | Higher |
| Not indexed pages | GSC Page indexing upload | Lower |
| Poor CWV URLs (mobile) | GSC CWV mobile upload | Lower |
| Good CWV URLs % (mobile) | GSC CWV mobile upload | Higher |

(Tina confirmed sitemap-based indexing KPIs in DFA item 4, but that only existed for the estimates; with
uploads only, the brief's own indexing KPIs apply.)

### A.2 Severity normalization

| Source | Native label | Normalized |
|---|---|---|
| Ahrefs Site Audit | Error / Warning / Notice | High / Medium / Low |
| Screaming Frog | Issue Priority High / Medium / Low | same |
| GSC Indexing | Server error (5xx), Not found (404), Soft 404, Redirect error, Blocked by robots.txt, Blocked due to unauthorized request (401) | High |
| GSC Indexing | Crawled – currently not indexed, Discovered – currently not indexed, Duplicate without user-selected canonical, Google chose different canonical than user | Medium |
| GSC Indexing | Alternate page with proper canonical tag, Page with redirect, Excluded by 'noindex' tag | Low |
| GSC CWV | Poor / Needs improvement | High / Medium |

Unlisted GSC reasons: Medium, flagged "Needs mapping".

### A.3 Ranking

Priority as §6.4. Ties break by URLs affected, then name.

### A.4 Acceptance criteria (brief §6, as amended)

1. Drop-down lists every snapshot, newest first; switching updates every section; clients see published only.
2. Commentary works as on Renaissance's AEO Overview and follows the selected snapshot.
3. Four health tiles with the specified visuals, ⓘ and delta vs previous; CWV shows mobile and desktop.
4. Delta strip: six KPIs, correct coloring, sparklines with gaps; trend chart switches KPI.
5. Issue list merges all inputs via the canonical map, normalizes severity, ranks, shows the source line;
   unmapped → "Needs mapping"; no movement tags.
6. Totals match the tools for Renaissance: Ahrefs Health Score, SF Issues tab, and the uploaded GSC Indexing
   and CWV reports.
7. The checklist tells the strategist what's missing; nothing publishes without them.
8. Strategists can hide or annotate an issue row per brand; hidden rows never reach a client view or PDF.
9. PDF export contains approved commentary only.

## Appendix B — calls made in writing this doc (check these)

- CWV tile shows both devices side by side (not a toggle) so both print.
- Blank GSC tiles: "Upload the GSC report…" (team) / "Not available for this month" (client).
- Publishing with a GSC upload missing warns but isn't blocked.
- Priority drops the brief's ×1.15 growth factor along with the movement tags.
- The sitemap severity rule is dropped.
- Canonical map stays read-time (pre-building it makes Tina's "past months change" concern mostly moot).
- KPIs revert to the brief's indexing measures (uploads only).
- Old-section code deleted when nothing else imports it.
- Hide/annotate apply per brand across all months (not per month); notes are plain text, shown to clients.
