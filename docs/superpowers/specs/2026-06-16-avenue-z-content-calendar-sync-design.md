# Avenue Z Content Calendar Sync — Design

**Date:** 2026-06-16
**Status:** Approved (brainstorming complete; pending spec review)
**Branch:** `feat/avez-content-calendar-sync`

## Problem & Goal

Avenue Z (unlike real clients such as Renaissance) has no human-maintained content
calendar, so its **Content Impact Tracker** (AEO → Content Impact) has no
content-calendar data source and its calendar-driven sections render empty.

Real clients use a human-authored content-calendar Google Sheet. Avenue Z's
equivalent should be **auto-generated from its own published blog**, in the exact
format of the Renaissance master template, and kept current automatically as new
posts publish.

**Goal:** A scheduled script that reads Avenue Z's published blog posts and
maintains a Google Sheet (in the Renaissance 17-column layout) so that setting
Avenue Z's `contentCalendarSheetId` to this sheet makes its Content Impact
Tracker live.

## Source of Truth

- **Master template:** `Renaissance_ContentCalendar_2026 - March – June 2026.csv`
  — defines the canonical 17-column layout (see Column Mapping).
- **Blog source:** Avenue Z WordPress **REST API** (verified working):
  - Posts: `GET https://avenuez.com/wp-json/wp/v2/posts?per_page=100&page=N&_fields=id,date,modified,link,title,categories`
  - Blog category: id `2`, slug `blog` (783 posts in category).
  - **Filter:** include a post only if its `link` path contains `/blog/`.
    (Category 2 is a broad catch-all that also tags some `/events/` and
    `/press-release/` URLs; the URL-path filter is the clean definition of a
    blog post and matches the user's `/category/blog/` intent.)

Chosen over sitemap XML (no clean title/category fields) and HTML scraping of
`/category/blog/` (fragile, paginated). REST API returns structured JSON with all
observable fields and is deterministic.

## Output

- **A Google Sheet** in Avenue Z's shared client drive, written via a Google
  service account, structured as the 17-column Renaissance layout (header row
  identical to the master template).
- Once populated, set Avenue Z's `clients.contentCalendarSheetId` (DB) to this
  sheet → Content Impact Tracker reads it via the existing
  `lib/content-calendar/client.ts` parser. No app code change required.

## Column Mapping (17 columns)

Only the "observable" columns are auto-filled; strategy columns are left blank
for humans to fill later (and are preserved on re-run).

| # | Column | Auto value |
|---|---|---|
| 1 | Date | Month-year derived from publish date, e.g. `June 2026` |
| 2 | Priority | *(blank)* |
| 3 | Content Type | `New Blog` (→ app derives Content Action = `new`) |
| 4 | Topic | Post title (`title.rendered`, HTML-entity-decoded) |
| 5 | Status | `Published` |
| 6 | Publish Date | From `date`, formatted **M/D** (e.g. `6/15`) to match master template |
| 7 | Suggested Author (Blog Only) | *(blank)* |
| 8 | Suggested Category Tags (Blog Only) | *(blank)* |
| 9 | Why | *(blank)* |
| 10 | How | *(blank)* |
| 11 | Proposed Page Slug (or Live URL When Published) | Post `link` (full URL) — app reads this as the URL |
| 12 | Relevant AI Queries | *(blank)* |
| 13 | Keyword(s) | *(blank)* |
| 14 | Internal Linking Opportunities | *(blank)* |
| 15 | Inspiration / Competitor URLs | *(blank)* |
| 16 | Organic Social Support | *(blank)* |
| 17 | Notes | *(blank)* |

The Content Impact Tracker parser consumes columns **4, 11, 3, 5, 6** (Topic, URL,
Content Type, Status, Publish Date) and derives Content Action from Content Type
and Match Status from URL+Status — so the auto-filled subset fully feeds the
tracker.

**Date-format caveat:** the master template uses bare M/D (no year). Avenue Z has
posts spanning multiple years, so M/D is ambiguous across years. Per decision we
match the template (M/D). Publish Date is not used for data matching (URL is), so
this is cosmetic.

## Update Behavior (idempotent, safe to re-run)

Dedup key = **post URL** (column 11).

1. Read all current rows from the target Google Sheet.
2. Fetch all `/blog/` posts from the REST API.
3. For each post whose URL is **not** already a row → **append** a new row with
   observable columns filled.
4. For posts whose URL **already exists** → **leave the row untouched** (never
   overwrite human-filled strategy columns or edited values).
5. Posts removed from the site are left in the sheet (no deletion) — additive only.

This makes scheduled re-runs pick up only new posts and never clobber human edits.

## Scheduling

- **Recommended:** GitHub Action on a cron schedule (e.g. daily), running the
  TypeScript script via `tsx`. Service-account key stored as a GitHub Actions
  secret. Decoupled from the app runtime.
- **Alternative:** Vercel cron → API route (the app already uses Vercel cron in
  `vercel.json` for `/api/cache-warm`). Heavier coupling to the app.

Decision: GitHub Action cron unless review prefers Vercel.

## Components

- `scripts/avez-content-calendar-sync.ts` — entry point. Orchestrates:
  - `fetchBlogPosts()` — paginated WP REST API fetch + `/blog/` filter + map to rows.
  - `readSheet()` / `appendRows()` — Google Sheets API (service-account auth via
    `google-auth-library`, `spreadsheets` scope). Mirrors the auth pattern in
    `lib/content-calendar/client.ts` (which currently uses readonly scope).
  - `mergeByUrl()` — pure function: given existing rows + fetched posts, returns
    the new rows to append. Unit-testable in isolation.
  - `toCalendarRow(post)` — pure mapping function (post JSON → 17-col row).
    Unit-testable.
- `.github/workflows/avez-content-calendar-sync.yml` — cron schedule (if GitHub
  Action path chosen).

Pure functions (`toCalendarRow`, `mergeByUrl`) are separated from I/O (REST fetch,
Sheets write) so the mapping and dedup logic can be tested without network access.

## Configuration / Prerequisites (provided at implementation time)

- **Target Google Sheet:** create a blank sheet in the shared client drive with
  the 17-column header row (copy from master template); share it with the service
  account as **Editor**. Provide its Sheet ID.
- **Service account:** confirm whether to reuse `GOOGLE_SERVICE_ACCOUNT_KEY`
  (`avenue-z-reporting@…`, already used by the app) or a different account. Needs
  **write** (`spreadsheets`) scope, not just readonly.
- **Secrets:** service-account JSON as env var locally and as a CI secret if
  scheduled via GitHub Action.
- **Final step (out of script scope):** set `contentCalendarSheetId` on Avenue
  Z's `clients` row to the new sheet (DB update) to make the tracker live.

## Out of Scope

- Strategy columns (Why, How, AI Queries, Keywords, Internal Linking, Inspiration,
  Priority, Author, Category Tags, Notes) — human-authored, left blank.
- `/press-release/` and `/events/` posts — blog only.
- Deleting/archiving rows for unpublished posts — additive only.
- Backfilling AI citations / bot visits / sessions — those are enriched at render
  time by the tracker from Peec/GA4, not stored in the calendar.

## Testing

- Unit-test `toCalendarRow()` against sample WP post JSON (title decoding, M/D
  date, URL passthrough, Content Type/Status constants).
- Unit-test `mergeByUrl()` for: new post appended, existing URL skipped,
  human-edited existing row preserved.
- Dry-run mode (`--dry-run`) that logs the rows it would append without writing
  to the sheet, for safe first execution against the real API.

## Open Questions

1. Service account: reuse the app's `avenue-z-reporting@…` or a separate one?
2. Schedule cadence (daily? hourly?) and host (GitHub Action vs Vercel cron)?
3. Should re-runs update the **Status** of an existing row if it changed on the
   site, or stay strictly append-only? (Default: strictly append-only.)
