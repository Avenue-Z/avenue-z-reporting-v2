# Social Listening Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A per-client, opt-in Social Listening tab under Organic Social: staff upload the monthly Talkwalker brand and industry exports, the page fills in, and staff add analysis, featured posts, theme trends and a keyword appendix that clients see once approved.

**Architecture:** Mirrors the AEO Informed Social tab (`lib/organic-social/aeo-tab/`, `components/report-sections/organic-social/aeo-informed/`): a runtime-parsed setting, a gate in `organicSocialSubsections`, an early branch in `OrganicSocialBody`. Uploads are parsed on the server with SheetJS into a typed shape and stored append-only in Postgres; pure modules compute comparisons and YTD; analysis boxes reuse `report_commentary` through `monthlyCommentary`.

**Tech Stack:** Next.js 16 App Router (server components, server actions, one route handler), TypeScript strict, Drizzle + Neon Postgres, SheetJS `xlsx` 0.20.3 (CDN tarball), Recharts, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-19-social-listening-tab-design.md`; review log with the round 2 MINOR list: `docs/superpowers/specs/2026-11-19-social-listening-tab-review-log.md`; parser trial: `docs/findings/2026-11-19-social-listening-xls-parser.md`.

## Global Constraints

- The repo is public: no client values, names, post text, sheet ids or file names in code, tests, fixtures, logs or commits. Test workbooks are built in the test with made-up numbers.
- Opt-in only. A client without `dash_social_config.socialListening` (Renaissance included) renders exactly as before.
- Organic Social only: shared files are touched only where the AEO tab touched them (spec section 4, 9).
- Parser: `"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"`, read-only, `cellFormula: false`, dates read as text.
- Limits: export file 2 MB (action check), `experimental.serverActions.bodySizeLimit: '3mb'`, image 300 KB JPEG at 1,200 px, print copy 60 KB JPEG at 600 px, 4 images per post, 12 posts per month (approved, not replaced, not deleted), post note 1,000 characters, URLs https only.
- Copy: no em or en dashes anywhere (Thomas's rule, also in code comments and commit messages); sentence case; plain words.
- Logs name slug, topic, month, rule ids and byte sizes only, under the `[social-listening]` prefix.
- Approvals use `COMMENTARY_APPROVERS` with the role AND email check (`noteCapabilities` pattern, `lib/organic-social/chart-notes/permissions.ts`).
- Every DB write calls `updateTag('db')`; new reads use `cached()` under the `db` tag; the commentary prefix read is per render (`React.cache`).
- Commit after each task and push the branch (`feat/social-listening`).
- Database writes to dev, staging or production need Thomas's go; this plan writes code and migrations only.

## Review Focus

1. Savannah opens the export in Excel and re-saves it (as .xlsx, or with dates turned into date cells): refuse with "This isn't the original Talkwalker .xls export. Upload the file as downloaded." (Task 1 test `re-saved xlsx is refused`.)
2. A media type appears that last month didn't have, or one with zero results (TikTok, Threads): the page renders it, its change is "n/a", colours are keyed by name with a fallback. (Task 4 test `new media type has n/a change`; Task 9 test `unknown media type renders with the fallback colour`.)
3. Post text containing `<script>` or HTML: shown as text, never markup. (Task 6 test `note is stored and rendered as text`.)
4. Double-clicked upload: two rows, the newer is current, no error shown. (Task 5 test `two uploads in a row both store, newest current`.)
5. A client opening a month whose brand export arrived after the month opened: the page shows it; the next month still compares with the presented upload. (Task 4 test `after-open upload is shown but not presented`.)

## Parallel execution: waves, sessions and file ownership

`feat/social-listening` (PR #468 into `dev`) is the deliverable branch. Each session works on its own branch cut from
it, in its own worktree, and opens a draft PR **into `feat/social-listening`** (never into `dev`). A session touches only
the files its row owns; anything else it needs from another session waits for that PR to merge. Shared shapes live in
`lib/organic-social/social-listening/types.ts`, committed before wave 1; no session changes it (a needed change comes back
to the coordinating session). Thomas merges, or tells the coordinating session to merge.

| Wave | Session | Tasks | Owns (only these files) |
|---|---|---|---|
| 1 | A: export parser | 1 | `package.json`, `package-lock.json`, `next.config.ts`, `social-listening/export-parse*.ts`, `social-listening/test-workbook.ts` |
| 1 | B: setting and tab gate | 2 | `social-listening/setting*.ts`, `lib/constants.ts`, `lib/portal/sidebar-client*.ts`, `lib/organic-social/aeo-tab/tab-list.test.ts`, `lib/organic-social/subsections.test.ts` |
| 1 | C: analysis boxes | 8 | `social-listening/boxes*.ts`, `lib/commentary/views*.ts`, `lib/commentary/labels*.ts`, `lib/db/queries.ts`, `components/report-sections/commentary/monthly*.tsx` |
| 1 | D: data layer | 3, 4 | `lib/db/schema.ts`, `lib/db/schema.social-listening.test.ts`, `drizzle/0030_*`, `drizzle/meta/*`, `social-listening/store.ts`, `social-listening/select*.ts`, `social-listening/compare*.ts` |
| 2 | E: actions and image route | 5, 6, 7 | `app/actions/social-listening*.ts`, `app/api/social-listening/**`, `social-listening/capabilities*.ts`, `social-listening/upload-month*.ts`, `social-listening/posts*.ts`, `social-listening/trends*.ts` |
| 2 | F: private checks | 11 | `~/.claude/organic-social-work/social-listening/**` only, no repo files |
| 3 | G: page and wiring | 9, 10 | `components/report-sections/organic-social/social-listening/**`, `social-listening/colors.ts`, `social-listening/params*.ts`, `components/report-sections/organic-social/index*.tsx`, both `reports/page.tsx`, `components/export/report-element*.tsx`, `lib/organic-social/report-views.pages.test.tsx` |
| end | coordinating session | 12 | docs, `CLAUDE.md`, PR #468 |

(`social-listening/` = `lib/organic-social/social-listening/`.) Wave 2 starts when every wave 1 PR has merged into
`feat/social-listening`; wave 3 when wave 2's has. Before each merge the coordinating session reads the diff, checks no
file outside the row changed, and runs `npm test`, `npm run typecheck` and `npm run lint` on the merged tree.

---

### Task 1: Export parser and contract (V1 to V9)

**Files:**
- Modify: `package.json` (dependency), `package-lock.json`, `next.config.ts` (`experimental.serverActions.bodySizeLimit: '3mb'`)
- Create: `lib/organic-social/social-listening/export-parse.ts`, `lib/organic-social/social-listening/test-workbook.ts`
- Consumes: `lib/organic-social/social-listening/types.ts` (already on the branch; do not change it)
- Test: `lib/organic-social/social-listening/export-parse.test.ts`

**Interfaces:**
- Produces: `parseTalkwalkerExport(bytes: Uint8Array, expect: { topic: SlTopic; topicName: string; month: SlMonth }): SlParseResult` (types from `types.ts`);
  `MAX_EXPORT_BYTES = 2 * 1024 * 1024`.
- Test helper (test-only module): `buildWorkbook(opts: { topic: SlTopic; topicName: string; month: string; overrides?: Partial<...> }): Uint8Array` writing `bookType: 'biff8'` with the exact title and filter rows of the real exports (findings doc, Format section).

- [ ] **Step 1: Add the dependency and the body limit.** `npm install --ignore-scripts https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`; confirm the lockfile integrity equals the finding's sha512. Add the `serverActions` block to `next.config.ts`.
- [ ] **Step 2: Write the failing tests.** One passing workbook per topic; one failing workbook per rule with its message:
  - `V1 non-OLE2 bytes`: a CSV buffer, `re-saved xlsx is refused` (an `.xlsx` written by SheetJS), 2 MB + 1 byte: message "This isn't the original Talkwalker .xls export. Upload the file as downloaded." (size: "The file is over 2 MB.")
  - `V2` a sheet without `Title: `; `V3` brand without Top influencers, and two Themes widgets both with three-word entries (ambiguous); `V4` September range uploaded for October ("This export covers September 2026, not October 2026."), and two sheets with different ranges; `V5` industry topic name in a brand upload ("This is the Industry export, not the brand export."); `V6` a negative count and `3.5` in a count; `V7` daily sum off by one; `V8` 30 daily rows for a 31-day month; `V9` a `Mixed` sentiment label.
  - `parses every field`: every field of `SlExport` for each topic equals the made-up input, `share` kept as the fraction, days as `YYYY-MM-DD`, overview value/unit split.
  - `picks the two-word Themes widget`: brand with a 3-word and a 2-word widget yields the 2-word list (R2-17: the widget with no three-word entries).
- [ ] **Step 3: Run** `npx vitest run lib/organic-social/social-listening/export-parse.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 4: Implement `parseTalkwalkerExport`.** Find widgets by the title row; tell the two "Share of Sentiment" widgets apart by header shape (2 columns vs more) and the two "Results over time" by column count; collect every failed rule rather than stopping at the first. Never put a value or name in a message except the month names V4 and V5 print.
- [ ] **Step 5: Run the tests.** Expected: PASS.
- [ ] **Step 6: Verify the install path.** `npm ci` from a clean `node_modules` succeeds; `npm run typecheck` passes. Record in the PR that Vercel's preview build installed the tarball (checked after the push).
- [ ] **Step 7: Commit** `feat(social-listening): Talkwalker export parser and contract`.

### Task 2: Setting, tab gate, portal boolean

**Files:**
- Create: `lib/organic-social/social-listening/setting.ts`
- Modify: `lib/constants.ts:203-260` (OrganicView, ORGANIC_SOCIAL_SUBSECTIONS, OrganicTabsClient, organicSocialSubsections), `lib/portal/sidebar-client.ts`. Not `lib/db/schema.ts` (Task 3 owns it): read the setting through a narrow cast of `dashSocialConfig`
- Test: `lib/organic-social/social-listening/setting.test.ts`; update `lib/organic-social/aeo-tab/tab-list.test.ts`, `lib/organic-social/subsections.test.ts`; `lib/portal/sidebar-client.test.ts`

**Interfaces:**
- Produces: `SOCIAL_LISTENING_TAB_ID = 'organic-social-listening'`; `type SocialListeningSetting = { brandTopic: string; industryTopic: string | null; industrySample: number | null }`;
  `parseSocialListeningSetting(raw: unknown): { kind: 'off' } | { kind: 'ok'; setting: SocialListeningSetting } | { kind: 'malformed'; reason: string }`;
  `hasSocialListeningTab(client: { socialListeningTab?: boolean; dashSocialConfig?: { socialListening?: unknown; reportingMonths?: unknown } | null; hiddenReports?: readonly string[] | null }): boolean`;
  `socialListeningSettingProblem(client): string | null`; `logMalformedSocialListeningSetting(slug: string, reason: string): void`.

- [ ] **Step 1: Write the failing tests.** Parse: absent and `enabled` not `true` are off; ok with defaults; malformed for an unknown key (including `paidSheet`, reserved for Phase 2), empty or whitespace topic, equal topics, `industrySample` not an integer 1 to 100, `industrySample` without `industryTopic` (R2-8). Gate: off without reporting months; `hidden_reports` hides it first; a trimmed record's boolean decides (R2-6). Tab list: `organicSocialSubsections` for a Renaissance-shaped client (no setting) returns exactly today's list; the AEO tab-list test and the subsections id list change on purpose (comment says why). Portal record: carries `socialListeningTab` and never the setting.
- [ ] **Step 2: Run** the four test files. Expected: FAIL.
- [ ] **Step 3: Implement** `setting.ts` (pure, browser-safe, like `aeo-tab/setting.ts`), the filter branch `s.view === 'social-listening' ? socialListening : ...`, the tab entry (last), and the portal field with its warning log.
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(social-listening): opt-in setting and tab gate`.

### Task 3: Tables, migration and store

**Files:**
- Modify: `lib/db/schema.ts` (five tables, spec section 8, and `DashSocialConfig.socialListening?: unknown` with its doc comment)
- Create: `drizzle/0030_social_listening.sql` (via `npm run db:generate`), `lib/organic-social/social-listening/store.ts`, `lib/organic-social/social-listening/select.ts`
- Test: `lib/organic-social/social-listening/select.test.ts`, `lib/db/schema.social-listening.test.ts`

**Interfaces:**
- Produces tables `socialListeningUploads` (with `beforeOpen: boolean`), `socialListeningHistory`, `socialListeningPosts` (`replacesId`, `replacedAt`, partial unique index on `replaces_id` `WHERE status = 'draft' AND deleted_at IS NULL`, R2-10), `socialListeningPostImages` (uuid ids, `bytes`, `printBytes`), `socialListeningTrends` (draft lists plus `approvedEmerging/approvedDecreasing/approvedNew`, R2-11).
- Pure: `currentUpload(rows: UploadRow[]): UploadRow | null` (newest); `presentedUpload(rows): UploadRow | null` (newest `beforeOpen`, else the first).
- Store (DB, cached reads): `getSlMonth(clientId: string, months: string[]): Promise<SlMonthData>` returning uploads, history, approved and draft posts, trends for the listed months in one call per table; writes `insertUpload`, `insertPost`, `forkPostDraft`, `updatePostDraft`, `approvePost`, `revokePost`, `softDeletePostDraft`, `insertImage`, `deleteImage`, `saveTrendsDraft`, `approveTrends`.

- [ ] **Step 1: Write the failing tests.** `currentUpload` picks the newest by `uploadedAt`; `presentedUpload` picks the newest `beforeOpen`, else the earliest; schema test asserts the partial index predicate text and the draft-only soft delete check exist.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement** the tables, generate the migration (`npm run db:generate`, review the SQL by hand: additive only, no change to existing tables), the pure selectors and the store. Page reads never select `raw` or image bytes.
- [ ] **Step 4: Run** the tests and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(social-listening): tables, migration and store`.

### Task 4: Comparisons and year to date

**Files:**
- Create: `lib/organic-social/social-listening/compare.ts`
- Test: `lib/organic-social/social-listening/compare.test.ts`

**Interfaces:**
- Consumes: `SlExport` (Task 1), history and upload rows (Task 3).
- Produces: `pct(count: number, total: number): number` (one decimal); `tileChange(now: number, prev: number | null | undefined): number | undefined` (undefined for null, 0 or missing, R2-2);
  `pointsChange(nowPct: number, prev: { pct: number; whole: boolean } | null): number | null` (rounds now to whole when prev is whole, R2-14);
  `presentedValues(month: string, history: HistoryRow[], uploads: UploadRow[]): Presented | null`;
  `ytdSeries(year: number, servedMonth: string, served: SlExport, history, uploads, pick: 'all' | 'reddit'): ({ month: string; pos: number; neu: number; neg: number } | null)[]` (null = gap);
  `posNeu(point) = round(pos) + round(neu)`; `mediaChanges(now: SlExport, prev: SlExport | null): Record<string, number | null>`; `authorChanges(now, prev): Record<string, number | null>` by `authorId`.

- [ ] **Step 1: Write the failing tests** with the spec's formulas: `tileChange(556, 729)` = -23.7 before rounding; `tileChange(5, 0)` is undefined; `pointsChange(69.2, { pct: 70, whole: true })` = -1; history beats upload in `presentedValues`; `after-open upload is shown but not presented`; YTD: a month with neither source is `null`, never zeros; the served month's point comes from `served`; whole-percent rounding per share (may sum to 101); `new media type has n/a change`; author matched by id not name.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the functions (pure, no I/O).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(social-listening): comparisons and year to date`.

### Task 5: Upload action

**Files:**
- Create: `app/actions/social-listening.ts`, `lib/organic-social/social-listening/capabilities.ts`, `lib/organic-social/social-listening/upload-month.ts`
- Test: `app/actions/social-listening.upload.test.ts`, `lib/organic-social/social-listening/upload-month.test.ts`

**Interfaces:**
- Consumes: Tasks 1 to 3; `lockedRangeFor`, `parseReportingMonths`, `opensOn` (`lib/organic-social/reporting-months.ts`).
- Produces: `slCapabilities(role: unknown, email: string | null | undefined, env?: string): { canEdit: boolean; canApprove: boolean }` (COMMENTARY_APPROVERS);
  `uploadMonth(client, requestedRange: string, clock: Clock): { ok: true; month: string; beforeOpen: boolean } | { ok: false; error: string }` (served month, finished, not before firstMonth, `beforeOpen` against `opensOn` at 00:00 America/New_York, R2-15);
  `uploadSocialListeningExport(form: FormData): Promise<{ ok: true } | { ok: false; errors: string[] }>` with form fields `clientSlug`, `topic`, `range`, `file`.

- [ ] **Step 1: Write the failing tests.** Refuses a client role, a non-avenuez email, an unknown client, a client without the setting, industry upload with no `industryTopic`; refuses the live month ("Upload opens when November 2026 ends.", R2-13), a month before `firstMonth`; the month comes from `range`, never a `month` field; stores raw bytes, sha256, size, `beforeOpen` (both sides of the New York midnight boundary); `two uploads in a row both store, newest current`; log line contains slug, topic, month, rule ids, size and nothing else (no file name); `updateTag('db')` called once.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Mirror `app/actions/chart-notes.ts`: `viewer()` from `auth()`, client by slug, setting check, then the month, then the parser.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(social-listening): upload action`.

### Task 6: Posts, screenshots and the image route

**Files:**
- Create: `lib/organic-social/social-listening/posts.ts` (validation), `app/api/social-listening/image/[id]/route.ts`
- Modify: `app/actions/social-listening.ts` (post and image actions)
- Test: `lib/organic-social/social-listening/posts.test.ts`, `app/actions/social-listening.posts.test.ts`, `app/api/social-listening/image/[id]/route.test.ts`

**Interfaces:**
- Produces: `validatePostInput(input): { ok: true; post: PostInput } | { ok: false; error: string }`; actions `savePostAction`, `approvePostAction`, `revokePostAction`, `deletePostDraftAction`, `addPostImageAction(form: FormData)` (one image, `bytes` and `print` fields), `removePostImageAction`; route `GET` returning `image/jpeg`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, max-age=31536000, immutable`, `?print=1` for the print bytes.

- [ ] **Step 1: Write the failing tests.** Validation: https only, note at most 1,000 characters, engagements integer at least 0 or empty, group and sentiment from the fixed lists, `note is stored and rendered as text`. Actions: create a draft; editing an approved post forks a draft and copies image rows; approving the draft sets the old row's `replacedAt`; delete a draft then edit the same approved post again (R2-10); the 13th approved post in a month is refused; a fifth image refused; `bytes` over 300 KB or `printBytes` over 60 KB or not JPEG magic bytes refused (R2-12). Route: 404 for no session, another client, a client viewing a draft, replaced or deleted post, a post in a month the client may not open, a client whose tab is off; the headers above; `?print=1`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** The route uses `isStaff` and `canOpenPortal` (`lib/auth/route-access.ts`) and `lockedRangeFor` for the client's months.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(social-listening): featured posts and screenshots`.

### Task 7: Theme trends

**Files:**
- Modify: `app/actions/social-listening.ts`
- Create: `lib/organic-social/social-listening/trends.ts`
- Test: `lib/organic-social/social-listening/trends.test.ts`, `app/actions/social-listening.trends.test.ts`

**Interfaces:**
- Produces: `parseTrendLines(text: string): { theme: string; change: string | null }[]` (one per line, optional trailing change like `+5.1K%` or `-77%`, at most 25 per list); `saveTrendsAction({ clientSlug, range, emerging, decreasing, newThemes })`, `approveTrendsAction({ clientSlug, range })`; `clientTrends(row): Lists | null` (the approved lists only).

- [ ] **Step 1: Write the failing tests.** Line parsing; saving after approval keeps the approved lists for clients until the next approval (R2-11); staff only, client and setting re-checked; month resolved from `range` like uploads.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(social-listening): theme trends with approval`.

### Task 8: Analysis boxes on commentary

**Files:**
- Modify: `lib/commentary/views.ts`, `lib/commentary/labels.ts`, `lib/db/queries.ts`, `components/report-sections/commentary/monthly.tsx`
- Create: `lib/organic-social/social-listening/boxes.ts`
- Test: `lib/commentary/views.test.ts`, `lib/organic-social/social-listening/boxes.test.ts`, `components/report-sections/commentary/monthly.prefetch.test.tsx`

**Interfaces:**
- Produces: `SL_BOX_IDS` (spec section 9 list, 26 ids) and `type SlBoxId`; `type SocialListeningViewKey = \`organic-social:social-listening:${SlBoxId}\`` added to `CommentaryViewKey`; `COMMENTARY_VIEWS` entries `{ label: 'Social Listening, <section>', owner: 'Savannah / Jasmine' }`; `ANALYSIS_LABELS` and `KEYWORD_LABELS: CommentaryLabels`; `getCommentaryForViewPrefix(clientId: string, prefix: string): Promise<ReportCommentary[]>` (React.cache, R2-9); `monthlyCommentary({ ..., entries?: ReportCommentary[] })`.

- [ ] **Step 1: Write the failing tests.** Every box id has a registry entry and `isCommentaryViewKey` accepts it; `recommendationsViewKeyFor` returns null for every box key; `monthlyCommentary` with `entries` makes no query; one prefix query serves all boxes.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the commentary test folder. Expected: PASS, existing commentary tests unchanged.
- [ ] **Step 5: Commit** `feat(social-listening): analysis boxes on commentary`.

### Task 9: The page (brand and industry)

**Files:**
- Create under `components/report-sections/organic-social/social-listening/`: `section.tsx` (server: loads, decides `clientView`), `brand.tsx`, `industry.tsx`, `cards.tsx` (chart card plus its analysis box), `cloud.tsx`, `sentiment-bars.tsx`, `points-delta.tsx`, `ytd-chart.tsx`, `posts.tsx`, `trends.tsx`, `empty.tsx`
- Create: `lib/organic-social/social-listening/colors.ts` (`SENTIMENT_COLORS`, `MEDIA_FALLBACK_COLOR`; not in `lib/constants.ts`, which Task 2 owns)
- Test: `components/report-sections/organic-social/social-listening/section.test.tsx`, `brand.test.tsx`, `industry.test.tsx`

**Interfaces:**
- Consumes: Tasks 2 to 8.
- Produces: `SocialListeningSection({ clientSlug, servedRange, role, topic, exporting }: { clientSlug: string; servedRange: string; role: unknown; topic: SlTopic; exporting: boolean })`; `clientView = viewerForRole(role) === 'client' || exporting`.

- [ ] **Step 1: Write the failing tests** from a stored upload built by `buildWorkbook` and parsed: every section in spec section 9 order with its numbers; per-role cases from spec section 5 (no brand upload, brand without industry, no `industryTopic`, analysis-only sections with nothing approved); staff notes (history row month, after-open re-upload); the `industrySample` label; `unknown media type renders with the fallback colour`; client view never renders an upload control, trends editor, add-post button, draft post or draft trends; the owned-channels card absent without the optional widget.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** with `KpiCard`, `ChartCard`, `DonutChart` and Recharts; posts as a sideways-scrolling row (the mockup's `.pgrid` behaviour) with screenshots from the Task 6 route; staff controls are client components calling the Task 5 to 7 actions; images shrunk in the browser (canvas, JPEG 0.8) before upload.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(social-listening): brand and industry page`.

### Task 10: Wiring, the `sl` param and the PDF export

**Files:**
- Modify: `components/report-sections/organic-social/index.tsx` (`OrganicSocialReport` skips both `SharedPartsHeader` boxes for the view, R2-7; `OrganicSocialBody` early branch with `NoMonths`), `app/dashboard/[clientSlug]/reports/page.tsx`, `app/portal/[clientSlug]/reports/page.tsx` (parse `sl`, URL builders, `getReportComponent`, Suspense key), `components/export/report-element.tsx` (passes `exporting`, renders brand then industry)
- Create: `lib/organic-social/social-listening/params.ts` (`parseSlTopic(raw: unknown): SlTopic`)
- Test: `components/report-sections/organic-social/index.social-listening.test.tsx`, `components/export/report-element.social-listening.test.tsx`, `lib/organic-social/report-views.pages.test.tsx` (extend)

- [ ] **Step 1: Write the failing tests.** The tab never reads or renders the `organic-social` stream; malformed reporting months show `NoMonths`; a malformed setting logs one `[social-listening]` warning naming the key at render; `sl` parses (anything else is brand) and survives the month picker URL; a staff export of a month with no industry upload and no approved analysis prints no empty sections, no staff text, no drafts, and prints brand then industry from either pill, in single and bulk exports; a Renaissance-shaped client's Organic Social render is unchanged.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the full suite: `npm test` and `npm run typecheck` and `npm run lint`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(social-listening): wire the tab, sl param and PDF export`.

### Task 11: Private checks and the backfill script (outside the repo)

**Files (private, `~/.claude/organic-social-work/social-listening/`, never committed):**
- `real-export-check.mts`: runs `parseTalkwalkerExport` on the real October brand and industry files and compares every field with the earlier Python parse (`~/code/apfm-social-listening-mock/brand_oct_2026-11-19.json`, `~/code/social-listening/runs/2026-10/oct/oct.json`). Expected: every field equal.
- `history-backfill.mts`: reads the history sheet through the service account (sheet id from an env var), plus the October deck values typed into a private JSON, and writes `social_listening_history` rows. Guards: refuses any host but the one passed with `--host`; `--dry-run` prints the rows and writes nothing; `--rollback` deletes exactly the rows it wrote (by source tag); prints before and after row counts.

- [ ] **Step 1:** Run `real-export-check.mts` from the worktree root with `npx tsx <abs path>`, bounded. Expected: every field equal. Record the pass in the PR, no values.
- [ ] **Step 2:** Run `history-backfill.mts --dry-run` against dev. Expected: Jan to Oct brand, May to Oct industry, values matching the deck charts. Show Thomas.
- [ ] **Step 3:** Stop. Running the migration and the backfill on dev, then the setting switch-on for APFM, each needs Thomas's go (spec section 13).

### Task 12: Docs and PR

**Files:**
- Create: `lib/organic-social/social-listening/ENGINEERS.md` (how it works, where every number comes from, the D5 rule, how to switch it on, the private checks)
- Modify: `CLAUDE.md` (Known Follow-ups: Social Listening, including Phase 2), `docs/social-listening/README.md` (the mockup is superseded by the tab)
- PR #468: title and description describe the real build, the trial finding, the osv false positives, and the rollout gates.

- [ ] **Step 1:** Write the docs; scan for dashes and client data (`grep` for the October figures and author names as in the mock commits).
- [ ] **Step 2:** Commit `docs(social-listening): engineers guide and follow-ups`, push, update the PR description and the self-review comment, re-check CI.

---

## Phase 2: Paid sentiment (blocked)

Blocked on a sample paid ad comment sheet from Savannah, its column layout, and who shares it with the service account
(spec section 12). When unblocked: a spec addendum (inputs from the sheet, the four deck slides 29 to 32 as the
layout), then these tasks on their own branch off `dev`:

- P2.1 Setting: un-reserve `paidSheet` (`{ sheetId, tab }`), with parse tests; the Paid pill appears only with it.
- P2.2 Sheet reader: `lib/organic-social/social-listening/paid-sheet.ts` on the `ytd-sheet.ts` pattern (strict layout check, typed errors, no values in logs), tests with a made-up grid.
- P2.3 Page: sentiment overview of ad comments, comment examples by sentiment, analysis boxes `p-*` registered in `COMMENTARY_VIEWS`, export prints it after industry.
- P2.4 Private check against the real sheet, then the same rollout gates.
