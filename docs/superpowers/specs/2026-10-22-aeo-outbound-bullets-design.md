# AEO Outbound: the findings bullets on each page (design)

Status: draft for review, 2026-10-22. Code cited at dev `049352a8`, read this session.

## 1. What Ryan asked (round 3, his answer to my question on how the bullets on each page should read)

Cited Sources page:

1. CITATION VOLUME. "[Brand domain] appears in [X] retrieved citations." PocketGuard: "PocketGuard.com appears in 678
   retrieved citations."
2. CITATION RATE. "[Brand] is cited in [X]% of tracked answers." PocketGuard: "PocketGuard is cited in 12% of tracked
   answers."
3. SOURCE-TYPE MIX. "[X]% of citations come from [Source Type], followed by [Source Type] at [Y]%; [Source Type]
   accounts for [Z]%." PocketGuard: "Corporate sources account for 37% of citations, followed by Editorial sources at
   19%; UGC accounts for 8%."

"And something like this for Competitive Visibility page":

1. NEXT-TIER GAP. "[Brand] is [X] percentage points behind [next-higher brand] in visibility." PocketGuard: "PocketGuard
   is 5.4 percentage points behind Quicken in visibility."
2. TOP-TIER DISTANCE. "[Brand] is [X] percentage points below the average visibility of the top [N] brands."
   PocketGuard: "PocketGuard is 20.5 percentage points below the top-three average visibility of 53.8%."
3. PEER CLUSTER. "[Brand] sits within a [X]-point visibility range alongside [Peer 1] and [Peer 2]." PocketGuard:
   "PocketGuard sits within a 7.8-point visibility range alongside Quicken and You Need A Budget."

## 2. How it works today

`dataSentences` (`sentences.ts:75`) writes both boxes from a row's data. The box beside the Domain Types donut (the
Cited Sources page) is `competitive_bullets` (`firstBox`, `sentences.ts:133-158`): a category position bullet, an own-site
bullet ("Present in the source ecosystem" or "Own-site retrievals", from `d.ownSites[0].retrievedChats`) and "Source-use
signal" (from `retrievedPct`). The box beside the bars (the Competitive Visibility page) is `sources_bullets` (`secondBox`,
`sentences.ts:191-225`): "Leadership gap" or "Leadership position" (`leadership()`, `:169-189`), "Competitor domain gaps"
(`:195-198`) and the source mix (`:199-223`), whose extras are Editorial and UGC when outside the top two (`:207`).
Percents use `pctText` (`:13-17`: whole from 10 up, one decimal below) and, for source shares, `sharePctAll` (`:65-73`).
Labels print uppercase (`render.ts` PAGE_CSS, `.insight-box li strong{...text-transform:uppercase}`).

`SENTENCES_VERSION` is 2 (`config.ts:36`). A row stores the version it was written with (`metrics.ts:295`). Grounding
checks an edited code sentence against today's sentence (its numbers, rank words and count words, `grounding.ts:216-239`)
only on a row of today's version (`grounding.ts:151`); on an older row every number in it must be in the Data block or in
today's sentences (`grounding.ts:148-156`, `:241`).

## 3. Measured (2026-10-22, read only, PocketGuard `or_6cfa5d3c`, data for 2026-10-19 only)

| Ryan's figure | Value in Peec | Field |
|---|---|---|
| 678 retrieved citations | `retrieved_chat_count` 678 on pocketguard.com, its one own site | `d.ownSites[0].retrievedChats`, today's own-site bullet |
| 12% of tracked answers | `retrieved_percentage` 0.1176 | `retrievedPct` 11.8, `pctText` 12% |
| Corporate 37%, Editorial 19%, UGC 8% | usage shares 36.7, 18.8, 8.0 (Competitor 17.1 is third) | `d.sourceMix`; UGC is today's extra, not the third type |
| 5.4 behind Quicken | Quicken 38.7, PocketGuard 33.3 | the brand just above |
| 20.5 below 53.8% | YNAB 57.5, Monarch 52.8, Monarch Money 51.2; mean 53.83 | the three highest competitors |
| 7.8-point range with Quicken and You Need A Budget | 38.7 and 30.9 | the brands just above and just below |

Every figure is already in `SnapshotData`; no new Peec call and no new stored field.

## 4. The changes

**B1. The Cited Sources box** (`competitive_bullets`), in Ryan's order:
- **Citation volume:** "{Domain} appears in {count} retrieved citations." `{Domain}` is `d.ownSites[0].domain` printed by
  the own-domain rule (D6): without `www.`; when the brand is one word that starts with a capital and the domain's first
  label equals it ignoring case, that label takes the brand's casing ("PocketGuard.com"); otherwise the first letter is
  capitalised as today (`capital`, `:46`), so "bunq" gives "Bunq.com", "blog.pocketguard.com" gives
  "Blog.pocketguard.com" and "Monarch Money" with "monarchmoney.com" gives "Monarchmoney.com";
  `{count}` is `countText`, with "approximately " from 1,000, as today. With no own site retrieved: "{Brand}'s own site
  does not appear in any retrieved citations in this window."
- **Citation rate:** "{Subject} is cited in {pct} of tracked answers." `{Subject}` is the brand when it has one own site,
  else the domain by the same own-domain rule (D6), so both bullets print it the same way (today's subject rule,
  `:153-154`); `{pct}` is `pctText(retrievedPct)`. Left out when no own site is retrieved
  or `retrievedPct` is null.
- **Source-type mix:** "{T1} sources account for {p1} of citations, followed by {T2} sources at {p2}; {E} accounts for
  {pe}." The two largest types, then the extras exactly as today (Editorial and UGC when outside the top two): one extra
  "; UGC accounts for 8%", two "; Editorial accounts for 6% and UGC for 3%", none no tail. Percents (decision D5):
  the stored one-decimal pct decides, as in `sharePctAll` (`:65-73`): below 1.0 it prints with one decimal; from 1.0 it
  prints whole, rounding the exact share (weight over total) as the donut does; a whole number that would read 100 for a
  pct under 100 prints with one decimal; and where two values that differ would read the same, both keep one decimal
  (today's collision rule). Edge lines: no types "Peec reported no source types for this window."; one type "All citations come
  from {T} sources."; every other type at 0.0% "Almost all citations come from {T} sources." `{T1}` starts the sentence
  with a capital ("Own-site sources ..."; `label()` gives "own-site", `:243`). The label is always "Source-type mix:" (the
  "Limited editorial and UGC presence" variant goes).

The leads, verbatim: "Citation volume:", "Citation rate:", "Source-type mix:", "Next-tier gap:", "Top-tier distance:",
"Peer cluster:", "Competitor domain gaps:", "AI visibility:". Gone: "Category position:", "Strong category position:",
"Present in the source ecosystem:", "Own-site retrievals:", "Source-use signal:", "Leadership gap:", "Leadership
position:", "Source mix:", "Limited editorial and UGC presence:". `ownSiteRank` is then read only by the version 2
writer (B3) and the stored contract (`contracts.ts:161`); it stays stored.

**B2. The Competitive Visibility box** (`sources_bullets`), in Ryan's order, using the displayed one-decimal visibility
and `tenths` for every difference, as today, so every gap except the top-tier distance (D3) is the difference of two
visibilities Peec reported, each to one decimal. "Competitors" are the other brands with Peec data (`d.brands`, not `noDataBrands`). The chart draws the top
nine and the brand (`charts.ts:45-48`), so for a brand ranked below tenth the next-tier brand and the peers can be off
the chart; their visibilities are still Peec's, and the sentence follows Ryan's template, which names no value for them:
- **Next-tier gap:** the brands at the lowest visibility above the brand. "{Brand} is {x} percentage points behind
  {names} in visibility." When the brand is first alone: "{Brand} is {x} percentage points ahead of {names} in
  visibility." (the brands at the highest visibility below it). Level at the top: "{Brand} is level with {names} at the
  top in visibility." Every brand at zero: "No brand tracked shows visibility in this window."
- **Top-tier distance:** the three competitors with the highest visibility (the brand itself never counts), their
  average computed in whole tenths (the sum of each displayed value times 10, divided by the count, rounded half up)
  and printed to one decimal as Ryan does, and `x = tenths(average, own)`, so the distance is the difference of the two numbers printed in the sentence (decision
  D3). "{Brand} is {x} percentage points below the top-three average visibility of {avg}." Above it: "above"; equal: "{Brand} matches the top-three
  average visibility of {avg}." With two competitors: "top-two"; with one: left out.
- **Peer cluster:** the competitors just above and just below the brand in rank order; when the brand is first, the two
  below it; when last, the two above it. "{Brand} sits within a {x}-point visibility range alongside {P1} and {P2}."
  (P1 the higher). Each peer is one brand, the nearest in the stored rank order (visibility, then id, `metrics.ts:143`).
  `{x}` is the highest of the three minus the lowest; at 0.0: "{Brand} sits at the same visibility as {P1} and {P2}."
  With one competitor: left out.
- **Competitor domain gaps:** unchanged, fourth (decision D1).

With no competitors tracked, the box holds one bullet, "AI visibility: {Brand} appears in {pct} of tracked answers.",
today's solo bullet (`:135`) moved here. With competitors tracked but none with Peec data: "AI visibility: {Brand} appears
in {pct} of tracked answers; no other brand tracked has Peec data in this window.", then the gaps bullet if any. So the
box is never empty: `validateGeneratedSlots` refuses an empty code box (`slots.ts:174`) and `STORED_SLOTS` needs 1 to 6
(`contracts.ts:171`); this PR writes at most 4.

**B3. `SENTENCES_VERSION` becomes 3** (`config.ts:36`), as its rule requires for a wording change. A row made before
keeps its stored bullets, which grounding checks by the allowed-numbers rule (§2). Today's bullets would no longer supply
the numbers only they print (the brand's own visibility and share of voice as whole percents, leader gaps beyond the five
the Data block lists, share-of-voice gaps), so an older row would gain flags. To stop that, today's two box writers move unchanged into an exported
function, `boxesV2(d)` in `sentences.ts`, which keeps today's helpers (`sharePctAll`, `capital`, `label`, `pctAll`); D5
and D6 are new helpers, so nothing `boxesV2` uses changes. For a row whose `sentences` is a number below this PR's
`SENTENCES_VERSION` (whatever it is when this merges, 3 off `dev`), grounding allows the numbers of `boxesV2(d)` as well
as today's sentences: the union, so no flag is added. Such a row is checked by the allowed-numbers rule, not against
today's sentence (as any older row is), so an edited rank or count word on it is no longer flagged. A row with no
`sentences` (version 1) is unchanged: it allows no sentence numbers, as today. Rows of today's version use only the new
writer.

**B4. The rename note ignores the own domain.** With D6 the volume bullet prints "PocketGuard.com", which contains the
brand's name. The `brand_changed` count (`grounding.ts:253-255`) would then ask for a real domain to be renamed. It counts
a slot only when the old name appears outside the row's own domains and the domains its bullets print (compared ignoring
case), except a domain equal to the brand's name ("Care.com"), which keeps every mention counted (final review).

**Not touched:** the context, the methodology, the Data block and the prompt, the gaps computation (#413), the page
order and names (#414), the pillars (#415), the KPI cards (the rank card stays).

## 5. Edge cases

| Case | Behaviour |
|---|---|
| Brand first alone | Next-tier: "ahead of" the next brands below; peers: the two below |
| Brand level at the top | Next-tier: "level with ... at the top"; peers in rank order |
| Brand last | Next-tier: behind the lowest brands above; peers: the two above |
| Ties at the next level up | Every brand at that level named, `someNames` (at most five, then "and k more") |
| Brand inside the top three by rank | Average of the three highest competitors; "above" or "below" as the numbers say |
| One competitor with data | Top-tier and peer bullets left out; next-tier stays |
| Competitors tracked, none with data | One "AI visibility" bullet naming that, then the gaps bullet if any |
| Brand ranked below tenth | Next-tier and peers named though off the chart (B2) |
| Own-site type leads the mix | The sentence starts "Own-site sources" |
| Three equal peers | "sits at the same visibility as" |
| Two own sites | Volume and rate both print the top site by the own-domain rule (D6) |
| Lowercase brand, subdomain, multi-word brand | First letter capitalised, as today (D6) |
| Top-two average at a half tenth | Rounded up (whole tenths) |
| Brand renamed | The note does not count "PocketGuard.com" (B4) |
| No competitors tracked | One bullet, "AI visibility" |
| Every brand at zero | Next-tier: "No brand tracked shows visibility in this window."; top-tier and peers left out |
| Brand at zero, others above | Next-tier behind the lowest brands above zero; top-tier below; peers as ranked |
| No own site retrieved | Volume: "does not appear in any retrieved citations"; rate left out |
| Two own sites | Volume names the top one; rate names its domain, not the brand (today's rule) |
| Empty or one-type source mix | The edge lines in B1 |
| A row made before this ships | Stored bullets unchanged; flags only by the allowed-numbers rule |

## 6. Tests (written first)

| File | Proves |
|---|---|
| `sentences.test.ts` | PocketGuard's numbers, rebuilt as a pull, give Ryan's six sentences word for word ("PocketGuard.com", "8%"); every edge row in §5; the live-shape and Ualett tests rewritten to the new boxes; each box holds 1 to 4 bullets in every edge case; `boxesV2` gives today's bullets (the existing wording tests move to it); the own-domain rule for www, a subdomain, a multi-word brand, no match and a lowercase brand; D5 for a value under 1%, a collision under 10 and the 100 guard; a top-two average at a half tenth |
| `grounding.test.ts` | A fresh row has no flags; an older row (`sentences: 2`) with its stored version 2 bullets has no flags, on a fixture with the brand at 10% or more visibility, more than five brands above it and share-of-voice gaps (the case that fails without B3); rows with `sentences: 1` and with no `sentences` keep today's flags; the rename note skips the own domain; the tests at `:360-376` that read `competitive_bullets[1]` follow the new boxes |
| `generate.test.ts` | `:359-368` "1 to 3 bullets per box" becomes 1 to 4 |
| `config.test.ts` | `SENTENCES_VERSION` is one higher than before (3 off `dev`) |
| `slots.test.ts` | Fixtures that quote old leads still pass (they are fixtures, not wording) |

## 7. Overlaps

#413 edits the gaps test in `sentences.test.ts`; #415 adds the pillar lines to `sentences.ts` and, with decision D2,
rewords them and moves `SENTENCES_VERSION` to 3. Whichever of this PR and #415 merges second sets `SENTENCES_VERSION` one
higher than the first. Each PR stands alone off `dev`.

## 8. Decisions (mine, 2026-10-22)

- **D1.** Keep the competitor domain gaps bullet as the fourth on the Competitive Visibility page: Ryan asked us to fix
  it this round (#413), and his list says "something like this".
- **D2.** Use Ryan's word "citations" for source shares here and in the pillar lines (#415), so one number reads one way
  on the page.
- **D3.** The top-tier average is over competitors only, so the brand is compared with its strongest rivals. It is a
  third kind of number besides Peec's and their differences: the mean of three charted bars, recomputable from the page.
- **D4.** The average prints to one decimal (Ryan's "53.8%"); every other percent keeps today's rule except D5.
- **D5.** The source-type mix prints whole percents from 1% up, as Ryan writes ("8%") and Peec's dashboard shows.
- **D6.** The own domain takes the brand's casing when its first label is the brand's name ("PocketGuard.com").
