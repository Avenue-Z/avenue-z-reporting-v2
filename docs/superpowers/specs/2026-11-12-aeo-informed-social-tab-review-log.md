# AEO Informed Social tab spec: review log

Spec: `2026-11-12-aeo-informed-social-tab-design.md`. Two rounds, fresh reviewer, fixed checklist. No round 3.

## Round 1 (whole spec)

4 blockers (B1 calendar MoM against the gate, B2 as-of in the in-progress month, B3 citation rate above 100%, B4 project
id reaching the browser) and 9 majors (M5 to M13). All fixed by targeted edits in b6bc539e.

## Round 2 (changed lines of b6bc539e)

Round 1 items: B1, B2, B3 resolved. B4 and M11 not resolved, M5 partial (fixed below). M6 to M10, M12, M13 resolved.

Blocker and majors, each with one fix and no choice, fixed by targeted edits in the commit that adds this log:

1. Cache key ignored `minCompetitors`: the key is now project, selector, windows, min and `fourthGraph`.
2. The tab boolean reached only the trimmed records: `hasAeoInformedTab` reads the boolean when present, else computes
   it from a full row, so every full-row caller (cited in the spec) agrees with the trimmed records.
3. "The project id never reaches the browser" was false for the staff sidebar: the claim is now limited to client-facing
   records. Trimming the staff sidebar is the open PR #250 follow-up, outside Organic Social, so not in this PR.
4. `fourthGraph` had no build path and no color for YouTube or Reddit: limited to Instagram and TikTok (the adapter
   platforms with an existing line color that are not graph 3), with the adapter change listed. This follows the
   continuity rule for colors: no new colors are invented.
5. Removing `pdf_columns_cropped` overstated proof: "Total" is `derived`, and the rule stays for the change columns.
6. The min control had no request path: `aeomin` in the URL, carried by the export like `models`, only the default warmed.

Minors, for the plan to handle (no further review round):

7. "Cached hourly" (section 2) against "finished months 6 hours" (section 4): say "cached up to 6 hours".
8. "Ends on ... the team's in-progress day" (section 2): say the window end is also clamped to the as-of day.
9. The Totals computation paragraph: moved back under Totals in round 2's edit (done).
10. Label the change basis (previous window of the same length) in the tile and table tooltips; R5 still says "MoM".
11. Cite the export plumbing for `aeo` too (`lib/export/request.ts:6-63`, `lib/export/bulk.ts:34-37`), same as `aeomin`.
12. Deep-link routes resolve with subsection null, so they never land on this tab: say "kept in parity" for their titles.
13. "One warning" is one per render: reworded in section 1 (done); the edge table still says "one warning".
14. The warmer covers only the newest month a client is served: a staff export of the in-progress month, or YTD of an
    older month, is always cold. Say so in the edge table.
15. Tests to add: malformed setting gives no tab and a warning; `view.no-chats` copy; the locked-month line; the export's
    30 second deadline gives the error card; "Your channels" tiles ignore the table switch; cache key varies with min
    (now in the test list).
