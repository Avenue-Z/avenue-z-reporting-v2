# Review log: notes on the YTD graphs, for every client

Spec: `2026-10-06-os-ytd-notes-design.md`. Fixed checklist: scope against the request; inputs and outputs; every
citation opened and checked; parity with today (daily notes, hides, the actions, the existing YTD tests and their log
assertions); every caller; security and permissions; failure behaviour; edge cases; a test for every output. At most
two rounds; round 2 reviews only the changed lines.

## Round 1 (fresh reviewer, read only, 2026-10-06)
No BLOCKER. Every section 2 citation checked and correct. No exposure found: drafts and editor fields reach only
editors, clients get approved text for the block's months only, hides refuse YTD charts, nothing outside Organic Social
changes. Baseline tests pass.

| # | Sev | Finding | Outcome |
|---|---|---|---|
| N1 | MAJOR | Section 2 left out the daily graphs' card (opens from the dot, holds the pictures and the buttons); the YTD design had no card and did not say why. | Fixed: section 2 describes the card; section 3 states "no card on the YTD graphs" as a decision, with its reason (no pictures on a YTD note, so a card would repeat the hover box; drafts have no dot, so editors' buttons go in the panel). |
| N2 | MAJOR | Dropping the first-month rule left YTD notes unbounded, and the malformed-config refusal was unspecified. | Fixed: the parse and the refusal stay for every chart; a locked client's YTD note may not be before January 1 of its first reporting year; tests added. |
| N3 | MAJOR | Two edge rows held only after PR #322; test 7 could pass on one side of #322 and fail on the other. | Fixed: rows reworded to hold either way; test 7 asserts only on a finished month; the suite runs on each merged combination before review. |
| N4 | MAJOR | `NoteActions`' input, what Edit opens, the line after a save and the existing-note warning were undefined. | Fixed: all defined in section 3. |
| N5 | MINOR | `notes={{}}` would change a v2 graph's Tooltip content. | Fixed: props passed only when non-empty; test 6. |
| N6 | MINOR | The panel could need a router in the existing client-role v2 tests. | Fixed: no panel when nothing to show; router only in editor parts; test 10. |
| N7 | MINOR | The failure log line was not exact. | Fixed: exact string, no error message, no note text. |
| N8 | MINOR | Where the viewer's rights come from. | Fixed: `noteCapabilities(ctx.role, ctx.email ?? null)`. |
| N9 | MINOR | The hides/notes parity test stops being true by design. | Fixed: renamed, YTD cases added; `checkNoteKey` reuses the shared checks. |
| N10 | MINOR | Empty-graph cases missing. | Fixed: two rows. |
| N11 | MINOR | No test that the daily graphs never show a YTD row. | Fixed: test 9. |
| N12 | MINOR | The revoke cast, the schema comment, the unneeded `NoteControls` widening, "day" in messages. | Fixed: listed in section 8; widening dropped. |
