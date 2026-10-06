# Notes on the YTD graphs: plan

**Spec:** `docs/superpowers/specs/2026-10-06-os-ytd-notes-design.md` (two review rounds closed; "dot plus hover note, no
card" approved 2026-10-06). **Executor:** inline, test first. **Baseline on `dev` 0b5a0a97:** typecheck clean; 205
files, 2067 tests pass.

## Global constraints
- No change to `components/charts/line-chart.tsx` or `components/charts/bar-chart.tsx`.
- Do not touch `parts/ytd-review-live.test.tsx`, `lib/organic-social/ytd.ts` or `CLAUDE.md` (open PR #322 does).
- Daily-graph notes, hides and the approve/revoke/delete actions behave exactly as today.
- No names other than Renaissance, no client figures, no em or en dashes.

## Task 1: keys and validation, then the save action
- RED: `validate.test.ts` (YTD rows of spec section 5; parity test renamed with YTD cases), `annotation-hides/mutations.test.ts`
  (a YTD chart refused), `app/actions/chart-notes.test.ts` (with `firstMonth: '2026-08'`: YTD on `2026-01-01` saved,
  `2025-12-01` refused with "That month is before this client's first reporting year.", the daily rule and the malformed
  refusal unchanged).
- GREEN: `annotations.ts` (`YtdNoteChart`, `YTD_NOTE_CHARTS`, `NoteChart`); `annotation-hides/mutations.ts` (platform and
  day checks split out, `checkAnnotationKey` unchanged); `validate.ts` (`checkNoteKey`); `mutations.ts`, `pick.ts` types;
  `app/actions/chart-notes.ts` (the rule by chart, the revoke cast); `schema.ts` comment.

## Task 2: the server builder (`parts/ytd-notes.ts`)
- RED, then GREEN: per graph, approved text by label and marks for months with a point; the panel rows (editor fields
  only for editors); window = the block's months; "(live)" matched by key; fail closed with the exact log line;
  `notesOn` false reads nothing.

## Task 3: the panel (`ytd-notes-panel.tsx`) and `NoteActions`' controls type
- RED, then GREEN: client lines only for off-point notes; nothing when nothing to show; editor Add annotation with every
  month; save sends `yyyy-mm-01` and no posts; the existing-note warning; the line after a save; panel rows carry
  `NoteActions` with the stated annotation; `saving` until the refreshed answer.

## Task 4: wiring
- RED, then GREEN: `ytdReviewBlock` takes optional notes (props only when non-empty; panel under each graph); version 2
  and version 3 read them; version 1 unchanged; `ytd-review-sheet.test.tsx` mocks the read; a new
  `parts/ytd-review-live.notes.test.tsx` (clock 2026-10-15, asserts on September only); the daily-graph regression guard in
  `annotations-wiring.test.tsx`.

## Task 5: prove and ship
Full suite, typecheck, `check:rsc`, eslint. Local app (dev database, staff and a client login): add, approve, see the dot
and hover note. Commit with the edge-case list; push; merge proofs (#322, #323, #324, #314, #320, #321, both orders, the
suite on each combination); fresh-eyed whole-branch review; PR to `dev` with Paul requested.
