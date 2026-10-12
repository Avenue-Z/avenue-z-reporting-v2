# Renaissance's YTD Review shows finished months only: plan

**Spec:** `docs/superpowers/specs/2026-10-06-os-ren-ytd-finished-months-design.md` (two review rounds closed; January and
February behaviour signed off 2026-10-06). **Executor:** inline, test first. **Baseline on `dev` 0b5a0a97:**
`npm run typecheck` clean; `npx vitest run` 205 files, 2067 tests, all pass.

## Global constraints
- Change `ytdLiveMonths` only (`lib/organic-social/ytd.ts:118-127`); every other function in `ytd.ts` and every other
  file's behaviour stays as it is.
- No names other than Renaissance and no client figures anywhere (public repo). No em or en dashes.
- `CLAUDE.md:1037` stays byte-identical (buffer against open PR #314).

## Task 1: unit tests for the rule (`lib/organic-social/ytd.test.ts`), RED
Replace the version-3 tests at `:167-223` with:
1. One test per row of spec section 5, plus the boundary rows 2026-10-01T03:59Z (Jan to Aug) and 04:00Z (Jan to Sep)
   (round 1 A6): exact keys, and the last month's full object.
2. Every hour across the two month ends (`:194-205`, tightened): no month is `partial`; every `dateRange` is whole.
3. Property, every hour of 2026 and of 2028: non-empty, at most 12, starts in January of the last month's year,
   consecutive keys, every month whole; the last month ends on or before `day` and the month after it does not
   (maximality, A5). `day` is recomputed in the test from the clock fields, not taken from the code under test.
Run `npx vitest run lib/organic-social/ytd.test.ts`. Expected: the new version-3 tests fail on the partial month.

## Task 2: part tests (`parts/ytd-review-live.test.tsx`), RED
Per spec section 9 items 4 to 9a: September-only Dash request and Jan to Sep labels (`:66-81`, retitled, A7); 9-month
counts (`:83-99`, `:154-165`, `:211-227`, "ten" to "nine"); the X tab asks Dash nothing (`:131-144`, retitled, A7); the
timeout log case moves to a finished month (`:229-244`); no "(live)" label; the stakeholder's 2026-10-06 case; 9a
(January shows 2026 from the 2026 entry over a 2027 entry; February is one `BarChart` per graph with no Dash call).
Run the file. Expected: those tests fail; the rest pass.

## Task 3: the change, GREEN
`ytdLiveMonths`: compute `day` as today; `end` = `day`'s month when `day` is its last day, else the month before;
return January of `end`'s year through `end`, all whole, `partial: false`, `compareRange: null`. Update the doc
comments at `ytd.ts:15`, `:111-117` and `ytd-review-live.tsx:19-22`. Run both files, then the full suite, the type check,
`npm run check:rsc` and `npx eslint` on the changed files. Expected: all green.

## Task 4: CLAUDE.md
`:1031` drop "(in practice the live month)"; `:1034-1036` describe finished months only, ending with "Its past" so
`:1037` still reads on. Confirm `:1037` unchanged with `git diff`.

## Task 5: commit, push, prove
Commit with the edge-case list in the body (external failure, operator visibility, bounds, input boundaries, state,
security). Push. Prove clean merges: this branch with #314, #320, #321 and the date-labels branch, in both orders, and
the full suite on the combined tree. Fresh-eyed review of the whole branch diff against the spec. Then the PR to `dev`.
