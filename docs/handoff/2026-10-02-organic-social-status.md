# Organic Social: current status (2026-10-02, about 03:40 UTC, end of night)

Written by me (Thomas) with Claude so the next session picks up with nothing lost. This file is the current state.
The 2026-10-01 doc beside it is the previous state (superseded), the 2026-09-30 doc before that, and the 2026-09-29 doc
is the history and dated decision log. Public repo: no brand ids, client figures, secrets, login details, links to
client data or security findings. Those live in my private folder (section 11). Every SHA, state and check below was
read from GitHub, git, Vercel or the staging database at the time of writing.

## 1. Where we are, in one paragraph
All ten October PRs were approved by Paul on their current heads, merged into `dev`, and promoted to staging (#305).
The YTD-from-the-sheet part and "clients see only the newest month" are switched on for the five outline clients on
staging. A full team-side QA pass on staging passed for every client and tab (section 5). **Next, first thing in the
morning: the client-side QA pass** (checklist in `docs/qa/2026-10-02-october-batch-staging-qa.md`, section 3). Then my
meeting with Jasmine; production waits for her approval on staging and my written go.

## 2. State
| Ref | SHA / id | Note |
|---|---|---|
| `main` | `0722fe0c` | production source, untouched |
| `dev` | `7243ec7f` | all ten PRs merged |
| `staging` | `f495f9a4` | `dev` promoted (#305); same files as `dev` |
| production deploy | `dpl_8wSnpe5X...` | from `main`, 2026-09-23, untouched |
| staging deploy | `dpl_AP5aL2JP...` | from `f495f9a4`, 2026-10-02 02:30 UTC, Ready |
| `feat/os-ytd-auto-tabs` | `a8c255aa` | docs only (spec + plan), no PR yet; see section 7 |
| `docs/handoff-2026-09-29` | this branch | status docs and the QA record; not merged |

## 3. What merged (2026-10-02, all approved by Paul on the merged head)
| PR | Merge commit | What it does |
|---|---|---|
| #281 | `777e8982` | next 16.3.6, next-auth beta.32, saves use `updateTag`; the dependency fixes that turned the scan green (all `@tiptap` to 3.31.4; Commentary editor gains `role="textbox"`) |
| #287 | `41a2a391` | each client can open only its own portal (page-level checks) |
| #282 | `c9a0aa41` | the older Top Content freeze and the range share one clock |
| #283 | `6af45a72` | the chart follows the server per day after a save |
| #284 | `002a5e9e` | Top Content sorts by Engagements and Views only (outline clients) |
| #285 | `eb032aef` | whole-number changes on outline tiles, one decimal under 1%; outline fallback arrow fixed |
| #291 | `921d924d` | optional `clientMonths`: clients see only the newest opened months |
| #292 | `7b3bd285` | a Day list so a note can go on a day with no post |
| #293 | `695e7a13` | each login's role and client re-read on every request |
| #286 | `7243ec7f` | YTD Review from the team's YTD sheet (`ytd-review@2`, opt-in per client) |
| #305 | `f495f9a4` | promotion `dev` to staging |

How: #281 first (merged by me), then `dev` merged into the other nine branches (merge commits only) so their scans
re-ran green, then the other nine merged in order with the tested merge script (Paul's approval on the current head or
an earlier head followed only by merges of `dev`, expected head, all checks green, mergeable), then #305 with every
check green. Issues #276, #277 and #278 closed by hand (fixed by #283 and #282).

## 4. Staging configuration written tonight (staging only, guarded, dry run first, my go)
- **YTD from the sheet:** the five outline clients (A Place For Mom, Akara, Joy of Life, PIMCO, Piper) have
  `dash_social_config.ytdSheets["2026"] = { sheetId, tab }` and their `ytd-review` pin moved from 1 to 2. The dry run
  read every tab with the app's own parser and printed each tab's CLIENT row, which matched each client.
- **Newest month only:** the same five have `reportingMonths.clientMonths = 1`. Checked with the app's own month logic:
  today a client sees August only; from Oct 12 a client sees September only and the team sees August tagged "No longer
  shown to clients".
- **Renaissance:** excluded by name in both writes, fingerprinted inside each transaction, and unchanged afterwards.
- **Production:** nothing written. The same two changes go to production with the launch, with my written consent.
  Production's `ytdSheets` waits for the runtime tab check (#299, section 7).

## 5. Team-side QA on staging (passed)
Full results: `docs/qa/2026-10-02-october-batch-staging-qa.md`, section 2. In short:
- Every Jasmine change works on every outline client and tab: YTD from January (every plotted point equals the sheet;
  months the sheet has not filled show our own value; missing months are named gaps, never 0), rounding, the sort
  options, Piper and PIMCO set up like A Place For Mom, notes on days with no post, Commentary, Manage Access, logos.
- No error card on any page of any client.
- Renaissance looks as before on staging and its database rows are byte-identical to a baseline taken before the pass.
- Test data: one chart note and one Commentary draft, labelled "QA test", created and deleted (soft-deleted).
- Renaissance note (no action needed, my call 2026-10-02): two Renaissance graphs on staging showed "No data" on the
  default range while production shows data; proved to be a stale cached Dash answer on staging, not code (the same code
  returns the data; a fresh range draws the graph). The underlying weakness is the existing CLAUDE.md follow-up "a failed
  Organic Social graph is never logged".

## 6. Next steps, in order
**Morning priorities (my note, 2026-10-02 just after midnight ET):** (a) in the Jasmine meeting, settle the source of
truth for the YTD graphs with her, since it changes values on the chart (staging plots her sheet today; going back to
Dash is a per-client pin change to version 1, a staging write); (b) the client-side QA; (c) confirm the automatic tab
plan (section 7) covers her adding clients to the sheet; (d) a read-only audit proving every item of her feedback is
accounted for, because after she tests staging we go live; (e) rewrite the team SOP in plain English from the code
only, covering dates, time ranges, cutoffs and every edge case.

1. **Client-side QA on staging** (checklist: the QA record, section 3). Prerequisite: only A Place For Mom has a client
   login on staging today; Akara, Joy of Life, PIMCO and Piper need a shared password and a test client user set in
   Manage Access first (I enter passwords myself; Claude never types them).
2. **Meeting with Jasmine** (2026-10-02). Two messages are drafted and held until after it: confirming her sheet is the
   source of truth for the YTD graphs, and the one-line heads-up on the rounding rule (Paul's ask on #285).
3. **Piper and PIMCO:** good to go as set up (like A Place For Mom, from August); their own outlines are pending from
   Jasmine, and we update their outline layout when they arrive.
4. **Production launch** after Jasmine approves staging and my written go: on `main` by 2026-10-07; production writes
   (client rows, `clientMonths`, migrations, Jasmine's admin row, `CHART_NOTES_APPROVERS`, `NEXT_PUBLIC_APP_URL` check)
   per my private launch checklist; `clientMonths: 1` live in production before 2026-10-12.

## 7. Follow-ups (tracked)
- **Auto tabs** (`feat/os-ytd-auto-tabs`, spec `docs/superpowers/specs/2026-10-01-ytd-auto-tabs-design.md` and plan,
  both reviewed): one setting per year names the sheet, each client's tab is matched by name and never guessed, an
  override is checked against the tab list. Nice to have, not needed for the demo. #286 has now merged, so the branch can
  bring `dev` in and be built test-first. It closes #299 (the runtime check production `ytdSheets` waits for).
- Issues from Paul's approvals: #296 (Node 22), #297 (react-simple-maps), #298 (Renaissance arrow, its own PR), #299 and
  #300 (YTD reader), #301 (before client logins), #302 (staff session limit and cap), #303 (log id and unavailable page),
  #304 (staging timing against the agreed bar; Paul to confirm the numbers). #275 still open.
- Held because it would change Renaissance: #284's toolbar accessibility, the `toISO` and GA4 picker follow-up.

## 8. Decisions made 2026-10-01 to 2026-10-02 (never re-ask)
- Jasmine's sheet is the source of truth for the YTD graphs; a month it has not filled shows our value; the source
  caption is held.
- Automatic tab matching: a name that does not match uses a one-line override (never looser matching); built as its own
  PR after #286.
- YTD on for the staging demo; production `ytdSheets` waits for the runtime tab check.
- Paul: every request re-checks the session (no cache); staff ~24 h limit plus a 30-day cap as a follow-up; the scan
  had to be green before merging (done in #281); Renaissance's arrow fixed in its own PR after the batch.
- Claude runs the tested merge and promotion scripts itself (my instruction, 2026-10-02); production still needs my go.

## 9. How work runs here (unchanged)
Spec from code, a fresh-eyed adversarial review (max two rounds), plan reconciled to the spec, test-first code,
`make check`, my review, Paul's review. Staging writes only with a host guard, a dry run and my go; production writes
need my written consent. Renaissance is never changed. Never force push.

## 10. Known gotchas (from tonight)
- A background Chrome tab is throttled: pages take 30 s or more and clicks may not land; screenshots force a render.
- The tab parameter is `subsection=organic-<platform>` (for example `organic-facebook`, `organic-x`); an unknown value
  falls back to the first tab.
- Next's data cache keeps a Dash answer for an hour, including an empty one.

## 11. Private records (on my machine, by design)
Under `~/.claude/organic-social-work/`: the paste-in handoff prompt `HANDOFF-PROMPT-2026-10-02.md`, the itinerary, the
launch checklist, the full QA checklists with results, the merge script, the staging switch-on and `clientMonths`
scripts and their outputs, the Renaissance baseline, and the YTD sheet's link and structure.
