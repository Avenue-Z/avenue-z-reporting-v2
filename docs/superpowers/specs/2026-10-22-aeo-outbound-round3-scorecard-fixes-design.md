# AEO Outbound round 3: fixes from the blind scorecard

**Date:** 2026-10-22. **Branch:** `fix/aeo-outbound-round3-scorecard` off `dev` at `bb0f48a8`.
**Source:** a fresh agent wrote a scorecard from Ryan's Slack thread and the pillars slide only
(`docs/qa/2026-10-22-aeo-outbound-round3-ryan-scorecard.md`); a second fresh agent ran it on staging `3f82cd20`
(`...-scorecard-results.md`, both on `docs/aeo-outbound-round3-staging-qa`): 63 of 73 must-pass. My calls, approved:
fix these five; the other failures read the scorecard stricter than Ryan wrote (results file, triage).

## 1. The five changes

**S1. The bar chart redraws when its card changes size (editor).** In the editor the report sits in a frame that is
still settling when the chart draws, so the chart keeps its first width: on staging at 1440 its labels were cut
("onarch Money", "eed A Budget") and the longest bar ran past the card. Measured: a chart drawn at 502 px stayed 502 px
in a 342 px card until a window resize event, then fit. The preview and the shared page load at their final width, so
they were clean. `PAGE_JS` (`render.ts`) watches each chart's container with a `ResizeObserver` and, when a container's
width changes, fires one window `resize` event, which Plotly (`responsive: true`, `charts.ts:19`) and the legend check
already answer. A width that did not change fires nothing, so no loop.

**S2. Citation volume prints the exact count.** Ryan's template is "[Brand domain] appears in [X] retrieved
citations." Today 1,000 and above read "approximately 1.4K". The count is now the whole number with thousands
separators ("1,412"), never "approximately". `sentences.ts` citedSourcesBox.

**S3. Peer cluster: the two brands closest in visibility.** Today the peers are the brand just above and just below;
on A Place for Mom that made a 96.4-point range and the bullet was dropped, though Caring (2.2) and Petunia (0.0) sit
within 3.1 points of the brand (3.1). The peers are now the two of the up to two brands above and two below that are
closest in visibility to the brand (ties go to the higher-ranked), named in rank order. The 10-point rule and the
"same visibility" wording stay. PocketGuard: You Need A Budget (2.4 away) and Quicken (5.4), unchanged.

**S4. Top-tier distance uses the top N brands, the prospect included.** Ryan's template: "below the average
visibility of the top [N] brands". Today the average is over competitors only (bullets spec D3, reversed here). It is
now over the first three brands of the ranking, the prospect included when it is among them, so A Place for Mom
(Care 98.6, the brand 3.1, Caring 2.2) reads "top-three average visibility of 34.6%". With fewer than three brands
with data the bullet is left out, so the average is never just the prospect and one rival (the old rule printed a
"top-two" average over two competitors). PocketGuard (6th) is unchanged.

**S5. Source-type mix keeps both Editorial and UGC** when neither is in the top two (A Place for Mom names four types).
Not changed, my call: the earned pillar leans on Editorial. Recorded so it is not re-raised.

`SENTENCES_VERSION` stays 3, for the same reason as #420 (the tool is not on `main`).

## 2. Edge cases

| Case | Expected |
|---|---|
| Brand first or last | Candidates from one side only; the two closest |
| Three candidates equally close | The higher-ranked first |
| Fewer than two other brands with data | No peer cluster, as today |
| Brand in the top three | Included in the average; "above" when it is above it |
| Count 999 / 1000 / 1,412,345 | "999" / "1,000" / "1,412,345" |
| A container that never changes width | No resize event |

## 3. Tests (written first)

- `sentences.test.ts`: exact counts at 999, 1,000, 1,412; peers by closeness on the A Place for Mom shape (Caring and
  Petunia, 3.1 points) and PocketGuard unchanged; the top-three average with the brand inside the top three.
- `render.frame.test.ts`: a container width change fires one window resize; an unchanged width fires none.
- Existing expectations that change on purpose: the top-two and top-three averages where the brand ranks in the top
  three, and the "approximately" own-site test lines that use the new box.
