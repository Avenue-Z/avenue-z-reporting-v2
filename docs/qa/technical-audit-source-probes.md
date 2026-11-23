# Technical Audit — source probes (2026-11-23)

Read-only checks run while designing the Technical Audit snapshot page
(`docs/superpowers/specs/2026-11-23-technical-audit-snapshot-page-design.md`). Recorded here so the build
and the issue-map draft don't need to ask the team again. Values are as of 2026-11-23.

## Ahrefs

**Plan and API.** Workspace "Avenue Z, Inc" is on **Advanced** (annual). API units: **2,000,000 / month**
(30,218 used; resets 14 Dec 2026). Site Audit crawl credits 1,500,000 / month. API v3 keys already exist
(scopes "API v3" and "MCP"); the Site Audit endpoints `site-audit/projects`, `site-audit/issues` and
`site-audit/page-explorer` were called successfully through the Glean MCP key in Nov 2026, so the plan
covers them. Our monthly pull is ~50 units per brand (projects is free; issues is 50).

**App key.** Paul generated a dedicated API v3 key and added it to `.env.local` as `AHREFS_API_KEY`
(2026-11-23; still to add in Vercel). Live check with it, Renaissance (`9371114`):

- `site-audit/projects?project_id=9371114` → 200: crawl `2026-11-18T16:42:47Z`, Completed, `health_score` 61,
  `urls_with_errors` 1013, `urls_with_warnings` 1039, `urls_with_notices` 603, `total` 2620,
  `target_mode` "subdomains".
- Same call with `date=2026-11-12T00:00:00` → 200: crawl **`2026-11-11T16:55:16Z`**, health 61, notices 614,
  total 2619 — **the `date` parameter does return a past crawl**, so a snapshot can pin its Ahrefs crawl.
- `site-audit/issues?project_id=9371114&date=2026-11-12T00:00:00` → 200, **184 rows, 50 units**. Fields:
  `issue_id, name, importance, category, is_indexable, crawled, change, added, new, removed, missing`.
  `importance` is Error / Warning / Notice; `change` is vs the crawl before. `is_indexable` was null on the
  AI-discoverability rows sampled.

**Site Audit projects** (24; crawls are weekly, so a crawl within 7 days of the SF run always exists when the
project is healthy):

| Project ID | Project | Domain | Note (2026-11-23) |
|---|---|---|---|
| 8543164 | Piper | www.piper.com | |
| 8543165 | Joyoflife | joyoflife.com | |
| 8543166 | Wellnessspace | wellnessspace.com | |
| 8543167 | Floridapace | floridapace.gov | health 12% |
| 8543168 | Cs3design | cs3design.com | |
| 8543169 | Corescientific | corescientific.com | |
| 8543172 | E2open | www.e2open.com | last crawl **failed** |
| 8543173 | Choicedoor | choicedoor.com | |
| 8543176 | Avenue Z | avenuez.com | |
| 8543177 | Hydrafacial | hydrafacial.com | |
| 8543178 | Elevatedfacilityservices | elevatedfacilityservices.com | |
| 8645204 | Hero | hero.co | |
| 8674451 | Paywithextend | paywithextend.com | |
| 8851204 | Cpap | cpap.com | **no crawls** |
| 8878316 | Cruiseplannersfranchise | cruiseplannersfranchise.com | |
| 9002108 | Prometeoapi | prometeoapi.com | **no crawls** |
| 9371114 | Renaissancebenefits | renaissancebenefits.com | QA brand |
| 10012602 | Openfarmpet | openfarmpet.com | health 0%, 10,006 URLs (crawl limit?) |
| 10110482 | Act-on | act-on.com | |
| 10236590 | Bloomfieldcapital | bloomfieldcapital.com | duplicate project (see 10311239) |
| 10287531 | Armada | www.armada.net | |
| 10292001 | Openfarmpet CA | openfarmpet.ca | last crawl 27 Aug, not scheduled |
| 10311239 | Bloomfieldcapital | bloomfieldcapital.com | duplicate project (see 10236590) |
| 10650735 | Harborfreight | www.harborfreight.com | Always-on audit |

**Renaissance (project 9371114), crawl of 18 Nov 2026 vs 11 Nov.** Health Score **61** (Fair). Weekly crawl
history visible back to 16 Sep. 2,620 internal URLs; 1,013 with errors. Issues: 4,732 total — 1,589 errors,
2,254 warnings, 889 notices; 52 actual issue types, 184 tracked. **Banner: "The website may not be fully
crawled"** — the crawl hit the project's max depth from seed, so counts may understate.

Issue names and crawled counts (Ahrefs "All issues", 18 Nov) — seed material for the canonical issue map:

| Group | Issue | Crawled |
|---|---|---|
| Internal pages | 404 page | 57 |
| Internal pages | 4XX page | 57 |
| Indexability | Noindex page | 74 |
| Indexability | Nofollow page | 1 |
| Indexability | Noindex follow page | 73 |
| Indexability | Noindex and nofollow page | 1 |
| AI Discoverability | Product page missing Product schema | 9 |
| AI Discoverability | Article page missing Article schema | 149 |
| AI Discoverability | FAQ page missing FAQPage schema | 18 |
| AI Discoverability | Category page missing ItemList schema | 1 |
| AI Discoverability | Changed pages not submitted to IndexNow | 1 |
| Links (indexable) | Page has links to broken page | 872 |
| Links (indexable) | Orphan page (has no incoming internal links) | 475 |
| Links (indexable) | Page has links to redirect | 873 |
| Links (indexable) | Redirected page has no incoming internal links | 2 |
| Links (indexable) | Page has only one dofollow incoming internal link | 14 |
| Links (indexable) | Page has nofollow and dofollow incoming internal links | 5 |
| Links (indexable) | Page has nofollow outgoing internal links | 1 |
| Links (not indexable) | Page has links to broken page | 91 |
| Links (not indexable) | Orphan page (has no incoming internal links) | 19 |
| Links (not indexable) | Page has links to redirect | 91 |
| Links (not indexable) | Page has only one dofollow incoming internal link | 17 |
| Links (not indexable) | Page has nofollow outgoing internal links | 1 |
| Redirects | Broken redirect | 1 |
| Redirects | 3XX redirect | 56 |
| Redirects | HTTP to HTTPS redirect | 2 |
| Redirects | Redirect chain | 1 |
| Content (indexable) | Meta description tag missing or empty | 721 |
| Content (indexable) | Title too long | 182 |
| Content (indexable) | Meta description too long | 107 |
| Content (indexable) | Meta description too short | 1 |
| Content (indexable) | Multiple H1 tags | 342 |
| Content (indexable) | Page and SERP titles do not match | 56 |
| Content (indexable) | SERP title changed | 4 |
| Content (not indexable) | Meta description tag missing or empty | 96 |
| Content (not indexable) | Multiple H1 tags | 40 |
| Content (not indexable) | Title too long | 4 |
| Content (not indexable) | Meta description too long | 3 |
| Content (not indexable) | Meta description too short | 1 |
| Social tags | Open Graph URL not matching canonical | 16 |
| Social tags | Open Graph tags incomplete | 3 |
| Usability and performance | Slow page | 3 |
| Images | Image file size too large | 53 |
| Images | Page has broken image | 4 |
| Images | Image broken | 1 |
| Sitemaps | 4XX page in sitemap | 44 |
| Sitemaps | Non-canonical page in sitemap | 19 |
| Sitemaps | 3XX redirect in sitemap | 6 |
| Sitemaps | Indexable page not in sitemap | 42 |
| Other | Organic traffic dropped | 13 |
| Other | Pages dropped from Top 10 | 7 |
| Other | Structured data has Google rich results validation error | 2 |

Note: the same issue name appears under "indexable" and "not indexable" — the API's `is_indexable` field
separates them. Importance (Error / Warning / Notice) is shown as an icon in the UI; take it from the API.

**Possible CWV source.** `site-audit/page-explorer` exposes per-URL `psi_crux_lcp_category`,
`psi_crux_inp_category`, `psi_crux_cls_category` (used by the Glean MCP key on 19 Nov). If PageSpeed checks
are enabled in a project's crawl settings, this could give **per-URL** good / NI / poor counts — closer to
GSC's URL-count format than CrUX origin shares. Not yet evaluated.

## Screaming Frog (Google Drive)

Folder `Screaming Frog Exports` (`1M1OK47uB7kK-PI1tXP1obRAiIvB1LuV4`, readable by the reporting service
account) has one subfolder per brand; each monthly run is a timestamped folder, e.g.
`Renaissance/2026-11-01_030106/internal_all.csv`. Runs: 2026-05-22 (×3 tests), 05-26, 06-01, 07-01, 09-01,
10-01, 11-01 — **no August run** (same for Avenue Z). Only `internal_all.csv` is exported (plus
`response_codes.csv` in May tests). The top-level `<brand>_internal_all.csv` files (2026-05-21) are what
`clients.sf_csv_file_id` points to today.

## Technical Audit Log

`Avenue-Z/monthly-technical-audit` writes the "Technical Audit Log" and "AEO Client Registry" Google
Sheets. Its workflow `monthly-audit.yml` is `workflow_dispatch` only ("add cron once schedule is
confirmed"); last run 2026-06-02. Columns: client, tool, run date, config, status, output path,
critical / high / medium / low counts, total score, total issues. Not shared with the reporting service
account.

## Google Search Console

**Access.** The app's GSC client impersonates `GSC_IMPERSONATE_EMAIL` = `nick@avenuez.com`, which lists only
`sc-domain:avenuez.com`; Renaissance returns 403. Paul's own account has no GSC properties. The shared
**`google@avenuez.com`** ("AVZ Google") account has access to **49 properties**, including
`sc-domain:avenuez.com` (Full) and `sc-domain:renaissancebenefits.com` (Full), plus most AEO clients
(act-on, armada, choicedoor, paywithextend, piper, corescientific, wellnessspace, bloomfieldcapital,
elevatedfacilityservices, cs3design, prometeoapi (Restricted), harborfreight (Restricted), …). A read-only
probe impersonating `google@avenuez.com` through the same service account (domain-wide delegation) worked:

- `sites.list` → 200, 49 entries.
- Sitemaps API for Renaissance → 200: `https://renaissancebenefits.com/sitemap_index.xml` (web submitted
  **924**, image 196, last downloaded 2026-11-22) and `https://tenncare.renaissancebenefits.com/sitemap.xml`
  (web submitted **269**, image 17, 1 warning). `indexed` is "0" (deprecated field), as documented.
- URL Inspection → 200. `https://renaissancebenefits.com/`: verdict PASS, coverageState "Submitted and
  indexed". `/contact-us/`: verdict NEUTRAL, coverageState **"Page with redirect"** — the same wording as the
  report's reason rows.

So switching `GSC_IMPERSONATE_EMAIL` to `google@avenuez.com` (local + Vercel) unblocks GSC automation for
most brands without asking clients for access. The domain property spans subdomains: take the sitemap list
from the Sitemaps API, not robots.txt (robots.txt misses the tenncare sitemap).

**Reference numbers for QA (read in the GSC UI as google@, 2026-11-23).**

Page indexing, last update 11/15/26:

| View | Indexed | Not indexed | Reasons |
|---|---|---|---|
| All known pages | 1.08K (UI-rounded) | 934 | 13 |
| Sitemap `renaissancebenefits.com/sitemap_index.xml` | 601 | 321 | 5 |

All-known "Why pages aren't indexed": Page with redirect 183 · Not found (404) 118 · Excluded by 'noindex'
tag 49 · Alternate page with proper canonical tag 22 · Duplicate without user-selected canonical 19 ·
Blocked due to other 4xx issue 1 · Redirect error 1 · Soft 404 1 · Blocked due to access forbidden (403) 1 ·
Blocked by robots.txt 1 · Discovered - currently not indexed 302 · Crawled - currently not indexed 230 ·
Duplicate, Google chose different canonical than user 6 · Server error (5xx) 0.

Main-sitemap view reasons: Not found (404) 28 · Redirect error 1 · Page with redirect 1 · Discovered -
currently not indexed 264 · Crawled - currently not indexed ≈27 (row truncated in capture; 321 − 294).

The main-sitemap total (601 + 321 = 922) matches the Sitemaps API's 924 submitted and our ≈925 count — the
URL-Inspection estimate should land close to GSC's **sitemap-filtered** view, not the all-known view.

Core Web Vitals (Source: Chrome UX report, last updated 11/21/26):

| Device | Poor | Need improvement | Good |
|---|---|---|---|
| Mobile | 0 | 0 | 172 |
| Desktop | 0 | 8 ("CLS issue: more than 0.1 (desktop)") | 164 |

Only ~172 URLs have CrUX data, so GSC's CWV report itself covers a small slice of the 2,000-odd known URLs.
