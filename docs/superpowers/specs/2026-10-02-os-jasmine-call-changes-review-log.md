# Review log: Jasmine's 2026-10-02 walkthrough changes spec

Spec: `2026-10-02-os-jasmine-call-changes-design.md` (same folder). One fresh-context subagent per round, fixed checklist,
two rounds at most. Code checked at `origin/dev` 7243ec7f.

## Round 1 (2026-10-02, whole spec): 0 BLOCKER, 7 MAJOR, 13 MINOR

### MAJOR, fixed in the spec with targeted edits
| # | Finding | Fix |
|---|---|---|
| 1 | The S11 row said locked numbers never change, but S5 makes the Followers and Views tiles follow the sheet | S11 now says Dash's stored answer never changes, and the tiles and YTD follow the sheet per S4 and S5 |
| 2 | The arrow could compare a sheet number against Dash; the prior-year lookup for January and `previous-year` was undefined | Sheet against sheet only; the prior year reads its own `ytdSheets` entry; no sheet number for the comparison month means no arrow |
| 3 | A month where Dash is all null but the sheet has the month was undefined | The Data block stays No data |
| 4 | January 1 gave @3 zero months | @3 is anchored on the last complete UTC day: the 1st shows the previous month whole, and January 1 shows the previous year |
| 5 | Pinning @3 on an outline client would create new lock rows | @3 renders nothing and logs once for a client with `reportingMonths` |
| 6 | No test for Renaissance's resolved parts | A `resolveSection` and `validateSectionOverride` test with the exact override; Overview unchanged |
| 7 | The staging write could replace existing keys or meet `frozen` | Staging read: Renaissance has only `organic-social.sharedParts`. The script creates only `organic-social:platform`, refuses on an existing key or `frozen`, leaves every other key alone, validates, and prints before and after |

### MINOR, for the plan (no further review round)
1. `SortableTopContent` is shared with top-content@2, so Renaissance's render path reaches it. Name `top-content-v2.golden.test.tsx` as the guard. The heading is per section, not per row: key the label by the tab's channel and map the Dash channel enum to it.
2. On Piper Instagram, a staff member who marks an owned post as Influencer moves it into the hidden section, and the UI cannot undo that. Either show the hidden row to staff only, greyed out, or document the database fix.
3. Read the sheet in parallel with `getOutlineKpis` (same `Promise.all`), not after it.
4. Tile failure list: add `YtdSheetLayoutError` (logged with `missing=`) and an invalid `ytdSheets` entry (`kind: 'invalid'`).
5. Section 2 says the Day list ends at yesterday. The code ends at min(today UTC, range end), so Renaissance's ranges that end today include today's partial day (`parts/chart-notes.ts:92`; `lib/date-range.ts:71, 77, 90`). Correct the claim when the plan cites it.
6. Notes gate precedence: a malformed `reportingMonths` plus `chartNotes: true`. Define it and test it.
7. @3 with an invalid `ytdSheets` entry or a layout error: all live Dash plus a warning, or the error card. Decide in the plan.
8. @3's live month: the UTC end day against the Eastern `T04:00:00Z` windows, `liveDayInProgress`, the 1-hour Dash fetch cache (so "(live)" can be up to an hour old), and past months re-read hourly. State each and accept it.
9. Renaissance's YTD points will not match its v1 rolling tiles. Accept this in one line.
10. List the new Renaissance Dash requests for the Renaissance proof: the UTC-day graphs, the second content read through `graphPosts`, and up to 12 `getOutlineKpis` calls per platform tab for YTD.
11. S7 still has three open cases: does a leading invalid cell break the leading run; what exactly "No data" means; and whether the 2027 v1 path (`ytdSeries`) should also hide leading months.
12. S12 step 3: "from production" is my decision. Jasmine's Slack says "once the data has locked on the dashboard".
13. More tests: @3 with a Dash failure shows the fallback; the NY/UTC month-end boundary; S4 January and `previous-year`; top-content@3 reads `influencerSection` and passes it to the component.

## Round 2 (2026-10-02, changed lines only): 0 BLOCKER, 0 MAJOR, 6 MINOR
Review closed. These go to the plan with the round 1 minors:
14. @3's previous month is still partial from 00:00 to 04:00 UTC on the 1st, because the Dash windows end at `T04:00:00Z`. Keep "(live)" while `liveDayInProgress` is true, and test the 1st at 02:00 UTC.
15. Define "logs once" for the @3 skip (per render), and test that.
16. A failed read of the prior year's sheet, used for the arrow, logs the same `ytd sheet read failed (tiles)` line with the year. Add it to the failure tests.
17. The staging script validates against `REGISTRIES['organic-social:platform']` and the part ids of the template the environment resolves: the DB row, else the code template.
18. The staging script prints `resolveSection(dbTemplate, newOverride)` and refuses unless the result is exactly the five pins.
19. The staging script keeps every other `dash_social_config` key byte for byte, and refuses if `reportingMonths` is present before or after the write.

## Round 3 (2026-10-02, at my request: the whole spec against the call transcript, my notes, the three screenshots and both Slack threads): 0 BLOCKER, 6 MAJOR, 7 MINOR

### MAJOR
| # | Finding | Outcome |
|---|---|---|
| 1 | Jasmine's 19:17 condition ("If it has influencer posts, I might just have you remove that") was said about both Piper and PIMCO | S2 now quotes it as covering both. Section 4: whether PIMCO's only tab (LinkedIn) shows the section is unverified until a staff session checks; if it does, it comes to me as a decision, and the fix is a data write only |
| 2 | Akara's other tabs could still say "Influencer Posts" | Rebutted: staging read 2026-10-02 shows Akara has only Instagram. S3 says so |
| 3 | @3 uses live Dash for a blank past month, which goes beyond Paul's "live Dash for the current month" | Left to me as an open decision in section 8, recommending keep |
| 4 | The 12:36 Facebook Views paid plus organic question had no row | New S15: no change, the sheet already holds the same Dash metric |
| 5 | The delivery dates were missing | Release step 0: code review today, staging for Whitney on Tuesday 10-06, production ready for Wednesday 10-07 on Jasmine's approval and my go |
| 6 | Nobody who heard "it will not change" (17:14) is told that sheet edits now change a month's Followers and Views | Release step 1a |

### MINOR, for the plan or the SOP
20. 2027: the tracker continues as a backup (10:56), so the SOP says to add no 2027 `ytdSheets` entry unless I decide otherwise.
21. Loop Maddie in before the staging write, not just before production, with the three changes her client will see: approved notes show immediately, the follower graph switches to daily gains, and the YTD block appears.
22. State why Renaissance's Overview gets no annotations: the new clients hide Overview, so there is nothing to copy, and Jasmine asked about the platform graphs.
23. A blank cell means "no data, removed" at 10:32 and "not filled yet" in her Slack. Every client's `firstMonth` is 2026-08 (staging read), so a blank before that is never filled from Dash. The SOP says N/A marks "no data".
24. The S4 quote has been fixed (Jasmine at 09:22 is the authority; 08:57 was my question). Done in the spec.
25. Piper added to the default-outline row S13. Done in the spec.
26. Name the sheet's Total Followers change against Dash's Net New Followers as an accepted mismatch, beside Engagement Rate.
