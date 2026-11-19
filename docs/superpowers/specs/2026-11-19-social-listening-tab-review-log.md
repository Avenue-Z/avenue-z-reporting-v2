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
