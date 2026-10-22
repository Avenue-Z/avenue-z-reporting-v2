# Review log: the findings bullets on each page

**Round 1** (whole spec, fixed checklist, 2026-10-22): 2 BLOCKER, 5 MAJOR, 6 MINOR. All fixed by targeted edits:
- BLOCKER 1: older drafts would gain flags once today's bullets stop supplying their numbers. B3 keeps the version 2
  writer for older rows' allowed numbers; §6 tests it on a fixture where it would fail.
- BLOCKER 2: "8.0%" against Ryan's "8%". D5: whole percents in the mix sentence from 1%.
- MAJOR: "Pocketguard.com" (D6); competitors with no data (B2, §5); off-chart neighbours (B2, §5); the average as a
  number (D3); a lowercase sentence start (B1, §5).
- MINOR: pyRound ties, peer ties and zero range, leads and removals listed, §2 wording, one own site measured, test
  list. Fixed in place.

**Round 2** (changed lines only): round 1 fixed in substance. 2 MAJOR, 9 MINOR. **Not applied: a round-2 MAJOR comes to
me as a decision.**
- MAJOR 1: B3 hard-codes "below 3", but §7 lets this PR's version be 4 if #415 merges first; rows made at #415's 3 would
  then gain flags. Proposed: "a row whose numeric `sentences` is below this PR's `SENTENCES_VERSION` also allows the
  numbers of the box writers as they stand on `dev` before this PR".
- MAJOR 2: D6 casing applies to the volume bullet only; with two own sites the rate bullet would print the same domain
  as "Pocketguard.com". Proposed: one domain formatter for every sentence that prints an own domain, and a test.
- MINORs (carried to the plan): name the frozen writer (`boxesV2`) with frozen copies of its helpers; rows with no or
  `sentences: 1`; D6 only for a capitalised brand and the label left of the public suffix, tests for www, subdomain,
  multi-word, no match and a lowercase brand; D5 decided on the stored pct with the 100 guard; the average in integer
  tenths; B2 intro excepts D3; `ownSiteRank` read by the version 2 writer; two citations; the rename note counting a
  domain that now carries the brand's casing.
