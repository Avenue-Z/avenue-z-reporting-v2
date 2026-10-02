# Staging QA: the October Organic Social batch (2026-10-02)

QA record for the ten PRs merged into `dev` and promoted to staging on 2026-10-02 (#281 #282 #283 #284 #285 #286 #287
#291 #292 #293, promotion #305, staging `f495f9a4`, deploy `dpl_AP5aL2JP...`). Public repo: no figures, no sheet link,
no login details, no security findings. The checklist was written from the sources below before anything on staging was
looked at, so every expected result was fixed in advance.

**Sources:** Jasmine's round 1 feedback table; her Slack answers of 2026-09-29; the 2026-09-29 call; her YTD sheet
message of 2026-10-01; Paul's 2026-10-01 approvals and the asks in them; the team's YTD sheet.
**Clients in scope:** A Place For Mom (Instagram, Facebook, LinkedIn), Akara Living, Kenect Nashville (Instagram),
Joy of Life (Instagram, Facebook, TikTok), PIMCO (LinkedIn), Piper Aircraft (Instagram, Facebook, LinkedIn, X).
Renaissance is the regression check.

## 1. Method
- Team side: my staff session in Chrome, every client's report page, every platform tab. Values read from the page's
  own text and from each YTD chart's own data, then compared with the team's YTD sheet read live through the app's
  parser (comparison kept privately).
- Writes during QA: one chart note and one Commentary draft on A Place For Mom, labelled "QA test", deleted afterwards
  (confirmed soft-deleted in the staging database). Nothing else changed.
- Renaissance: a fingerprint of its client row, users, the shared section templates, and counts of its notes,
  Commentary entries and lock rows, taken before the pass and compared after.

## 2. Team-side results (2026-10-02, 02:42 to 03:24 UTC): PASSED
| # | Check | Result |
|---|---|---|
| A1 | Staff sign-in, client list | PASS |
| A5 | Staff open every client | PASS |
| B2 | Team month picker | PASS: October in progress (team only), September (team only until Oct 12), August |
| B3 | From Oct 12 | PASS (the app's own month logic on staging's config: client September only; team both, August tagged) |
| C1 | Changes from 1% | PASS: whole numbers on every outline tile |
| C2 | Changes under 1% | PASS: one decimal; a flat change shows a muted 0% |
| C3 | Piper X arrow after a negative month | PASS (code): no such month in range; covered by #285's end-to-end test |
| C4 | Renaissance tiles | PASS: unchanged (its own one-decimal changes), same as production |
| D1 | Sort options, all 11 outline tabs | PASS: Engagements and Views / Impr. only |
| D2 | Post cards | PASS: keep all four metrics |
| D3 | Renaissance sort | PASS: unchanged |
| E1 | YTD block on every outline tab, from January | PASS |
| E2 | Every filled month equals the sheet | PASS on all 11 tabs |
| E3 | A month the sheet has not filled | PASS: our own tile value (including the live month) |
| E4 | N/A or blank before the first month | PASS: named gaps, never 0 |
| E5 | Columns not on the dashboard | PASS: ignored; Piper's X tab has no YTD block |
| E7 | Renaissance | PASS: no YTD block |
| F1-F4 | Piper and PIMCO | PASS: no Overview; Piper IG, FB, LI, X; PIMCO LI; same features as A Place For Mom; from August |
| G1 | Note on a day with no post | PASS |
| G2 | Day list end and UTC caption | PASS: a finished month ends on its last day; the live month ends yesterday (UTC) |
| G3 | Note before the first month | PASS (code): unreachable in the picker; the action refusal is tested in #292 |
| G4 | Edit, approve, hide, unhide, revoke, delete | PASS |
| G5 | Card buttons wait after a save | PASS (code): not observable in a background tab; tested in #283 |
| H1 | Commentary editor | PASS: opens, period prefilled, saves a draft, delete asks to confirm |
| H3 | Manage Access | PASS: opens; nothing changed |
| I1 | Every page loads with no error card | PASS (5 outline clients, every Renaissance section, every Avenue Z section) |
| I2 | Client logos | PASS |
| I3 | Renaissance unchanged | PASS: pages as before; database rows byte-identical to the baseline |

Notes from the pass (none blocks the batch):
- Two Renaissance graphs on staging showed "No data" on the default range while production showed data. Not code: the
  same code returns the data, and a fresh range draws the graph. A stale cached Dash answer; the underlying weakness is
  the existing CLAUDE.md follow-up "a failed Organic Social graph is never logged".
- After editing a note, no "Updated the draft" status line appeared (the first save showed its line). Re-check in a
  foreground tab during the client pass.
- Deleting a chart-note draft has no confirmation, where Commentary asks. A design question, not a defect.

## 3. Client-side checklist (to run 2026-10-02 morning)
**Prerequisite.** Only A Place For Mom has a client login on staging today. For Akara, Joy of Life, PIMCO and Piper, I
set a shared password and assign a test client user (a `.test` address) in Manage Access first; I type passwords
myself. Each client check is done signed in as that client's user, in its own browser window.

**Per client (all five), signed in as that client:**
| # | Check | Expected |
|---|---|---|
| CA1 | Sign in | Lands on that client's own portal |
| CA2 | Stay signed in | A refresh and a second tab keep the session |
| CA3 | Another client's portal URL | Refused or sent away; never the other client's data |
| CA4 | A staff page (`/dashboard`) | Refused |
| CA5 | Sign out | Signs out; a back-button visit asks to sign in |
| CB1 | Month picker | August only (no September until Oct 12, no October, no team tags) |
| CB2 | An old or hidden month by URL (September, October) | Served the newest allowed month (August) instead |
| CE1 | YTD block on every platform tab | Both graphs, January through August only, the same points the team sees for those months |
| CE2 | Gaps | Same named gaps as the team view |
| CC1 | Data tiles | Whole numbers from 1%, one decimal under 1% |
| CD1 | Top Content | Sort by Engagements and Views only; cards keep their metrics |
| CF1 | Tabs | A Place For Mom: IG, FB, LI. Akara: IG. Joy of Life: IG, FB, TikTok. PIMCO: LI. Piper: IG, FB, LI, X. No Overview |
| CG1 | Notes | No draft, hidden or unapproved note shows; no Add annotation control |
| CG2 | An approved note (team approves a "QA test" note on an August day for one client) | Appears for that client after a refresh, then gone after the team deletes it |
| CH1 | Commentary | No editor; only approved commentary for August shows (none today unless approved) |
| CH2 | An approved Commentary (team approves a "QA test" entry for August for one client) | Appears for that client, then gone after it is deleted |
| CI1 | Logo and name | The client's own logo and name |
| CI2 | Errors | No error card on any tab |

**Separation checks:** a Piper login never reaches PIMCO and the reverse (CA3); one client's approved test note never
shows to another client.

**Renaissance client view (regression, if its client test login is used):** looks as before; no YTD; unchanged sort.

**Cleanup:** every "QA test" note and Commentary created for the client pass is deleted afterwards and confirmed in the
staging database; the test client users and shared passwords stay (they are how the team views the client side).
