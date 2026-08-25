# PR Influence: claims ledger

**Purpose.** Every factual assertion made to Tina, with the evidence behind it. A
sentence with no row here does not go in the stakeholder document.

**Why this exists.** Eleven document versions in one session drifted from the evidence in
different ways, because the prose was hand-written and checked afterward. Reviewing prose
finds the last mistake. Reviewing this table finds the class of mistake. In every case the
cause was the same: a claim written before the check that would have settled it.

**Covers:** `Tina QFA Final v11.docx`, 9 questions.
**Status:** all rows closed. Probes run 2026-07-21 against live Peec, both PR Proof
sheets, and the production database.

## Evidence types

| Type | Meaning |
|---|---|
| `CODE` | Verified against source. Cites `file:line`. |
| `EXEC` | Proven by running the shipped function. |
| `PROBE` | Measured against live data by a read-only probe. |
| `REPORTED` | A person observed it. |
| `OPEN` | Stated in the document as something we do not know. |

---

## Background section

| # | Claim | Type | Evidence |
|---|---|---|---|
| S1 | Placements come from the tracker sheet, citations from Peec, the join is the problem | `CODE` | `pr-influence.tsx:154`, `:185`, `:252` |
| S2 | Bristol's URL is absent from Peec | `PROBE` | 6,000 URLs paginated across 7/30/90/180d, absent in all |
| S3 | Other dig-in.com stories are cited | `PROBE` | 4 URLs, all `[ChatGPT]` |
| S4 | The join runs on website address, never article address | `CODE` + `EXEC` | `matchback.ts:74,110`; empty-link control still returns cited |
| S5 | Engine names are borrowed from another article | `CODE` + `PROBE` | `matchback.ts:111`; the 4 dig-in.com URLs carry `[ChatGPT]` |
| S6 | The date range changes the answer | `PROBE` | ranks 2566/4815 (30d), 1937/2435/3949/3950 (90d), 2846/4391 (180d) |
| S7 | We are fixing it by reading every cited page | `PROBE` | `offset` pagination verified to 6,000 rows |
| S8 | "First cited" shows the range start | `CODE` + `REPORTED` | `pr-influence.tsx:189-196`; all 5 rows show 2026-05-21 |
| S9 | Digital Insurance: first cited May 21, published July 8 | `PROBE` + `REPORTED` | tracker publish date; screenshot |
| S10 | No headline field in Renaissance's tracker | `PROBE` | header is `Date, Reporter, Outlet, Article Link, Media Type` |
| S11 | Avenue Z's sheet has one, so only Renaissance is affected | `PROBE` | Avenue Z map is `NULL` → default A-G; 3/3 headlines populate |
| S12 | 5 cited on the screenshotted view, 1 real; 15 / 7 / 1 combined | `PROBE` | production matchback, each client's own sheet and Peec project |

## Per question

| Q | Claim | Type | Evidence |
|---|---|---|---|
| 1 | Publisher-level matching was the 2026-07-09 direction | `CODE` | `matchback.ts:5-10`; passing test `matchback.test.ts:192` |
| 1 | 7 claimed become 1; Renaissance 5→1, Avenue Z 2→0 | `PROBE` | 90d window, top-2000 depth |
| 1 | 6.3% of returned rows carry zero citations | `PROBE` | 126 of 2,000; `matchback.ts` never reads `citationCount` |
| 2 | AI Engines has the same flaw | `CODE` | `matchback.ts:111` |
| 2 | Hover content is lost in a PDF export | `CODE` | `export-pdf-button.tsx` uses `window.print()` |
| 3 | The dates are publisher-level | `CODE` | `citation-dates.ts:146`, `ApiDomainDateRow` has no url field |
| 3 | Article-level dates may not be possible | `OPEN` | only 3 Peec endpoints exist; no caller requests a date dimension on `/reports/urls` |
| 4 | Uncited placements are removed, not marked No | `CODE` | `matchback.ts:110` |
| 4 | 11 of Renaissance's 12 would vanish | `PROBE` | 1 of 12 cited after the fix |
| 4 | The "No" display is already built and unused | `CODE` | `pr-influence-tables.tsx:467,470` |
| 4 | The honest rate already renders above the table | `CODE` | `pr-influence-tables.tsx:506-510` |
| 5 | The Article column is empty because the field does not exist | `PROBE` + `CODE` | sheet header; `client.ts:149` returns `''` for an undeclared column |
| 5 | Peec supplies a title for 93.3% of cited pages | `PROBE` | measured at production depth |
| 6 | Six of twelve are podcast/video links | `PROBE` | buzzsprout, spotify, youtu.be ×2, apple ×2 |
| 6 | None currently produces a false citation, but that is luck | `PROBE` | Peec has `youtube.com` cited; placement is `youtu.be`; hosts are not equal |
| 7 | Five tabs, only Media Coverage is read | `PROBE` + `CODE` | tab list; `resolveTabName` falls back to first tab |
| 8 | The synopsis labels the all-time total as "in period" | `CODE` | `pr-influence-synopsis.ts:82`; `pr-influence.tsx:424` |
| 8 | We clear saved summaries on release | `CODE` | `cache.ts:53,67`, manual `version` bump, now an action item |
| 9 | Only two dashboards exist | `PROBE` | 7 clients, 2 with a PR Proof sheet |
| 9 | Whether past reports were affected is unchecked | `OPEN` | stated as unknown in the document |

---

## Falsified rows, kept as a record

Claims that appeared in earlier drafts and did not survive a probe.

| Claim | What the probe found |
|---|---|
| Renaissance and Avenue Z share one sheet | Different sheets, different layouts |
| 37 of 65 clients affected | 2 dashboards, 15 placements total |
| Renaissance has 5 placements | 12 |
| The sheet has blank headline cells | Zero blank cells; the field does not exist |
| The sheet has homepage-instead-of-article links | ~6 of 263 in Avenue Z's sheet, none Renaissance's |
| Article-level dates are a same-shape fix | `/reports/domains` has no article granularity |
| Citing any YouTube page would fire the placement | `youtu.be` and `youtube.com` are different hosts |
| Peec title coverage is 96% | 93.3% at production depth |
| Reports already sent carried the instability | Never checked; now stated as unknown |

## Rows no probe can close

All option choices, thresholds, and column naming are Tina's judgment. They are framed as
decisions and need no evidence.

## Generation rule

The stakeholder document is built from rows in this table. An `OPEN` row is written into
the document as an acknowledged unknown, never as an assertion. Anything else does not
ship.
