> **Superseded on 2026-10-01** by `2026-10-01-organic-social-status.md` beside it. Kept as the 2026-09-30 record.

# Organic Social: current status (2026-09-30, end of day)

Written by me (Thomas) with Claude so the next session picks up with nothing lost. This is the current state; the
2026-09-29 doc beside it (`2026-09-29-organic-social-jasmine-round-1.md`) is the history and the dated decision log.
This file is in the public repo: no brand ids, client figures, secrets, login details or security findings. Those are in
my private folder (section 10). Every SHA, state and check below was read from GitHub, git or Vercel at the time of
writing.

## 1. Where we are
- Jasmine's four round 1 changes are built, tested, passed my local QA, and wait on Paul (#284, #285, #291, #292).
- YTD from January (#286) waits on her Google Sheet.
- The session recheck from Paul's #287 comment is built and waits on Paul (#293).
- Her client logos are merged and live on staging (#294, promoted by #295). Nothing else has merged.
- Production code and deploys are untouched. One production setting changed: I added Jasmine to `COMMENTARY_APPROVERS` in
  Vercel (Production and Preview/staging); it takes effect in production only with the launch deploy. Renaissance is
  untouched (its logo stays as is; Jasmine confirmed).
- The team SOP is written from the code and checked against it by two fresh-eyed reviews.

## 2. State
| Ref | SHA | Note |
|---|---|---|
| `main` | `0722fe0c` | production source, untouched |
| `dev` | `b48de420` | the logos (#294) plus a no-change update from staging |
| `staging` | `ef1aa184` | same files as `dev` |
| production deploy | `dpl_8wSnpe5X...` | from `main`, 2026-09-23 |
| staging deploy | `dpl_JAadkRoU...` | 2026-09-30 15:11 ET, the logos; serves all five byte for byte |

Merged today, and nothing else: #294 (`dev` gained only the five logo files) and #295 (`staging` gained only the same five).

## 3. Open PRs (all into `dev`, each standalone)
CI on every open PR: `ci`, `test`, `rsc-boundary` and Vercel pass; all are mergeable. The `checks` job fails on every PR
and on `dev` since #279 (2026-09-28); it scans dependencies; a decision with Paul is open.

| PR | Branch @ head | What it does | State | Waiting on |
|---|---|---|---|---|
| #281 | `fix/next-security-upgrade` @ `dd4a8a21` | next 16.3.6, next-auth beta.32, saves read their own writes | open | Paul |
| #282 | `fix/top-content-freeze-clock` @ `2f83e5a2` | the older Top Content freeze uses the same clock as the range | open | Paul (the server clock check is done: Vercel's functions run on UTC, so nothing changes where it runs; evidence in my PR comment, 2026-09-30) |
| #283 | `fix/chart-state-follows-server` @ `d5969442` | the chart follows the server per day after a save | open | Paul |
| #284 | `feat/os-top-content-sort` @ `88842a59` | Top Content sorts by Engagements and Views only; cards keep four | open, ready | Paul |
| #285 | `feat/os-whole-number-changes` @ `a37cdd2e` | whole-number percent changes on outline tiles and Piper's X tab | open, ready | Paul |
| #286 | `feat/os-ytd-from-january` @ `886bccec` | YTD from January, from Jasmine's numbers | draft, on hold | Jasmine's sheet |
| #287 | `fix/proxy-client-scope` @ `fb7893d0` | every page checks the client's own portal | open | Paul's re-review; the launch gate. The code-review bot's three minor findings are answered (2026-09-30): two fixed (a test and ENGINEERS.md), one needs no change, reasons in my PR comment |
| #291 | `feat/os-newest-month-for-clients` @ `b63e25f3` | optional `clientMonths`: clients see only the newest opened months | open, ready | Paul; then turn it on (section 6) |
| #292 | `feat/os-notes-without-posts` @ `6734b4f0` | a Day list so a note can go on a day with no post | open, ready | Paul |
| #293 | `fix/session-recheck-every-request` @ `79a8a178` | each login's role and client re-read on every request | open, ready | Paul; then a live check on staging |

Closed: #290 (changed Renaissance's invite limit; never reopen). Issues #275 to #278 are open. #283 fixes #276 and #277
and #282 fixes #278, but they target `dev`, so GitHub will not close the issues: close them by hand when those merge.
#275 stays open.

Merge proof, re-run after `dev` moved: each open PR merges clean onto `dev` `b48de420`, and all ten together in both
orders. Shared files: `vitest.config.ts` (#281, #285, #287, #293 at different lines), `note-form.tsx` and
`chart-notes-ui.test.tsx` (#292 and #283), `CLAUDE.md` (#282, #283, #293 at different places),
`annotation-callouts.tsx` (#281 and #283), and both `reports/page.tsx` routes (#283 and #287). No pair conflicts.

## 4. Jasmine's round 1, item by item
| Her ask | Where | Status |
|---|---|---|
| YTD from January 2026 | #286 | waiting on her sheet (expected 2026-09-30, no deadline given) |
| Percent changes rounded (6.3 shows 6, 6.57 shows 7) | #285 | built, with Paul |
| Sort Top Content by views and engagements only (cards keep all four, call 26:22) | #284 | built, with Paul |
| Piper and PIMCO: no Overview, all features | staging config | done on staging; production rows at launch |
| Notes on days with no post (call 18:36) | #292 | built, with Paul |
| Clients stop seeing August once September opens (Slack: clients only) | #291 | built, with Paul; switched on per client after merge |
| Lock on the 5th, open on the 12th | defaults | unchanged, as she asked |
| Client logos (her Drive folder) | #294 | on staging; Renaissance's logo unchanged, as she confirmed |
| Piper and PIMCO outlines (including Piper's X tab) | none yet | waiting on her |

## 5. Decisions (dated; never re-ask)
- Renaissance is off everything, config, render and behaviour. Dated exceptions that reach it because they apply to
  everyone: #293 (my explicit OK, 2026-09-30), #287, #281, #283 (renders the same with no notes), #282 (clock check done:
  unchanged on UTC servers). Its logo stays as is (Jasmine, 2026-09-30).
- Round 1: sort buttons only; nearest whole number, halves away from zero; `clientMonths: 1` for the five clients; a Day
  list for no-post notes; YTD January to August from her sheet, our locks from September.
- Session recheck: every request, not hourly (a timed check cannot be saved; see the #293 spec). A login lasts 30 days
  from sign-in.
- Logos: we use what Jasmine sends and make it fit (her artwork whole, padded into squares); no questions back to her.
- Never ask Jasmine questions myself; I send what's needed. Not sent to her, by my choice: the password correction, and
  two clarifications (notes and Commentary need approval before clients see them; copy scorecards from the locked
  report, not Dash). Her Glean question on the call (who to tag for edits to Tina's skills) had no answer on the
  recording.

## 6. Next steps, in order
1. Paul's reviews of the nine PRs; I post review replies myself. (The #287 bot review audit and fixes, and the #282
   clock check, were done 2026-09-30.)
2. On approval, merge each to `dev`, then promote `dev` to `staging`. Staging only accepts a branch that is up to date
   with it; bring `dev` up to date first (GitHub's "Update branch" on the promotion PR).
3. #291 on staging: its plan's Task 4 sets `clientMonths: 1` on the five clients (dry run first, my go to write). It must
   be live in production before 2026-10-12, when September opens to clients. The launch target is on `main` by
   2026-10-07, so the team can write and approve Commentary in production on 7 to 9 October.
4. #293 on staging: the live check (a test client viewer loses access on the next click after their row changes; staging
   write, dry run, my go).
5. After 2026-10-05: check that Piper's X tab actually locked September.
6. When Jasmine's sheet arrives: rework #286's spec, review, plan, build. Her figures go into the database through a
   guarded staging import with a data check, never into the repo.
7. Launch, after Jasmine approves staging and my written go: #287 first; the five client rows, migrations, Jasmine's
   admin row and the note approvers in production; the logos arrive with the launch deploy; confirm the login link.
8. Keep the team SOP current whenever behaviour changes (next: #286, then any change Jasmine asks for).
9. Launch checklist sections 1 to 4 triaged 2026-09-30: most were done; Jasmine's staging approval and the self-review
   for staging to main moved into the launch steps. Still open, none blocking launch: a note for the team on the deck
   numbers Dash cannot reproduce, an August drift check, a data contract decision (with #286), two small cleanups.

## 7. How work runs here
- Every build: a spec from the code, a fresh-eyed adversarial review (at most two rounds), the plan reconciled to the
  spec, test-first code, `make check`, my review, Paul's review. Push after every step. Never force push.
- Claude cannot approve or merge its own PRs (the permission system blocks self-approval). When I want something merged,
  Claude writes a tested script with safety stops and I run it.
- Staging writes only, with a host guard and a dry run first; production writes need my written consent.

## 8. Known gotchas (each cost time on 2026-09-30)
- Staging requires the incoming branch to be up to date with it; a promotion from a `dev` that lacks staging's merge
  commits is refused until `dev` is updated (no file changes).
- Scripts that compare sorted lists must set `LC_ALL=C`; my Terminal sorts differently from Claude's shell.
- Never edit a script while it is running: bash reads it as it goes.
- The feature worktrees need `npm ci` before tests run.
- In Claude's shell: zsh does not split `$VAR` into words (use bash for loops over lists); `grep` is aliased (use
  `/usr/bin/grep`); a foreground `sleep` is blocked.

## 9. The SOP
"Organic Social Reporting SOP", a Claude doc: https://claude.ai/code/artifact/c26a0f18-fa69-4745-b264-7864d402cb6e
(private until I share it). Written for the October launch build; every line checked against the code.

## 10. Private records (on my machine, by design)
Under `~/.claude/organic-social-work/`: `HANDOFF-PROMPT-2026-09-30.md` (the paste-in prompt; the 2026-09-29 one is superseded), `ITINERARY-2026-09-29.md`
(the current PR table, then a dated log), `OCTOBER-CHECKLIST.md` (launch steps, section 5),
`jasmine-qa/ROUND-1-FEEDBACK-MASTER-2026-09-28.md` (her words and answers), `plans/2026-09-29-jasmine-round1-plan.md`,
`TEAM-SOP-2026-09-30.md` and `.html` (the SOP text and a Google Docs copy), `logos/` (the logo and ship scripts),
`security/2026-09-29-access-audit.md` (never posted publicly).
