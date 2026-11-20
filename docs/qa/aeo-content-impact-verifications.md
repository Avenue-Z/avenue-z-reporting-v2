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
