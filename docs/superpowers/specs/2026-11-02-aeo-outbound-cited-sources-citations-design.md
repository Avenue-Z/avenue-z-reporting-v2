# AEO Outbound: Cited Sources counts real citations

**Date:** 2026-11-02. **Branch for the build:** off `dev` at `4cf99df2`. **Evidence:**
`docs/findings/2026-11-02-aeo-outbound-citation-total.md` (same branch as this spec).

## Goal (Ryan, 2026-11-02, verbatim)

"Is it possible that we add more substance to the citation volume and citation rate section so they are more
differentiated? Once we can adjust that, we are good to finalize." Earlier: "is there a way to pull the total number of
retrieved citations ... The value of 19 is hard to analyze if we don't know the total", and "will there still be any
stats in that section that align with the chart?" (answered yes, on the conditions below).

Today Citation volume is answers that retrieved the top own site (`retrieved_chat_count`, `metrics.ts:231-232`) and
Citation rate is the same thing as a share (`retrieved_percentage`, `sentences.ts:276-279`), so the two repeat each
other, neither shows a total, and both say "cited" about retrieval. The mix, donut and pillars say "of citations" but
weight by `usage_rate` (`metrics.ts:242-253`), which Peec's spec marks deprecated.

## The change

**S1. Citation volume = citations, with the total and a rank.** Over the brand's own rows (the existing own match,
`metrics.ts:223-230`): X = sum of `citation_count` over own rows; Y = sum of `citation_count` over every row; rank R = 1 +
the number of non-own rows with `citation_count` above X (the own sites together count as one entry; ties share a
rank); N = non-own rows with `citation_count` above 0, plus 1 when X > 0. The share prints with the donut's own label
(`charts.ts` `sliceLabel`; "<1%" reads "under 1%", ">99%" reads "over 99%"), so it always reads as the "You" slice does.

| Case | Sentence |
|---|---|
| One own site cited | "Aplaceformom.com earned 731 of the 16,287 citations in AI answers (4%), the fourth most-cited site of 1,118." |
| Several own sites cited | "Crocs's own sites earned 2,572 of the 31,821 citations in AI answers (8%), ranking second among 1,422 cited sites." |
| R = 1 | "... (35%), more than any other site." |
| Own sites never cited (X = 0) | "Milkmakeup.com earned none of the 3,740 citations in AI answers this window." (no own rows: "<Brand>'s own site ...") |
| No citations at all (Y = 0) | "Peec recorded no citations in AI answers this window." |

The subject is the domain (`ownDomainText`, as today) when one own row has citations, "<Brand>'s own sites" when more do.

**S2. Citation rate = answers that cite the brand, out of all answers.** C = answers citing any own site, counted once;
T = `total_chat_count` (one value per window on every row, measured on all 62 projects). One own row cited: C is that
row's `cited_chat_count`. Several: one extra POST `/reports/domains` over the window with `dimensions: ["chat_id"]` and
`filters: [{field: "domain", operator: "in", values: <own rows' domains>}]`; C = distinct `chat.id` with `citation_count`
above 0 (measured: United Health 177, where the largest single site is 98 and the per-site sum 220 double counts).
"<Brand> is cited in 441 of 2,004 tracked answers (22%)." Percent via `pctText` (one decimal under 10). C = 0: "<Brand>
isn't cited in any of the 636 tracked answers." If the extra call fails (not a spent deadline), the Citation rate
bullet is left out and a note says why; the report still generates.

**S3. The section counts citations throughout.** `sourceMixWeight` becomes `citation_count` (`config.ts:16`), so the
Source-type mix sentence, the donut and the three pillar lines are shares of citations. Measured on all 62 projects
with data: the mix matches the donut on every project (one SDEV case prints "12.5%" beside "12%", both roundings of
12.496%), and X / Y equals the "You" slice on every project. The Glean data block's mix label (`prompt.ts:56`) says
"share of citations".

**S4. Data.** `DomainRow` (`pull.ts:20-28`) and the `peec.domains_report` contract (`contracts.ts:79`) add
`citation_count`, `cited_chat_count`, `total_chat_count` (required: present on every row of every project) and make
`usage_rate` optional (no longer read). `SnapshotData` stores X, Y, R, N, C, T. The weight value `citation_count` is
added to the allowed list (`config.ts:16`, `contracts.ts:165`).

**S5. Versions.** `SENTENCES_VERSION` 3 to 4; `OLDER_BOXES[3]` keeps today's boxes so a version 3 row's stored
bullets still pass grounding. Rows stored before this change keep their data and words; only new reports change.

**Not changed:** Competitive Visibility, the gaps, the editor, approval, links. Cost, accepted: the donut no longer
reproduces Peec's own Domain types chart (the 2026-10-19 reason for `usage_rate`); Peec's current chart is unverified.

## Edge cases

| Case | Expected |
|---|---|
| Brand rank tied with another site | Shared rank (strictly-above count) |
| Share under 1% / over 99% | "under 1%" / "over 99%", as the slice |
| One own row, extra call | Not made |
| Own rows with 0 citations and some with more | Only cited rows count toward "several" |
| Extra call over 10,000 rows | Paged by the client (`peec.ts` `all`); largest measured 2,627 (Crocs) |
| Version 3 row edited after the change | Grounded against its own boxes (`OLDER_BOXES[3]`) |

## Tests (written first)

`sentences.test.ts`: every row of the S1 table and the S2 cases; rank ties; "under 1%"; several own sites.
`metrics.test.ts`: X, Y, R, N from fixture rows; the weight switch reproduces the measured APFM shares (Institutional
45.7%, Corporate 34.2%). `pull.test.ts`: the extra call is made only with several cited own rows, with the exact body;
its failure leaves the rate out with a note. `contracts.test.ts`: the new required fields; `usage_rate` optional.
`grounding.test.ts`: a version 3 row's bullets still pass. `npm run aeo:sweep` on dev before staging.

## Trial (2026-11-02)

Scratch trial on all 63 pitch projects (62 with data): no failures; "You" slice equal to the share on all 62; 12
projects with several cited own sites, 3 never cited, 16 where the brand ranks first. Sample: A Place for Mom, Crocs,
Milk Makeup, ColourPop ("1 of the 1,086 citations (under 1%), the 106th most-cited site of 165"; "cited in 1 of 272
tracked answers (0.4%)").
