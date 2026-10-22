# AEO Outbound round 3: staging QA before Ryan's review

**Build under test:** `staging` at `326e9f56` (#419, promoting `dev` at `275e7f26`: #418, #410, #415, #413, #414, #417).
Vercel deployment 7263487633, state success, 2026-10-22.

**Purpose:** confirm on staging, in a real browser, that every item Ryan asked for in round 3 is on the page exactly as
he worded it, before he reviews. Pass criteria are Ryan's own words (Slack, 2026-10-21 and 2026-10-22) and the audit
slide "The Pillars of AI Search". Nothing here is a question for Ryan.

**Fixed test input:** PocketGuard (`or_6cfa5d3c`), date range 2026-10-19 to 2026-10-19. That is the day Ryan's
PocketGuard examples were measured against Peec, read only (bullets spec §3), so the page must reproduce his sentences
word for word. If Peec has revised that day since 2026-10-22, a figure can move: then compare against a read-only Peec
probe before calling it a bug.

**Writes to staging** (test data only, nothing outside staging): the Settings save in S2 (only if needed), one or two
generated reports (G, X), slot edits that are reverted (E2, E3), the Opportunities switch (T), one Approve then Revoke (A).

**How each check is done:** read the page text, measure with JavaScript in the page (positions, layout values), and
screenshot where the point is visual. Each line gets PASS, FAIL (with what was seen) or BLOCKED (with why).

## 0. Preconditions

| # | Check | Expected | Result |
|---|---|---|---|
| P1 | Signed in to `staging.reporting.avenuez.com` in the browser pane (I sign in; Claude never enters a password) | `/tools/new-business` loads, not `/login` | |
| P2 | Console on the hub | No errors | |

## 1. Settings (`/tools/new-business/settings`)

| # | Check | Expected | Result |
|---|---|---|---|
| S1 | Field labels | "Sources section title" and "Visibility section title" present; "Most opportunities from Peec recommendations" absent | |
| S2 | Section titles values | "Cited Sources" and "Competitive Visibility". If different, set exactly these and save | |
| S3 | Reload | Values persist | |

## 2. Generate the test report

| # | Check | Expected | Result |
|---|---|---|---|
| G1 | Hub: New snapshot, pick PocketGuard, start and end 2026-10-19, Generate | Generation starts | |
| G2 | Progress checklist | Seven rows: Finding the project in Peec; Reading the brands tracked; Reading the project profile; Finding the days with data; Loading brand visibility and AI models; Loading the sources AI used; Writing the copy. No "Loading Peec's recommendations" | |
| G3 | Finishes | Opens as a draft, no failure message | |
| G4 | About this data | No "Peec actions could not be loaded" warning | |

## 3. Page order and names (Ryan: "Changing headline signal page title to Executive Summary"; "Competitive Vis page will go before it"; "renamed to Cited Sources")

| # | Check | Expected | Result |
|---|---|---|---|
| M1 | Menu, top to bottom | 01 Executive Summary, 02 Competitive Visibility, 03 Cited Sources, 04 Opportunities, 05 Methodology | |
| M2 | Section labels on the page, in page order | "Executive Summary"; "02 / Competitive Visibility"; "03 / Cited Sources"; "04 / Opportunities"; "05 / Methodology" | |
| M3 | Section titles | Competitive Visibility section titled "Competitive Visibility"; sources section titled "Cited Sources" | |
| M4 | "Headline signal" or "Category data" anywhere on the page | Absent | |
| M5 | Click each menu item | Scrolls to that section; the highlight follows the page order | |
| M6 | Same checks in Open full size (preview) | Identical | |

## 4. Competitive Visibility (Ryan's Q1 template for this page, and the bar chart)

| # | Check | Expected | Result |
|---|---|---|---|
| CV1 | Bullet 1 | "Next-tier gap:" "PocketGuard is 5.4 percentage points behind Quicken in visibility." | |
| CV2 | Bullet 2 | "Top-tier distance:" "PocketGuard is 20.5 percentage points below the top-three average visibility of 53.8%." | |
| CV3 | Bullet 3 | "Peer cluster:" "PocketGuard sits within a 7.8-point visibility range alongside Quicken and You Need A Budget." | |
| CV4 | Competitor domain gaps (Ryan: "Only include competitor domains") | If present, the fourth bullet. Every listed domain is the own site of a competitor in the bar chart (or a subdomain of one); no editorial, review or other third-party site; never pocketguard.com | |
| CV5 | Bar numbers against the bullets | Quicken 38.7, PocketGuard 33.3, YNAB 57.5, Monarch 52.8, Monarch Money 51.2, You Need A Budget 30.9 | |
| CV6 | Gap under the title (Ryan: "not a big gap between the chart and the overhead title") | Chart title to figure 0px, figure top to plot about 8px, at 1440 and 1105 (editor) widths | |
| CV7 | Grey behind the bars (Ryan: "eliminate the grey gradient") | Plot area `#000000`; no `#1a1a1a` plot area; faint gridlines are fine | |

## 5. Cited Sources (Ryan's Q1 template for this page, and the donut)

| # | Check | Expected | Result |
|---|---|---|---|
| CS1 | Bullet 1 | "Citation volume:" "PocketGuard.com appears in 678 retrieved citations." | |
| CS2 | Bullet 2 | "Citation rate:" "PocketGuard is cited in 12% of tracked answers." | |
| CS3 | Bullet 3 | "Source-type mix:" "Corporate sources account for 37% of citations, followed by Editorial sources at 19%; UGC accounts for 8%." | |
| CS4 | Donut slices against Peec's Domain types for 2026-10-19 | Corporate 37, Editorial 19, Competitor 17, UGC 8 (measured 36.7, 18.8, 17.1, 8.0); every other slice equals Peec's dashboard for that day | |
| CS5 | Legend in 2 columns (Ryan: "Split the Domain Types ... into 2 columns vs. one") | At 1440, 1105 and 1000: two distinct column starts, no name running into its neighbour | |
| CS6 | Phone width 375 | The legend flows (one list), names readable, slice labels kept | |
| CS7 | Hide a slice by clicking its legend entry, then change the width | The slice stays hidden | |

## 6. Opportunities (Ryan: "follow the three pillars shown in our audit slide"; "a one liner under each pillar that connects the data from this report to each")

| # | Check | Expected | Result |
|---|---|---|---|
| O1 | Title | "The Pillars of AI Search" | |
| O2 | Cards in order, names | Earned & Affiliate Media; Content and Creative; Technical Optimizations | |
| O3 | Descriptions | Earned and Technical word for word from the slide. Content: the slide's sentence completed as "...to better influence how LLMs answer the questions buyers ask." (the slide cuts off after "LLMs for") | |
| O4 | Earned line (Ryan: "X percent of citation sources are coming from editorials") | "Editorial sites make up 19% of citations in this window." | |
| O5 | Content line (Ryan: "what percentage of citations are currently coming from the target domain") | "PocketGuard's own site makes up N% of citations in this window." N is the brand's own rows' share: equal to the donut's You slice, or slightly above it when Peec files an own subdomain under another type | |
| O6 | Technical line (Ryan: "how often competitors are cited as sources") | "Competitors' own websites make up 17% of citations in this window." | |
| O7 | Insights, not recommendations | No table; no "explore", "investigate", "test" or workstream text on the page | |
| O8 | Layout | Three cards side by side at 1440 and 1105; stacked at 375 | |

## 7. Opportunities on/off (Ryan: "toggle on/off the Opportunities page")

| # | Check | Expected | Result |
|---|---|---|---|
| T1 | Toolbar | "Opportunities page: on", immediately before Approve | |
| T2 | Click it | Reads "Opportunities page: off"; Opportunities section and menu item gone; Methodology reads 04 in the menu and its label | |
| T3 | Before you send count | Drops; no Opportunities fields listed | |
| T4 | Reload | Still off | |
| T5 | Open full size | Matches the editor (no Opportunities, Methodology 04) | |
| T6 | Click again | Back on; the three pillars return unchanged | |

## 8. Editing and the number checks

| # | Check | Expected | Result |
|---|---|---|---|
| E1 | Before you send on the fresh report | Labels name the pillar fields ("Pillar 1, data line" and so on); list any flags | |
| E2 | Edit "678" to "679" in Citation volume | Flagged as not matching Peec; revert, flag clears | |
| E3 | Edit "7.8" to "6.8" in Peer cluster | Flagged as not matching Peec; revert, flag clears | |

## 9. Approve, then Revoke (the frozen page)

| # | Check | Expected | Result |
|---|---|---|---|
| A1 | Turn Opportunities off, Approve | A test link (staging only) | |
| A2 | Open the link | No Opportunities, Methodology 04, everything else as in sections 3 to 5 | |
| A3 | Revoke | Link stops working | |

## 10. Older drafts and a second shape

| # | Check | Expected | Result |
|---|---|---|---|
| R1 | Open a draft generated before 2026-10-22 | Renders without error in its old layout (Headline signal, old order, table, old bullets); nothing broken | |
| R2 | The switch on that older draft | Works the same way | |
| X1 | Generate one other project with a different shape (custom source types or several own domains) | Renders; no "undefined", "NaN", empty bullet, or duplicate name; legend falls back cleanly if names are long | |

## 11. Throughout

| # | Check | Expected | Result |
|---|---|---|---|
| Z1 | Console and network on every page above | No errors, no failed requests | |
| Z2 | Long dashes in any text the tool wrote | None | |

## Exit

All PASS: send Ryan the staging link and the test report. Any FAIL: fixed on a feature branch off `dev` through the
normal gates, then this checklist runs again from the failing section.
