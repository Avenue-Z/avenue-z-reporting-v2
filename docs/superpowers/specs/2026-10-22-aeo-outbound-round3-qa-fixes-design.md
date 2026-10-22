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
`chartedBrands<T extends { visibilityPct: number; isOwn?: boolean }>(brands: readonly T[]): T[]`, in a new module
`lib/aeo-outbound/charted.ts` with no imports (`charts.ts:6` imports from `metrics.ts`, so it cannot live in
`charts.ts` without a cycle). It is the existing rule moved out of `visibilityBarFigure` (`charts.ts:46-49`)
unchanged and returns the same objects: the first 20 in rank order, sorted by visibility, the top 10, the brand in
place of the tenth when it is not among them. `visibilityBarFigure` calls it. Inside `buildSnapshotData`
(`metrics.ts`), after `brands` is built (`metrics.ts:158`), `chartedIds` is the ids of `chartedBrands(brands)` that
are not the brand, and the gap filter uses it where it uses `keptIds` today (`metrics.ts:267-285`): a charted competitor's roster domain or subdomain, or a COMPETITOR page
that mentions a charted competitor and no tracked competitor off the chart (final review). Every other competitor's
site counts as cut, so the closest-domain rule (#413 D3) keeps working; a domain on both a charted and an off-chart
competitor's roster is the charted one's (final review: it used to stay cut). Everything else about the gaps is unchanged (own wins, mentions the brand, zero chats, top 4, no
competitors tracked). The Data block's gap line reads the same list, so Glean sees only charted competitors' sites.

**F2. No peer cluster wider than 10 points.** `peerCluster()` (`sentences.ts:334-345`) returns null when the range
(the existing `x`) is above 10.0 points (`PEER_CLUSTER_MAX_POINTS = 10`). The Competitive Visibility box then has
Next-tier gap, Top-tier distance and the gaps bullet, still 1 to 4 bullets. PocketGuard's 7.8 keeps its bullet; a
range of exactly 10.0 keeps it; 0 keeps "sits at the same visibility as".

**F3. Pillar lines round like the source-mix bullet.** `pillarLines()` formats its shares with `mixPctAll` instead of
`sharePctAll`, each share on its own: whole numbers from 1% rounding the exact share, one decimal below 1%, and "under
0.1%" for a share that stores as 0.0 (unchanged). No tie rule across the three lines: on the dev click-through, A Place
for Mom's Editorial (2.6) and own site (3.3) both round to 3%, and the tie rule turned them into "2.6%" beside the
donut's "3%". The pillars are three separate facts, not a ranking, so they read as their donut slices do; this
replaces the single rounding pass of the pillars spec §9 m1. So A Place for Mom's lines
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
| 10 or fewer brands with data | Every competitor with a Peec row is charted; gaps as before, except a competitor with no Peec row (next row) |
| A competitor with no Peec row | Not charted (no bar), so its sites are no longer gaps (today `keptIds` includes it, `metrics.ts:154`) |
| A competitor named in a bullet but not charted (the brand ranks 11th or lower, so Next-tier gap or Peer cluster names a neighbour off the chart; or a no-data brand in the context) | Its sites are not gaps, on purpose: the list follows the chart |
| Competitors tied at the 10th bar | The chart and the gaps agree, because both use `chartedBrands` on the same ordered list |
| `rankAmong` set | The chart is drawn from the compared brands, so charted is a subset of compared |
| Cut parent, charted subdomain (and reverse) | The closest roster domain decides (#413 D3) |
| One domain on a charted and an off-chart competitor's roster | A gap: the charted competitor's site |
| A COMPETITOR page off every roster whose domain spells a tracked competitor's name (ynab.com: YNAB) | That competitor's site: a gap when it is charted, whatever else the page mentions; never when it is off the chart (adversarial review, I1) |
| A COMPETITOR page off every roster that names no competitor and mentions a charted and an off-chart competitor | Not a gap (it may be the off-chart competitor's page); an untracked id in the mentions does not count |
| Editorial or UGC absent from the mix (source-mix bullet) | No clause for it, never "accounts for 0.0%"; one stored as 0.0 reads "under 0.1%" (adversarial review, M3; a dev defect from #417) |
| Peer range 10.0 / 10.1 | Kept / dropped |
| Brand first or last | Its two neighbours on one side, same width rule |
| Pillar share 0.4% / 1.0% / 2.4% / 2.6% beside 3.3% | "0.4%" / "1%" / "2%" / "3%" and "3%", as the donut reads them |
| The Editorial pillar beside the source-mix bullet | Usually the same reading. They can still differ: the pillar's Editorial excludes the brand's own rows (`ownMixByType`), and the source-mix sentence keeps its own tie rule (`sentences.ts:286`) |

## 5. Tests (written first)

- `charts.test.ts`: `chartedBrands` returns exactly what `visibilityBarFigure` draws (names and order), including the
  brand outside the top 10.
- `metrics.test.ts`: an 11th-ranked competitor's own site is not a gap; a charted one's is; a cut parent with a
  charted subdomain; the PocketGuard shape (18 brands, gaps from charted competitors only).
- `sentences.test.ts`: peer cluster at 7.8 kept, 10.0 kept, 10.1 dropped, 96.4 dropped (the A Place for Mom shape);
  pillar lines at 2.4, 3.2, 0.6, 4.1 read 2%, 3%, 0.6%, 4%, and 2.6 beside 3.3 read 3% and 3%; Ryan's PocketGuard
  sentences unchanged.
- `metrics.test.ts`: a no-row competitor's site is no longer a gap; competitors tied at the 10th bar give the same set
  to the chart and the gaps.
- Existing tests whose expected output changes on purpose: the 20.0 and 30.0-point peer clusters
  (`sentences.test.ts:380`, `:385`, `:390`, `:405`) are dropped, and the pillar lines that read "4.0%", "5.0%" and
  "6.0%" (`:265`, `:272`, `:282`) read whole numbers.
- The full suite, the type check and the RSC check.

## 6. After merge

Promote `dev` to `staging`, then rerun QA checks CV4, X1 and O5 on fresh reports (PocketGuard 2026-10-19 and A Place
for Mom), and record them in the QA doc.
