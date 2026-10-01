# Organic Social: current status (2026-10-01, end of day)

Written by me (Thomas) with Claude so the next session picks up with nothing lost. This is the current state. The
2026-09-30 doc beside it is the previous state, and the 2026-09-29 doc is the history and dated decision log. This file
is in the public repo: no brand ids, client figures, secrets, login details, links to client data or security findings.
Those are in my private folder (section 12). Every SHA, state and check below was read from GitHub, git or Vercel at
the time of writing.

## 1. Where we are
- Paul reviewed all nine open PRs on 2026-10-01 (51 comments, none a blocker). Every comment is fixed, answered or held
  on purpose, PR by PR, with a reply on each thread. Nine threads stay open on purpose (section 4).
- **Waiting on Paul:** his sign-off on all nine. I am sending him one Slack message (the text is in my private records).
  His GitHub review requests cleared when he submitted his comments, so GitHub no longer shows him as requested.
- **Waiting on a decision about Jasmine's YTD sheet** (#286, section 6): she sent her "2026 YTD Tracker" Google Sheet
  and will update it monthly. The service account can read every tab. Next: decide which source wins for a month that
  is in both her sheet and our locked numbers, then rework #286's spec.
- Nothing merged since 2026-09-30. Production code and deploys are untouched. Renaissance is untouched.

## 2. State
| Ref | SHA | Note |
|---|---|---|
| `main` | `0722fe0c` | production source, untouched |
| `dev` | `b48de420` | unchanged since the logos |
| `staging` | `ef1aa184` | same files as `dev` |
| production deploy | `dpl_8wSnpe5X...` | from `main`, 2026-09-23 |
| staging deploy | `dpl_JAadkRoU...` | 2026-09-30 15:11 ET, the logos |

## 3. Open PRs (all into `dev`, each standalone)
CI on every open PR: `ci`, `test`, `rsc-boundary` and Vercel pass. The repo-wide `checks` dependency scan fails on every
PR (12 high or critical advisories in indirect packages, all with a non-major fix; `next` and `next-auth` are clean
after #281). Paul asked whether we merge past it; a decision with him.

| PR | Branch @ head | What it does | Paul's round (2026-10-01) | Open threads |
|---|---|---|---|---|
| #281 | `fix/next-security-upgrade` @ `300939ed` | next 16.3.6, next-auth beta.32, saves use `updateTag` | 4 fixed: client-access writers leave invalidation to their actions; repo-wide `revalidateTag` ban; next-auth pinned and `@auth/core` declared; two notes | 2 later: drop the redundant refreshes after #283/#292 merge; a branded crash screen as its own PR |
| #282 | `fix/top-content-freeze-clock` @ `adc4bb08` | the older Top Content freeze and the range share one clock | 5 fixed: freeze compares with `rollingRangeEnd()` (fixes the day after a UTC+0 zone leaves summer time); zone guard in tests; CLAUDE.md trimmed; `toISO` follow-up recorded | none |
| #283 | `fix/chart-state-follows-server` @ `efe11966` | the chart follows the server per day after a save | 5 fixed: a card's Approve/Revoke/Delete wait for the refreshed answer (`noteSaving`); revert is `onToggle(day, null)`; docs | none |
| #284 | `feat/os-top-content-sort` @ `9b62ed4d` | Top Content sorts by Engagements and Views only | 3 fixed: an empty sort list does not compile; start rule pinned; plan Task 2 a record | 1 held: toolbar accessibility, touches Renaissance's markup |
| #285 | `feat/os-whole-number-changes` @ `c866b4b5` | whole-number changes on outline tiles | 5 fixed (snap at nine decimals, hop test, one v1 render copy, simpler KpiCard, docs), then my two decisions: one decimal under 1%; outline clients' fallback tabs use the size-based change (Piper's X) | none; **asks Paul to sign off on both decisions** (PR comment) |
| #286 | `feat/os-ytd-from-january` @ `886bccec` | YTD from January | draft, on hold | none |
| #287 | `fix/proxy-client-scope` @ `ef8f4247` | every page checks the client's own portal | 5 fixed: RSC forms pinned as refused; one `refusalLine`; page-check walk errors clearly and accepts a kept session; pages keep the session their check returns | 2 open: a pre-existing item for the extra PR (section 8); the security scan question |
| #291 | `feat/os-newest-month-for-clients` @ `badfa9b6` | optional `clientMonths`: clients see only the newest opened months | 6 answered: route-level tests; aged-out log wording; bad value spelled out as an outage; exact production SQL (spec section 7); opt-in kept, onboarding step added; YTD and "vs August" settled from Jasmine's own asks | none |
| #292 | `feat/os-notes-without-posts` @ `e2ef2848` | a Day list so a note can go on a day with no post | 4 fixed: saves refuse a day before the first reporting month; true line for a missing pick; UTC caption; the list ends at the last complete UTC day | none |
| #293 | `fix/session-recheck-every-request` @ `8e8b1952` | each login's role and client re-read on every request | 3 fixed: one test-admin rule, one workspace domain, no session at sign-in for anyone else with no row; spec corrected | 4 open: two decisions for Paul and me (section 5), the `/api/auth/session` cap (part of decision 1), the log id (after #287 merges) |

Merge proof (2026-10-01, after every change above): each PR merges clean onto `dev` and with every other open PR, and
all ten merge clean together in both orders. With all ten merged: `tsc` clean, 1918 tests pass.

Issues #275 to #278 are open. #283 fixes #276 and #277, #282 fixes #278: close them by hand when those merge (they target
`dev`, so GitHub will not). #275 stays open. Closed, never reopen: #290.

## 4. Threads deliberately left open (9)
- #281: dropping the redundant `router.refresh()` calls (after #283 and #292 merge, since #283 builds on the refresh);
  a branded crash screen with Try again (its own PR, before client logins).
- #284: the toolbar accessibility change (it would change Renaissance's markup when its template is v2).
- #287: a pre-existing item for the one extra PR (section 8); whether we merge past the red security scan.
- #293: how long staff stay signed in; every request or a short cache; the `/api/auth/session` 30-day cap (part of the
  first); the `who=` log id (needs `logId` from #287, so after it merges).

## 5. Decisions
**Made on 2026-10-01 (never re-ask):**
- Paul's review round: non-blockers are fixed, tested and closed with a reply on GitHub; only a massive blocker goes to
  Paul by Slack. Nothing goes to Paul until all nine are done (done; the message is ready).
- #285: a change under 1% keeps one decimal (from 1%, whole numbers, as Jasmine asked). An outline client's fallback tab
  measures the change against the size of the prior, so a rise from a negative prior shows a rise. Both apply to every
  client on the outline Data part (on staging: A Place For Mom, Akara, Joy of Life, PIMCO, Piper). Renaissance is
  untouched. Paul is asked to sign off on both.
- Time zones stay as they are (no Eastern-everywhere change). Anything that would change Renaissance is on hold.
- #291: YTD and "vs August" need no question to Jasmine (her own asks cover them); `clientMonths` stays opt-in.

**With Paul (in the Slack message):**
1. #293: how long staff stay signed in (a staff time limit plus a hard 30-day cap; keep 30 days; or a disabled-staff list).
2. #293: a database read on every request, or a 30 to 60 second cache.
3. #287: merge past the red security scan for now, or a dependency-bump PR first.
4. #285: Renaissance's flipped arrow after a negative prior: fix it or not (Paul and me together; deferred).

**Mine, next:** the YTD source rule (section 6): keep 2026-09-29's "sheet to August, our locks from September", or let her sheet win.

## 6. Jasmine's YTD sheet (#286)
- Jasmine's "AVZ–OS 2026 YTD Tracker", one tab per client, "updated monthly moving forward". The app's service account
  reads every tab (read-only probe, 2026-10-01). Link in my private records.
- Every tab has the same layout: a client-name row; a Follower Growth block, January to December; a Views block, January to
  December; one column per platform.
- Tabs: A Place for Mom (filled through August), Renaissance (not used: Renaissance is untouched), Piper Aircraft, PIMCO,
  Joy of Life, and Kenect Nashville (filled through September). "Kenect Nashville" is Akara's tab: titled "Akara – Kenect
  Nashville", and Akara's client name is "Akara Living, Kenect Nashville".
- The reader must handle: "July " with a trailing space; "N/A" cells (Joy of Life Instagram followers in January, TikTok
  followers January to March, Akara's Facebook views in February); blank cells (Akara Instagram, January to May); columns
  the dashboard does not show (Akara's Facebook, Piper's X).
- **The decision:** on 2026-09-29 I decided "YTD January to August from her sheet, our locks from September" (the
  2026-09-30 doc, section 5). Her sheet now also has September for most clients, and she will keep it updated monthly.
  So: keep that rule, or let her sheet win for any month it has (she says the YTD graphs come from it), with our locked
  numbers only for months the sheet has not reached? My lean: her sheet wins. Then: rework #286's spec around a live, read-only read (a per-client sheet setting, a data check, caching),
  fresh-eyed review, my review, build test-first. Her figures never go into the repo.

## 7. Next steps, in order
1. Send Paul the Slack message; take his sign-offs and his answers to section 5's four decisions.
2. Settle the YTD source rule (section 6), then #286: spec, review, plan, build.
3. After Paul signs off: merge to `dev` with a tested script I run (#281 before #287), then promote `dev` to `staging`
   (bring `dev` up to date with staging first). Then: #291's staging write and live look (spec section 7), #293's live
   check, Piper's X lock check after 2026-10-05.
4. Launch, after Jasmine approves staging and my written go: target on `main` by 2026-10-07; #291 live in production
   before 2026-10-12.
5. Update the team SOP for what changed (section 9).

## 8. Held, deferred or saved for later
- **One extra PR** (my decision): two pre-existing items Paul raised on #287, details in my private records; plus a
  dependency bump if Paul wants the scan green.
- **On hold because they would change Renaissance:** #284's toolbar accessibility; Renaissance's flipped arrow (a decision
  for Paul and me); the `toISO` day-early and GA4 picker label follow-up (CLAUDE.md, recorded on #282); time zones.
- **Later:** #281's refresh removal and branded crash screen; #293's log id after #287.
- A separate task chip: convert three manual `lib/auth` test scripts to vitest so CI runs them.

## 9. The SOP
"Organic Social Reporting SOP", a Claude doc: https://claude.ai/code/artifact/c26a0f18-fa69-4745-b264-7864d402cb6e
(private until I share it). It describes the October build. To update once these merge: changes under 1% show one
decimal; Piper's X tab shows the right arrow after a negative month; the Day list ends yesterday in the current month
and its days are UTC; right after a save a card's Approve, Revoke and Delete wait about a second; YTD from her sheet.

## 10. How work runs here
- Every build: a spec from the code, a fresh-eyed adversarial review (at most two rounds), the plan reconciled to the
  spec, test-first code, `make check`, my review, Paul's review. Push after every step. Never force push.
- Review rounds: audit every comment read-only first; fix non-blockers test-first; prove a new test can fail (break the
  code on purpose, then restore it by text, never `git checkout` on uncommitted work); `make check`; merge proof against
  every open PR (and a combined run when files are shared); reply on the thread, then resolve.
- Claude cannot approve or merge its own PRs. When I want something merged, Claude writes a tested script with safety
  stops and I run it.
- Staging writes only, host guard, dry run first; production writes need my written consent.

## 11. Known gotchas (each cost time on 2026-10-01)
- `git checkout -- <file>` throws away uncommitted edits: restore a deliberate break by text.
- An apostrophe inside a single-quoted `bash -c` string ends it early; write commit messages and comment bodies to files.
- zsh does not split a `$VAR` list: use bash arrays for file lists.
- Two PRs editing adjacent lines conflict even when each is right: check `git merge-tree` before pushing a fix to a
  shared file.
- `vitest.config.ts` includes tests by an explicit list; three `lib/auth/*.test.ts` files are manual `npx tsx` scripts.
- The heredoc in zsh can turn ` ` text into real separator characters: write such source with Python.

## 12. Private records (on my machine, by design)
Under `~/.claude/organic-social-work/`: `HANDOFF-PROMPT-2026-10-01.md` (the paste-in prompt; older prompts superseded),
`ITINERARY-2026-09-29.md` (the current PR table, then a dated log), `OCTOBER-CHECKLIST.md` (launch steps, section 5),
`security/2026-09-29-access-audit.md`, the YTD sheet link and Paul's Slack text.
