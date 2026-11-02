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
`metrics.ts:223-230`): X = sum of `citation_count` over own rows; Y = sum of `citation_count` over every row. The rank
is the top own site's own rank, as Peec ranks domains (review r1-5: a pooled rank overstated it, Hooker 11th pooled
against 29th for its best site): R = 1 + the number of rows (any, own included) with `citation_count` above the top own
row's; N = rows with `citation_count` above 0. A tie at R = 1 (another row level with the top own row) reads "tied for
most cited". The share prints with the donut's own label
(`charts.ts` `sliceLabel`; "<1%" reads "under 1%", ">99%" reads "over 99%"), so it always reads as the "You" slice does.

| Case | Sentence |
|---|---|
| One own site cited | "Aplaceformom.com earned 731 of the 16,287 citations in AI answers (4%), the fourth most-cited site of 1,118." |
| Several own sites cited | "Crocs's own sites together earned 2,572 of the 31,821 citations in AI answers (8%); Crocs.com alone is the second most-cited site of <N>." |
| R = 1, no tie | "... (35%), the most-cited site of <N>." |
| R = 1, tied | "... (35%), tied for most cited of <N> sites." |
| Own sites never cited (X = 0) | "Milkmakeup.com earned none of the 3,740 citations in AI answers this window." (no own rows: "<Brand>'s own site ...") |
| No citations at all (Y = 0) | "Peec recorded no citations in AI answers this window." |

The subject is the domain (`ownDomainText`, as today) when one own row has citations, "<Brand>'s own sites" when more do.

**S2. Citation rate = answers that cite the brand, out of all answers.** C = answers citing any own site, counted once;
T = `total_chat_count` (one value per window on every row, measured on all 62 projects). One own row cited: C is that
row's `cited_chat_count`. Several: one extra POST `/reports/domains` over the window with `dimensions: ["chat_id"]` and
`filters: [{field: "domain", operator: "in", values: <own rows' domains>}]`; C = distinct `chat.id` with `citation_count`
above 0 (measured: United Health 177, where the largest single site is 98 and the per-site sum 220 double counts). Its
rows are one per domain and answer (541 for United Health, no repeats under the key `domain|chat.id`, each with
`total_chat_count` 1, so T always comes from the main report). It gets its own contract, `peec.own_cited_chats`:
an array of `{ domain: string, chat: { id: string }, citation_count: count }`, paged by `client.all` with that key. The
own-row match moves to one helper that `pull.ts` and `metrics.ts` both call.
"<Brand> is cited in 441 of 2,004 tracked answers (22%)." Percent via `pctText` (one decimal under 10), except that 0 < C/T below 0.05% reads "under 0.1%" (review r1-4:
`pctText` would print "0.0%"; Brandy Melville is 1 of 2,295). C = 0: "<Brand>
isn't cited in any of the 636 tracked answers." If the extra call fails for any reason but a spent deadline,
including a contract violation (caught at the call, not through `mustRethrow`, `pull.ts:52`), C is `null`: the Citation
rate bullet is left out and a note says why, and the report still generates. A spent deadline fails the report as
today.

**S3. The section counts citations throughout.** `sourceMixWeight` becomes `citation_count` (`config.ts:16`), so the
Source-type mix sentence, the donut and the three pillar lines are shares of citations. Measured on all 62 projects
with data: the mix matches the donut on every project (one SDEV case prints "12.5%" beside "12%", both roundings of
12.496%), and X / Y equals the "You" slice on every project. The Glean data block's mix label (`prompt.ts:56`) says
"share of citations".

**S4. Data.** `DomainRow` (`pull.ts:20-28`) and the `peec.domains_report` contract (`contracts.ts:79`) add
`citation_count`, `cited_chat_count`, `total_chat_count` (required: present on every row of every project) and make
`usage_rate` optional (no longer read). `PeecPull` gains `ownCitedAnswers?: number | null` (C from the extra call;
absent when one own row is cited). `SnapshotData` gains one optional field, absent on every older row:
`citations?: { own: number; total: number; answers: number; citedAnswers: number | null; citedSites: number;
ownSitesCited: number; topSite: { domain: string; rank: number; tied: boolean } | null }` (X, Y, T, C, N, the count of
cited own rows, and the top own row; `topSite` null when X = 0; `citedAnswers` null only when the extra call failed).
The stored-data contract (`contracts.ts:145-170`) adds it as optional. The weight value `citation_count` is
added to the allowed list (`config.ts:16`, `contracts.ts:165`).

**S5. Versions and older rows.** `SENTENCES_VERSION` 3 to 4. Grounding runs `dataSentences` on every row with
`sentences` (`grounding.ts:150`), and `boxesV2` builds the current boxes too (`sentences.ts:419-437`), so the new code
runs on version 1, 2 and 3 rows. Rule: the new S1/S2 sentences are written only when `data.citations` is present;
without it `write` uses today's Cited Sources box, frozen in code as `citedSourcesBoxV3`, so every older row produces
exactly the sentences it does today. `OLDER_BOXES[3]` returns that frozen box. Rows stored before this change keep their
data and words; only new reports change.

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
`grounding.test.ts`: version 1, 2 and 3 rows produce today's
sentences byte for byte through `dataSentences`, and their stored bullets still pass `groundingFlags`. `pull.test.ts`
also: a contract violation in the extra call leaves C null with a note, and a spent deadline still fails. `npm run aeo:sweep` on dev before staging.

## Trial (2026-11-02)

Scratch trial on all 63 pitch projects (62 with data): no failures; "You" slice equal to the share on all 62; 12
projects with several cited own sites, 3 never cited, 16 where the brand ranks first. Sample: A Place for Mom, Crocs,
Milk Makeup, ColourPop ("1 of the 1,086 citations (under 1%), the 106th most-cited site of 165"; "cited in 1 of 272
tracked answers (0.4%)").

## Minor findings for the plan (review round 1, not fixed here)

1. Singular forms: X, Y or T of 1 ("1 of the 1 citation"), and the subject when X = 0 with several uncited own rows.
2. `sweep-checks.ts:44-47` checks "appears in N retrieved"; replace with X = sum over own rows.
3. Glean Data block: keep `prompt.ts:56`'s labels for older rows, add a `citation_count` branch; give Glean X/Y and the
   rank, and stop naming "retrievals" (`prompt.ts:41-44, 74`).
4. The "You" slice counts Peec OWN rows (`metrics.ts:126`); X uses the own match. Equal on all 62 projects, measured,
   not guaranteed.
5. "Citation rate" shares a name with Peec's own `citation_rate` field, a different measure; consider "Answers citing".
6. The mix matches the donut on every project but one (SDEV "12.5%" beside "12%", the same 12.496%).
7. Run the extra call across the 12 multi-site projects with `npm run aeo:sweep` before staging.
8. Weights block is `metrics.ts:241-256`.
