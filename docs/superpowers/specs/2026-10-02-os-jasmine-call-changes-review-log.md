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
