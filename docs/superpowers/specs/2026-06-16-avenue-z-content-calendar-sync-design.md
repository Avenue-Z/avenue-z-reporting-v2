# Avenue Z Content Calendar Sync — Design (v2)

**Date:** 2026-06-16
**Status:** Revised after studying the Renaissance sheet + `monthly-report-agent`. Pending spec review.
**Branch:** `feat/avez-content-calendar-sync`

## Problem & Goal

Avenue Z (unlike clients such as Renaissance) has no human-maintained editorial
content calendar, so its **Content Impact Tracker** (AEO → Content Impact) has no
content-calendar source and its calendar-driven sections render empty.

**Goal:** A scheduled Python job that reads Avenue Z's published blog posts and
maintains a Google Sheet (replicating the Renaissance content-calendar format) so
that setting Avenue Z's `contentCalendarSheetId` to that sheet makes its Content
Impact Tracker show real data. Priority is **mapping to the Content Impact section
perfectly** on the live dashboard; exact tab styling is secondary to that.

## How the dashboard reads the sheet (verified on production branch `feat/aeo-overview-enhancements`)

`lib/content-calendar/client.ts`:
- Fetches **`A1:Z1000` of the FIRST (leftmost) tab** (no sheet/gid specified →
  first sheet by position). → **Blog rows MUST be in the first tab.**
- Row 1 = header; columns alias-matched case-insensitively.
- Verified aliases that make the Renaissance format map cleanly:
  - URL ← **"Proposed Page Slug (or Live URL When Published)"** (explicit alias).
  - Content Type **"New Blog"** → `parseContentAction` derives Content Action = `new`.
  - Status **"Published"** + a URL → `deriveMatchStatus` = `matched` (shows as live/tracked).
- Consumes Topic, URL, Content Type, Status, Publish Date; derives Content Action
  (from Content Type) and Match Status (from URL + Status).

**Discovery:** Renaissance's first tab is "July – September 2026" (empty planning
quarter, 3 placeholder rows), so Renaissance's live tracker currently shows only
those 3 rows — its 28 published posts sit in the "March – June 2026" tab the app
never reads. For Avenue Z we deliberately put the published posts in the **first**
tab so the tracker reads them.

## Renaissance workbook structure (studied 1:1, read-only) — to replicate

Workbook `Renaissance_ContentCalendar_2026`, three tabs, identical 17-column layout:

| Tab | gid | Role |
|---|---|---|
| July – September 2026 | 0 | upcoming planning quarter (placeholder rows) |
| March – June 2026 | 748532855 | populated published quarter (~28 rows) |
| Backlog | 1757973412 | unscheduled ideas (Date = TBD) |

**17 columns (A→Q):** A Date (month, e.g. "March 2026") · B Priority (High/Med/Low,
dropdown+color) · C Content Type (dropdown: Existing Page Optimization / Existing
Blog Optimization / New Page / New Blog / Existing Guide Optimization) · D Topic
(hyperlinked to URL) · E Status (dropdown+color: Published/Planned/Ready for
Renaissance Review/Staging/In Progress) · F Publish Date (M/D) · G Suggested Author
(Blog Only) · H Suggested Category Tags (Blog Only) · I Why · J How · K Proposed
Page Slug (or Live URL When Published) · L Relevant AI Queries · M Keyword(s) ·
N Internal Linking Opportunities · O Inspiration / Competitor URLs · P Organic
Social Support · Q Notes.

Formatting: frozen bold header (dark bg), data-validation dropdowns + conditional
colors on Priority/Content Type/Status, Topic as hyperlink.

## Source

Avenue Z WordPress **REST API** (verified working):
- `GET https://avenuez.com/wp-json/wp/v2/posts?per_page=100&page=N&_fields=id,date,modified,link,title,categories`
- Blog category id `2` (~783 posts). **Filter:** include only posts whose `link`
  path contains `/blog/` (category 2 is a catch-all that also tags some
  `/events/` and `/press-release/` URLs). Matches the user's `/category/blog/` source.

Chosen over sitemap XML and HTML scraping (structured JSON, deterministic).

## Output target

- **Avenue Z Google Sheet** `1-Ar5vGXLWHnO3qtbymFVsgGD6kpJxCZvGWUSK5NngyQ`
  (Editor access already granted to the service account).
- The script writes blog rows into the **first (leftmost) tab** in the 17-column
  Renaissance layout. (Optionally replicate the Backlog tab empty for visual
  fidelity; not required for the tracker.)
- **Go-live step (out of script scope):** set Avenue Z's `clients.contentCalendarSheetId`
  = `1-Ar5…` in the DB → tracker reads it via the existing parser, no app code change.

## Column mapping (blog post → row)

Observable columns auto-filled; strategy columns left blank (preserved on re-run).

| Column | Value |
|---|---|
| A Date | Month-year from publish date, e.g. `June 2026` |
| B Priority | *(blank)* |
| C Content Type | `New Blog` → derives Content Action `new` |
| D Topic | Post title (HTML-decoded; hyperlink to URL optional) |
| E Status | `Published` |
| F Publish Date | From `date`, **M/D** to match the master template |
| G–J, L–Q | *(blank)* — human strategy fields |
| K Proposed Page Slug (or Live URL When Published) | Post `link` (full URL) — the column the parser reads as the URL |

Date format M/D matches the template; Publish Date is not used for data matching
(URL is), so multi-year ambiguity is cosmetic only.

## Update behavior (idempotent, safe to re-run)

Dedup key = **post URL** (column K).
1. Read current rows from the first tab of the Avenue Z sheet.
2. Fetch all `/blog/` posts from the REST API.
3. New URL → append a new row (observable columns filled).
4. Existing URL → leave the row untouched (never clobber human-filled columns).
5. Additive only (removed posts are not deleted from the sheet).

## Stack & auth (mirrors `monthly-report-agent`)

- **Language/runtime:** Python; deployed as a **Cloud Run Job + Cloud Scheduler**
  (the established Avenue Z automation pattern). New standalone repo/dir; the
  `monthly-report-agent` repo stays untouched (reference-only).
- **Service account:** `automation-agent@vertex-api-test-495415.iam.gserviceaccount.com`
  via `google-credentials.json` (base64 env `GOOGLE_CREDENTIALS_JSON`, decoded at
  startup). Scopes: `https://www.googleapis.com/auth/spreadsheets` (+ `drive` if
  locating/creating files in the shared drive).
- **Shared drive:** the target sheet lives in a shared drive; all Drive/Sheets
  calls must pass `supportsAllDrives=True` / `includeItemsFromAllDrives=True`
  (service accounts have no personal Drive quota). Pattern from
  `monthly-report-agent/gdoc_writer.py`.
- **Sheets write:** `build("sheets","v4")` — read first tab values, append new rows
  (`values().append` or `batchUpdate`).

## Components (new repo)

- `sync.py` — entry point: orchestrate fetch → map → merge → write.
- `wp_reader.py` — paginated REST fetch + `/blog/` filter.
- `mapping.py` — pure `post_to_row(post)` (post JSON → 17-col row). Unit-testable.
- `merge.py` — pure `rows_to_append(existing, posts)` (dedup by URL). Unit-testable.
- `sheets_writer.py` — SA auth + read first tab + append (shared-drive aware).
- `Dockerfile`, `deploy.sh` (Cloud Run Job + Cloud Scheduler), `requirements.txt`.

Pure functions (`mapping`, `merge`) separated from I/O so logic is tested without network.

## Configuration / prerequisites

- `google-credentials.json` for `automation-agent` (Sheets+Drive enabled).
- Target sheet `1-Ar5…` shared with the SA as Editor (done).
- Shared-drive id / folder if file creation is ever needed (sheet already exists).
- Cloud Scheduler cadence (e.g. daily) — to confirm.

## Out of scope

- Strategy columns (Why/How/AI Queries/Keywords/Internal Linking/Inspiration/
  Priority/Author/Category Tags/Notes) — human-authored, blank.
- `/press-release/`, `/events/` posts — blog only.
- Deleting/archiving rows — additive only.
- AI citations / bot visits / sessions — enriched at render time by the tracker.

## Testing

- Unit-test `post_to_row()` (title decode, M/D date, URL in col K, constants).
- Unit-test `rows_to_append()` (new appended, existing skipped, human edits preserved).
- `--dry-run` mode logs rows it would append without writing.

## Open questions

1. Cloud Scheduler cadence (daily? weekly?).
2. Replicate the empty Backlog tab for visual fidelity, or single data tab only?
3. Hyperlink the Topic cell to the URL (Renaissance does), or plain text?
