# AEO Content Impact: verifications V1/V2 and coverage measurement

Read-only. Scripts: `scripts/v2-calendar-audit.ts`, `scripts/measure-coverage-walk.ts` (Renaissance, run 2026-11-20).

## V1: Published rule
A calendar row counts as Published only when Status is exactly "Published". No date rule. Counts across all 4 tabs: "Published" 44; anything else 48 (blank 15, Planned 13, Proposed/Pending 7, In Progress 6, Ready for Renaissance Review 5, Staging 1, Rejected 1).

## V2: Publish Date formats
Header `Publish Date` (column F) matches the `publishDate` alias on all 4 tabs. The sheet has no "last updated" column; Publish Date is the last push-live date. Distinct raw formats, all parsed correctly: bare `M/D` (e.g. 9/3, 11/18, 10/2), `M/D/YY` (11/6/26). Year comes from the `Date` month-context column; tab 2 has no such column (header "Column 1") and bare `M/D` there falls back to the nearest non-future year (5/22 -> 2026-05-22, OK). Nulls: only "TBD" (30 rows) and blank (18 rows), all legitimately unpublished. No unparseable real dates, so `parseCalendarDate` is unchanged.

## Content Type -> badge (parseContentAction, no explicit action column)
| Content Type | Result |
|---|---|
| New Blog | new |
| New Page | new |
| Existing Blog Optimization | optimized |
| Existing Guide Optimization | optimized |
| Existing Page Optimization | optimized |

No mapping fix needed. 3 URLs appear on two tabs (dental-insurance tabs 0,3; employer-faq tabs 2,3; brokers-guide-integrated-ancillary-benefits... tabs 2,3), to be merged by Task 5.

## Peec coverage walk (last 30 days, limit 10000)
| Measure | Value |
|---|---|
| `/reports/urls` dims prompt_id+model_id: rows / pages | 48,478 / 5 (short final page, not truncated) |
| Duplicate (url,prompt,model) keys | 3 |
| `JSON.stringify(aggregateDomainCoverage(rows, [], {}))` | **5,751,842 bytes (5.75 MB)** |
| Base `/reports/urls`: rows / pages / duplicate urls | 20,396 / 3 / 0 |
| Own domains (Peec `/reports/domains`, OWN) | 1 |
| Owned-host rows (FB-050 suffix rule) / JSON | 135 / 66,432 bytes |
| Full base JSON (reference) | 9,649,925 bytes |

**STOP:** the aggregated coverage JSON (5.75 MB) exceeds the 1.5 MB threshold and the 2 MB Next data-cache limit. The Task 2 cache plan assumes it fits; escalate before Task 2. The owned-host subset (66 KB) fits comfortably, so filtering to owned hosts before caching is a candidate. Also note 3 duplicate keys: completeness of an uncached walk is not guaranteed by the duplicate check.

Note: duplicate keys vary run to run (2-3 across Task 1's runs, 1 in Task 2's), so they are a reorder signal, not a fixed count. `getCoverageProjection` walks once, de-duplicates, and accepts the result with a warning (D-21 as amended by F-8: a measured retry came back clean 0 of 5 times, and each duplicate displaces a distinct row, so up to that many rows may be missing).

## Projection sizes (bytes; 30-day prompt x model walk)
Full walk: 12.9 s (5 pages). Tracked prompts (`/prompts` totalCount): 100.

| Piece | Bytes |
|---|---|
| Full aggregate: promptIdsByDomain | 1,112,583 |
| Full aggregate: promptIdsByDomainByModel | 1,388,194 |
| Full aggregate: promptIdsByUrlKey | 3,251,063 |
| Full aggregate: tagIdsByDomain / tagIdsByUrlKey / tagNameById | 42,241 / 115,594 / 546 |
| a) owned prompt ids + per engine | 14,798 (97 prompts) |
| b) promptIdsByUrlKey, owned only | 53,056 (132 keys) |
| c) domain maps, top 25 competitors + own | 137,597 (Peec has only 26 Competitor domains) |
| d) per-prompt top 3 non-owned urls + more | 37,456 (100 prompts) |
| e) brand-absent competitor-naming urls (capped getUrlCitations) | 614,357 (1,146 of 2,000 qualify) |
| f) a+b+c+d+e (Task 1 estimate) | 857,264 |

### Measured `getCoverageProjection('renaissance', last30)` (Task 2)
`JSON.stringify(projection).length` = **1,042,670 bytes** (under the 1,500,000 target and Next's 2 MB limit). Walk plus tag/domain/brand/url fetches took ~21 s uncached (includes one retry walk after a duplicate); `complete: true`, `duplicateRows: 1`. Per field: promptIdsByDomain 50,021; promptIdsByDomainByModel 87,842; promptIdsByUrlKey 667,454 (1,278 keys); tagIdsByDomain 42,241; tagIdsByUrlKey 115,594; ownedPromptIds 4,075; ownedPromptIdsByModel 10,703; otherSitesByPrompt 63,973. One transient Peec 429 on `/reports/domains` was seen on the first measurement run; the rerun succeeded.
