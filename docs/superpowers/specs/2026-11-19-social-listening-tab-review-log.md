# Social Listening tab spec: review log

Spec: `2026-11-19-social-listening-tab-design.md`. Reviews are fresh-context subagents with the fixed checklist (inputs and
outputs defined, claims cited and true, parity with the AEO tab, downstream conflicts, failure behaviour, a test per output).

## Round 1 (2026-11-19, whole spec, draft 7caa32f0)

36 findings: 2 BLOCKER, 20 MAJOR, 14 MINOR. Every BLOCKER and MAJOR fixed by targeted edit; the MINORs were small enough to
fix in the same pass.

| # | Sev | Disposition |
|---|---|---|
| F1 | BLOCKER | Trends gain draft and approved; clients see approved only (§8) |
| F2 | BLOCKER | Export prints the client's view whoever exports, via `useExportMode()` (§9), with a test (§14) |
| F3 | MAJOR | `hasSocialListeningTab` and the filter branch named; trimmed records carry a boolean (§4) |
| F4 | MAJOR | Early body branch like AEO's, with NoMonths; the header commentary boxes are not rendered (§4) |
| F5 | MAJOR | Presented upload = newest before the month's open date; later re-uploads never move it (§7) |
| F6 | MAJOR | The served month's YTD point is the upload the page shows (§7) |
| F7 | MAJOR | `wholeDelta` behaviour stated truly; `PointsDelta` added for points (§7) |
| F8 | MAJOR | Typed stored shape with units and the date parse (§6) |
| F9 | MAJOR | Formulas written out (§7) |
| F10 | MAJOR | Two-word Themes widget chosen by its strings; ambiguity refused (§6) |
| F11 | MAJOR | Upload month re-resolved on the server; finished months only (§5) |
| F12 | MAJOR | `bodySizeLimit` 3mb; sizes measured; one image per action (§6, §8) |
| F13 | MAJOR | `sl=brand|industry` param, Suspense key, export and bulk (§4) |
| F14 | MAJOR | JPEG only, a 60 KB print copy, first image per post in exports, 12 posts per month cap (§8) |
| F15 | MAJOR | Image route checks named (`isStaff`, `canOpenPortal`) and approval rule for clients (§8) |
| F16 | MAJOR | Editing an approved post forks a draft; one open draft per post (§8) |
| F17 | MAJOR | `getCommentaryForViewPrefix` and pre-fetched entries for `monthlyCommentary` (§9) |
| F18 | MAJOR | Rollout uploads October's exports after the backfill (§13) |
| F19 | MAJOR | `industrySample` setting and the sample label (§4) |
| F20 | MAJOR | Parser claims marked unverified until the scratch trial (§6) |
| F21 | MAJOR | Missing tests added (§14) |
| F22 | MAJOR | The two tab-list tests named as changing on purpose; Renaissance assertion (§14) |
| F23 | MINOR | Accepted: commentary's write path is reused without a setting check, stated (§9, §10) |
| F24, F25 | MINOR | Union, registry owner and labels named (§9) |
| F26, F27, F28 | MINOR | Per-role cases, NoMonths, previous-month comparison stated (§4, §5) |
| F29 | MINOR | Empty and equal topics malformed; where it logs (§4) |
| F30 | MINOR | Citation fixed to `lib/constants.ts:205` |
| F31 | MINOR | `SENTIMENT_COLORS` beside `CHART_COLORS`, existing delta colours untouched (§9) |
| F32 | MINOR | "Without brand-owned channels" (§9) |
| F33 | MINOR | Media totals from sentiment by media type, stated (§6) |
| F34 | MINOR | OLE2 signature in V1 (§6) |
| F35 | MINOR | History `source` values (§8) |
| F36 | MINOR | Reads cached under the `db` tag, writes `updateTag('db')` (§8) |

## Round 2 (2026-11-19, changed lines only, 7caa32f0..092243d3)

17 findings: 0 BLOCKER, 5 MAJOR, 12 MINOR. Per the review rules there is no round 3: a MAJOR with exactly one fix is fixed
by targeted edit and reported; a MAJOR with a choice goes to Thomas; MINORs go to the plan.

| # | Sev | Disposition |
|---|---|---|
| R2-1 | MAJOR | Fixed (one fix): a server-side export flag drives one `clientView` value for every section 5 case (§9) |
| R2-2 | MAJOR | Fixed (one fix): a missing, null or 0 previous value gets the placeholder, never Infinity (§7) |
| R2-3 | MAJOR | **Decision for Thomas:** what October's page shows when it has both a history row and a re-pulled upload |
| R2-4 | MAJOR | Fixed (one fix): `before_open` stored on the upload row at upload time (§7, §8) |
| R2-5 | MAJOR | **Decision for Thomas:** whether a PDF of the tab prints both Brand and Industry, or only the pill on screen |
| R2-6 | MINOR | Plan: a trimmed record's `socialListeningTab` boolean decides; test on a trimmed record |
| R2-7 | MINOR | Plan: `OrganicSocialReport` (not the body) skips both header boxes; test the `organic-social` stream is not read |
| R2-8 | MINOR | Plan: add `industrySample` to the shape block (integer 1 to 100, only with `industryTopic`); parse tests incl. empty and equal topics |
| R2-9 | MINOR | Plan: new reads use `cached()` under `db`; the commentary prefix read is per render (`React.cache`), like `getCommentaryForView` |
| R2-10 | MINOR | Plan: the draft index predicate `WHERE status = 'draft' AND deleted_at IS NULL`; the cap of 12 counts approved, not replaced, not deleted posts |
| R2-11 | MINOR | Plan: trends keep the approved lists while a draft is edited (approved columns beside the draft) |
| R2-12 | MINOR | Plan: check `print_bytes` like `bytes`; `image/jpeg` with `nosniff`; client role also needs the post's month in its months and the tab on; uuid ids |
| R2-13 | MINOR | Plan: the live month's staff empty state, "Upload opens when <month> ends." |
| R2-14 | MINOR | Plan: round the current value to whole when the previous month is a history row; positive + neutral = round(pos) + round(neu) |
| R2-15 | MINOR | Plan: the open-date cutoff is `opensOn` 00:00 America/New_York; test the boundary |
| R2-16 | MINOR | Plan: the 3 MB server-action limit is app-wide; accepted (no other action is affected by a higher cap) |
| R2-17 | MINOR | Plan: choose the Themes widget with no three-word entries; refuse only when that is ambiguous |
