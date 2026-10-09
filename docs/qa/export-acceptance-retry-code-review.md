# Code Review Record — `fix/export-acceptance-retry-on-refresh` (PR #364)

**Feature under review:** PR #364, `test(export): re-export a staff/client pair once when a cache refresh made them differ`

**Diff range reviewed:** `1d73ee6..d4b32a9`, one commit on `dev`. No unrelated code.

**Reviewers:** Paul, Thomas.

**This document changes no code.**

| Area | Files |
|---|---|
| Helper | `e2e/export/pair.ts` (new, `exportPair`) |
| Call site | `e2e/export/acceptance.mts:137` (the A Place for Mom staff/client pair) |
| Tests | `e2e/export/pair.test.ts` (new), pinned in `vitest.config.ts` |

The PR is test infrastructure only. No app code changes.

---

## §1 How it works

**The check.** The export acceptance run exports a view twice, as a staff editor and then as a client, and asserts the two PDFs print the same. That's how a staff-only control (editor, draft, button) leaking into a PDF is caught.

**Why it flaked.** The report data caches are stale-while-revalidate: the first request after an entry expires is served the stale value while the cache refreshes in the background. After the app sits idle for a few hours:
1. the first export of a pair (staff) gets stale numbers;
2. the second (client), seconds later, gets fresh ones;
3. the pair differs by real data that no role logic caused.

Seen on 2026-10-09, all within one minute:
- AEO Technical Audit: 274 vs 275 crawled pages;
- Executive Overview: 41,898 vs 42,353 sessions;
- AEO Content Impact: 215 vs 218 rows.

Every one re-ran green.

**The fix.** `exportPair(exportStaff, exportClient, differ)` (`pair.ts:21`):
1. Exports staff, then client (attempt 1). If either failed to export, it returns without comparing (`:28`); the export's own checks (route status, page size, fonts…) already report the failure.
2. Compares them with `differ`. If they match, it's done.
3. If they differ, it exports both once more (attempt 2). The caches are warm by then.
   - If a retry fails to export, the first difference stands (`:34`).
   - Otherwise the result is the second comparison.
4. Returns the pair to use for the remaining checks, the final difference, and `retried`, the first difference when a retry happened.

**At the call site** (`acceptance.mts:137`):
- Retry PDFs are named `-retry`, so the first pair stays on disk.
- A retry prints a `note` line naming the first difference, so it's visible, not silent.
- The staff/client check reads the final difference (`:153`).

`differ` is passed in: today's `body()` comparison on `dev`, and `printedDifference` once #356 merges.

**What it can hide.** A difference that appears in the first pair and disappears in the second. A deterministic staff/client difference, such as a staff-only control, appears in both pairs and still fails.

---

## §2 Verification method

- **Unit, executed:** `e2e/export/pair.test.ts` has 5 cases with fake exports:
  - a matching pair is exported once (call counts asserted);
  - differs then matches: passes with `retried` set, exporting twice;
  - differs twice: the second difference stands;
  - a failed export: no compare, no retry;
  - a failed retry: the first difference stands.
- **Suite:** `npx vitest run` 2492/2492. `tsc` clean, lint clean.
- **Live, executed:** the acceptance run on this commit (`dev` plus this PR, local production build) passes every check. The A Place for Mom pair matched on the first attempt, as the caches were warm, so the live run exercised the wiring, not the retry. The retry path rests on the unit tests.

---

## §3 Findings

**Sev:** **●** correctness · **○** cleanup/convention.
**Status:** CONFIRMED (proven in-tree) · PLAUSIBLE (code confirmed, external trigger unverified).

| # | Sev | Status | Location | Finding |
|---|-----|--------|----------|---------|
| 1 | ● | CONFIRMED | `acceptance.mts` (before) | A stale cache refreshing between the two exports failed the staff = client check on identical role behaviour. **Fixed by this PR.** |
| 2 | ○ | PLAUSIBLE | `pair.ts` | An intermittent real difference (one that shows in only one of two pairs) would pass after the retry. Its note line still records it. |
| 3 | ○ | CONFIRMED | `acceptance.mts` | On `dev` only the A Place for Mom pair uses `exportPair`. The AEO, Paid Media and Executive Overview pairs, where the flake was seen, live on #350, #352 and #354, and switch to it when they meet this on `dev`. |
| 4 | ○ | CONFIRMED | `acceptance.mts:137` | #356 rewrites the same lines (`body()` becomes `sameExport()`/`printedDifference`). Whichever merges second resolves the conflict and passes `printedDifference` as `differ`. |

---

## §4 Detail

**#2: What a retry can hide.** The retry targets differences caused by time, not by role. A real role difference is deterministic and appears in both pairs. The remaining risk is an intermittent rendering difference that happens to clear on the second pair. That would previously have been an intermittent failure anyway, and now it leaves a note line.

---

## §5 Follow-ups

**Merge order**
- #3 and #4: resolved when #350, #352, #354 and #356 meet this on `dev`. All of them are ours.

Nothing here blocks the ship.
