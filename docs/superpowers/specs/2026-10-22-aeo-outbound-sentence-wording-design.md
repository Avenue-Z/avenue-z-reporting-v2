# AEO Outbound: sentence wording that broke on real projects

**Date:** 2026-10-22. **Branch:** `fix/aeo-outbound-sentence-wording` off `dev` at `25d99335`.
**Source:** a read-only sweep of every Peec pitch project (61) through the same steps generation runs before Glean
(pull, `buildSnapshotData`, `dataSentences`, `groundingFlags`, the bar chart, the page render), then a fresh agent's read
of its output. 59 of 61 passed every check; the other two have no Peec data and get the `no_data` message
(`pull.ts:97`). Four wording problems showed up in sentences a prospect would read. My call: fix all four.

## The four changes

| # | Seen on | Was | Now | Where |
|---|---|---|---|---|
| W1 | Abbvie | "emsculpt.me at 1 retrievals" | "at 1 retrieval"; the methodology's "1 prompt tracked" the same way | `sentences.ts` gapsBullet, methodology |
| W2 | Moonfare, Angi | "within a 8.7-point range" | "within an 8.7-point range": "an" before a number said with a vowel sound (8, 11, 18, 80 to 89) | `sentences.ts` peerCluster, `article` |
| W3 | The Mad Hatter | "alongside Banded and Lost Hat Co.." | One period: every sentence `write()` returns passes through `tidy`, which drops a second period after a name that ends in one | `sentences.ts` `tidy` |
| W4 | SDEV | " Stablecoin Development 's own site" | Peec names are trimmed where they enter (roster and brands report), so every sentence, the chart and grounding read the same name | `pull.ts` pullSnapshot |

**Not changed (my call):** "Crocs's" (Chicago style), "above the top-three average" when the prospect ranks in the top
three (true as written), the source-mix decimals that keep close values apart, the Competitor pillar on a project with no
tracked competitors (Peec's own label, as the donut shows), the peer cluster's 10-point rule (kept, 2026-10-22).

## Versions and older rows

`SENTENCES_VERSION` stays 3, as in #420 and #422 (the tool is not on `main`). No number changes, so grounding's allowed
numbers are unchanged. Older rows keep their stored names and text; W4 applies at the next pull only.

## Tests (written first, each watched fail)

- `sentences.test.ts`: a single retrieval and a single prompt read singular; 8.7 reads "an", 7.0 reads "a"; a name
  ending in a period ends the peer cluster and the context with one period, and no sentence anywhere has two.
- `pull.test.ts`: names padded with spaces in the roster and the brands report come back trimmed.
- The sweep rerun on the fixed code: the four problems are gone on the projects that showed them, 59 of 61 still pass,
  and on four projects whose source mix moved between runs, the old and new code give identical output back to back
  (Peec's data moved, not the code).
