# Review log: AEO Outbound Opportunities toggle spec (2026-10-21)

Spec: `2026-10-21-aeo-outbound-opps-toggle-design.md`. Two rounds, fresh subagents given only the goal and the spec.

## Round 1 (whole spec, `f99bc7f8`)

4 MAJOR, 7 MINOR, no BLOCKER. Every §2 citation held. MAJORs fixed in `d4fa4c7a`:
- M1: a toolbar click could overtake an unsaved frame edit, and a refused opportunity cell survived a hide. The button
  is now disabled exactly when Approve is for saving (`busySaving || busy`).
- M2: the two-tabs row was wrong (409, not 200).
- M3: the button state is re-seeded from newer props like notes and titles.
- M4: the structural-path labels could never be shown; S6 removed.
MINORs listed in §9 of the spec.

## Round 2 (changed lines only, `d4fa4c7a`)

No BLOCKER, no MAJOR. Six MINORs listed in §10 of the spec; r2-1 is marked must-do for the plan.
