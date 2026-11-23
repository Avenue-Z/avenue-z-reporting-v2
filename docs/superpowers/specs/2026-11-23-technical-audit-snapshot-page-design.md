# Technical Audit snapshot page — design

**Date:** 2026-11-23 (revised same day: automated intake)
**Status:** Draft for Paul's approval
**Brief:** "Technical Audit Page Build Brief" (Tina Fleming, Glean) + "Technical Audit Page Mockup" (Glean, sample data)
**Build owners:** Thomas Chang, Paul Ramirez
**Branch:** `feat/technical-audit-snapshots` (off `dev`)
**Stakeholder decisions doc:** `docs/official-feedback/technical-audit-decisions-for-approval.{md,docx}`

---

## 1. Intent

Rebuild the AEO **Technical Performance** tab (`?section=peec-ai&subsection=technical-audit`) as a
**snapshot-based technical health report** per brand. The page answers three questions, top to bottom:

1. How healthy is the site right now? (health scores)
2. What changed since the last snapshot? (change over time)
3. What should we investigate next? (one ranked, cross-source issue table)

It merges **Ahrefs Site Audit**, **Screaming Frog**, and **Google Search Console** (Page Indexing + Core Web
Vitals). A service-line marketer adds written commentary per snapshot, using the existing Commentary feature.
Data arrives **automatically** each month; a person only uploads the GSC exports when they want GSC's exact
numbers instead of our estimates.

**Why:** today's tab is AI-crawler oriented and reads one Screaming Frog "Internal: All" CSV pinned by file ID
(for Renaissance, a **May 21** file — the tab has shown May data since). It can't show a health score,
indexing coverage, CWV, or history, and can't rank issues across tools.

## 2. Goals, non-goals, anti-goals

**Goals**
- Snapshots build themselves monthly from the tools; no routine manual uploads.
- Snapshot drop-down (no date picker), newest first, labeled by snapshot date; switching updates every new
  section.
- Brief §2.3 health tiles, §2.4 delta strip + trend chart, §2.5 merged issue table, §2.2 snapshot-bound
  commentary — brief §6 acceptance criteria are the definition of done, with the GSC caveat in §6.4.
- Existing app branding; mockup used for layout only.

**Non-goals (v1)**
- Sitebulb as a fourth source (brief: out of scope; the existing Sitebulb AEO checklist stays as-is below).
- The Technical Audit Log Sheet (`Avenue-Z/monthly-technical-audit`) as a dependency — see §3.
- Multi-domain brands (one snapshot = one client = one property in v1).

**Anti-goals** (would be a failure even if it technically works)
- A missing source treated as 0 (every issue would read "Resolved").
- Older data carried forward into a snapshot without a label.
- **GSC estimates presented as GSC's own report numbers**, or compared against exact export numbers as if
  they were the same measure.
- Unmapped issues silently dropped; URLs double counted (summing across sources).
- Drafts, staff timestamps, or the Approved badge reaching a client (view or PDF).
- A missed monthly crawl going unnoticed.
- The mockup's blue/purple palette shipped instead of the app's brand.

## 3. Approaches and probe results

First pick was **upload every source by hand in v1**, because automating looked blocked. Paul asked for
"as automated as possible", so each source was probed (2026-11-23):

| Source | Probe result | Decision |
|---|---|---|
| Screaming Frog | The scheduled crawl already writes a timestamped run folder per brand to Drive monthly (`Screaming Frog Exports/<Brand>/2026-11-01_030106/internal_all.csv`), readable by our service account. Runs exist for Jun, Jul, Sep, Oct, Nov — **August is missing** for every brand. Only `internal_all.csv` is exported. | **Automate.** Add the **Issues Overview** report to the scheduled export (one-time change on the office audit machine). The run folders are the snapshot list. |
| Technical Audit Log | A Google Sheet written by `Avenue-Z/monthly-technical-audit`. Its workflow is `workflow_dispatch` only ("add cron once schedule is confirmed"); last run 2026-06-02. It holds X-Point summary counts, not SF Issues / Ahrefs / GSC. Not shared with our service account. | **Not used.** The Drive run folders are the live run history. |
| Ahrefs | API v3 has Site Audit endpoints: `/site-audit/projects` (free; `health_score`, crawl `date`, status) and `/site-audit/issues` (50 units; name, importance, affected-URL count, `date` / `date_compared`). Workspace is on **Advanced** (2M API units/mo; Site Audit endpoints already in use via the Glean MCP key). 24 Site Audit projects exist, crawled weekly, incl. Renaissance (`9371114`) — IDs in `docs/qa/technical-audit-source-probes.md`. **No Ahrefs key in this app's env yet.** | **Automate.** Needs a dedicated API v3 key (`AHREFS_API_KEY`). |
| GSC Page Indexing | No API or BigQuery export returns the report. URL Inspection API: 2,000 calls/day and 600/min per property, returns `verdict`, `coverageState` (free text, e.g. "Crawled - currently not indexed"), `pageFetchState`, etc. Renaissance's sitemaps hold ≈925 URLs. | **Automate as an estimate** over sitemap URLs; optional GSC export upload replaces it with exact numbers. |
| GSC Core Web Vitals | No API returns the report. CrUX API gives origin-level good / needs-improvement / poor distributions per device (weekly, 28-day windows); no URL-group counts. | **Automate as an estimate** (share of page loads, per device); optional upload replaces it. |
| GSC access | The delegated account (`GSC_IMPERSONATE_EMAIL`) sees only `sc-domain:avenuez.com`; Renaissance returns 403. | Grant it access to each brand's property. |

Rejected: all-upload (manual toil, Paul wants automation); GSC upload-only (no numbers until someone uploads);
building the UI on sample data (fails "totals match the tools").

## 4. Constraints

- Server-side data only; RSC sections each wrapped in the existing error boundary.
- Data lives in **Neon** (the BigQuery spec defers crawl tools).
- Both report routes render this tab (`app/dashboard/...` and `app/portal/...`) — wire both.
- Respect `enabledReports` / hidden subsections.
- Export PDF is rendered server-side by a headless browser at `app/export/[clientSlug]/[section]` through
  `components/export/report-element.tsx` — a **third** render site. The `snapshot` param must pass through
  `ExportRequest` / `parseExportRequest` (`lib/export/request.ts`) and the bulk export (`lib/export/bulk.ts`).
  Export mode already prints only approved commentary; staff-only UI must not render there.
- The date picker shows on this tab today in both routes (`AEO_SUBSECTION_NAMES` checks) and the PDF header
  date follows `usesPageRange`. Both must exclude `technical-audit` in both routes.
- Background work runs on **Vercel cron** like `/api/health/sweep` (bounded fan-out via `mapWithConcurrency`,
  `maxDuration` ≤ 300 s). Work longer than one invocation must be resumable.
- Upload body cap 3 MB (`next.config.ts`), same as Social Listening.
- Migrations: SQL in `drizzle/`, applied with `scripts/migrate-http.ts` **before** the code that reads them
  ships.
- New env vars in `.env.example`: `AHREFS_API_KEY`, `CRUX_API_KEY`, `TECH_AUDIT_ISSUE_MAP_SHEET_ID`.
- Branding: invoke `frontend:brand-coherence` during the build; reuse existing tokens (`bg-bg-surface`,
  `text-text-muted`, `#60FF80` good, `#FF4444` bad, `#FFFC60` warn), `SectionHeader`, the AEO card style.
  Charts on Recharts.

## 5. Page layout

Top to bottom (new sections first, existing AI-crawler sections kept below):

1. **Header + snapshot selector.** `SectionHeader`, then a select of snapshots ("Nov 1, 2026 (latest)").
   "Compared with: Oct 1, 2026" (or "Baseline — first snapshot"). One "data as of" line per source with a
   status dot: Screaming Frog crawl date, Ahrefs crawl date, GSC capture date, and the GSC basis
   ("estimate" or "GSC export"). Flags: "Crawl settings changed" when set. Selection is a URL param,
   `snapshot=YYYY-MM-DD`; absent → latest published. No snapshots → empty state (team view says why:
   "No Screaming Frog run found for this brand").
   Team view only: a health line — "Last crawl 31 days ago", "Ahrefs: failed — 401", "GSC estimate: 640 /
   925 URLs inspected" — plus **Re-pull** per source, **Upload GSC export**, and **Unpublish / Publish**.
2. **Commentary** (§7).
3. **01 · Health scores** — 2×2 tiles, each with source path, ⓘ tooltip, value, delta vs previous:
   - Site health score (Ahrefs) — speedometer 0–100, red/amber/green bands; delta in points.
   - Crawl issues by type (SF Issues Overview) — bars Issues / Warnings / Opportunities, previous snapshot as a
     lighter bar; URLs affected as the secondary label. Bars count **issue types**.
   - Indexing coverage — half-donut, neutral color. Export basis: "% indexed of known URLs", indexed / not
     indexed counts. Estimate basis: "% of sitemap URLs indexed", with "Estimate · URL Inspection of N
     sitemap URLs".
   - Core Web Vitals — Mobile/Desktop toggle, default Mobile. Export basis: Poor / NI / Good **URL counts**.
     Estimate basis: Poor / NI / Good **share of page loads** (CrUX, origin), labeled "Estimate · Chrome UX
     Report, share of page loads".
   Each tile shows "No data for this snapshot" when its source is missing.
4. **02 · Change over time** — delta strip of six KPI tiles with value, good/bad-colored delta, sparkline;
   clicking one selects it in the **trend chart** (one KPI, own axis, all snapshots, selected and previous
   marked). KPIs and basis rules in §6.4 and Appendix A.1.
5. **03 · Investigate next** — the merged issue table (§6.5), filters by source and severity, and
   "N resolved since <prev date> · x new · y worsening · z improving".
6. **Existing AI-crawler sections, unchanged in content**, under a divider: **"Current AI-crawler activity ·
   not tied to the selected snapshot"**, each with its own as-of date: bot activity, AI-activity/issue
   overlap, crawler waste, the fix list (its card renamed "How is the fix list scored?"), Sitebulb AEO
   checklist. They keep today's pipelines (bot activity = last 30 days ending today; GA4 AI-path query uses
   the same window). The fix list and overlap table switch from the pinned `sf_csv_file_id` file to the
   **latest Drive run's** `internal_all.csv`, so they stop showing May data.
   The current SF "Internal: All" KPI cards, "What changed since the last crawl?" and "How are technical
   issues trending?" are **removed** (superseded).

## 6. Data

### 6.1 Client config (new columns on `clients`)

`sf_drive_folder_id` (the brand's folder under `Screaming Frog Exports`), `ahrefs_project_id`,
`tech_audit_sitemap_url` (defaults to the robots.txt `Sitemap:` line). `gsc_site_url` already exists.
Onboarding a brand = setting these, plus GSC access for the delegated account. `sf_csv_file_id` stays until
nothing reads it, then is dropped in a later cleanup.

### 6.2 Tables (Neon, new migration)

- `tech_audit_snapshots` — `id`, `client_id`, `snapshot_date` (= SF run date, unique per client),
  `sf_run_folder_id`, `sf_crawl_date`, `ahrefs_crawl_date`, `gsc_capture_date`, `ahrefs_health_score`,
  `crawl_settings_changed`, `status` (`draft` | `published`), `published_at`, `published_by` (null = auto),
  `hold` (bool, staff can keep a snapshot from auto-publishing), timestamps.
- `tech_audit_source_runs` — one row per (snapshot, source) where source ∈ `sf`, `ahrefs`,
  `gsc_indexing_estimate`, `gsc_cwv_estimate`, `gsc_indexing_export`, `gsc_cwv_export`: `status`
  (`pending` | `in_progress` | `complete` | `failed` | `missing`), `attempts`, `last_error`, `started_at`,
  `finished_at`, `raw` (bytea ≤ 2 MB: the SF CSV, the Ahrefs JSON, the uploaded GSC file) so parsers can
  re-derive.
- `tech_audit_metrics` — per snapshot and basis (`estimate` | `export`): SF issue-type counts + URL totals per
  category; Ahrefs health score; indexed / not indexed (/ inspected); CWV poor / NI / good per device (counts
  for export, shares for estimate).
- `tech_audit_source_issues` — `snapshot_id`, `source`, `native_issue_name`, `native_severity`, `url_count`,
  `device` (CWV), `basis`.
- `tech_audit_gsc_inspections` — `snapshot_id`, `url`, `verdict`, `coverage_state`, `page_fetch_state`,
  `inspected_at`; the work queue for the resumable estimate and the URL list behind GSC issue rows.

### 6.3 Monthly pipeline (Vercel cron, daily)

`/api/tech-audit/sweep`, daily, cron-secret protected, bounded fan-out over brands with config. Each step is
idempotent and resumable; one brand or source failing never blocks another.

1. **Discover.** List the brand's Drive folder; any run folder newer than the latest snapshot creates a draft
   snapshot (`snapshot_date` = folder date). No new folder ≥ 35 days after the last → team-view warning
   ("No crawl since Oct 1") and a log line naming the brand.
2. **Screaming Frog.** Parse `issues_overview.csv` (Issues Overview report) from the run folder. If absent,
   mark `missing` with "Issues Overview not in export" — do not fall back silently.
3. **Ahrefs.** `/site-audit/projects` for the health score and crawl date; take the latest completed crawl on
   or before the snapshot date and within 7 days (brief's rule), using the `date` param. None → `missing`.
   Then `/site-audit/issues` for that crawl. Retries with backoff on 429/5xx; 401/403 → `failed` with the
   reason.
4. **GSC indexing estimate.** Expand the sitemap (index → child sitemaps) into the inspection queue, then
   inspect up to a per-run budget (stay under 2,000/day and 600/min per property). Done when the queue
   drains; a large site may take several days.
5. **GSC CWV estimate.** CrUX `queryRecord` for the origin, PHONE and DESKTOP; classify into good / NI / poor
   shares per Core Web Vital thresholds, worst metric wins, per device.
6. **Publish.** Auto-publish when every source is `complete`, or 7 days after the snapshot date with
   whatever arrived (missing tiles marked). `hold` blocks auto-publish; staff can publish or unpublish any
   time.

Operator visibility: every failure logs brand, snapshot date, source, and reason; the same reason shows in
the team-view health line. No secrets in logs.

### 6.4 GSC basis: estimate vs export

- Estimates are **always** computed. An uploaded GSC export (optional, per snapshot, team view) adds the
  `export` basis; it never deletes the estimate.
- Tiles show the export when present, else the estimate, and say which.
- Deltas compare **like with like**: export vs export when both snapshots have one, else estimate vs estimate
  (labeled "change vs estimate"). Never export vs estimate.
- Delta-strip KPIs and the trend chart use the **estimate** series (complete history, one measure). GSC KPIs
  in the strip are therefore: "% sitemap URLs indexed" (↑), "Not-indexed sitemap URLs" (↓), "Poor page
  loads % (mobile)" (↓), "Good page loads % (mobile)" (↑).
- Brief §6 "totals match GSC Indexing and CWV" holds only for snapshots with an uploaded export.
- Issue table: GSC indexing rows come from the inspections (estimate) or from the export's reason table when
  uploaded. "Why URLs aren't considered good" CWV rows exist **only** with an export — CrUX has no URL groups.

### 6.5 Merge, severity, ranking, status

Pure functions in `lib/technical-audit/`; weights and severity map in one config module.

- **Canonical map:** `(source, native_issue_name)` → `canonical_issue_key` + display name, in a **Google Sheet
  the AEO team edits** (`TECH_AUDIT_ISSUE_MAP_SHEET_ID`; columns `source`, `native_issue_name`,
  `canonical_issue_key`, `canonical_issue_name`), read with the existing service account, cached 1 h. The repo
  ships a seed map as test fixture and fallback (logged). **Applied at read time**, so mapping fixes correct
  older snapshots; native names stay stored. URL-Inspection `coverageState` strings are mapped like any other
  native name.
- **URLs affected:** max across contributing sources, never the sum (SF and Ahrefs give counts only).
- **Severity:** brief normalization table (Appendix A.2); canonical = highest among contributors. The
  brief's "raise GSC Low to High when in the XML sitemap" **applies to every estimate row**, because the
  estimate inspects sitemap URLs only; for export rows it stays Low (no URL list).
- **Priority, status, unmapped, source detail line:** as Appendix A.3. Change and status compare only sources
  present in both snapshots, on the same basis; otherwise "—".

## 7. Commentary

- New view key `peec-ai:technical-audit` in `CommentaryViewKey` / `COMMENTARY_VIEWS` (owner "AEO"). Renders via
  `SharedPartsHeader` only when the brand's `report_section_config['peec-ai:technical-audit'].sharedParts`
  has `{ id: 'commentary' }` — a DB config row. At launch: Renaissance only. (`resolveCommentaryView` is
  orphaned; don't rely on it.)
- Snapshot binding, no schema change: `periodStart = periodEnd = snapshot_date`; the panel shows only that
  period's entries; the editor shows "Snapshot: Nov 1, 2026" instead of date inputs (as Social Listening's
  analysis boxes do for a fixed month).
- Everything else as shipped: draft → approved, edit-as-new-draft, revoke, soft-delete, approver history,
  client view hides drafts/timestamps/badge, `COMMENTARY_APPROVERS`.
- No commentary for a snapshot: team view → "Add commentary"; client view → hidden.

## 8. Edge cases

| Case | Behavior |
|---|---|
| First snapshot | No deltas; "Baseline". |
| Source missing / failed | Tile empty state with reason (team view); left out of merge and status. |
| No Issues Overview in the SF run | SF `missing` with that reason; never derived from Internal: All. |
| Missed monthly crawl | No snapshot; team-view warning after 35 days. |
| Ahrefs crawl > 7 days before the SF run | Ahrefs `missing` for that snapshot. |
| Estimate still running | Tile shows progress in team view; auto-publish waits (up to 7 days). |
| Export uploaded later | Adds `export` basis; tiles switch; estimate kept. |
| Crawl settings changed | Header flag; deltas still shown. |
| Sweep re-runs / overlaps | Idempotent per (snapshot, source); lock as `/api/lock-sweep` does. |
| Canonical-map Sheet unreachable | Seed map; logged. |
| Snapshot param not found | Latest published. |

## 9. Testing

- Parser tests on real files: SF Issues Overview CSV, Ahrefs `/projects` + `/issues` JSON, URL Inspection and
  CrUX responses, and a GSC export pair — from Renaissance (fixtures committed, anonymized as needed).
- Pure-function tests: merge, severity (incl. sitemap raise), priority, status, like-with-like deltas,
  auto-publish rule, commentary period filter.
- Pipeline tests with fakes: idempotent re-run, partial failure of one source, resumable inspection queue,
  quota budget respected.
- Section render tests: empty / baseline / missing / estimate vs export labels; client vs team view.
- Manual QA on Renaissance: Ahrefs health score and SF Issues tab match the tools; with an uploaded export,
  GSC totals match; report how far the estimates sit from the export.

## 10. Delivery

Feature PRs into `dev`, each reviewed: (1) tables + client config + Drive/SF + Ahrefs pull + sweep skeleton,
(2) GSC estimates (inspection queue, CrUX) + optional export upload, (3) header + health tiles + delta strip +
trend chart, (4) issue table + canonical map, (5) commentary binding + PDF + AI-crawler block move.
Prerequisites outside this repo, tracked in the decisions doc: Issues Overview added to the SF scheduled
export; Ahrefs key + projects; GSC property access; CrUX API key.

## 11. Left to the builder

Component layout under `components/report-sections/peec-ai/technical-audit/`; gauge implementation; exact
parser column handling once sample files are in hand; ⓘ copy; per-run inspection budget and sweep schedule
within the quotas.

## 12. Still open for Tina

See the decisions doc. From the brief's §7: #1 (anchor = SF monthly run, Ahrefs matched within 7 days) and
#2 (GSC automated estimate, export optional) are answered by this design; #4 and #5 assumed as the mockup;
#3 (approvers per brand, client-facing scope) open.

---

## Appendix A — rules carried over from the brief

### A.1 KPIs (delta strip + trend chart)

| KPI | Source | Better when |
|---|---|---|
| Health Score | Ahrefs | Higher |
| Issues (issue types) | Screaming Frog | Lower |
| % sitemap URLs indexed *(brief: Indexed pages)* | GSC estimate | Higher |
| Not-indexed sitemap URLs *(brief: Not indexed pages)* | GSC estimate | Lower |
| Poor page loads % (mobile) *(brief: Poor CWV URLs)* | CrUX estimate | Lower |
| Good page loads % (mobile) *(brief: Good CWV URLs %)* | CrUX estimate | Higher |

### A.2 Severity normalization

| Source | Native label | Normalized |
|---|---|---|
| Ahrefs Site Audit | Error / Warning / Notice | High / Medium / Low |
| Screaming Frog | Issue Priority High / Medium / Low | same |
| GSC Indexing | Server error (5xx), Not found (404), Soft 404, Redirect error, Blocked by robots.txt, Blocked due to unauthorized request (401) | High |
| GSC Indexing | Crawled – currently not indexed, Discovered – currently not indexed, Duplicate without user-selected canonical, Google chose different canonical than user | Medium |
| GSC Indexing | Alternate page with proper canonical tag, Page with redirect, Excluded by 'noindex' tag | Low; High when in the XML sitemap (all estimate rows) |
| GSC CWV (export only) | Poor / Needs improvement | High / Medium |

Unlisted GSC reasons: Medium, flagged "Needs mapping".

### A.3 Priority and status

- Priority = `weight(sev) × log10(urls + 1) × (1 + 0.25 × (sources − 1)) × (grew ? 1.15 : 1)`, weights High 3 /
  Medium 2 / Low 1, all in config.
- Status: New (previous 0), Worsening (up), Improving (down), Unchanged, Baseline (first snapshot). Current 0 →
  out of the table, into "Resolved".
- Source detail line under each issue, e.g. "Ahrefs: 4XX page (132) · SF: Internal Client Error (4xx) (148) ·
  GSC: Not found (404) (121)". Unmapped → native name + "Needs mapping".

### A.4 Acceptance criteria (brief §6)

1. Drop-down lists every snapshot, newest first, labeled by date; switching updates every new section.
2. Commentary works as elsewhere and follows the selected snapshot.
3. Four health tiles with the specified visuals, ⓘ, and delta vs previous.
4. CWV tile toggles Mobile / Desktop.
5. Delta strip: six KPIs, correct coloring, sparklines; trend chart switches KPI.
6. Issue table merges all inputs via the canonical map, normalizes severity, ranks, shows source detail,
   change and status; unmapped → "Needs mapping".
7. Totals match the tools for Renaissance: Ahrefs Health Score, SF Issues tab, and — **for a snapshot with an
   uploaded export** — GSC Indexing + CWV.
8. PDF export contains approved commentary only.

## Appendix B — calls made in writing this doc (check these)

- SF run folders are the snapshot list; snapshot date = SF run date.
- Technical Audit Log not used.
- Ahrefs matched within 7 days on or before the SF run (brief's rule), via API.
- GSC estimates always computed; exports optional and additive; deltas like-with-like; KPIs/trend on
  estimates.
- Auto-publish when complete or after 7 days; staff hold / publish / unpublish.
- URLs affected = max across sources.
- Sitemap severity raise applied to estimate rows.
- Canonical map applied at read time, from one Sheet.
- Commentary per-brand opt-in; Renaissance only at launch.
- Kept AI-crawler sections labeled "current", and moved off the pinned May CSV to the latest run.
- Removing the three SF "Internal: All" sections.
