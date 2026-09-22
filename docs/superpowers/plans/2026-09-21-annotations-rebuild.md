# Annotations Rebuild Plan (October update to the 2026-09-18 plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. This document UPDATES `docs/superpowers/plans/2026-09-18-chart-annotations.md` (the base plan, Tasks 0 to 6). Follow the base plan task by task; wherever this document says something different, this document wins. No subagents and no background commands (standing rule, 2026-09-21).

**Goal:** Build the approved annotations design (spec `docs/superpowers/specs/2026-09-18-chart-annotations-design.md`) on the v2 Follower Growth and Engagement graphs for the three clients, with Paul's rebuild notes applied and fitted to the October set (locked months, lock every number, the outline fixes, YTD Review), then demo it for Jasmine on staging. Renaissance renders v1 and is untouched.

## Sources (the premise; the reviewer checks this against them)

- **Jasmine's question 9 answer (2026-09-21):** "This should be fine, need to see it in action." Her question 9 described exactly the spec: top days called out with date, number and that day's post; followers gained per day; one button to hide them all; the team can hide any single one from the client; written notes later.
- **The outlines:** every platform tab's Follower Growth Graph and Engagement Graph "Needs to include annotations" (PR 250's `docs/reporting-outline.md`).
- **Paul's review of PR 252 (2026-09-18) and my replies** (private `replies-to-paul-2026-09-18.md`, "PR 252"): 4050225284 marks never forwarded on the engagement graph; 4050225288 v2 was `published: true`, must ship unpublished; 4050225292 "render or drop the label, and pass only `{date, count}` to the chart"; 4050225296 two test comments to fix or remove. My promise: "drop 922a090 and `annotations.test.tsx` and rebuild per the plan", keep `ebf3037`'s guard tests and the docs. Also in the PR description: "cache `fetchTopContentFrozen`, align the Top Content and graph date windows".
- **Question 8 (D17):** keep the "Influencer Posts" section and its name.
- **Memory:** `section_templates` rows pin Renaissance's graphs to v1 in all three environments; they win over the code template.
- **The October plans** (their branches): locked months (PR 256), lock every number (`feat/os-lock-every-number`), outline fixes (`feat/os-outline-fixes`), YTD Review (`feat/os-ytd-review`).
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
| 4050225292 label and RSC shape | Drop the label from what reaches the chart: `LineChart` receives `marks={visible?.map((a) => ({ x: a.date }))}` (override `:1573`, `:2652`, `:2658`). The annotation text (`8/10 \| +12 Followers`) and thumbnail render in the annotations row the base plan builds in `trends.tsx`, so nothing is lost; only plain `{ x }` crosses to the client chart. The `marks` type keeps `label?` (it renders nothing and v1 never passes it) so the shared chart's golden output does not move. |
| 4050225296 the two test comments | Both live in `922a090`'s files; `annotations.test.tsx` is deleted in Task 4 (its regression is re-covered at `:1209`) and `post-marks.test.ts` in Task 6. |
| "cache `fetchTopContentFrozen`" | New file `lib/organic-social/graph-posts.ts`: `export const graphPosts = cache((slug: string, dateRange: string, channel: DashChannel | null) => fetchTopContentFrozen(slug, dateRange, channel))`. Both v2 graph parts call `graphPosts` instead of `fetchTopContentFrozen` (override the base plan's Task 4 calls and mocks: mock `@/lib/organic-social/graph-posts`). One fetch per render for the two graphs; `frozen.ts` is not edited (the lock-every-number plan edits it). |
| "align the Top Content and graph date windows" | Already the base plan's Task 3: the v2 graphs request with `window: 'utc'`, which sends `isoRange(dateRange)`, the plain-date window Top Content uses. |

**"Drop 922a090", stated exactly:** every piece of `922a090` is removed or replaced (post-marks, the v2 part code, `annotations.test.tsx`, `published: true`) except `LineChart`'s optional `marks` prop, which the rebuild reuses as the dot layer; it renders nothing when absent, and `ebf3037`'s golden tests prove v1 and Paid Media draw byte-identical output with it present. I say this in the PR so Paul sees the one reused piece.

### B. The served month (locked months, PR 256)

The v2 parts receive the served canonical range (`ctx.dateRange = 'custom:2026-08-01,2026-08-31'`) from the section. `isoRange` parses `custom:` ranges (`lib/organic-social/base.ts:34-37` calls `parseDateRange`, which calls `resolveDateRange`; `lib/date-range.ts:47` handles `custom:`). Override every base-plan test fixture that uses `dateRange: '2026-08-01,2026-08-31'` to the served form `'custom:2026-08-01,2026-08-31'` and assert the request's plain dates `2026-08-01` and `2026-08-31`. The team's live month ends on the last complete UTC day (locked months spec 3.4), so the UTC-day window never includes a partial day for a finished month and at most the in-progress evening already labelled for the live month.

### C. Lock every number

For opted-in clients the v2 graph requests (GRAPH, plain dates) and the posts behind the thumbnails lock on the lock day with every other number (the lock sits in the Dash client; the posts come through `fetchTopContentFrozen`, which that plan routes to the locked Dash answer). Nothing in this plan changes for that. Hides (Task 5) are the team's presentation choice and are NOT locked: a team member can hide or unhide an annotation after the month opens to clients, like editing Commentary. (Decision 2.)

### D. Pinning, never publishing

Unchanged for Renaissance: its `section_templates` rows pin v1. The three clients get v2 by adding `versions: { 'follower-graph': 2, 'engagement-trend': 2 }` to their `report_section_config['organic-social:platform']` (the override PR 255's opt-in writes), with my go, on staging, in the same scripted, host-guarded, snapshot-first write as the other outline pins (a new script that edits the existing key). Read back one resolved tab per client; drift check.

### E. The hides table moves to one shared schema PR

The base plan's Task 5 generates migration `0024` for `chart_annotation_hides`. The lock-every-number plan also generates a `0024` (for `dash_response_locks`), and both add a table after `topContentSnapshots` in `lib/db/schema.ts`: two PRs claiming the same migration number and the same lines would conflict in any merge order. So both tables and one migration live in one small shared PR, `feat/os-october-schema` off `organic-social-october` (the table definitions exactly as each plan writes them, one `npm run db:generate`, `MIGRATIONS-PENDING.md` updated), which this rebuild and lock every number both build on. The base plan's Task 5 keeps the server action, the store and the UI; it drops its schema and migration steps and requires `feat/os-october-schema` merged into `organic-social-october` first (a build order, not a conflict). The migration is applied to staging only with my go (`npm run db:migrate:staging`).

### F. Thumbnails and Question 8

Thumbnails come from the tab's Top Content posts (owned and collab), as the spec says ("that day's top post"). Question 8 kept the Influencer Posts section visible to clients, so a collab post is already client-visible content and may be a thumbnail. (Decision 1.)

### G. Zero conflicts

- PR 254 edits `followers.ts` and `trends.ts` at the import after line 4 and the `getReportsData` call (followers `:32`, trends `:31`); the base plan's Task 3 edits the `./base` import (line 3), the getter signature, and the window line (`:25`, `:24`). They are separated by unchanged lines; prove it with a 3-way `git merge-file` before Task 3 and in the final proof.
- `parts/registry.ts`: this branch edits lines 7-8 and 13-14 (the v2 imports and entries); PR 255, the outline fixes and YTD Review touch other lines (proven clean pairwise already for 255; re-prove with both plans' branches).
- `frozen.ts` is not edited here (section A's cache is a new file).
- The final proof: `git merge-tree --write-tree` of this branch with 247, 250, 253, 254, 255, 256, `feat/os-october-schema`, and the three plan branches once they hold code; all merged in two orders off `origin/dev`, same tree, tests, tsc, `check:rsc` green.

### H. The demo

After this is on staging and pinned (section D) with my go: open one platform tab per client as the team, for August and September, show the top days with thumbnails, the Annotations button, and hiding one annotation from the client (then unhide it). I record the steps and screenshots privately (no client figures in the repo); Jasmine sees it on staging.

## Decisions made overnight (flagged for my yes)

1. Collab posts may be thumbnails (Question 8 keeps them client-visible).
2. Hides are not locked: the team may change them after a month opens to clients.
3. `LineChart`'s optional `marks` prop from `922a090` is reused; everything else from that commit is removed or replaced.

## Order of work

1. `git revert` nothing; instead follow the base plan Tasks 0 to 6 on this branch, with sections A to G applied. Task 0 is already done (`ebf3037`); rerun it first to confirm green.
2. Before Task 5: `feat/os-october-schema` exists and is merged into `organic-social-october`, and this branch is updated from `organic-social-october` by merge (no rebase, review threads stay).
3. Task 6 as written, plus: `parts/annotations.test.tsx` is gone (deleted in Task 4), and the gate counts are re-derived, not copied from the base plan.
4. Push only with my go; the PR stays draft until the demo.
