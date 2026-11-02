# Finding: what the Cited Sources numbers count, and the total Ryan asked for

**Date:** 2026-11-02. **Asked by:** Ryan, on the COSRX report: "is there a way to pull the total number of retrieved
citations for the stat under citation volume? The value of 19 is hard to analyze if we don't know the total. ... If
not, could we change that stat to be another percentage from that section?"

**Answer:** yes. Peec gives the total. But the section's numbers count two different things while all saying
"citations", so the fix is to make the whole section count Peec's real citations, not just this one line.

## What the report shows today (code read 2026-11-02, dev `4cf99df2`)

| On the page | Peec field | Where |
|---|---|---|
| Citation volume: "COSRX.com appears in 19 retrieved citations" | `retrieved_chat_count` of the top own domain (answers that pulled the site in as a source) | `metrics.ts:231-232`, `sentences.ts:271` |
| Citation rate: "cited in 1.5% of tracked answers" | `retrieved_percentage` = `retrieved_chat_count / total_chat_count` | `sentences.ts:276-279` |
| Source-type mix: "... 28% of citations" | shares of `usage_rate` by classification | `metrics.ts:240-256`, `sentences.ts:301` |
| Domain Types donut | the same `usage_rate` shares | `charts.ts`, `metrics.ts:240-256` |
| Content pillar: "own site makes up N% of citations" | own rows' `usage_rate` share | `metrics.ts:249`, `sentences.ts:408` |

So: the 19 is answers, not citations; the total behind it is `total_chat_count`, and "19 of N answers" is the same fact
as the 1.5% beside it. "Cited in" is printed from a retrieved number. The mix, donut and pillar say "citations" but are
`usage_rate`, which Peec's spec now marks "Deprecated: use retrieved_percentage or retrieval_rate instead", and which
the contract requires (`contracts.ts:79`): if Peec drops it, every Generate fails.

## What Peec returns

Peec's OpenAPI spec (`https://api.peec.ai/customer/v1/openapi/json`, read 2026-11-02), POST `/reports/domains`, every
row: `retrieved_chat_count`, `total_chat_count`, `retrieved_percentage`, `retrieval_count`, `cited_chat_count`,
`cited_percentage` ("share of chats in scope that cite at least one URL from this domain inline"), `citation_count`,
`citation_rate`, and the deprecated `usage_rate`. `citation_count`, `cited_chat_count` and `total_chat_count` are in the
row's required list. Peec separates **retrieved** (a page appeared as a source) from **cited** (the answer linked it
inline); its metrics page defines "Citation share" as a domain's inline citations over all inline citations.

Live, read only, A Place for Mom, Sep 17 to 29, 2026 (the report shows 479 and 24% today):

| | Value |
|---|---|
| Answers in the window (`total_chat_count`) | 2,004 |
| Answers that retrieved aplaceformom.com | 479 (23.9%, today's Citation rate) |
| Answers that cited it inline | 441 (22.0%) |
| Inline citations of aplaceformom.com | 731 |
| All inline citations in the window | 16,287 |
| Citation share | 4.5% (today's pillar reads 3%, from `usage_rate`) |

The 16,287 and 731 are identical summed from the domains report (1,383 rows) and the URLs report (4,867 page rows).
By `citation_count`, Institutional is 45.7% and Corporate 34.2%; by `usage_rate` they read 59.4% and 24.5%.

## Scale (all clients)

Read-only sweep of all 63 Peec pitch projects, full history as the tool pulls it: 62 with data, 1 with none; citation
fields on every row (0 missing); one `total_chat_count` per window everywhere; brand citation share from 0.0% to 35.3%
(median 3.8%). Cases the wording must handle: own site retrieved but never cited (Milk Makeup, 0 of 3,740), no own-site
rows (2 projects), several own domains (12 projects, up to 29 for Crocs), shares under 0.1% (Brandy Melville, 1 of
6,212). A fresh-eyes review (2026-11-02) confirmed every fact above and found the contradiction with the pillar.

## Proposed change (pending my decision and Ryan's)

Count Peec's real citations across the whole Cited Sources section:

- **Citation volume** becomes the brand's share of all citations, summed over every own domain (the same own match the
  pillar uses): "COSRX.com earned 731 of the 16,287 citations in AI answers this window (4.5%)"; several sites: "COSRX's
  own sites earned ..."; under 0.1%: "(under 0.1%)"; retrieved but never cited: "AI answers used COSRX.com as a source
  3 times but never cited it among the 3,740 citations this window"; no own rows: "COSRX's own site earned none of the
  13,549 citations ...".
- **Citation rate** prints `cited_percentage` (answers that cite the site), so "cited in" is true.
- **Source-type mix, donut and pillars** weight by `citation_count`, so every "of citations" agrees and the deprecated
  `usage_rate` is retired. Cost: the donut no longer reproduces Peec's Domain types chart, the reason `usage_rate` was
  chosen on 2026-10-19 (`config.ts:13-15`). Whether that chart still uses it is unverified.
- Plumbing: `citation_count` and `cited_percentage` on `DomainRow` (`pull.ts:20-28`) and the contract; a new
  `SENTENCES_VERSION` with the old boxes kept for grounding; the Glean prompt's description of the mix (`prompt.ts:56`).
