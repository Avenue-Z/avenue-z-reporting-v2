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
