# Review log: Renaissance's YTD Review shows finished months only

Spec: `2026-10-06-os-ren-ytd-finished-months-design.md`. Fixed checklist: scope against the request; inputs and outputs;
every citation opened and checked; parity with today; every caller; failure behaviour; edge cases recomputed from the
code; a test for every output. At most two rounds; round 2 reviews only the changed lines.

## Round 1 (fresh reviewer, read only, 2026-10-06)
Every citation checked and correct; every row of the section 5 table recomputed from `clockFor` and the rule, and correct.
No BLOCKER.

| # | Sev | Finding | Outcome |
|---|---|---|---|
| A1 | MAJOR | February: only January is finished, so each graph is one point and draws as a bar, not a line (`ytd-review-sheet.tsx:84-86`). Not in the table. | Fixed: section 3 states it; a row and test 9a added. |
| A2 | MAJOR | January 2 to 31 shows the whole previous year under titles with no year; was described as "not new logic". | Fixed: section 3 states it as a deliberate decision, with its basis (parity with the five outline clients' January) and asks for sign-off. Test 9a added. |
| A3 | MINOR | "Pinned by Renaissance only" is staging data; production pins not cited. | Plan: production runs the old code, which has no `ytd-review@3` at all (this version reaches production only with the launch); note it in the PR. |
| A4 | MINOR | Version 3 is changed in place, safe because it is unpublished (`ytd-review-live.tsx:74`) and pinned once. | Plan: say so in the PR description. |
| A5 | MINOR | The property test should also prove the last month is the latest whole one (maximality), recomputing `day` from the clock. | Plan: add to test 3. |
| A6 | MINOR | Add exact boundary rows at 2026-10-01 03:59Z (Jan to Aug) and 04:00Z (Jan to Sep). | Plan: add to test 1. |
| A7 | MINOR | Two test titles become false (`ytd-review-live.test.tsx:66`, `:131`). | Plan: retitle them. |
| A8 | MINOR | `CLAUDE.md:1037` continues the bullet started at `:1034`; the rewrite must keep a subject for "Its". The #314 buffer is unproven until the merge is tested. | Plan: keep "Its past" ending `:1036`; prove the merge both ways. |

## Round 2 (fresh reviewer, changed lines only, 2026-10-06)
No BLOCKER, no MAJOR. Both round 1 MAJORs confirmed fixed from the code: one point draws as a bar
(`ytd-review-sheet.tsx:85-86`); the January parity holds for the outline clients' client view and default staff view
(`lockedRangeFor` callers in both report pages; `reporting-months.ts:176-184`, `:210`). The review ends here; there is no round 3.

| # | Sev | Finding | Outcome |
|---|---|---|---|
| R1 | MINOR | The January-start rule is version 2's (`ytd.ts:100-109`), not `ytdMonths` (`:52-67`, clamped at firstMonth). | Corrected in place: cites `:100-109`. |
| R2 | MINOR | The parity basis needs the default (`:210`), the client opens-on gate (`:178-179`) and the team's live pick (`:171-172`). | Corrected in place. |
| R3 | MINOR | The January and February windows were not in UTC bounds; the February change starts at 04:00 UTC on February 2. | Corrected in place. |
| R4 | MINOR | One bar only when January has a value; a January gap shows "No data" (`:85`). | Corrected in place. |
| R5 | MINOR | Test 9a must prove the 2026 entry is chosen over a 2027 one, and avoid an unmocked Dash call in February. | Corrected in place: fixture with both entries; the 2027 sheet fills January. |

## Final code review (fresh reviewer, whole branch against the spec, 2026-10-06)
No Critical, no Important; verdict: ready for human review. The reviewer recomputed `ytdLiveMonths` by hand at 15 clocks
(month ends, 03:59 and 04:00 UTC on the 1st, January 1 and 2, February 1 and 15, leap February) and found every result
matches the spec; scope, callers, comments and types clean; every changed test assertion justified.

| # | Sev | Finding | Outcome |
|---|---|---|---|
| C1 | MINOR | Spec item 10 said the January 1 test stays; the rule's version contradicted the section 5 table and was replaced. | Fixed: item 10 reworded. |
| C2 | MINOR | The "(live)" test's date pattern would accept an impossible end such as 02-30. | Fixed: compares against the month's real last day. |
| C3 | MINOR | `CLAUDE.md:1018`, `:1021` mention "the live month" in the #306 history paragraph. | Kept: accurate as history; the current behaviour is stated at `:1034-1037`. |
