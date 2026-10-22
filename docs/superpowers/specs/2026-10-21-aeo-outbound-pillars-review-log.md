# Review log: AEO Outbound pillars spec (2026-10-21)

Spec: `2026-10-21-aeo-outbound-pillars-design.md`. Two rounds, fresh subagents given only the goal and the spec.

## Round 1 (whole spec, `9fcf23fd`)

5 MAJOR, 8 MINOR, no BLOCKER. Fixed in `9f2f90aa`:
- M1: no `SENTENCES_VERSION` bump; the marker tells pillar rows apart, and a bump would switch off the word-for-word
  check on every version-2 draft in flight.
- M2: the Content line follows Peec's classification, as the donut does (stated; reopened in round 2).
- M3: wording is "of the domain mix in this window", the number being a usage-weighted share, not a count of sources.
- M4: every grounding change keyed on the marker; `isCodeSentencePath` unchanged.
- M5: the `opportunities` key removed from `GLEAN_SLOTS`, so a malformed one can't fail a reply.
MINORs in §9 of the spec.

## Round 2 (changed lines only, `9f2f90aa`)

1 MAJOR, 6 MINOR. The MAJOR (the Content line can deny an own site the first findings box shows) is not iterated on:
it goes to Thomas as decision D3. MINORs in §10.
