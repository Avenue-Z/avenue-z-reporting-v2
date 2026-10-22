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
| P1 | Signed in to `staging.reporting.avenuez.com` in the browser pane (I sign in; Claude never enters a password) | `/tools/new-business` loads, not `/login` || PASS: already signed in; the hub loads |
| P2 | Console on the hub | No errors || PASS: no console errors |

## 1. Settings (`/tools/new-business/settings`)

| # | Check | Expected | Result |
|---|---|---|---|
| S1 | Field labels | "Sources section title" and "Visibility section title" present; "Most opportunities from Peec recommendations" absent || PASS: both labels present; the Peec recommendations field is absent |
| S2 | Section titles values | "Cited Sources" and "Competitive Visibility". If different, set exactly these and save || PASS after a fix: staging held "Category data" / "Competitive visibility" (the saved row Paul predicted); set to Ryan's names and saved |
| S3 | Reload | Values persist || PASS: persists after reload |

## 2. Generate the test report

| # | Check | Expected | Result |
|---|---|---|---|
| G1 | Hub: New snapshot, pick PocketGuard, start and end 2026-10-19, Generate | Generation starts || PASS: report `db61f066` |
| G2 | Progress checklist | Seven rows: Finding the project in Peec; Reading the brands tracked; Reading the project profile; Finding the days with data; Loading brand visibility and AI models; Loading the sources AI used; Writing the copy. No "Loading Peec's recommendations" || PASS: exactly the seven rows listed |
| G3 | Finishes | Opens as a draft, no failure message || PASS: opened as a draft |
| G4 | About this data | No "Peec actions could not be loaded" warning || PASS: Before you send (0), no actions warning |

## 3. Page order and names (Ryan: "Changing headline signal page title to Executive Summary"; "Competitive Vis page will go before it"; "renamed to Cited Sources")

| # | Check | Expected | Result |
|---|---|---|---|
| M1 | Menu, top to bottom | 01 Executive Summary, 02 Competitive Visibility, 03 Cited Sources, 04 Opportunities, 05 Methodology || PASS |
| M2 | Section labels on the page, in page order | "Executive Summary"; "02 / Competitive Visibility"; "03 / Cited Sources"; "04 / Opportunities"; "05 / Methodology" || PASS |
| M3 | Section titles | Competitive Visibility section titled "Competitive Visibility"; sources section titled "Cited Sources" || PASS |
| M4 | "Headline signal" or "Category data" anywhere on the page | Absent || PASS: neither appears |
| M5 | Click each menu item | Scrolls to that section; the highlight follows the page order || PASS: menu links target the sections in page order |
| M6 | Same checks in Open full size (preview) | Identical || PASS: checked in Open full size |

## 4. Competitive Visibility (Ryan's Q1 template for this page, and the bar chart)

| # | Check | Expected | Result |
|---|---|---|---|
| CV1 | Bullet 1 | "Next-tier gap:" "PocketGuard is 5.4 percentage points behind Quicken in visibility." || PASS, word for word |
| CV2 | Bullet 2 | "Top-tier distance:" "PocketGuard is 20.5 percentage points below the top-three average visibility of 53.8%." || PASS, word for word |
| CV3 | Bullet 3 | "Peer cluster:" "PocketGuard sits within a 7.8-point visibility range alongside Quicken and You Need A Budget." || PASS, word for word |
| CV4 | Competitor domain gaps (Ryan: "Only include competitor domains") | If present, the fourth bullet. Every listed domain is the own site of a competitor in the bar chart (or a subdomain of one); no editorial, review or other third-party site; never pocketguard.com || **FAIL (decision):** ynab.com, monarchmoney.com, copilot.money, actualbudget.org. All four are compared competitors' own sites, but Copilot and Actual Budget rank below the 10 brands the chart shows (18 are compared) and are named nowhere else on the page: the shape of Ryan's original complaint |
| CV5 | Bar numbers against the bullets | Quicken 38.7, PocketGuard 33.3, YNAB 57.5, Monarch 52.8, Monarch Money 51.2, You Need A Budget 30.9 || PASS: all six values match |
| CV6 | Gap under the title (Ryan: "not a big gap between the chart and the overhead title") | Chart title to figure 0px, figure top to plot about 8px, at 1440 and 1105 (editor) widths || PASS: 0px and 8px at 1024, 1105 and 1440 |
| CV7 | Grey behind the bars (Ryan: "eliminate the grey gradient") | Plot area `#000000`; no `#1a1a1a` plot area; faint gridlines are fine || PASS: plot and paper `#000000`; no `#1a1a1a` anywhere in the chart |

## 5. Cited Sources (Ryan's Q1 template for this page, and the donut)

| # | Check | Expected | Result |
|---|---|---|---|
| CS1 | Bullet 1 | "Citation volume:" "PocketGuard.com appears in 678 retrieved citations." || PASS, word for word |
| CS2 | Bullet 2 | "Citation rate:" "PocketGuard is cited in 12% of tracked answers." || PASS, word for word |
| CS3 | Bullet 3 | "Source-type mix:" "Corporate sources account for 37% of citations, followed by Editorial sources at 19%; UGC accounts for 8%." || PASS, word for word |
| CS4 | Donut slices against Peec's Domain types for 2026-10-19 | Corporate 37, Editorial 19, Competitor 17, UGC 8 (measured 36.7, 18.8, 17.1, 8.0); every other slice equals Peec's dashboard for that day || PASS: 37, 19, 17, 9, 8, 4, 3, 2 |
| CS5 | Legend in 2 columns (Ryan: "Split the Domain Types ... into 2 columns vs. one") | At 1440, 1105 and 1000: two distinct column starts, no name running into its neighbour || PASS: two columns, no overlap, at 1024, 1105 and 1440 |
| CS6 | Phone width 375 | The legend flows (one list), names readable, slice labels kept || PASS: flowing, labels "Corporate 37%" and so on, no overflow, no sideways scroll |
| CS7 | Hide a slice by clicking its legend entry, then change the width | The slice stays hidden || PASS: Editorial stayed hidden through two width changes |

## 6. Opportunities (Ryan: "follow the three pillars shown in our audit slide"; "a one liner under each pillar that connects the data from this report to each")

| # | Check | Expected | Result |
|---|---|---|---|
| O1 | Title | "The Pillars of AI Search" || PASS |
| O2 | Cards in order, names | Earned & Affiliate Media; Content and Creative; Technical Optimizations || PASS |
| O3 | Descriptions | Earned and Technical word for word from the slide. Content: the slide's sentence completed as "...to better influence how LLMs answer the questions buyers ask." (the slide cuts off after "LLMs for") || PASS (Content ending as decided) |
| O4 | Earned line (Ryan: "X percent of citation sources are coming from editorials") | "Editorial sites make up 19% of citations in this window." || PASS |
| O5 | Content line (Ryan: "what percentage of citations are currently coming from the target domain") | "PocketGuard's own site makes up N% of citations in this window." N is the brand's own rows' share: equal to the donut's You slice, or slightly above it when Peec files an own subdomain under another type || PASS: 4.1% beside the donut's You 4%. See the rounding finding below |
| O6 | Technical line (Ryan: "how often competitors are cited as sources") | "Competitors' own websites make up 17% of citations in this window." || PASS |
| O7 | Insights, not recommendations | No table; no "explore", "investigate", "test" or workstream text on the page || PASS: no table, none of those words |
| O8 | Layout | Three cards side by side at 1440 and 1105; stacked at 375 || PASS: side by side at 1105 and 1440, stacked at 375 |

## 7. Opportunities on/off (Ryan: "toggle on/off the Opportunities page")

| # | Check | Expected | Result |
|---|---|---|---|
| T1 | Toolbar | "Opportunities page: on", immediately before Approve || PASS |
| T2 | Click it | Reads "Opportunities page: off"; Opportunities section and menu item gone; Methodology reads 04 in the menu and its label || PASS |
| T3 | Before you send count | Drops; no Opportunities fields listed || PASS: count stayed 0, nothing listed |
| T4 | Reload | Still off || PASS |
| T5 | Open full size | Matches the editor (no Opportunities, Methodology 04) || PASS |
| T6 | Click again | Back on; the three pillars return unchanged || PASS: on the copy `1603b65f`; pillars unchanged |

## 8. Editing and the number checks

| # | Check | Expected | Result |
|---|---|---|---|
| E1 | Before you send on the fresh report | Labels name the pillar fields ("Pillar 1, data line" and so on); list any flags || PASS: zero flags on the fresh report |
| E2 | Edit "678" to "679" in Citation volume | Flagged as not matching Peec; revert, flag clears || PASS: "679" flagged; cleared on revert |
| E3 | Edit "7.8" to "6.8" in Peer cluster | Flagged as not matching Peec; revert, flag clears || PASS: "6.8" flagged; cleared on revert |

## 9. Approve, then Revoke (the frozen page)

| # | Check | Expected | Result |
|---|---|---|---|
| A1 | Turn Opportunities off, Approve | A test link (staging only) || PASS: link on the staging domain |
| A2 | Open the link | No Opportunities, Methodology 04, everything else as in sections 3 to 5 || PASS: no Opportunities, Methodology 04, not editable |
| A3 | Revoke | Link stops working || PASS: "This link is not available." |

## 10. Older drafts and a second shape

| # | Check | Expected | Result |
|---|---|---|---|
| R1 | Open a draft generated before 2026-10-22 | Renders without error in its old layout (Headline signal, old order, table, old bullets); nothing broken || PASS: Ryan's Oct 19 draft `1b780680` renders in its old layout; read only, not changed |
| R2 | The switch on that older draft | Works the same way || PASS: on my older draft `56567fff`, off then back on |
| X1 | Generate one other project with a different shape (custom source types or several own domains) | Renders; no "undefined", "NaN", empty bullet, or duplicate name; legend falls back cleanly if names are long || PASS with findings: A Place for Mom (rerun `7c7bb284`) renders cleanly, but see the peer cluster and rounding findings |

## 11. Throughout

| # | Check | Expected | Result |
|---|---|---|---|
| Z1 | Console and network on every page above | No errors, no failed requests || PASS: the only 404 was the revoked link; aborted requests are navigations |
| Z2 | Long dashes in any text the tool wrote | None || PASS: none |

## Results (2026-10-22, staging `326e9f56`)

54 checks: 53 PASS (one after a staging Settings fix), 1 FAIL that needs a decision (CV4), and the findings below. Test
reports left on staging: `db61f066` (revoked), `1603b65f` (draft copy), `7c7bb284` (A Place for Mom rerun), `2cc1e8a2`
(failed: no Peec data for that week, the correct message).

**Findings to settle before Ryan reviews:**
1. **Gap domains for competitors the page never shows (CV4).** On PocketGuard, copilot.money and actualbudget.org are
   compared competitors' own sites, but those brands rank 11th and below, so they are not in the 10-bar chart and are
   not named anywhere on the page. Ryan's complaint was "some of the domains listed were not competitors mentioned".
   Option: list only the competitors the chart shows (`charts.ts:46-49`, top 10 with the brand).
2. **A "peer cluster" 96.4 points wide (X1).** A Place for Mom: "sits within a 96.4-point visibility range alongside
   Care and Caring" (Care 98.6, A Place for Mom 3.1, Caring 2.2). Accurate to Ryan's template, but not a cluster.
   Option: drop the bullet above a width, or name only the closer neighbour.
3. **One number, two roundings (O5, X1).** The pillar lines print one decimal under 10% while the donut and the
   source-mix bullet print whole numbers: A Place for Mom shows Editorial "2%" in the bullet and the donut but "2.4%" in
   the pillar; PocketGuard shows You "4%" on the donut and "4.1%" in the pillar. Option: the pillar lines use the
   source-mix bullet's rule (bullets spec D5).
4. **Report name on staging is "AI Visibility Snapshot 2"** (Settings, Report name; the default is "AI Visibility
   Snapshot", `config.ts:92`). Every staging report's header and tab title carry the "2". A saved setting, not code.

**What happened to them (2026-10-22):** findings 1 to 3 are fixed in #420 (`fix/aeo-outbound-round3-qa` into `dev`),
with a spec, two review rounds, tests first and a final review whose two findings were also fixed. Finding 4 is done on
staging: Report name is back to "AI Visibility Snapshot" (the "2" was a test value saved on 2026-10-14). After #420
reaches staging, CV4, X1 and O5 run again on fresh reports and are recorded here.

## Re-check after #420 (2026-10-22, staging `3f82cd20`, via #421)

#420 was reviewed by two fresh adversarial reviewers (one fuzzing 3,000 reports), checked against live Peec data read
only, and clicked through on the dev database; its later findings were fixed test first (gaps by the competitor a
domain names; pillars use the donut's own label; no "accounts for 0.0%"). Then, on staging:

| # | Check | Result |
|---|---|---|
| CV4 | PocketGuard 2026-10-19 (`0197d0ef`) gaps | PASS: "The largest gaps include ynab.com at 488 retrievals and monarchmoney.com at 213." Both on the chart. The other charted competitors' sites mention PocketGuard (left out by rule D1); copilot.money, actualbudget.org and empower.com are off the chart |
| X1 | A Place for Mom (`0a31b0ef`: Care 98.6, the brand 3.1, Caring 2.2) | PASS: no peer cluster; Next-tier gap, Top-tier distance and the gaps (care.com, caring.com, seniorly.com, all charted) |
| O5 | Pillars against the donut | PASS: PocketGuard 19%, 4%, 17% (donut 19, 4, 17); A Place for Mom 2%, 3%, 1% (donut 2, 3, 1) |
| CV1-3, CS1-3 | Ryan's six sentences | PASS, word for word |
| M1-M4 | Order and names | PASS: Executive Summary, Competitive Visibility, Cited Sources, The Pillars of AI Search, Methodology; header "AI Visibility Snapshot" |
| CV7, CS5 | Charts | PASS: bar plot `#000000`, top margin 8; legend `entrywidth` 0.5 |
| E1 | Flags on the fresh reports | PASS: PocketGuard 0; A Place for Mom 1, the existing "Care shows 98.6% AI visibility, which is unusually high" data note |
| S1-S3 | Settings | PASS: "Cited Sources", "Competitive Visibility", Report name "AI Visibility Snapshot" |
| S4 | Ryan can change the titles | PASS (from code and history): Settings opens for admins, and everyone on the tool's environment list is an admin (`access.ts`); staging's Settings user and admin lists are empty and have never changed, and Ryan made a staging draft on 2026-10-19, so he is on that list. The environment value itself cannot be read |

**Ready for Ryan.**

## Exit

All PASS: send Ryan the staging link and the test report. Any FAIL: fixed on a feature branch off `dev` through the
normal gates, then this checklist runs again from the failing section.
