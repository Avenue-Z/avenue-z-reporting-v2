# Review log: Competitive Visibility before Cited Sources

#411 (the Opportunities toggle) was later combined with the pillars into #415; read #411 below as #415.

**Round 1** (whole spec, fixed checklist, 2026-10-21): 2 MAJOR, 8 MINOR.
- MAJOR 1: #411 appends the Opportunities link to the `#competitive-visibility` menu line, so moving that line would put
  04 between 02 and 03. Fixed in `b738ee45` (O1, §5, §7).
- MAJOR 2: no test proved a slot edit keeps `section_order`. Fixed in `b738ee45` (§6 `slots.test.ts` row).
- Minors: citation corrections applied in `b738ee45`; the rest carried to the plan (§8).

**Round 2** (changed lines only): MAJOR 2 confirmed fixed. 1 MAJOR, 3 MINOR.
- MAJOR: the MAJOR 1 pin tests a marker row with the Opportunities page hidden, where `oppsNav` is empty, so it passes
  even if the link stays on the wrong line. The breaking case is marker plus page shown. Proposed fix: §5 and §6 require
  a marker-row test of the full menu sequence with the page shown (01, 02 `#competitive-visibility`, 03
  `#category-data`, 04 `#opportunities`, 05 `#methodology`) and hidden (04 Methodology right after 03), in whichever
  of this PR and #411 merges second. **Not applied: a round-2 MAJOR comes to me as a decision.**
- Minors (citation and wording corrections): applied.

**My decision (2026-10-21):** apply the round-2 MAJOR fix. §5 and §6 now require the full menu sequence on a marker
row, page shown in this PR, page hidden in whichever of this PR and #411 merges second.
