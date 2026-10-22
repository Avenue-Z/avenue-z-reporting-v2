# AEO Outbound round 3: fixes from the staging QA

**Date:** 2026-10-22. **Branch:** `fix/aeo-outbound-round3-qa` off `dev` at `275e7f26`.
**Source:** the staging QA of round 3 (`docs/qa/2026-10-22-aeo-outbound-round3-staging-qa.md`, findings 1 to 3, on
branch `docs/aeo-outbound-round3-staging-qa`). Each fix is my decision; nothing here goes back to Ryan.

## 1. What QA found (staging `326e9f56`, live Peec data)

1. **Gap domains for competitors the page never shows.** PocketGuard, 2026-10-19: the report compares 18 brands, the
   bar chart shows 10 (`charts.ts:46-49`: the top 10 by visibility, the brand always in), and the gaps list
   "ynab.com at 488 retrievals, monarchmoney.com at 213, copilot.money at 102, and actualbudget.org at 73". Copilot and
   Actual Budget rank 11th or lower, so they are not on the chart and not named anywhere else on the page. Ryan's
   complaint was "some of the domains listed were not competitors mentioned".
2. **A peer cluster 96.4 points wide.** A Place for Mom, 2026-10-15 to 2026-10-21: "A Place for Mom sits within a
   96.4-point visibility range alongside Care and Caring" (Care 98.6, A Place for Mom 3.1, Caring 2.2). Accurate to
   Ryan's template, not a cluster.
3. **One number rounded two ways.** The pillar lines format shares with `sharePctAll` (`sentences.ts:381`): one decimal
   under 10%. The donut (`sliceLabel`, `charts.ts:84`) and the source-mix bullet (`mixPctAll`, bullets spec D5) print
   whole numbers from 1%. A Place for Mom shows Editorial as "2%" in the bullet and the donut and "2.4%" in the pillar;
   PocketGuard shows You "4%" on the donut and "4.1%" in the pillar.

## 2. The changes

**F1. Gaps list only competitors the chart shows.** One function decides the charted brands and both callers use it:
`chartedBrands(brands)` in `charts.ts`, the existing rule moved out of `visibilityBarFigure` unchanged (the first 20
by rank order, sorted by visibility, the top 10, the brand in place of the tenth when it is not among them).
`buildSnapshotData` (`metrics.ts`) takes the charted competitors' ids (`chartedIds`) and uses them where the gap filter
uses `keptIds` today (`metrics.ts:267-285`): a charted competitor's roster domain or subdomain, or a COMPETITOR page
that mentions a charted competitor. Every other competitor's site counts as cut, so the closest-domain rule (#413 D3)
keeps working. Everything else about the gaps is unchanged (own wins, mentions the brand, zero chats, top 4, no
competitors tracked). The Data block's gap line reads the same list, so Glean sees only charted competitors' sites.

**F2. No peer cluster wider than 10 points.** `peerCluster()` (`sentences.ts:334-345`) returns null when the range
(the existing `x`) is above 10.0 points (`PEER_CLUSTER_MAX_POINTS = 10`). The Competitive Visibility box then has
Next-tier gap, Top-tier distance and the gaps bullet, still 1 to 4 bullets. PocketGuard's 7.8 keeps its bullet; a
range of exactly 10.0 keeps it; 0 keeps "sits at the same visibility as".

**F3. Pillar lines round like the source-mix bullet.** `pillarLines()` formats its shares with `mixPctAll` instead of
`sharePctAll`: whole numbers from 1% rounding the exact share, one decimal below 1%, one decimal where two different
values would read the same, and "under 0.1%" for a share that stores as 0.0 (unchanged). So A Place for Mom's lines
read 2%, 3% and 0.6%, and PocketGuard's Content line reads 4%.

**Not changed:** the donut, every other sentence, the chart itself, stored contracts, the Settings form, the prompt.

## 3. Versions and older rows

`SENTENCES_VERSION` stays 3. The AEO Outbound tool is not on `main` (verified: `lib/aeo-outbound/` does not exist on
`origin/main` at `17aa47db`), so version-3 rows and pillar rows exist only as test data on staging and the dev
database. Cost, accepted: a version-3 test draft made before this fix that is edited after it can show a flag on its
stored peer cluster or pillar line (for example "96.4" on `7c7bb284`). New rows are unaffected. F1 changes stored data
only at generation, so older rows keep their stored gaps.

## 4. Edge cases

| Case | Expected |
|---|---|
| Brand outside the top 10 | It takes the tenth bar; the nine charted competitors give the gaps |
| 10 or fewer brands with data | Every competitor is charted; gaps as before |
| A competitor with no Peec row | Not charted (no bar), so its sites are not gaps |
| `rankAmong` set | The chart is drawn from the compared brands, so charted is a subset of compared |
| Cut parent, charted subdomain (and reverse) | The closest roster domain decides (#413 D3) |
| Peer range 10.0 / 10.1 | Kept / dropped |
| Brand first or last | Its two neighbours on one side, same width rule |
| Pillar share 0.4% / 1.0% / 2.4% / 19.4% and 19.6% | "0.4%" / "1%" / "2%" / two different values never read alike |

## 5. Tests (written first)

- `charts.test.ts`: `chartedBrands` returns exactly what `visibilityBarFigure` draws (names and order), including the
  brand outside the top 10.
- `metrics.test.ts`: an 11th-ranked competitor's own site is not a gap; a charted one's is; a cut parent with a
  charted subdomain; the PocketGuard shape (18 brands, gaps from charted competitors only).
- `sentences.test.ts`: peer cluster at 7.8 kept, 10.0 kept, 10.1 dropped, 96.4 dropped (the A Place for Mom shape);
  pillar lines at 2.4, 3.2, 0.6, 4.1 read 2%, 3%, 0.6%, 4%; Ryan's PocketGuard sentences unchanged.
- The full suite, the type check and the RSC check.

## 6. After merge

Promote `dev` to `staging`, then rerun QA checks CV4, X1 and O5 on fresh reports (PocketGuard 2026-10-19 and A Place
for Mom), and record them in the QA doc.
