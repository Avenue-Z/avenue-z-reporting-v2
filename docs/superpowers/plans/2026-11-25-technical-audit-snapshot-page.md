# Technical Audit Snapshot Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the AEO Technical Performance tab with a monthly snapshot page: Ahrefs + Screaming Frog pulled automatically, GSC uploaded by the strategist, a "Before you publish" checklist, health tiles, KPI trends, one merged issue list with per-brand hide/annotate, and snapshot-bound commentary.

**Architecture:** A daily Vercel cron (`/api/tech-audit/sweep`) discovers new Screaming Frog run folders in Drive, creates draft snapshots in Neon, and fills each source run (SF Issues Overview CSV, Ahrefs Site Audit API). Staff server actions upload GSC Excel exports, publish/unpublish, and hide/annotate issues. The page is an RSC that builds one view model (`loadTechAuditView`) and renders presentational components; pure functions in `lib/technical-audit/` do parsing, merging, ranking and deltas.

**Tech Stack:** Next.js 16 App Router (RSC + server actions), TypeScript strict, Drizzle + Neon, SheetJS `xlsx` (already a dependency), Recharts, Tailwind v4, Vitest (jsdom).

**Spec:** `docs/superpowers/specs/2026-11-23-technical-audit-snapshot-page-design.md` (approved 2026-11-25). Evidence: `docs/qa/technical-audit-source-probes.md`. Decisions: `docs/official-feedback/technical-audit-decisions-for-approval-answered.docx`.

## Global Constraints

- No GSC number on the page that didn't come from an uploaded GSC export. No estimates of any kind.
- Nothing auto-publishes. Clients (non-staff) only ever see `status = 'published'` snapshots; never the checklist, hidden rows, staff names or timestamps.
- Issue list has no movement tags, no change column, no "resolved" count.
- URLs affected = max across contributing sources, never the sum.
- Priority = `weight(sev) × log10(urls + 1) × (1 + 0.25 × (sources − 1))`, weights High 3 / Medium 2 / Low 1 (no growth factor).
- Staff = `isAvenueZEmail(session.user.email)` (`lib/commentary/permissions.ts`); every action re-checks session and client.
- Ahrefs crawl = latest completed crawl on or before `snapshot_date`, within 7 days.
- Raw files stored as bytea ≤ 2,097,152 bytes, with a DB check constraint, as `social_listening_uploads`.
- Logs name client slug, snapshot date, source and reason only — never file contents, keys, or DB error text.
- Env: `AHREFS_API_KEY`, `TECH_AUDIT_ISSUE_MAP_SHEET_ID` (+ existing `GOOGLE_SERVICE_ACCOUNT_KEY`, `CRON_SECRET`). No `CRUX_API_KEY`.
- Branding: invoke `frontend:brand-coherence` before UI tasks; tokens `bg-bg-surface`, `text-text-muted`, good `#60FF80`, bad `#FF4444`, warn `#FFFC60`; `SectionHeader` from `components/report-sections/peec-ai/section-header`.
- New test globs must be added to `vitest.config.ts` `include` (it's an allowlist; unlisted tests are silently skipped).
- Feature PRs target `dev` (CI rejects other bases). Run `npm run typecheck`, `npm test`, `npm run check:rsc`, `npm run lint` before each PR.

## Review Focus

1. A GSC Excel export for the wrong report or device dropped in a slot (e.g. CWV desktop into mobile, Page indexing into CWV) must be refused with a named reason, not silently stored — pinned in Task 6.
2. A snapshot with GSC missing for the previous month: deltas and sparklines must show gaps ("—"), never treat missing as 0 — pinned in Task 9.
3. A client viewer requesting `?snapshot=` for a draft date must land on the latest published snapshot, and the PDF export of a draft must not leak it — pinned in Task 10.
4. An Ahrefs or Drive call that hangs or 429s must leave the source run retryable (`failed` with reason, `attempts` incremented) without blocking other brands — pinned in Task 5.
5. A hidden issue must disappear from the client view and the PDF even when it's the #1 ranked row; a note must render as text, not HTML — pinned in Task 13.

---

## PR 1 — Data foundation and automatic pulls

### Task 0: Worktree setup

- [ ] **Step 1:** In `/Users/paulramirez/Documents/Projects/rdr-tech-audit` (branch `feat/technical-audit-snapshots`, rebased on `origin/dev`), run `npm ci`. Do not symlink `node_modules` (Turbopack build panics on it).
- [ ] **Step 2:** `cp ../reporting-dashboard-renaissance/.env.local .env.local` (gitignored). Run `npm run typecheck && npm test` — Expected: both pass on the untouched branch.

### Task 1: Schema, migration, types

**Files:**
- Modify: `lib/db/schema.ts` (clients table ~L215; add tables after the Social Listening block)
- Create: `drizzle/0031_technical_audit.sql` (via drizzle-kit, then reviewed)
- Create: `lib/technical-audit/types.ts`
- Modify: `vitest.config.ts` (add `'lib/technical-audit/**/*.test.{ts,tsx}'`), `.env.example` (add `AHREFS_API_KEY`, `TECH_AUDIT_ISSUE_MAP_SHEET_ID` with one-line comments)
- Test: `lib/technical-audit/types.test.ts`

**Interfaces — Produces:**
- `clients`: `sfDriveFolderId: text('sf_drive_folder_id')`, `ahrefsProjectId: text('ahrefs_project_id')`.
- Tables `techAuditSnapshots`, `techAuditSourceRuns`, `techAuditMetrics`, `techAuditSourceIssues`, `techAuditIssueOverrides` with the columns in spec §6.2. Constraints: snapshots unique (`client_id`, `snapshot_date`), `status IN ('draft','published')`; source_runs unique (`snapshot_id`, `source`), `source IN (...TA_SOURCES)`, `status IN ('pending','complete','failed','missing')`, raw size check as `social_listening_uploads`; metrics unique (`snapshot_id`); overrides unique (`client_id`, `issue_key`), `char_length(note) <= 280`.
- `types.ts`:
  ```ts
  export const TA_SOURCES = ['sf', 'ahrefs', 'gsc_indexing', 'gsc_cwv_mobile', 'gsc_cwv_desktop'] as const
  export type TaSource = (typeof TA_SOURCES)[number]
  export type TaRunStatus = 'pending' | 'complete' | 'failed' | 'missing'
  export type TaIssueSource = 'ahrefs' | 'sf' | 'gsc_indexing' | 'gsc_cwv'
  export type Severity = 'high' | 'medium' | 'low'
  export type Device = 'mobile' | 'desktop'
  export interface SourceIssue { source: TaIssueSource; nativeName: string; nativeSeverity: string; urlCount: number; device?: Device }
  export type Parsed<T> = { ok: true; value: T } | { ok: false; reason: string }
  export interface SfResult { crawlDate: string; issueTypes: { issue: number; warning: number; opportunity: number }; urls: { issue: number; warning: number; opportunity: number }; issues: SourceIssue[] }
  export interface AhrefsResult { crawlDate: string; healthScore: number; issues: SourceIssue[] }
  export interface GscIndexingResult { exportDate: string | null; indexed: number; notIndexed: number; issues: SourceIssue[] }
  export interface GscCwvResult { exportDate: string | null; device: Device; poor: number; ni: number; good: number; issues: SourceIssue[] }
  export const isTaSource: (v: string) => v is TaSource
  ```

- [ ] **Step 1: Write the failing test** `isTaSource accepts the five sources and rejects others`: `expect(TA_SOURCES.every(isTaSource)).toBe(true)`; `expect(isTaSource('gsc_cwv')).toBe(false)`.
- [ ] **Step 2:** `npx vitest run lib/technical-audit/types.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3:** Implement `types.ts`; add columns/tables to `schema.ts` (reuse the file's `bytea` custom type); run `npx drizzle-kit generate --name technical_audit`.
- [ ] **Step 4:** Read the generated SQL. It must contain only the 2 `ALTER TABLE clients ADD COLUMN` statements and the 5 `CREATE TABLE`s with their constraints/indexes. If drizzle-kit added anything else (it has drifted before — see `users.demo_mode`), hand-edit it out. Rename to `drizzle/0031_technical_audit.sql` if numbered differently and keep the journal consistent.
- [ ] **Step 5:** `npx vitest run lib/technical-audit/types.test.ts && npm run typecheck` — Expected: PASS.
- [ ] **Step 6: Commit** `feat(technical-audit): schema, migration and types`.

The migration is applied to Neon at deploy time, before code that reads it ships (`npx tsx --env-file=.env.local scripts/migrate-http.ts` against the target branch). Do not apply it to production from a task.

### Task 2: Screaming Frog — run discovery and Issues Overview parser

**Files:**
- Create: `lib/technical-audit/google.ts`, `lib/technical-audit/sf.ts`
- Create: `lib/technical-audit/__fixtures__/sf-issues-overview.csv`
- Test: `lib/technical-audit/sf.test.ts`

**Interfaces:**
- Produces (`google.ts`): `googleToken(scopes: string[]): Promise<string>` — service-account token from `GOOGLE_SERVICE_ACCOUNT_KEY` (base64 JSON), cached per scope set.
- Produces (`sf.ts`):
  - `parseRunFolderName(name: string): string | null` — `'2026-11-01_030106'` → `'2026-11-01'`; anything else → `null`.
  - `listSfRuns(folderId: string): Promise<{ date: string; folderId: string }[]>` — Drive `files.list` with `supportsAllDrives=true&includeItemsFromAllDrives=true`, folders only, newest first; several folders on one date → keep the latest by name.
  - `fetchIssuesOverview(runFolderId: string): Promise<{ bytes: Uint8Array } | null>` — the file whose name matches `/^issues_overview.*\.csv$/i`, else `null`.
  - `parseSfIssuesOverview(csv: string, crawlDate: string): Parsed<SfResult>` — CSV via `XLSX.read(csv, { type: 'string' })`. Required columns: `Issue Name`, `Issue Type`, `Issue Priority`, `URLs`. Type `Issue`/`Warning`/`Opportunity` → bucket; `issueTypes` counts rows per bucket, `urls` sums `URLs` per bucket. `SourceIssue.nativeSeverity` = `Issue Priority`.

The fixture is written from Screaming Frog's documented Issues Overview columns (Issue Name, Issue Type, Issue Priority, URLs, % of Total, Description, How To Fix), 6 rows covering all three types. Replace it with a real export once Zaf adds the report to the scheduled crawl; the tests must keep passing.

- [ ] **Step 1: Write the failing tests:**
  - `parseRunFolderName`: `'2026-11-01_030106'` → `'2026-11-01'`; `'Renaissance'` → `null`.
  - `parseSfIssuesOverview counts issue types and sums URLs per bucket` — on the fixture: exact `issueTypes` and `urls` objects; `issues.length === 6`; first issue `{ source: 'sf', nativeName: …, nativeSeverity: 'High', urlCount: … }`.
  - `parseSfIssuesOverview refuses a file missing Issue Priority` → `{ ok: false, reason: "Missing column 'Issue Priority'" }`.
  - `parseSfIssuesOverview refuses an Internal: All export` (header row of `internal_all.csv`: `Address,Content Type,Status Code,…`) → `ok: false`.
- [ ] **Step 2:** Run `npx vitest run lib/technical-audit/sf.test.ts` — Expected: FAIL.
- [ ] **Step 3:** Implement `google.ts` and `sf.ts` (Drive calls use `fetch` with a 15 s `AbortController` timeout; non-2xx → throw `Error('Drive <status>')` with no body text).
- [ ] **Step 4:** Run the tests — Expected: PASS.
- [ ] **Step 5: Commit** `feat(technical-audit): Screaming Frog run discovery and Issues Overview parser`.

### Task 3: Ahrefs Site Audit client

**Files:**
- Create: `lib/technical-audit/ahrefs.ts`, `lib/technical-audit/__fixtures__/ahrefs-projects.json`, `lib/technical-audit/__fixtures__/ahrefs-issues.json`
- Test: `lib/technical-audit/ahrefs.test.ts`

**Interfaces — Produces:**
- `pickAhrefsCrawl(crawlDate: string, snapshotDate: string): boolean` — true when `crawlDate` (ISO) is on or before `snapshotDate` and within 7 days of it.
- `parseAhrefsProjects(json: unknown, snapshotDate: string): Parsed<{ crawlDate: string; healthScore: number }>` — reads `healthscores[0]`; requires `status === 'Completed'` and `pickAhrefsCrawl`; else `ok: false` with `'No completed Ahrefs crawl within 7 days before <date>'`.
- `parseAhrefsIssues(json: unknown): SourceIssue[]` — rows with `crawled > 0` only; `nativeSeverity` = `importance`; `nativeName` = `name` plus ` (not indexable)` when `is_indexable === false` (Ahrefs lists the same name twice).
- `fetchAhrefs(projectId: string, snapshotDate: string): Promise<{ raw: Uint8Array; result: Parsed<AhrefsResult> }>` — `GET https://api.ahrefs.com/v3/site-audit/projects?project_id=…&date=<snapshotDate>T23:59:59`, then `site-audit/issues?project_id=…&date=…`; `Authorization: Bearer ${AHREFS_API_KEY}`; 15 s timeout; one retry on 429/5xx honoring `Retry-After`; 401/403 → throw `Error('Ahrefs <status>')`. `raw` = UTF-8 JSON of both responses.

Fixtures mirror the shapes recorded in the probes doc (projects: `healthscores[{ project_id, date, status, health_score, total, … }]`; issues: `issues[{ issue_id, name, importance, category, is_indexable, crawled, change, … }]`), Renaissance values from 2026-11-11/18.

- [ ] **Step 1: Write the failing tests:**
  - `pickAhrefsCrawl`: `('2026-11-11T16:55:16Z', '2026-11-12')` → true; `('2026-11-01T00:00:00Z', '2026-11-12')` → false; `('2026-11-13T00:00:00Z', '2026-11-12')` → false.
  - `parseAhrefsProjects` on fixture with `'2026-11-18'` → `{ ok: true, value: { crawlDate: '2026-11-18T16:42:47Z', healthScore: 61 } }`; with `'2026-12-01'` → `ok: false`.
  - `parseAhrefsIssues drops zero-crawled rows and suffixes not-indexable duplicates`.
  - `fetchAhrefs retries once on 429 then succeeds`, `throws Ahrefs 401 without retry`, and `aborts after 15 s` (fake timers; mock `fetch` that never resolves).
- [ ] **Step 2:** Run `npx vitest run lib/technical-audit/ahrefs.test.ts` — Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run — Expected: PASS.
- [ ] **Step 5: Commit** `feat(technical-audit): Ahrefs Site Audit client`.

### Task 4: Snapshot store

**Files:**
- Create: `lib/technical-audit/store.ts`
- Test: `lib/technical-audit/store.test.ts` (mock `@/lib/db/client` like `lib/commentary/mutations.test.ts` does)

**Interfaces — Produces:**
- `ensureSnapshot(clientId: string, run: { date: string; folderId: string }): Promise<{ id: string; created: boolean }>` — insert-if-absent on (`client_id`, `snapshot_date`); creates the five `source_runs` rows as `pending`.
- `claimRun(snapshotId: string, source: TaSource, staleAfterMs = 600_000): Promise<boolean>` — single `UPDATE … SET attempts = attempts + 1, started_at = now() WHERE snapshot_id = $1 AND source = $2 AND (status IN ('pending','failed') OR (status = 'pending' AND started_at < now() - interval)) RETURNING id`.
- `completeRun(snapshotId, source, raw: Uint8Array, write: { metrics?: Partial<TechAuditMetricsInsert>; issues?: SourceIssue[]; snapshot?: Partial<TechAuditSnapshotInsert> }): Promise<void>` — one transaction: replace that source's issue rows, upsert metrics, update snapshot dates/score, set run `complete`.
- `failRun(snapshotId, source, status: 'failed' | 'missing', reason: string): Promise<void>`.
- `setSnapshotStatus(snapshotId: string, status: 'draft' | 'published', by: string): Promise<void>`.
- Row types: `SnapshotRow = typeof techAuditSnapshots.$inferSelect`, `TechAuditSnapshotInsert` / `TechAuditMetricsInsert` = the tables' `$inferInsert`.
- `getSnapshots(clientId: string, opts: { publishedOnly: boolean }): Promise<SnapshotRow[]>` newest first, and `getSnapshotBundle(snapshotId: string): Promise<{ snapshot; runs; metrics; issues }>`.
- `getOverrides(clientId: string)` / `setOverride(clientId, issueKey, patch: { hidden?: boolean; note?: string | null }, by: string)`.

- [ ] **Step 1: Write the failing tests:** `ensureSnapshot is idempotent` (second call → `created: false`, no extra run rows); `claimRun returns false when the run is complete`; `completeRun replaces only that source's issues`; `getSnapshots publishedOnly filters drafts`.
- [ ] **Step 2:** Run — Expected: FAIL.
- [ ] **Step 3:** Implement with Drizzle (`db` from `lib/db/client`).
- [ ] **Step 4:** Run — Expected: PASS.
- [ ] **Step 5: Commit** `feat(technical-audit): snapshot store`.

### Task 5: Daily sweep and cron route

**Files:**
- Create: `lib/technical-audit/sweep.ts`, `app/api/tech-audit/sweep/route.ts`
- Modify: `vercel.json` (add `{ "path": "/api/tech-audit/sweep", "schedule": "20 6 * * *" }`)
- Test: `lib/technical-audit/sweep.test.ts`, `app/api/tech-audit/sweep/route.test.ts` (add `'app/api/tech-audit/**/*.test.{ts,tsx}'` to vitest include)

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces: `runSweep(deps: SweepDeps, now: Date): Promise<SweepReport>` where `SweepDeps` bundles the Task 2–4 functions plus `listClients(): Promise<{ id; slug; sfDriveFolderId: string | null; ahrefsProjectId: string | null }[]>` (injected for tests); `SweepReport = { brands: number; created: number; completed: string[]; failed: { slug: string; date: string; source: TaSource; reason: string }[]; staleCrawl: string[] }`. Brands processed with `mapWithConcurrency(brands, 4, …)`; each brand's work wrapped so one throw never rejects the batch.
- Rules: discover → `ensureSnapshot` for every run folder newer than the client's newest snapshot (first run for a brand: all existing folders, so history builds; older months will mostly have SF `missing` and Ahrefs from its dated past crawls); for each draft snapshot with `sf`/`ahrefs` claimable: SF → `fetchIssuesOverview` (null → `failRun(…, 'missing', 'Issues Overview not in this crawl’s export')`), Ahrefs → `fetchAhrefs`; parse failure → `missing` with reason; thrown error → `failed` with message. No folder newer than 35 days → slug in `staleCrawl`. Each failure logs `[tech-audit] <slug> <date> <source> <reason>`.
- Route: `GET`, `dynamic = 'force-dynamic'`, `maxDuration = 300`, `Authorization: Bearer ${CRON_SECRET}` exactly as `app/api/health/sweep/route.ts`; returns the report JSON.

- [ ] **Step 1: Write the failing tests:**
  - `runSweep creates a draft for a new run folder and completes sf and ahrefs`.
  - `a 429 on Ahrefs marks only that run failed and other brands still complete`.
  - `missing Issues Overview marks sf missing with its reason`.
  - `a brand with no folder in 35 days is reported in staleCrawl`.
  - `running twice is idempotent` (second report: `created 0`, nothing re-completed).
  - Route: `401 without the cron secret`, `200 with it`.
- [ ] **Step 2:** Run — Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run — Expected: PASS. Then `npm run typecheck && npm test && npm run check:rsc && npm run lint`.
- [ ] **Step 5: Commit** `feat(technical-audit): daily sweep for Screaming Frog and Ahrefs`. Open **PR 1** into `dev`.

---

## PR 2 — GSC uploads, checklist, publish

### Task 6: GSC Excel export parsers

**Files:**
- Create: `lib/technical-audit/gsc-export.ts`, fixtures `lib/technical-audit/__fixtures__/gsc-page-indexing.xlsx`, `gsc-cwv-mobile.xlsx`, `gsc-cwv-desktop.xlsx`
- Test: `lib/technical-audit/gsc-export.test.ts`

**Blocked on fixtures:** real Renaissance exports (Search Console as `google@avenuez.com` → Indexing → Pages → All known pages → Export → Download Excel; Experience → Core Web Vitals → Mobile → Open report → Export → Excel; same for Desktop). Read their sheet names and headers before writing the tests; record them in a comment at the top of `gsc-export.ts`.

**Interfaces — Produces:**
- `detectGscReport(bytes: Uint8Array): 'page_indexing' | 'cwv_mobile' | 'cwv_desktop' | null` — from sheet names / metadata sheet contents.
- `parseGscPageIndexing(bytes: Uint8Array): Parsed<GscIndexingResult>` — latest chart row → `indexed`, `notIndexed`; reason table → `SourceIssue[]` (`source: 'gsc_indexing'`, `nativeSeverity: ''`).
- `parseGscCwv(bytes: Uint8Array, device: Device): Parsed<GscCwvResult>` — latest chart row → poor / ni / good; issues table → `SourceIssue[]` (`source: 'gsc_cwv'`, `nativeSeverity` = `Poor` | `Need improvement`, `device`).
- `MAX_GSC_BYTES = 2_097_152`.

- [ ] **Step 1: Write the failing tests** (values from the Renaissance fixtures; reference as of 2026-11-15/21: all-known 1.08K indexed / 934 not indexed with 14 reason rows; CWV mobile 0/0/172, desktop 0/8/164 with `CLS issue: more than 0.1 (desktop)` = 8):
  - `detectGscReport identifies each fixture`.
  - `parseGscPageIndexing reads totals and reasons` (exact `notIndexed: 934`, `issues` contains `{ nativeName: 'Not found (404)', urlCount: 118 }`).
  - `parseGscCwv reads device counts` (desktop → `{ poor: 0, ni: 8, good: 164 }`).
  - `parseGscCwv refuses a mobile export in the desktop slot` → `ok: false, reason: 'This is the Core Web Vitals mobile export; upload it in the mobile slot.'`
  - `parseGscPageIndexing refuses a CWV export` and `refuses a non-xlsx file`.
- [ ] **Step 2–4:** Run (FAIL) → implement with `XLSX.read(bytes, { type: 'array' })` → run (PASS).
- [ ] **Step 5: Commit** `feat(technical-audit): GSC Excel export parsers`.

### Task 7: Staff server actions

**Files:**
- Create: `app/actions/tech-audit.ts`
- Test: `app/actions/tech-audit.test.ts` (mock `@/auth`, `@/lib/db/queries`, `@/lib/technical-audit/store` as `app/actions/social-listening.upload.test.ts` does)

**Interfaces — Produces** (all `'use server'`; result `{ ok: true } | { ok: false; error: string }`):
- `uploadGscExport(form: FormData)` — fields `clientSlug`, `snapshotId`, `slot` (`gsc_indexing` | `gsc_cwv_mobile` | `gsc_cwv_desktop`), `file`. Staff + client + snapshot-belongs-to-client checks; size ≤ `MAX_GSC_BYTES`; parse via Task 6 matching the slot; `completeRun` (sets `gsc_export_date` on the snapshot); `revalidatePath` of both report routes.
- `publishSnapshot({ clientSlug, snapshotId })` / `unpublishSnapshot({ clientSlug, snapshotId })` → `setSnapshotStatus(…, session email)`.
- `setIssueOverride({ clientSlug, issueKey, hidden?, note? })` — note trimmed, ≤ 280 chars, empty → `null`.

- [ ] **Step 1: Write the failing tests:** `non-staff is refused` (each action); `a snapshot from another client is refused`; `wrong-report upload returns the parser reason and writes nothing`; `oversize file refused before parsing`; `publish sets status and publisher`; `note over 280 chars refused`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(technical-audit): upload, publish and override actions`.

### Task 8: "Before you publish" checklist

**Files:**
- Create: `lib/technical-audit/checklist.ts`, `components/report-sections/peec-ai/technical-audit/publish-checklist.tsx` (client component), `.../gsc-upload-slot.tsx`
- Test: `lib/technical-audit/checklist.test.ts`, `components/report-sections/peec-ai/technical-audit/publish-checklist.test.tsx`

**Interfaces:**
- Produces: `buildChecklist(input: { runs: { source: TaSource; status: TaRunStatus; lastError: string | null }[]; commentary: 'none' | 'draft' | 'approved'; status: 'draft' | 'published' }): ChecklistItem[]`, `ChecklistItem = { key: TaSource | 'review' | 'commentary'; label: string; state: 'done' | 'todo' | 'problem'; detail?: string }`; `publishWarnings(items): string[]` (one line per missing GSC slot).
- Copy (exact): labels `Screaming Frog`, `Ahrefs`, `Upload GSC Page indexing`, `Upload GSC Core Web Vitals — mobile`, `Upload GSC Core Web Vitals — desktop`, `Review the issues list`, `Commentary`; how-to lines per slot as spec §5.1 ("Search Console → Indexing → Pages → All known pages → Export → Download Excel; upload the .xlsx", and the CWV equivalents).
- Component props: `{ clientSlug: string; snapshotId: string; items: ChecklistItem[]; status: 'draft' | 'published' }`; Publish confirms when `publishWarnings` is non-empty; whole component has `data-print-hidden` / renders `null` in export mode (`useExportMode`).

- [ ] **Step 1: Write the failing tests:** `buildChecklist marks missing GSC uploads as todo and failed Ahrefs as problem with its reason`; `publishWarnings lists each missing GSC slot`; component: `shows Unpublish when published`, `renders nothing in export mode`.
- [ ] **Step 2–4:** FAIL → implement (brand-coherence skill first) → PASS; `npm run check:rsc`.
- [ ] **Step 5: Commit** `feat(technical-audit): before-you-publish checklist`. Open **PR 2** into `dev`.

---

## PR 3 — Page: header, health tiles, change over time

### Task 9: View model

**Files:**
- Create: `lib/technical-audit/view.ts`, `lib/technical-audit/kpis.ts`
- Test: `lib/technical-audit/kpis.test.ts`, `lib/technical-audit/view.test.ts`

**Interfaces — Produces:**
- `KPI_DEFS` — six entries `{ key: 'health' | 'sf_issue_types' | 'indexed' | 'not_indexed' | 'cwv_poor_mobile' | 'cwv_good_pct_mobile'; label; better: 'higher' | 'lower'; unit: 'pts' | 'count' | 'pct' }` per spec Appendix A.1.
- `kpiValue(key, metrics): number | null` (`cwv_good_pct_mobile` = good / (poor + ni + good) × 100; null when any input null or total 0).
- `kpiDelta(cur: number | null, prev: number | null): number | null` and `deltaTone(key, delta): 'good' | 'bad' | 'flat' | null`.
- `loadTechAuditView(clientSlug: string, snapshotParam: string | undefined, viewer: 'team' | 'client'): Promise<TechAuditView | null>` → `{ snapshots: { id; date; status }[]; selected; previous | null; metrics; prevMetrics; series: Record<KpiKey, { date: string; value: number | null }[]>; runs; checklist (team only; commentary state `'none'` until Task 13); issues (Task 12 fills; empty array until then); staleSince: string | null (newest snapshot date when > 35 days old, team only); crawlSettingsChanged: boolean }`. Client viewer: published only; unknown/draft param → latest published; `null` when none.

- [ ] **Step 1: Write the failing tests:** `kpiValue returns null when GSC is missing`; `staleSince is set when the newest snapshot is 36 days old and null at 30`; `kpiDelta is null when either side is null`; `deltaTone: lower-is-better KPI going down is good`; `client viewer requesting a draft date gets the latest published`; `previous is the snapshot immediately before the selected one`; `series keeps nulls as gaps`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(technical-audit): view model and KPIs`.

### Task 10: Page shell, tiles, trends, and wiring

**Files:**
- Create under `components/report-sections/peec-ai/technical-audit/`: `index.tsx` (RSC `TechnicalAuditPage`), `snapshot-header.tsx`, `health-tiles.tsx` (gauge, SF bars, indexing half-donut, CWV side by side), `change-over-time.tsx` (client: delta strip + trend chart)
- Modify: `app/dashboard/[clientSlug]/reports/page.tsx`, `app/portal/[clientSlug]/reports/page.tsx`, `components/export/report-element.tsx`, `lib/export/request.ts`, `lib/export/bulk.ts`
- Test: `components/report-sections/peec-ai/technical-audit/index.test.tsx`, `lib/export/request.test.ts` (extend)

**Interfaces:**
- Consumes: `loadTechAuditView`, `buildChecklist`, Task 8 component.
- Produces: `TechnicalAuditPage({ clientSlug, snapshot }: { clientSlug: string; snapshot?: string })`; `ExportRequest.snapshot?: string` (validated `^\d{4}-\d{2}-\d{2}$`).
- Wiring: all three render sites call `TechnicalAuditPage` with the `snapshot` search param; `technical-audit` is excluded from the date-picker condition and from `usesPageRange` in both routes; the snapshot select navigates by replacing `snapshot=` in the URL.
- Blank GSC tile copy (exact): team `Upload the GSC report to fill this tile`; client `Not available for this month`. Tile ⓘ text names the source path from brief §2.3.
- Header shows `Compared with: <prev date>` or `Baseline — first snapshot`, one data-as-of line per source (SF crawl, Ahrefs crawl, GSC export) with status dot, a `Crawl settings changed` flag when set, and (team only) `No crawl since <date>` when `staleSince` is set.

- [ ] **Step 1: Write the failing tests:** `renders the checklist for staff and not for clients`; `shows No crawl since for a stale brand (team only)`; `GSC tiles show the team/client blank copy when not uploaded`; `CWV tile renders mobile and desktop together`; `parseExportRequest keeps a valid snapshot and drops an invalid one`; `client export of a draft date renders the latest published snapshot`.
- [ ] **Step 2–4:** FAIL → implement (brand-coherence skill first; each section in `ReportErrorBoundary`) → PASS.
- [ ] **Step 5:** `npm run typecheck && npm test && npm run check:rsc && npm run lint && npm run build` (build in this real checkout, not a symlinked one). Then run the dev server and check `/dashboard/renaissance/reports?section=peec-ai&subsection=technical-audit` in the browser (team) — no date picker, checklist visible, tiles render or show blank copy.
- [ ] **Step 6: Commit** `feat(technical-audit): snapshot page header, health tiles and trends`. Open **PR 3** into `dev`.

---

## PR 4 — Issue list

### Task 11: Merge, severity, ranking, issue map

**Files:**
- Create: `lib/technical-audit/issues.ts`, `lib/technical-audit/issue-map.ts`, `lib/technical-audit/__fixtures__/issue-map.csv`
- Create: `scripts/tech-audit/build-issue-map.ts`
- Test: `lib/technical-audit/issues.test.ts`, `lib/technical-audit/issue-map.test.ts`

**Interfaces — Produces:**
- `normalizeSeverity(source: TaIssueSource, nativeName: string, nativeSeverity: string): Severity` per spec Appendix A.2 (unlisted GSC reason → `medium`).
- `loadIssueMap(): Promise<IssueMap>` — Sheet `TECH_AUDIT_ISSUE_MAP_SHEET_ID` via `googleToken(['…/spreadsheets.readonly'])`, `cached('tech-audit', 'issue-map', …, { ttlSeconds: 3600 })`; on failure log and fall back to the fixture CSV. `IssueMap = Map<string /* `${source}:${nativeName}` */, { key: string; name: string }>`.
- `mergeIssues(issues: SourceIssue[], map: IssueMap): MergedIssue[]`, `MergedIssue = { key: string; name: string; severity: Severity; urls: number; sources: TaIssueSource[]; detail: { source; nativeName; urlCount }[]; needsMapping: boolean; priority: number }`, sorted by priority desc, then urls desc, then name. Unmapped → `key = \`${source}:${nativeName}\``, `needsMapping: true`.
- `scripts/tech-audit/build-issue-map.ts` — writes `tmp/issue-map-seed.csv`: Ahrefs catalog (`site-audit/issues` for every `ahrefs_project_id` in `clients`, union of `name`s incl. zero-count), Screaming Frog issue names (from the Issues Overview fixture/real exports in Drive), GSC indexing reasons (Appendix A.2 list + the 14 Renaissance reasons in the probes doc) and CWV issue names; proposed `canonical_issue_key` by normalized name; `reviewed = FALSE`. Paul imports the CSV into the Sheet for AEO-team review.

- [ ] **Step 1: Write the failing tests:**
  - `merges three tools' 4xx rows into one with max URLs` (Ahrefs 132, SF 148, GSC 121 → `urls 148`, three sources, detail line order ahrefs/sf/gsc).
  - `severity is the highest contributor` and `GSC 'Page with redirect' normalizes to low`.
  - `priority matches the formula` (`high, 148 urls, 3 sources` → `3 × log10(149) × 1.5`, `toBeCloseTo(…, 6)`).
  - `unmapped issues keep their native name and are flagged`.
  - `loadIssueMap falls back to the fixture when the Sheet fetch throws`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Run `CACHE_DISABLE=1 npx tsx --env-file=.env.local scripts/tech-audit/build-issue-map.ts` — Expected: CSV with ≥ 184 Ahrefs rows; spot-check `4XX page` → same key as GSC `Not found (404)`.
- [ ] **Step 6: Commit** `feat(technical-audit): issue merge, ranking and issue map`.

### Task 12: Issue list with hide/annotate

**Files:**
- Create: `components/report-sections/peec-ai/technical-audit/issue-list.tsx` (client), `issue-row-controls.tsx` (client, staff only)
- Modify: `lib/technical-audit/view.ts` (fill `issues`: merge over the bundle's issues, apply overrides), `components/report-sections/peec-ai/technical-audit/index.tsx`
- Test: `components/report-sections/peec-ai/technical-audit/issue-list.test.tsx`, extend `lib/technical-audit/view.test.ts`

**Interfaces:**
- Consumes: `mergeIssues`, `getOverrides`, `setIssueOverride`.
- Produces: `TechAuditView.issues: (MergedIssue & { hidden: boolean; note: string | null; noteBy?: string; noteAt?: string })[]` — for a client viewer hidden rows are **removed** and `noteBy`/`noteAt` stripped in `view.ts` (server side, before props cross to the browser).
- Columns (exact headers): `#`, `Issue`, `Severity`, `URLs affected`, `Sources`. Filters: source (All / Ahrefs / Screaming Frog / GSC Indexing / GSC CWV) and severity (All / High / Medium / Low). Team view: hidden rows collapse under `Hidden by strategist (N)` with `Unhide`; each row has `Hide` and `Add note`. Notes render as text (no `dangerouslySetInnerHTML`).

- [ ] **Step 1: Write the failing tests:** `client view never receives a hidden row even when it ranks #1`; `client props carry no noteBy/noteAt`; `team view shows the hidden count and Unhide`; `a note with <b>tags</b> renders literally`; `severity filter narrows rows`.
- [ ] **Step 2–4:** FAIL → implement → PASS; `npm run check:rsc`.
- [ ] **Step 5: Commit** `feat(technical-audit): issue list with strategist hide and notes`. Open **PR 4** into `dev`.

---

## PR 5 — Commentary, removal of old sections

### Task 13: Snapshot-bound commentary

**Files:**
- Modify: `lib/commentary/views.ts` (add `'peec-ai:technical-audit'` to `CommentaryViewKey`, `COMMENTARY_VIEWS` `{ label: 'AEO Technical Audit', owner: 'AEO' }`, `isCommentaryViewKey`), `components/report-sections/commentary/index.tsx`, `components/report-sections/commentary/commentary-panel.tsx`, `components/report-sections/commentary/commentary-editor.tsx`
- Create: `components/report-sections/commentary/snapshot.tsx`
- Modify: `components/report-sections/peec-ai/technical-audit/index.tsx` (render `SharedPartsHeader viewKey='peec-ai:technical-audit' requestedRange={`${date},${date}`}`)
- Test: `components/report-sections/commentary/snapshot.test.tsx`, extend `lib/commentary/views.test.ts`

**Interfaces — Produces:**
- `snapshotCommentary({ client, email, viewKey, snapshotDate }): Promise<ReactElement | null>` — entries filtered to `periodStart === periodEnd === snapshotDate`; staff get the panel even when empty; non-staff get `null` with no approved entry; same redaction as `CommentarySection` (`toClientSafeEntry`, `historyEntries`).
- `CommentarySection` branch: `viewKey === 'peec-ai:technical-audit'` and `requestedRange` of the form `D,D` → `snapshotCommentary`.
- `CommentaryPanel` / `CommentaryEditor` new optional prop `periodLabel?: string` — when set the editor hides both date inputs, shows the label (`Snapshot: Nov 1, 2026`), and always saves `defaultPeriod`.

- Also: `loadTechAuditView` now reads `getCommentaryForView(client.id, 'peec-ai:technical-audit')` for the selected snapshot and passes `'none' | 'draft' | 'approved'` to `buildChecklist`.

- [ ] **Step 1: Write the failing tests:** `shows only entries for the selected snapshot`; `checklist reports draft commentary for the snapshot`; `client sees nothing without an approved entry`; `editor with periodLabel has no date inputs and saves the snapshot date`; `isCommentaryViewKey accepts peec-ai:technical-audit`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(technical-audit): snapshot-bound commentary`.

### Task 14: Remove the old tab and finish

**Files:**
- Delete: `components/report-sections/peec-ai/technical-audit.tsx`, `lib/screaming-frog/client.ts`, `lib/screaming-frog/types.ts`, `lib/sitebulb/client.ts`, `lib/sitebulb/types.ts`, `lib/peec/fix-list.ts` — **each only after** `grep -rn` shows no importer outside the old tab.
- Modify: `components/report-sections/peec-ai/technical-audit-tables.tsx` — remove `WhatChangedTable`, `PageOverlapTable`, `LogAnomaliesTable`, `FixListTable`, `BotActivityTable` **only if** unused; it stays for whatever `bot-vs-human-scatter.tsx` (Content Impact) imports.
- Keep: `lib/peec/agent-analytics.ts`, `lib/peec/url-citations.ts` (used by Content Impact / PR Influence).
- Keep the `sf_csv_file_id` / `sf_prev_csv_file_id` / `sitebulb_sheet_id` columns (a later cleanup drops them).

- [ ] **Step 1:** Delete/trim per the rules above.
- [ ] **Step 2:** `npm run typecheck && npm test && npm run check:rsc && npm run lint && npm run build` — Expected: all pass, no unused-import errors.
- [ ] **Step 3:** Browser check (dev server, team and a client-role session): Renaissance tab shows only the new sections; date picker absent; Export PDF of a published snapshot shows approved commentary only and no checklist or hidden rows.
- [ ] **Step 4: Commit** `refactor(technical-audit): remove the old Technical Performance sections`. Open **PR 5** into `dev`.

---

## Rollout (not code — tracked here so nothing is missed)

1. Apply `0031_technical_audit.sql` to staging, then prod, **before** the PR 1 code reaches each.
2. Set `clients.sf_drive_folder_id` (Renaissance: the `Renaissance` folder under `Screaming Frog Exports`) and `ahrefs_project_id = '9371114'`; add `report_section_config['peec-ai:technical-audit'].sharedParts = [{ id: 'commentary', version: 1 }]` for Renaissance only.
3. Vercel (Production + Preview): `AHREFS_API_KEY`, `TECH_AUDIT_ISSUE_MAP_SHEET_ID`, `GSC_IMPERSONATE_EMAIL=google@avenuez.com`.
4. Zaf adds the Issues Overview report to the scheduled Screaming Frog export; replace the SF fixture with a real file.
5. Import `tmp/issue-map-seed.csv` into the issue-map Sheet; AEO team reviews.
6. Raise Renaissance's Ahrefs max crawl depth; set `crawl_settings_changed = true` on the first snapshot after it.
7. Each PR gets its Stage-1 code review record (`docs/qa/<feature>-code-review.md`) per CLAUDE.md before merging to `dev`.
