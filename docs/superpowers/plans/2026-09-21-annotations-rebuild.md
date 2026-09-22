# Annotations Rebuild Plan (October update to the 2026-09-18 plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. This document UPDATES `docs/superpowers/plans/2026-09-18-chart-annotations.md` (the base plan, Tasks 0 to 6). Follow the base plan task by task; wherever this document says something different, this document wins. No subagents and no background commands (standing rule, 2026-09-21).

**Goal:** Build the approved annotations design (spec `docs/superpowers/specs/2026-09-18-chart-annotations-design.md`) on the v2 Follower Growth and Engagement graphs for the three clients, with Paul's rebuild notes applied and fitted to the October set (locked months, lock every number, the outline fixes, YTD Review), then demo it for Jasmine on staging. Renaissance renders v1 and is untouched.

## Sources (the premise; the reviewer checks this against them)

- **Jasmine's question 9 answer (2026-09-21):** "This should be fine, need to see it in action." Her question 9 described exactly the spec: top days called out with date, number and that day's post; followers gained per day; one button to hide them all; the team can hide any single one from the client; written notes later.
- **The outlines:** every platform tab's Follower Growth Graph and Engagement Graph "Needs to include annotations" (PR 250's `docs/reporting-outline.md`).
- **Paul's review of PR 252 (2026-09-18) and my replies** (private `replies-to-paul-2026-09-18.md`, "PR 252"): 4050225284 marks never forwarded on the engagement graph; 4050225288 v2 was `published: true`, must ship unpublished; 4050225292 "render or drop the label, and pass only `{date, count}` to the chart"; 4050225296 two test comments to fix or remove. My promise: "drop 922a090 and `annotations.test.tsx` and rebuild per the plan", keep `ebf3037`'s guard tests and the docs. Also in the PR description: "cache `fetchTopContentFrozen`, align the Top Content and graph date windows".
- **Question 8 (D17):** keep the "Influencer Posts" section and its name.
- **Memory:** `section_templates` rows pin Renaissance's graphs to v1 in all three environments; they win over the code template.
- **The October plans** (where they live, 2026-09-22): locked months and lock every number on PR 256 (`feat/os-locked-months`); outline fixes and YTD Review on PR 255 (`feat/organic-social-no-overview`). The stacked PRs #257, #258 and #259 are closed: every October PR stands alone and merges in any order.
- Standing rules: Renaissance untouched, client agnostic, zero conflicts in any order, staging-only writes with my go.

## Before (at `2d65904`, this branch)

- `922a090` added: an optional `marks?: { x: string; label?: string }[]` prop on the shared `components/charts/line-chart.tsx` (a dot per mark; `label` is never drawn), `lib/organic-social/post-marks.ts` (+ test), v2 of both graph parts registered `published: true`, and `parts/annotations.test.tsx`; the engagement graph accepted marks and never passed them to the chart.
- `ebf3037` pins what Renaissance's v1 charts and the Paid Media chart draw (real Recharts output) and the exact Dash request and gap rule behind each v1 graph.
- The base plan builds on `922a090`: it keeps `LineChart`'s `marks` prop, rewrites the v2 parts, adds `Annotation` building (Tasks 1, 2), the getters' `metric`/`window` arguments (Task 3), the annotations UI (Task 4), hides with a new table (Task 5), and deletes `post-marks` (Task 6). It still registers v2 `published: true` (`2026-09-18-chart-annotations.md:1666`, `:1722`) and passes `label` to `LineChart` (`:1573`, `:2652`, `:2658`).

## What changes against the base plan

### A. Paul's notes, each mapped

| Note | Change |
|---|---|
| 4050225284 marks not forwarded | Already covered by the base plan's regression test (`:1209`); keep it. |
| 4050225288 `published: true` | Both v2 parts are registered `published: false` (override `:1666` and `:1722`). A client gets v2 only by pinning it (section D). Add a test: `follower-graph@2` and `engagement-trend@2` are unpublished and v1 stays the published default. |
| 4050225292 label and RSC shape | Two parts. (1) The label: `LineChart` never drew it, so drop it. Remove `label?` from `LineChart`'s mark type and its doc comment (`components/charts/line-chart.tsx:17-23`; a type-only change, no render changes, and `tsc` proves no caller passes it); the v2 charts pass `marks={visible?.map((a) => ({ x: a.date }))}` (override base plan `:1573`, `:2652`, `:2658`), and the two base-plan tests that expect a `label` in the marks now expect `[{ x: '2026-08-10' }]` (`:1198`) and `[{ x: '2026-08-11' }]` (`:2505`). The annotation text (`8/10 \| +12 Followers`) still renders, in the annotations row the base plan builds. (2) The payload: the server to client boundary is `ChannelTrendChart`'s props (`components/report-sections/organic-social/trends.tsx:1` is `'use client'`), and the base plan's `Annotation` carries a whole post (`:597`, `post: TopContentPost \| null`). So the v2 parts (server) map each annotation to a small shape before rendering the chart: new pure `toChartAnnotations(a: Annotation[]): ChartAnnotation[]` in `lib/organic-social/annotations.ts`, `ChartAnnotation = { date: string; value: number; label: string; hidden?: boolean; thumb: { creative: Creative \| null; mediaType: TopContentPost['mediaType']; url: string \| null } \| null }`, and `trends.tsx` takes `ChartAnnotation[]`. Test: the props reaching `ChannelTrendChart` contain no `caption`, `metrics`, `id` or `publishedAt`. |
| 4050225296 the two test comments | Both live in `922a090`'s files; `annotations.test.tsx` is deleted in Task 4 (its regression is re-covered at `:1209`) and `post-marks.test.ts` in Task 6. |
| "cache `fetchTopContentFrozen`" | New file `lib/organic-social/graph-posts.ts`: `export const graphPosts = cache((slug: string, dateRange: string, channel: DashChannel \| null) => fetchTopContentFrozen(slug, dateRange, channel, { writeSnapshot: async () => {} }))`. It reads a frozen Top Content window when one exists, fetches live otherwise, and NEVER writes the snapshot: only Top Content freezes, so the graphs can never freeze a window without post authors ahead of the outline fixes' `top-content@3` (which fetches with authors). Both v2 graph parts call `graphPosts` (override the base plan's Task 4 calls and mocks: mock `@/lib/organic-social/graph-posts`). Test: `graphPosts` never calls `writeSnapshot`. It dedupes the two graphs' calls within a render (both call it with the same arguments; React's cache does not memoise outside a server render, so this is proven by the arguments, not a unit test). Top Content still makes its own call; its Dash request is the same, so Next's fetch cache (by URL) and, for opted-in clients, the lock return the same answer. `frozen.ts` is not edited. |
| "align the Top Content and graph date windows" | Already the base plan's Task 3: the v2 graphs request with `window: 'utc'`, which sends `isoRange(dateRange)`, the plain-date window Top Content uses. |

**"Drop 922a090", stated exactly:** the commit stays in the branch history (no revert, no rebase, so review threads stay intact), and every piece of it is removed or replaced (post-marks, the v2 part code, `annotations.test.tsx`, `published: true`, the mark `label`) except `LineChart`'s optional `marks` prop, which the rebuild reuses as the dot layer; it renders nothing when absent. Because `ebf3037`'s golden files were recorded after `922a090`, they cannot by themselves prove the chart matches `dev`: the final proof also runs those golden tests against `origin/dev`'s `components/charts/line-chart.tsx` and requires them to pass unchanged. The PR description says the commit stays in history and names the one reused piece.

### B. The served month (locked months, PR 256)

The v2 parts receive the served canonical range (`ctx.dateRange = 'custom:2026-08-01,2026-08-31'`) from the section. `isoRange` parses `custom:` ranges (`lib/organic-social/base.ts:34-37` calls `parseDateRange`, which calls `resolveDateRange`; `lib/date-range.ts:47` handles `custom:`). Override every base-plan test fixture that uses `dateRange: '2026-08-01,2026-08-31'` to the served form `'custom:2026-08-01,2026-08-31'` and assert the request's plain dates `2026-08-01` and `2026-08-31`. The team's live month ends on the last complete UTC day (locked months spec 3.4), so with `isoRange` the UTC-day window never includes a partial day, for a finished month or the live one.

### C. Lock every number

For opted-in clients the v2 graph requests (GRAPH, plain dates) and the posts behind the thumbnails lock on the lock day with every other number (the lock sits in the Dash client; the posts come through `fetchTopContentFrozen`, which that plan routes to the locked Dash answer). Nothing in this plan changes for that. One timing note: v2's plain-date `NET_NEW_FOLLOWERS` and engagement requests are new request keys, so for a month already past its lock day when v2 is pinned (August, whose lock day was Fri Sep 4), they lock at the first render after the pin, later than that month's tiles; each capture logs a late-lock warning. The two measure different things (daily gains versus totals), so no displayed number contradicts another, but the rollout pins v2 before the next lock day it should cover (Oct 5 for September). Hides (Task 5) are the team's presentation choice and are NOT locked: a team member can hide or unhide an annotation after the month opens to clients, like editing Commentary. (Decision 2.)

### D. Pinning, never publishing

Unchanged for Renaissance: its `section_templates` rows pin v1. The three clients get v2 by adding `versions: { 'follower-graph': 2, 'engagement-trend': 2 }` to their `report_section_config['organic-social:platform']` (the override PR 255's opt-in writes), with my go, on staging, in the same scripted, host-guarded, snapshot-first write as the other outline pins (a new script that edits the existing key); assert that override has no `frozen` base (`lib/report-sections/resolve.ts` ignores `versions` on a frozen base). Read back one resolved tab per client; drift check. While v2 is unpublished the team cannot freeze those tabs' composition (the freeze action refuses an unpublished pin, `lib/report-sections/validate.ts:40`); that is expected. Replace the base plan's publish test with: `follower-graph@1` and `engagement-trend@1` are published, `@2` of both is not.

### E. The hides table ships in one migration commit shared with PR 256 (2026-09-22; replaces the shared schema PR)

The base plan's Task 5 generates migration `0024` for `chart_annotation_hides`; the lock-every-number plan also generates a `0024` (for `dash_response_locks`). Two PRs each creating `drizzle/0024_*` and editing `drizzle/meta/_journal.json` conflict in any merge order. (The tables themselves sit in different places: the base plan adds its table after `export type PostDesignation`, `lib/db/schema.ts:372`; lock every number after `topContentSnapshots`.) A separate shared schema PR would make this PR and 256 depend on it, which the October set does not allow. So ONE commit adds both tables and ONE migration, and that same commit object is merged into this branch and into 256: the one named exception to "no PR carries another PR's commits" (D32). The full recipe and BOTH table definitions are in the appendix at the end of this file, word for word the same as the appendix in the lock every number plan on PR 256, so this build never reads another PR's branch.

In the base plan's Task 5: Step 1 (add the table), Step 2 (generate the migration) and Step 12 (record the migration) are replaced by the appendix (steps 1 to 9): make the October schema commit, or merge the same commit if PR 256's build already made it; Steps 3 to 11 and 13 stay. Step 14 (apply to staging, my go) runs once, from whichever of 252 or 256 reaches staging first. The migration is applied to staging only with my go (`npm run db:migrate:staging`).

### F. Thumbnails and Question 8

Thumbnails come from the tab's Top Content posts (owned and collab), as the spec says ("that day's top post"). Question 8 kept the Influencer Posts section visible to clients, so a collab post is already client-visible content and may be a thumbnail. (Decision 1.)

### G. Zero conflicts

- PR 254 edits `followers.ts` and `trends.ts` at the import after line 4 and the `getReportsData` call (followers `:32`, trends `:31`); the base plan's Task 3 edits the `./base` import (line 3), line 6, the getter signature, the window line (`:25`, `:24`), the metric line (`:29`) and the gap rule (`:49-52`). A reviewer's 3-way `git merge-file` of the full Task 3 edits against 254 came out clean both ways for both files; repeat it before Task 3 and in the final proof.
- `parts/registry.ts`: this branch edits lines 4-5 and 10-11 (the v2 imports and entries; lines 7-8 and 13-14 in PR 255's numbering); PR 255 (with the outline fixes and YTD Review) touches other lines (a reviewer's sequential merge of this branch, 255, the outline fixes and YTD Review came out clean).
- `frozen.ts` is not edited here (section A's cache is a new file).
- The final proof: `git merge-tree --write-tree` of this branch with 247, 250, 253, 254, 255 and 256 (each with their added work); all merged in two orders off `origin/dev`, same tree, tests, tsc, `check:rsc` green.

### H. The demo

After this is on staging and pinned (section D) with my go: open one platform tab per client as the team, for August and September, show the top days with thumbnails, the Annotations button, and hiding one annotation from the client (then unhide it). I record the steps and screenshots privately (no client figures in the repo); Jasmine sees it on staging.

## Decisions made overnight (flagged for my yes)

1. Collab posts may be thumbnails (Question 8 keeps them client-visible).
2. Hides are not locked: the team may change them after a month opens to clients.
3. `LineChart`'s optional `marks` prop from `922a090` is reused (its `label` field removed); everything else from that commit is removed or replaced, and the commit stays in history.

## Order of work

1. `git revert` nothing; instead follow the base plan Tasks 0 to 6 on this branch, with sections A to G applied. Task 0 is already done (`ebf3037`); rerun it first to confirm green.
2. Before Task 5: the October schema commit exists (built first with lock every number, or here if this build comes first) and is merged into this branch with `git merge --no-ff` (no rebase, no cherry-pick, review threads stay). Also prove this branch stands alone: by itself on `organic-social-october` it passes tests, tsc and `check:rsc`.
3. Task 6 as written, plus: `parts/annotations.test.tsx` is gone (deleted in Task 4); the gate counts are re-derived, not copied from the base plan; and `ebf3037`'s golden tests are also run against `origin/dev`'s `line-chart.tsx` (section A).
4. Push only with my go; the PR stays draft until the demo.

## Review record

Fresh adversarial review of `b353f88` (one reviewer, read only; its 3-way merges of the base plan's Task 3 against PR 254 and of the registry across this branch, 255 and the two plan branches all came out clean). Every finding was checked and accepted.

| # | Sev | Finding | Disposition |
|---|---|---|---|
| M1 | MAJOR | `graphPosts` could freeze a Top Content window without authors ahead of `top-content@3`, silently disabling the collab rule | Fixed: `graphPosts` never writes the snapshot; test |
| M2 | MAJOR | The RSC boundary is `ChannelTrendChart` (a client component) and `Annotation` carries a whole post | Fixed: `toChartAnnotations` maps to a small shape on the server; test |
| M3 | MAJOR | Keeping `label?` was not "render or drop", and the stated reason was wrong | Fixed: `label?` removed from the mark type |
| M4 | MAJOR | Base-plan tests at `:1198` and `:2505` still expected a label | Fixed: overridden |
| M5 | MAJOR | The shared schema PR was half wired: lock every number still generated its own `0024`; table placement misstated | Fixed: exact Task 5 steps moved; lock-every-number plan amended in the same step; placement corrected |
| m1 | MINOR | "Drop 922a090" read loosely | Fixed: stated that the commit stays in history, one piece reused |
| m2 | MINOR | Golden proof circular (recorded after `922a090`) | Fixed: also run against `origin/dev`'s `line-chart.tsx` |
| m3 | MINOR | Pinning gaps: frozen base, freeze action refuses unpublished pins, vague publish test | Fixed (section D) |
| m4 | MINOR | v2 requests for a past-lock-day month lock late | Stated (section C); rollout pins v2 before the next lock day |
| m5 | MINOR | Line numbers, Task 3 edit list, the live-month wording, "one fetch per render" | Fixed |

**Review of the 2026-09-22 restructure** (one fresh reviewer, read only): the simulated schema commit off `100e6c7` merged clean into this branch and 256, and the whole set in three orders gave one tree with a single `0024`. Fixed from its findings: the schema commit's base is pinned to `100e6c7` here as in the lock plan, and a later table change is a new shared migration, never a one-branch edit.

**Audit fix 2026-09-22 (fresh audit, M1):** the schema commit recipe and both table definitions now live verbatim in this file's appendix, so the build never reads another PR's branch; the shared commit is recorded as the one named exception (D32).

## Appendix: the October schema commit (this text is identical in the lock every number plan on PR 256 and the annotations rebuild plan on PR 252)

**What it is.** Two October PRs each need a new table: PR 256 (`dash_response_locks`, lock every number) and PR 252 (`chart_annotation_hides`, annotation hides). Drizzle keeps one migration list (`drizzle/meta/_journal.json`), so two PRs that each generate their own `0024` conflict in any merge order, and a separate schema PR would make both depend on it. So ONE commit adds both tables and ONE migration, and that same commit object is merged into both PRs. Either PR can merge first; the other then merges clean and the migration runs once. Each PR carries one table it does not read until the other lands: empty, unused, harmless.

**The one named exception to "no PR carries another PR's commits" (my decision, D32, 2026-09-22, "same commit in both").** This commit is the only commit two October PRs share. It is not another PR's work: it belongs to both equally, contains only the two tables and their migration, and neither PR needs the other to merge. Every other commit on every October PR is unique to that PR.

**Everything the builder needs is here; nothing is read from the other PR's branch.**

1. Cut a local scratch branch from commit `100e6c7` EXACTLY: `git switch -c local/october-schema 100e6c7`. Never from the moving tip of `organic-social-october`: once any PR has merged there, a commit cut from the tip would carry that PR's commits into 256 and 252.
2. In `lib/db/schema.ts` (every helper used below is already imported on line 1 at `100e6c7`), directly after the line `export type PostDesignation = typeof postDesignations.$inferSelect`, add:

```ts

// One row per (client, platform, chart, day) the team has hidden or unhidden on a v2
// Organic Social graph. hidden=true keeps that annotation from the client; the team still
// sees it, faded, with an Unhide button. No row means never touched, i.e. shown. Mirrors
// post_designations. Purely additive: nothing Renaissance renders reads it.
export const chartAnnotationHides = pgTable('chart_annotation_hides', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  channel: text('channel').notNull(),   // DashChannel, e.g. 'INSTAGRAM'
  chart: text('chart').notNull(),       // 'followers' | 'engagements'
  day: date('day').notNull(),           // the annotation's day, yyyy-mm-dd, the UTC day Dash counts
  hidden: boolean('hidden').notNull(),
  setBy: text('set_by').notNull(),      // email
  setAt: timestamp('set_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  clientCalloutUnique: unique('chart_annotation_hides_client_callout_key').on(table.clientId, table.channel, table.chart, table.day),
  clientIdx: index('chart_annotation_hides_client_idx').on(table.clientId),
}))

export type ChartAnnotationHide = typeof chartAnnotationHides.$inferSelect
```

3. Directly after the `topContentSnapshots` table definition (the `}))` that closes it), add:

```ts
/** Lock every number (D27): the stored Dash answer for one exact request of a locked month, per
 *  client. Written once (the first read after the lock day), then served forever. Only clients with
 *  reportingMonths ever read or write it. */
export const dashResponseLocks = pgTable('dash_response_locks', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  requestKey: text('request_key').notNull(),
  periodEnd: date('period_end').notNull(),
  response: jsonb('response').notNull(),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  clientRequestUnique: unique('dash_response_locks_client_request_key').on(table.clientId, table.requestKey),
}))
```

   and directly after the line `export type NewTopContentSnapshot = typeof topContentSnapshots.$inferInsert`, add `export type DashResponseLock = typeof dashResponseLocks.$inferSelect`.
4. Run `npm run db:generate` once (no database). If it asks any question, STOP and bring it to me.
5. Check it mechanically: `grep -iE 'create table|alter table|drop|rename' drizzle/0024_*.sql` shows only `CREATE TABLE "dash_response_locks"`, `CREATE TABLE "chart_annotation_hides"` and `ALTER TABLE` lines adding those two tables' foreign keys; read every other line (unique constraints, the hides index); `git diff --stat 100e6c7` lists only `lib/db/schema.ts`, `drizzle/0024_*.sql`, `drizzle/meta/0024_snapshot.json`, `drizzle/meta/_journal.json` and `MIGRATIONS-PENDING.md` (add both tables there).
6. Commit `feat(db): October tables (dash_response_locks, chart_annotation_hides), one migration`.
7. Before merging it anywhere: `git merge-base local/october-schema origin/dev` prints `100e6c7`, and `git rev-list --count 100e6c7..local/october-schema` prints `1`.
8. `git merge --no-ff local/october-schema` into the PR branch being built. Whichever of 256 or 252 is built second merges the SAME commit (the branch stays local until both have it; recreate it from the first PR's history with `git branch local/october-schema <sha>` if needed). Never cherry-pick: a cherry-pick is a different commit, and the two `0024_snapshot.json` files would differ.
9. Prove it: `git merge-tree --write-tree` of 256 and 252 is clean, and the two branches' `drizzle/` trees are byte-identical (`git diff 256-branch 252-branch -- drizzle` is empty).

**After it is shared.** It is never amended. A later change to either table (for example from Paul's review) is a new migration `0025` made the same way (one commit on top of this one, merged into both), never an edit on one branch. If one of the two PRs is squash-merged into `organic-social-october`, the other still merges clean (both sides add byte-identical files); re-run `git merge-tree` at that time to confirm.

**Staging.** The migration is applied once, from whichever of 256 or 252 reaches staging first, only with my go (`npm run db:migrate:staging`, host-guarded, table list snapshot first; confirm only the two tables were added).
