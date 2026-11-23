# Technical Audit snapshot page — design

**Date:** 2026-11-23
**Status:** Draft for Paul's approval
**Brief:** "Technical Audit Page Build Brief" (Tina Fleming, Glean) + "Technical Audit Page Mockup" (Glean, sample data)
**Build owners:** Thomas Chang, Paul Ramirez
**Branch:** `feat/technical-audit-snapshots` (off `dev`)

---

## 1. Intent

Rebuild the AEO **Technical Performance** tab (`?section=peec-ai&subsection=technical-audit`) as a
**snapshot-based technical health report** per brand. The page answers three questions, top to bottom:

1. How healthy is the site right now? (health scores)
2. What changed since the last snapshot? (change over time)
3. What should we investigate next? (one ranked, cross-source issue table)

It merges three tools the AEO team already uses: **Ahrefs Site Audit**, **Screaming Frog**, and **Google
Search Console** (Page Indexing + Core Web Vitals). A service-line marketer adds written commentary per
snapshot, using the same Commentary feature as the rest of the report.

**Why:** today's tab is AI-crawler oriented and reads a single Screaming Frog "Internal: All" CSV pair
(current vs previous). It can't show a health score, indexing coverage, CWV, or a history beyond two crawls,
and it can't tell the team which issue to work on first across tools.

## 2. Goals, non-goals, anti-goals

**Goals**
- Snapshot drop-down (no date picker) lists every snapshot for the brand, newest first, labeled by snapshot
  date. Switching snapshots updates every new section.
- Brief §2.3 health tiles, §2.4 delta strip + trend chart, §2.5 merged issue table, §2.2 snapshot-bound
  commentary — with the brief's acceptance criteria (§6) as the definition of done.
- Totals match the source tools for a QA brand.
- Follows the **existing app branding** (dark theme, current tokens), using the mockup for layout only.

**Non-goals (v1)**
- Automated intake from the Ahrefs API, the Screaming Frog office-machine automation, or the Technical Audit
  Log. Every source is uploaded by hand in v1 (see §3). Each becomes a later, independent swap.
- Sitebulb as a fourth source (brief: out of scope; the existing Sitebulb AEO checklist stays as-is below).
- GSC URL-Inspection / CrUX approximations.
- URL-level lists. v1 stores counts only (see §6.3).
- Multi-domain brands (one snapshot = one client = one property in v1).

**Anti-goals** (would be a failure even if it technically works)
- A missing source treated as 0 (every issue would read "Resolved").
- Older data carried forward into a snapshot without a label.
- Unmapped issues silently dropped from the table.
- Double-counted URLs (summing across sources).
- Drafts, staff timestamps, or the Approved badge reaching a client (view or PDF).
- The mockup's blue/purple palette shipped instead of the app's brand.

## 3. Approaches (decided)

| | Approach | Trade-off |
|---|---|---|
| **A (chosen)** | **Upload for every source in v1.** A team-only "Add snapshot" form takes a date, the Ahrefs Health Score (typed) + All Issues CSV, the Screaming Frog Issues Overview CSV, and the two GSC report exports. Parsers write to Neon snapshot tables; the page reads only those. Each source sits behind its own adapter. | Unblocked by anything outside this repo; same mechanism the brief already accepts for GSC. Cost: ~4 files per brand per month of manual work; the snapshot list comes from uploads, not the Technical Audit Log. |
| B | Wire the real sources (Ahrefs API, SF automation → Drive, Technical Audit Log); upload only GSC. | Matches the brief and removes toil, but blocked on three external unknowns (Ahrefs plan returns per-crawl history? SF automation config change on the office machine; Technical Audit Log not reachable from this app). |
| C | Build the UI on sample data now, wire data later. | Dropped: the acceptance test is "totals match the tools"; a fake-data page is the anti-goal. |

Paul picked **A**. B remains the upgrade path, one source at a time, behind the same adapter seam.

## 4. Constraints

- Server-side data only; RSC sections each wrapped in the existing error boundary (CLAUDE.md rules 1, 4, 5).
- Data lives in **Neon** (the BigQuery spec explicitly defers crawl tools).
- Both routes render this tab: `app/dashboard/[clientSlug]/reports/page.tsx` and
  `app/portal/[clientSlug]/reports/page.tsx` (known duplication — wire both).
- Respect `enabledReports` / hidden subsections exactly as today.
- Upload body cap is 3 MB (`next.config.ts`), same as Social Listening.
- Export PDF is rendered server-side by a headless browser at `app/export/[clientSlug]/[section]` through
  `components/export/report-element.tsx` — a **third** render site for this tab. The new `snapshot` param
  must pass through `ExportRequest` / `parseExportRequest` (`lib/export/request.ts`) and the bulk export
  (`lib/export/bulk.ts`). Export mode already prints only approved commentary; staff-only UI (upload panel)
  must not render there.
- The date picker shows on this tab today in both routes (the `AEO_SUBSECTION_NAMES` checks) and the PDF
  header date follows `usesPageRange`. Both must exclude `technical-audit` in both routes.
- Migrations: write SQL in `drizzle/`, apply with `scripts/migrate-http.ts` **before** the code that reads
  the new tables goes live (see the commentary 0018 incident).
- Branding: invoke the `frontend:brand-coherence` skill during the build; reuse existing tokens
  (`bg-bg-surface`, `text-text-muted`, `#60FF80` good, `#FF4444` bad, `#FFFC60` warn, `white/…` neutrals),
  `SectionHeader`, and the card style used across AEO tabs. Charts on Recharts as elsewhere.

## 5. Page layout

Order, top to bottom (new sections first, existing AI-crawler sections kept below):

1. **Header + snapshot selector.** `SectionHeader` for the tab, then a select of all snapshots
   ("Nov 15, 2026 (latest)"). Under it, "Compared with: Oct 15, 2026" (or "Baseline — first snapshot").
   One "data as of" line per source: Ahrefs crawl date, SF crawl date, GSC capture date, each with a status
   dot (complete / missing). A "Crawl settings changed" flag shows when set on the snapshot.
   Selection is a URL param, `snapshot=YYYY-MM-DD` (shareable, survives print). Absent → latest.
   No snapshots at all → team view shows the "Add snapshot" empty state; client view shows the standard
   empty-state card.
2. **Commentary** (§7).
3. **01 · Health scores** — 2×2 tiles, each with source path, ⓘ tooltip, value, delta vs previous:
   - Site health score — speedometer 0–100, red/amber/green bands; delta in points.
   - Crawl issues by type (SF) — vertical bars Issues / Warnings / Opportunities, previous snapshot as a lighter
     bar beside each; URLs affected per category as the secondary label. Bars count **issue types** (mockup
     default; brief open question #5).
   - Indexing coverage — half-donut "% indexed of known URLs", **neutral color, not pass/fail**; indexed and
     not-indexed counts with deltas.
   - Core Web Vitals — bars Poor / Needs improvement / Good, previous as lighter bar; Mobile/Desktop toggle,
     default Mobile.
   Each tile shows "No data for this snapshot" when its source is missing.
4. **02 · Change over time** — delta strip of six KPI tiles (Health Score ↑, SF issue types ↓, Indexed ↑,
   Not indexed ↓, Poor CWV URLs mobile ↓, Good CWV % mobile ↑), each with value, good/bad-colored delta, and a
   sparkline across all snapshots. Clicking a tile selects it in the **trend chart** below: one KPI at a time
   on its own axis, all snapshots, selected and previous snapshots marked.
5. **03 · Investigate next** — the merged issue table (§6). Filters by source and severity (default All,
   sorted by priority). Above it: "N resolved since <prev date> · x new · y worsening · z improving".
6. **Existing AI-crawler sections, unchanged in content:** bot activity, AI-activity/issue overlap, crawler
   waste (log anomalies), the fix list (with its "How is priority scored?" card), and the Sitebulb AEO
   checklist. Most of them cannot be pinned to a past snapshot (bot activity is always the last 30 days
   ending today, URL citations has no window, Sitebulb holds only the latest crawl, and the fix list and
   overlap table read the Drive SF "Internal: All" CSVs). So they sit under a divider —
   **"Current AI-crawler activity · not tied to the selected snapshot"** — and each shows its own as-of
   date. They keep running on today's pipelines and render on every snapshot, older ones included.
   The GA4 AI-path query, the one input that takes a range, uses the last 30 days ending today so the block
   is consistent. The fix-list scoring card is renamed "How is the fix list scored?" so it isn't confused with
   the issue table's priority formula.
   The current SF "Internal: All" sections (snapshot KPI cards, "What changed since the last crawl?", "How are
   technical issues trending?") are **removed** — the new health tiles, delta strip and issue table supersede
   them. (Builder: confirm with Paul if any of those has a consumer this misses.)

## 6. Data

### 6.1 Tables (Neon, new migration)

- `tech_audit_snapshots` — `id`, `client_id`, `snapshot_date` (unique per client), `ahrefs_crawl_date`,
  `sf_crawl_date`, `gsc_capture_date` (nullable), `ahrefs_health_score` (nullable),
  `crawl_settings_changed` (bool), `status` (`draft` | `published`, default `draft`), `published_by`,
  `published_at`, `created_by`, `created_at`, `updated_at`.
  **Clients see only published snapshots**: the drop-down, "latest", and "Compared with" all skip drafts in
  the client view and in PDF export. The team view lists drafts too, marked "(draft)"; a team member
  previewing a draft compares it against the latest published snapshot before it.
  Per-source status is **derived** (a source is complete when its upload row exists), not stored.
- `tech_audit_metrics` — one row per snapshot: SF issue-type counts and URL totals for issue/warning/
  opportunity; GSC indexed / not indexed; GSC CWV poor / NI / good for mobile and desktop. All nullable per
  source.
- `tech_audit_source_issues` — `snapshot_id`, `source` (`ahrefs` | `sf` | `gsc_indexing` | `gsc_cwv`),
  `native_issue_name`, `native_severity`, `url_count`, plus `device` for CWV rows.
- `tech_audit_uploads` — `snapshot_id`, `source`, `file_name`, `byte_size`, `raw` (bytea, ≤ 2 MB, same
  pattern and size check as `social_listening_uploads`), `uploaded_by`, `uploaded_at`. One live row per
  (snapshot, source); re-uploading a source replaces its upload, issues and metrics in one transaction.
  Raw files are kept so a parser fix can re-derive without re-asking the team.

### 6.2 Upload flow (team view only)

"Add snapshot" panel (and "Replace" per source on an existing snapshot), visible only to
`canEditCommentary` users (`@avenuez.com`) on the dashboard route, print-hidden. Inputs: snapshot date,
Ahrefs crawl date + Health Score + All Issues CSV, SF crawl date + Issues Overview CSV, GSC capture date +
Page Indexing export + CWV export (per device), and a "crawl settings changed" checkbox. Any source may be
left out and added later. A **Publish** button (any `@avenuez.com` user) moves the snapshot to published;
it warns, but does not block, when a source is missing. **Unpublish** returns it to draft. Server action per source, modeled on `uploadSocialListeningExport`: auth +
client check, size check, parse, transactional write, `revalidate`. Parse failures return a named reason
("This isn't a Screaming Frog Issues Overview export: missing column 'Issue Priority'") and write nothing.
Sizes and parse failures are logged with client slug, snapshot date, and source.

### 6.3 Merge, severity, ranking, status

Pure functions in `lib/technical-audit/` with unit tests; weights and the severity map in one config module.

- **Canonical map:** maps `(source, native_issue_name)` → `canonical_issue_key` + display name. Stored as a
  **Google Sheet the AEO team edits**, read with the existing service account (same as the Sitebulb
  client), cached 1 h. One Sheet for all brands; its ID in env var `TECH_AUDIT_ISSUE_MAP_SHEET_ID` (add to
  `.env.example`). Columns: `source`, `native_issue_name`, `canonical_issue_key`, `canonical_issue_name`.
  The repo ships a seed version of the map for tests and as the fallback when the Sheet can't be read
  (logged). The map is **applied at read time** (not frozen per snapshot), so a mapping fix also corrects
  older snapshots; the raw native names stay stored, so nothing is lost.
- **URLs affected:** v1 has counts only → **max across contributing sources**, never the sum.
- **Severity:** brief §2.5 normalization table; canonical severity = highest among contributors. The
  "raise GSC Low to High when in the XML sitemap" rule needs URL lists and is **deferred**.
- **Priority:** `weight(sev) × log10(urls + 1) × (1 + 0.25 × (sources − 1)) × (grew ? 1.15 : 1)`.
- **Status:** New / Worsening / Improving / Unchanged / Baseline per brief. Change and status compare
  **only sources present in both snapshots**; when the previous snapshot lacks every contributing source,
  change shows "—" and status is not computed. Zero-count issues drop out and add to "Resolved".
- **Unmapped issues** appear under their native name with a "Needs mapping" flag.
- Source detail line under each issue: "Ahrefs: 4XX page (132) · SF: Internal Client Error (4xx) (148) · GSC:
  Not found (404) (121)".

## 7. Commentary

- New view key `peec-ai:technical-audit` added to `CommentaryViewKey` / `COMMENTARY_VIEWS` (owner label
  "AEO"); extends the PRD's scope, as the brief notes. Commentary renders the way it does on every other
  tab: only when the brand's `report_section_config['peec-ai:technical-audit'].sharedParts` contains
  `{ id: 'commentary' }` (via `SharedPartsHeader`). Turning it on for a brand is a DB config row — listed
  in the rollout notes of the plan, not a code change. (`resolveCommentaryView` is orphaned; don't rely on it.)
- **Snapshot binding without a schema change:** an entry for a snapshot has
  `periodStart = periodEnd = snapshot_date`. The section passes the selected snapshot's date; the panel shows
  only that period's entries. The editor shows "Snapshot: Nov 15, 2026" instead of date inputs (same
  approach Social Listening's analysis boxes use for a fixed month).
- Everything else as shipped: draft → approved, edit-as-new-draft, revoke, soft-delete, approver history,
  client view hides drafts/timestamps/badge, `COMMENTARY_APPROVERS` env allowlist.
- Snapshot with no commentary: team view → "Add commentary" empty state; client view → box hidden.

## 8. Edge cases

| Case | Behavior |
|---|---|
| First snapshot | No deltas; "Baseline" in place of change values and statuses. |
| Source missing for a snapshot | Tile empty state; source left out of the merge and of status comparison. |
| Crawl settings changed | Flag on header; deltas still shown. |
| Same snapshot date uploaded twice | Unique per client — the form edits the existing snapshot. |
| Malformed / wrong file | Named parse error, nothing written. |
| Canonical-map Sheet unreachable | Repo seed map used; logged. |
| Snapshot param not found | Fall back to latest. |

## 9. Testing

- Parser tests against **real exports** from the QA brand, **Renaissance** (fixtures committed, anonymized as
  needed). Needed from the AEO team before PR 1's parsers: one month's Ahrefs All Issues CSV + Health Score,
  SF Issues Overview CSV, GSC Page Indexing export, GSC CWV export (mobile + desktop).
- Seed canonical map: drafted by the builder from the native issue names in those exports, then corrected
  by the AEO team in the Sheet. PR 1 (tables, upload shell) and the pure merge/rank logic don't wait on it.
- Pure-function tests for merge, severity, priority, status, delta coloring, and the commentary period filter.
- Section render tests for empty / baseline / missing-source states; client vs team view (no drafts, no
  upload UI, no staff timestamps).
- Manual QA: totals match Ahrefs, SF Issues tab, GSC Indexing and CWV for the QA brand; print to PDF from
  the team view shows approved commentary only.

## 10. Delivery

Feature PRs into `dev`, each with its own review: (1) tables + upload + parsers, (2) header + health tiles +
delta strip + trend chart, (3) issue table + canonical map, (4) commentary binding + PDF check. The
code-review record doc follows the CLAUDE.md Stage-1 template.

## 11. Left to the builder

Component breakdown and file layout under `components/report-sections/peec-ai/technical-audit/`; gauge
implementation (Recharts radial vs hand SVG); exact parser column handling once sample files are in hand;
ⓘ copy (draft from the brief's source paths).

## 12. Still open for Tina (from the brief, §7)

Approach A answers #1 (anchor = uploaded snapshot date) and #2 (manual upload) for v1, and assumes #4
(commentary follows the snapshot) and #5 (issue types in bars). #3 (approvers per brand, client-facing for
every AEO brand or team-only first) is unanswered; v1 uses the global approver list and today's per-client
subsection visibility.

---

## Appendix A — rules carried over from the brief

The brief lives in Glean; these are its rules, copied here so the build doesn't depend on it.

### A.1 KPIs (delta strip + trend chart)

| KPI | Source | Better when |
|---|---|---|
| Health Score | Ahrefs | Higher |
| Issues (issue types) | Screaming Frog | Lower |
| Indexed pages | GSC Indexing | Higher |
| Not indexed pages | GSC Indexing | Lower |
| Poor CWV URLs (mobile) | GSC CWV | Lower |
| Good CWV URLs % (mobile) | GSC CWV | Higher |

Prefer ratios (% indexed, % good CWV) where possible; site size changes between crawls.

### A.2 Severity normalization

| Source | Native label | Normalized |
|---|---|---|
| Ahrefs Site Audit | Error / Warning / Notice | High / Medium / Low |
| Screaming Frog | Issue Priority High / Medium / Low | same |
| GSC Indexing | Server error (5xx), Not found (404), Soft 404, Redirect error, Blocked by robots.txt, Blocked due to unauthorized request (401) | High |
| GSC Indexing | Crawled – currently not indexed, Discovered – currently not indexed, Duplicate without user-selected canonical, Google chose different canonical than user | Medium |
| GSC Indexing | Alternate page with proper canonical tag, Page with redirect, Excluded by 'noindex' tag | Low (sitemap raise deferred, §6.3) |
| GSC CWV | Poor / Needs improvement | High / Medium |

Unlisted GSC reasons: Medium, flagged "Needs mapping".

### A.3 Priority and status

- Severity weight: High 3, Medium 2, Low 1. Multi-source bonus 0.25 per extra source. Growth multiplier
  1.15. All in config so they can be tuned.
- Status: **New** (previous count 0), **Worsening** (count up), **Improving** (count down), **Unchanged**,
  **Baseline** (first snapshot for the brand). Current count 0 → out of the table, into "Resolved".

### A.4 Acceptance criteria (brief §6)

1. Drop-down lists every snapshot, newest first, labeled by date; switching updates every new section.
2. Commentary works as elsewhere (draft, approve, revoke, edit-as-new-draft; client view hides drafts,
   timestamps, badge) and follows the selected snapshot.
3. Four health tiles with the specified visuals, each with ⓘ and a delta vs previous.
4. CWV tile toggles Mobile / Desktop.
5. Delta strip: six KPIs, correct good/bad coloring, sparklines; trend chart switches KPI.
6. Issue table merges all four inputs via the canonical map, normalizes severity, ranks by priority, shows
   source detail, change and status; unmapped issues show "Needs mapping".
7. Totals match the tools for a QA brand (Ahrefs Health Score, SF Issues tab, GSC Indexing + CWV exports).
8. PDF export contains approved commentary only.

## Appendix B — calls made in writing this doc (check these)

- Upload panel is dashboard-route only, for `@avenuez.com` staff.
- Snapshot date is unique per client; re-upload replaces that source in one transaction.
- Raw uploads kept as bytea (≤ 2 MB) so parsers can re-derive.
- URLs affected = max across sources (no URL lists in v1); GSC sitemap severity raise deferred.
- Canonical map applied at read time, from one Sheet for all brands.
- Commentary follows the existing per-brand `sharedParts` opt-in.
- Change/status compare only sources present in both snapshots.
- Kept AI-crawler sections are labeled "current, not tied to the snapshot" rather than hidden on older
  snapshots.
- Snapshots have Draft → Published; clients see published only; missing sources warn, don't block.
- QA brand is Renaissance; builder drafts the seed issue map, AEO team corrects it.
- Removing the SF "Internal: All" KPI cards, "What changed since the last crawl?" and "How are technical
  issues trending?" sections.
