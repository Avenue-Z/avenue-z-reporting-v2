# Handoff: Organic Social, Jasmine's round 1 feedback (2026-09-29, updated 2026-09-30)

Written by me (Thomas) with Claude at the end of the 2026-09-29 session and brought up to date on 2026-09-30, after the
four builds and my local QA, so the next session picks up with nothing lost.
This file is in the public repo: it holds no brand ids, client figures, secrets, login details or security findings.
Those live in my private folder (section 11). Every SHA below was read from GitHub at the time of writing.

## 1. Where we are, in one paragraph
The October Organic Social build (locked months, chart notes, outline tabs, Commentary) is on staging, not production.
Jasmine reviewed staging and sent four feedback items, then we had a call (2026-09-29) and she answered five follow-up
questions on Slack (5:12 PM). Every item she raised is tracked. Four of her changes are built, passed my local QA on
2026-09-30 and wait on Paul's review (#284, #285, #291, #292); the fifth (#286, YTD from January) waits on a Google
Sheet she said she'd send 2026-09-30. Four other PRs on the same build also wait on Paul's review (#281, #282, #283,
#287). Production and Renaissance are untouched.

## 2. State (read from GitHub and Vercel, 2026-09-30)
| Ref | SHA | Note |
|---|---|---|
| `main` | `0722fe0c` | production source, untouched |
| `dev` | `8502f409` | |
| `staging` | `b8e199bf` | same files as `dev` (25 merge commits ahead, 0 file differences) |
| production deploy | `dpl_8wSnpe5X...` | built from `main`, 2026-09-23 |
| staging deploy | `dpl_G8s31VzK...` | 2026-09-29 14:10 ET |

Local worktrees (all clean, all equal to origin): the main checkout on `feat/os-chart-notes` `6201e8ea` (merged; never
branch from it) and one per active branch under `~/code/worktrees/reporting-ren-add-overview-<branch with / as ->`.

## 3. Jasmine's feedback, every item, and where it is tracked
Sources: her feedback table (Google Doc "Demo SOP / Feedback" tab), the call transcript (2026-09-29, reporting part
16:07 to 27:54; the call's AI summary is WRONG about Top Content, so build from the spoken lines), and her Slack answers.

Feedback table:
1. YTD Review: "We need this to be from Year to Date starting January 2026." Tracked in #286 (on hold for her sheet).
2. Data: "Can all percent changes be rounded up?" Slack: 6.3% shows 6%, 6.57% shows 7%. Tracked in #285.
3. Top Performing Content: "Can we only give the ability to sort by views and engagements. Remove Engagement Rate and
   Effectiveness." Call (26:06 to 26:28): sort buttons only; the post cards keep all four metrics. Tracked in #284.
4. Piper + PIMCO: remove the Overview tabs and add all the other features. Client setup, not code: done on staging
   (set up like A Place For Mom, from August). Production rows are a launch step (private checklist). No PR can hold
   it; there are no brand ids in this repo by rule.

Call:
5. Notes on days with no post (PR coverage etc.): I committed at 18:36. Tracked in #292.
6. Remove the August view once September is out (24:25): Slack confirmed clients only; the team keeps every month.
   Tracked in #291.
7. Lock on the 5th, clients see it on the 12th: unchanged (the defaults already).
8. YTD timeline: this month's cycle (the September report, which clients see Oct 12). Her data, not Dash, so the
   history matches what clients were already shown. Tracked in #286.

Slack answers (2026-09-29 5:12 PM): rounding as above (#285); month rule "yes" (#291); YTD sheet "will work on this
tmmr!" (#286); two logins for one person at Piper and PIMCO "cool!" (acknowledged; separate clients need separate
emails); Piper and PIMCO outlines, including Piper's X tab, coming, and "yes pls" to staying like A Place For Mom from
August meanwhile (no change until the outlines arrive).

Not ours (no action): the automations Slack channel, Glean skills testing, who edits Tina's skills, Paul's deck demo.

## 4. Every open PR
### Jasmine round 1 (label `jasmine-round-1`: four built, ready and waiting on Paul; #286 a draft on hold)
- #284 `feat/os-top-content-sort` `88842a59`. Top Content on outline tabs sorts only by Engagements and Views; cards keep
  all four metrics. Spec `docs/superpowers/specs/2026-09-29-top-content-sort-design.md`. Built, local QA passed, waiting on Paul.
- #285 `feat/os-whole-number-changes` `a37cdd2e`. Percent changes on outline tiles show the nearest whole number (halves
  away from zero, my decision); Piper's X tab too, through the Data part's fallback. Spec
  `docs/superpowers/specs/2026-09-29-whole-number-changes-design.md`. Built, local QA passed, waiting on Paul.
- #291 `feat/os-newest-month-for-clients` `5f861266`. New optional `reportingMonths.clientMonths` (1 to 36); with 1,
  clients pick only the newest opened month; the team keeps all, older ones tagged "No longer shown to clients".
  Visible from Oct 12. Spec `docs/superpowers/specs/2026-09-29-newest-month-for-clients-design.md`. Built, local QA
  passed, waiting on Paul. Must be live before Oct 12: once it reaches staging, its plan's Task 4 turns it on for the
  five clients there (dry run first, my go to write), then production at launch.
- #292 `feat/os-notes-without-posts` `6734b4f0`. The Add annotation panel offers every day up to today through a Day
  list; a note on a day with no post is a text-only card. Spec `docs/superpowers/specs/2026-09-29-notes-without-posts-design.md`.
  Built, local QA passed (a no-post note sits on a dot on the graph), waiting on Paul. Shares `note-form.tsx` and
  `chart-notes-ui.test.tsx` with #283 at other lines (proved clean).
- #286 `feat/os-ytd-from-january` `886bccec`. ON HOLD for her sheet. The spec marks its earlier Dash-history design
  superseded and lists what the sheet must settle: August's source (her sheet or our lock, which clients already see),
  which of the five clients have a tab, and that Piper's X tab has no YTD without X outline rows. Supplied figures go in
  the database through a guarded staging import with a contract-core data check, never in this repo.

### Same build, waiting on Paul (not drafts)
- #281 `fix/next-security-upgrade` `dd4a8a21`: next 16.3.6, next-auth beta.32, saves read their own writes (`updateTag`).
- #282 `fix/top-content-freeze-clock` `5d65f421`: a frozen Top Content range is judged on the clock that ended it.
- #283 `fix/chart-state-follows-server` `bd75c8f2`: the chart keeps a just-saved note until the refreshed answer arrives.
- #287 `fix/proxy-client-scope` `4b0faf09`: every page checks the client's own portal first. MUST merge before any real
  client gets a login. Paul re-requested after his seven comments were answered.

### Session recheck (from Paul's #287 comment)
- #293 `fix/session-recheck-every-request` `a25a5cba`, draft. Role and slug re-read from the database on every request;
  spec `docs/superpowers/specs/2026-09-30-session-recheck-design.md` (two fresh-eyed rounds); built test-first; merges
  clean with every open PR (all ten merged: 1866 tests pass). Its description lists the decisions for Paul.

### Closed 2026-09-29
- #290 `fix/seat-count-client-roles` (branch kept on origin at `cdc5b90c`): closed because it changed Renaissance's invite
  limit (my standing rule) and changes nothing for any other client. Do not reopen.

### Dormant (not this workstream; leave alone unless I say)
Mine: #234 (touches Renaissance), #180, #175, #165, #164, #162, #141. Paul's: #248, #219, #217, #211, #190 (edits
`sortable-top-content.tsx` and `post-card.tsx`, already conflicts with `dev` on its own), #146, #138.

### Issues open
#275 to #278 (chart notes and Top Content follow-ups).

## 5. Merge proof (final, 2026-09-29 night, against every PR's final head)
All nine open PRs (#281, #282, #283, #284, #285, #286, #287, #291, #292) merge clean with `dev` pair by pair in both
orders and all nine together in both orders. All nine merged onto `dev`: `tsc --noEmit` clean, 193 test files and 1853
tests pass. Shared files: `vitest.config.ts` (#285 with #281 and #287, at different lines; the merged include list keeps
every entry) and `note-form.tsx` with `chart-notes-ui.test.tsx` (#292 with #283; the Organic Social tests pass on the
merged tree). Re-run if any branch moves.

## 6. The standard every build follows (my rule, restated 2026-09-29)
1. A spec from the code: every claim cited to a file and line read in that session; nothing from memory or inference;
   anything unprovable by reading is marked UNVERIFIED; about 300 lines at most.
2. A fresh-eyed adversarial review of the spec: one foreground subagent, only the goal and the spec, the fixed checklist
   (inputs and outputs, every citation checked, parity with every reader, downstream conflicts, failure behaviour, a
   test for every output). BLOCKER and MAJOR fixed with targeted edits; round 2 reviews only the changed lines; at most
   two rounds; a MAJOR in round 2 stops and comes to me. Push after each step.
3. A scratch trial only where a wrong guess is expensive, and only after asking me.
4. Reconcile the plan to the reviewed spec (the spec wins).
5. Test-first code (watch each test fail), `make check`, my review, Paul's review. Never merge to `main` without my
   written go; production only after Jasmine approves staging.
#284, #285, #291 and #292 have passed every step up to Paul's review: reviewed specs, reconciled plans, test-first
code, `make check`, and my local QA (2026-09-30).

## 7. Decisions (dated, so nobody re-asks)
- Renaissance is off everything, in config, render AND behaviour (seat limits, access, anything). A one-off earlier
  approval does not stand (2026-09-29). Every change is a per-client opt-in or a default-off flag Renaissance never gets.
- Top Content: sort buttons only; cards keep all four metrics (call, 26:22 to 26:28).
- Rounding: nearest whole number; an exact half rounds away from zero by size (my decision, matching the tiles' rate
  rounding).
- Newest month: `clientMonths: 1` for the five clients; an invalid value fails closed like any other knob; an old link
  to an aged-out month goes to the newest month without a hidden-month log.
- No-post notes: a Day list beside the picture row, reversing the earlier "no date list" choice on purpose.
- Piper's X tab: rounds with #285; still no outline rows (so v1 tiles, no YTD) until her outline arrives.
- YTD: January to August from her sheet, our locked months from September.
- Password correction (I said on the call a new password "wipes them out"; it does not): I decided NOT to send it.
- Two facts I agreed are correct for any guide or demo (not sent to Jasmine unless I ask): notes and commentary reach
  clients only once approved and only after the month opens; a scorecard should be copied from the locked report, not
  from Dash on the 6th.

## 8. Open items, by who
- Jasmine: the YTD sheet (expected 2026-09-30); Piper and PIMCO outlines (no date); her approval of staging.
- Paul: reviews of #281, #282, #283, #287, and of #284, #285, #291, #292 (requested 2026-09-30); a decision on the security scan (`checks`/sca) that has failed on every PR
  since #279 went in on 2026-09-28 (high or critical dependency advisories with a fix; last pass 2026-09-25; no current
  PR caused it).
- Me (Thomas): the session length from Paul's #287 comment is decided: #293 (draft, `fix/session-recheck-every-request`)
  re-checks each login against the database on every request; its live local check waits on my go. Done 2026-09-30: I added
  Jasmine to `COMMENTARY_APPROVERS` in Vercel (Production and Preview/staging), checked with the app's own approver
  rule; it takes effect on each environment's next deploy.
- Launch (after Jasmine's staging approval and my written go): the five client rows in production copied from staging;
  production migrations; Jasmine's admin row in production; `CHART_NOTES_APPROVERS` in production; `clientMonths: 1` on
  all five once #291 ships; confirm the login link points at production; #287 merged first.

## 9. Next steps, in order
1. Session gate, then a status of five lines or fewer.
2. Paul's reviews as they come on all eight; I post review replies myself; fixes go on each PR's own branch.
3. On approval, each merges to `dev`, then `dev` to `staging` on my go.
4. #291 on staging: its plan's Task 4 (`clientMonths: 1` on the five clients; dry run first, my go to write). Must be
   live in production before Oct 12.
5. When Jasmine's sheet arrives: record it privately, settle the three open questions in #286's spec, re-review, plan,
   build.
6. Launch steps in section 8, after Jasmine approves staging and I give my written go.

## 10. Standing rules
- Writes to staging only, with written consent otherwise; host guard every script; dry run first; never `db:seed`.
- No background tasks; bound slow commands with `perl -e 'alarm N; exec @ARGV' --`; never touch `~/Desktop`,
  `~/Documents` or iCloud paths.
- Production database reads are blocked by the session's safety classifier: do not work around it; ask me. The
  Renaissance fingerprint script reads production, so it needs my go too.
- Private probes under `~/.claude/organic-social-work/probes/` run as `zz-*.ts` copies at the repo root, then deleted.
- Every PR stands alone off `dev`; prove merges; never force push. Never ask Jasmine questions directly; I send them.
- Never type or set passwords; never print secrets. Writing: plain English, first person as me, no em or en dashes.
- Shell gotchas on this Mac: no `tac` (use `tail -r`), bash 3 has no associative arrays, zsh arrays start at 1.
- End of session: `~/code/push-check.sh`, showing only this repo's lines.

## 11. Private records (on my machine, not in git, by design)
Under `~/.claude/organic-social-work/`:
- `HANDOFF-PROMPT-2026-09-29.md`: the paste-in prompt that points here.
- `ITINERARY-2026-09-29.md`: every PR, the critical path, the feedback coverage review.
- `jasmine-qa/ROUND-1-FEEDBACK-MASTER-2026-09-28.md`: her words verbatim, the call, the Slack answers (sections 11 to 13).
- `plans/2026-09-29-jasmine-round1-plan.md`: the state sections, newest at the end.
- `OCTOBER-CHECKLIST.md`: launch steps with the private details (section 5).
- `security/2026-09-29-access-audit.md`: security findings, never to be posted publicly.
- `plans/RESUME-2026-09-29-plans-D-E.md`: marked DONE, a record only.
Claude's memory for this project: `~/.claude/projects/-Users-thomaschangavenuez-code-reporting-ren-add-overview/memory/`.

## 12. Update, 2026-09-29 night: the four ready builds are built
The record of the builds. On my go, one at a time, each test-first from its plan (every new test watched failing first),
on its own branch. Sections 1 to 9 above are current as of 2026-09-30.

| PR | Head | Commits | `make check` |
|---|---|---|---|
| #291 newest month for clients | `5f861266` | `b0248436` parse, `5f861266` cap, tag, attempt rule | 1727 tests pass |
| #292 notes on days with no post | `6734b4f0` | `1ac08c6e` server days, `6734b4f0` Day list | 1727 tests pass |
| #285 whole-number changes | `a37cdd2e` | `6d6d76d2` rounding + card prop, `44fda3a7` outline tiles, `a37cdd2e` Piper X fallback | 1726 tests pass |
| #284 Top Content sort | `88842a59` | `88842a59` (Task 1 only; cards keep four) | 1721 tests pass |

- Each merges clean with every other open PR, pair by pair in both orders, and all nine together in both orders.
- All nine merged onto `dev` together: `tsc --noEmit` clean, 193 test files and 1853 tests pass.
- #292 with #283 merged: the Organic Social tests pass (257).
- Renaissance: every Organic Social golden and `render-invariant.test.tsx` pass unchanged on every branch; #284's T7 and
  #285's O4 pin that the parts Renaissance renders never get the new behaviour.
- CI on all four: `ci`, `test`, `rsc-boundary`, Vercel pass; `checks` (the repo-wide scan) fails as on every PR.
- Deviations, each written in its PR: #285's plan expected one card test to pass beforehand (it failed, correctly);
  #284's T5 was tightened because as planned it passed beforehand; #284 falls back to all four buttons on an empty
  filtered list (spec 3.1), not only an empty list; #291's edge-case list is in its PR body, not its commit bodies.

2026-09-30: I ran a local QA of all four together on the dev database (A Place For Mom, Instagram, August; Renaissance
for comparison). All passed; the results are a comment on each PR. A note on a day with no post sits on a dot on the
graph. All four were then marked ready for review with Paul requested. The throwaway QA checkout was removed.
