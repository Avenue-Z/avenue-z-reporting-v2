# AEO Outbound Snapshot spec: review log

Spec: `2026-10-08-aeo-outbound-snapshot-design.md`. Fixed checklist: inputs and outputs, citations, parity, downstream
conflicts, failure behaviour, tests. At most two rounds. Only BLOCKER and MAJOR are fixed before approval. MINOR items go
to the plan.

## Round 1 (whole spec, fresh-eyes subagent): 0 BLOCKER, 15 MAJOR, 14 MINOR

Before editing I re-checked the reviewer's load-bearing claims against code: `next.config.ts:18-20` (180s Router Cache),
`aivx:renderer.py:1297-1300` (900px breakpoint), and `app/api/export/pdf/route.ts:47` (auth line). All held.

| # | Finding | Fix (targeted edit) |
|---|---|---|
| 1 | Editor iframe too narrow, so the mobile layout shows | §10: iframe takes the full content width; Notes became a drawer; "Open full size" added |
| 2 | Writes don't match `deleted_at IS NULL` | §9: every UPDATE matches it |
| 3 | `brand_name` not null but unknown at insert | §9: nullable; hub shows the project name |
| 4 | Revision not returned to the parent; Approve during a save; false conflicts | §9a: the parent owns one save queue, carries the revision forward, and disables Approve while dirty or saving |
| 5 | Peec strings and figure JSON not escaped; draft view could run as Ryan | §5 escaping rule; §8 draft view in `sandbox="allow-scripts"` srcdoc plus the CSP sandbox header |
| 6 | Glean may pull company docs into prospect copy | §6: UNVERIFIED, "Data block only" prompt rule, domain check, T3 probe, back to me if it can't be turned off |
| 7 | Retries can exceed `maxDuration` | §7a: 270s deadline signal, 3 attempts, 20s clamp, guaranteed `failed` update |
| 8 | Generate contract undefined | §7a: request and response, run in-request, no `after()` |
| 9 | Router Cache shows stale status | §10: `router.refresh()` on mount, after actions and on poll; `updateTag('db')` |
| 10 | A Peec outage takes down the hub, Revoke included | §4 projects route; §10 inline retry; the table comes from the DB only |
| 11 | Null SOV or position | §7: `n/a` plus a note |
| 12 | Stale generating rows can't be discarded | §9: discard matches stale generating |
| 13 | `gap` filter is undefined in the docs | §7 step 7: computed from `mentioned_brands`; meaning UNVERIFIED, checked in T3 |
| 14 | PATCH contract undefined | §9a: closed path list, value rules, status codes |
| 15 | Outputs with no test | §15: tests added for each |

Also fixed, since a wrong citation is worse than none: the auth citation `app/api/export/pdf/route.ts:5-15` became `:47`.

### MINOR (deferred to the plan, not fixed in the spec)

16. Define what counts as a "number" for the grounding check (regex, exemptions such as years and digits in names), and recompute notes after edits.
17. Bolding brand names inside the plain-text `context` slot: the renderer bolds exact roster names after escaping, or the rule is dropped.
18. List the 5 sidebar nav entries, their labels and the section `id`s the scroll-spy needs (`aivx:renderer.py:1320`).
19. `<meta name="description">` text for a snapshot (`aivx:renderer.py:2538`).
20. Chart parity details: `leaderboard[:15]` pre-slice; source-donut slice order (descending by retrievals); Python half-even `round` vs JS rounding, with a test on a .x5 value.
21. `model_id` is deprecated in favour of `model_channel_id`; pick the filter field if R2 = ChatGPT only.
22. `/actions/list` has no date window; filter by open statuses; `impact` is an enum string.
23. Row-cap value; whether the UPPERCASE classification guard still earns its place when R6 shows every type.
24. Partly done in §7a (server re-check of `projectId`). Open: whether non-PITCH projects may be approved.
25. Partial unique index on `(peec_project_id) WHERE status='generating'` so a double-click can't race the 409 check.
26. Origin check on cookie-auth POST/PATCH handlers; iframe clipboard permission for the share button.
27. Date format and timezone for the window and the footer date; which timestamp "generated" means.
29. Migration number: regenerate it against the then-current `dev` at merge time.

## Round 2 (changed lines only, fresh-eyes subagent): 0 BLOCKER, 2 MAJOR, 11 MINOR

Per my process, a MAJOR in round 2 stops the review. Both go to me as decisions, with no round 3.

**MAJOR (open, awaiting my decision):**
- R2-1. Rerun has no defined way to run the pipeline. The `rerun` server action can't run inside the generate route's 270s/300s budget. Proposed: Rerun calls `POST /generate` with `{ projectId, rerunOf }`, and the editor or hub opens the new draft. Add a test.
- R2-2. The save queue has no error rule, so a 400 (for example a model-written lead over 80 characters) can lock Approve forever. Proposed: retry only network errors and 5xx, with backoff. On 400, show the reason and keep the edit. On 403, 404 or 409, stop and show the reload message. §6's shape check enforces the §9a length limits. Add component tests.

**MINOR (deferred to the plan):**
- R2-3. §5 escaping text is garbled: `\u003c` was written to the file as a bare `<`. Restored before the decision edits, since it was my transcription error rather than a design change (my transcription error). Fix with the decision edits.
- R2-4. Narrow the §5 claim. JSON escaping protects the `<script>` block, but Plotly still reads its own pseudo-HTML in labels (UNVERIFIED). Strip `<` and `>` from Peec strings used in figure text.
- R2-5. The debounce lives inside the iframe, so the parent isn't dirty for 800ms. Post `{type:'dirty'}` right away; the Approve confirm re-checks.
- R2-6. T1 must also load the fonts inside the sandboxed srcdoc iframe and the CSP-sandboxed tab (opaque origin).
- R2-7. Send `Content-Security-Policy: sandbox allow-scripts` on `/snapshot` too.
- R2-8. Open full size uses a no-hooks preview mode; correct the §4 wording.
- R2-9. Name the client component folder and add its vitest glob.
- R2-10. §7a outcomes when Peec fails at the project re-check (502), the 409 body, and hub handling per status.
- R2-11. Tests for: computed gap, 3-attempt/20s clamp, Glean 60s rule, projects 502, null SOV as 0 in the donut, refresh poll.
- R2-12. Nulls citation: give the docs URL and date, or mark it UNVERIFIED and add it to T3. Note `lib/peec/client.ts:81,85` types them as required.
- R2-13. Width threshold needs a scrollbar allowance (`app/tools/layout.tsx:22`, `overflow-y-auto`).

## Resolution (2026-10-08)

I reviewed both round-2 MAJORs and told Claude to fix everything. All findings are now fixed in the spec with targeted edits: the 2 round-2 MAJORs, the 11 round-2 MINORs and the 13 round-1 MINORs (16-27, 29). Per the process there is no round 3. Items that can't be proven by reading are marked UNVERIFIED and go to scratch trials T1-T3.

## Amendment 2026-10-09: open tracking, Edit a copy, hub listing

My decisions on 2026-10-09: track opens (not a per-recipient link or an email code), and add Edit a copy. Amendment
commit `0ae74fe0`; adversarial review round 1 on the changed lines only: 0 BLOCKER, 4 MAJOR, 10 MINOR.

MAJOR, fixed in the spec:
1. How the new columns and stricter check reach the database: `0026` is regenerated in place (unapplied everywhere,
   unmerged), the `MIGRATIONS-PENDING.md` read-back is updated, `approveQuery` sets the recipient (§4 item 2).
2. Action contracts: `approve(id, revision, recipient)` and `copyAsDraft(id)` inputs, success shapes and errors (§4).
3. Recording an open: awaited with a 1.5s cap; an error or the cap is logged and the page still served (§8, §15).
4. Opens mislead: a request with a session cookie isn't counted; step 7 says opens are a rough signal (§2, §8, §15).

MINOR, for the plan (no further spec round):
5. Next 16 runs the GET handler for HEAD when no HEAD export exists: check `request.method` or export a HEAD that never records.
6. A 0-row record-open after a concurrent revoke isn't a failure; record-open doesn't touch `updated_at`; update by id
   (the live lookup returns id and html); a missing User-Agent or `Sec-Purpose: prefetch` is counted.
7. The preview-bot User-Agent list is unverified: mark it so and check it on the first preview deploy.
8. Double click on Edit a copy: disable the button while pending; a stray second draft can be discarded.
9. Copy as draft copies `peec_project_id`, `peec_project_name`, `brand_name`, `data`, `slots`, `notes`; everything else
   defaults; `rerun_of` means "derived from"; skipping the pitch-only re-check is deliberate (the source already passed it).
10. Hub listing columns: id, project name, brand, status, created, approved, revoked, deleted, error, share token,
    recipient, open count, first and last opened; ordered by `created_at desc`; `listReports` is replaced.
11. Opens times: US Eastern, the footer's format; visible in the row on narrow screens too; For and Opens are empty
    for draft and failed rows.
12. Tests to add: the Approve dialog's required field, the For and Opens cells, Edit a copy opening the new draft,
    `copyAsDraft` writing nothing when forbidden.
13. `rankAmong` N also trims the bar chart and the brands in the Data block; §5a row 10, §7 and §14 to say so. Q4 as a
    boolean covers "yes" and "drop the list", not another ranking.
14. The recipient is never logged; it is kept with the approved row, which can't be discarded. Accepted; a retention
    rule is a follow-up.

Round 2 (changed lines `0ae74fe0..87bee3e7` only): MAJORs 2, 3 and 4 resolved; MAJOR 1 not resolved, because "0026 is
unapplied everywhere" had no evidence. Per my rule a MAJOR after round 2 stops the review and comes to me. My decision:
regenerate `0026` in place. Evidence: `git branch -r --contains e3cd1b3f` lists only `origin/feat/aeo-outbound-data`;
`dev`, `staging` and `main` have no `0026`; migrations are applied only by hand on my written go, and I never applied it.
Recorded in §4 item 2. No round 3.

MINOR from round 2, for the plan:
15. §9's closing paragraph should read "one new table, including its open-tracking columns".
16. Plan Task 4.2 must carry `approve(id, revision, recipient)`, the recipient message and the `copyAsDraft` contract.
17. Approve checks run in this order: forbidden, not found, recipient (length checked after cleaning), Needs validation, stale.
18. Recording an open is best effort: if the 1.5s cap fires, that open may be lost (logged). The cap should not fire in
    normal operation, and it adds no latency when the database answers.
19. The four-condition approved check can't be exercised without a database: the test pins the generated SQL, and the
    dev apply's read-back checks the constraint text.

## Amendment 2026-10-09 (2): Paul's review of #361, and Ryan picks the dates

Paul reviewed #361 (10 inline comments). My decisions: the window is the last 30 days by default; Ryan may pick the
dates; opens skip staff only. Amendment commit `99534552`; adversarial round 1 on the changed lines: 0 BLOCKER,
5 MAJOR, 10 MINOR; Paul's comments 9 of 10 resolved (the rank denominator was not).

MAJOR, fixed in the spec: (1) date rules: UTC days, both ends inclusive, default today − 29 through today, length
end − start + 1, calendar-invalid, one date or empty string refused; (2) `n` = distinct roster-and-row brands, the cut
applies to that set, `i` within the ranked set, the note texts, no-row brands only in `n`; (3) 400 bodies carry
`code: 'bad-range' | 'bad-project'`; (4) Rerun's range is read server-side from the original, a body range with
`rerunOf` is refused, copy as draft carries the range, an old range fails with the no-data reason; (5) the public
route's session read is inside the 1.5s cap, not counted on failure, and the response never sets a cookie.
Also fixed (errors in my own text): a duplicate step number in §7a and the stale "400-day ... Ported" parity row.

MINOR, for the plan: (6) the 5xx and network retry is separate from the 429 budget, runs only with more than 6s left,
and a failure while reading the body counts as a network failure; (7) leader gaps: list every brand ranked above the
brand, with the gap as the difference of displayed values; (9) measure a 90-day pull's rows against the cap, and record
the decision on Paul's brands-by-date suggestion; (10) the window limits are plain constants (not DECISIONS) and the hub
copy renders from them; (11) a notes line when the picked range is wider than the data; (12) gap-site exclusion covers
subdomains of roster domains; (14) name the check `aeo_outbound_range_both_or_neither`, and tests for one-date bodies,
Rerun reusing the range, and copy carrying it; (15) `/prompts` added to §7's step-8 row as non-fatal with its note text.

Round 2 (changed lines `99534552..35371312` only): MAJORs 1, 3, 4 and 5 resolved; MAJOR 2 not resolved (the rankAmong
cut versus brands with no data). Per my rule, a MAJOR after round 2 came to me as a decision. My decision: a tracked
brand with no data is a zero-visibility brand for ranking everywhere (counts in n, can fill a rankAmong slot, never
drawn or sent to Glean). Written into §7 with a worked example; the §14 row updated. No round 3. The code changes to
match in the plan's Task 1.8.

MINOR from round 2, for the plan: (16) a rerunOf lookup that finds nothing, a discarded row or another project's row
returns `404 { code: 'bad-rerun' }`; a 400 with an unknown code shows the generic message, and a body range sent with
rerunOf returns `code: 'bad-request'`; (17) the session read and the UPDATE share one 1.5s budget; (18) the route never
sets a cookie by reading the session token without writing (or by dropping any Set-Cookie it would add), named in the
plan; (19) no range rule is re-checked on rerun, with a test that an old stored range reaches Peec and fails with the
no-data reason.

## Amendment 2026-10-09 (3): the Glean call acts as the signed-in user

Commit `8aa687d2`; review round 1 (changed lines): 0 BLOCKER, 2 MAJOR, 5 MINOR.
1. MAJOR, the no-header failure wasn't recorded: it was measured (the dashboard token without act-as returned 400 in the same
   probe); now written into §6 with the exact list of dashboard paths that send act-as (the reviewer's claim that meeting-brief
   skips it is wrong: `app/api/glean/meeting-brief/route.ts:48` sends it).
2. MAJOR, wrong email source and stale code blocks: the plan now passes the route's `outboundEmail(session?.user)` result and the
   Task 3.1 Produces line, signature and Task 3.3 call site are edited directly.
MINOR, fixed in the same edit: a `local@domain.tld` shape check with `a@` tested; a route test that a body email is ignored;
status-only logging; the privacy, permission and rerun sentences; `.env.example` marks the token required and organization-wide.
MINOR, for my decision: whether local `.env.local` carries the organization-wide Glean token.
Round 2 (`8aa687d2..3ee99fda`): both MAJORs RESOLVED; 5 MINOR fixed as targeted edits (the Task 3.1 block's body and guard, where gleanOnce lives, the route wrapper logs status only, matching test cases, a duplicate sentence). No round 3.

## Amendment 2026-10-11 (4): full history by default, and the implausible-visibility warning

My decisions after the 2026-10-11 sample-copy trial (`aeo-outbound-audit-notes/findings/2026-10-11-sample-copy-trial.md`):
the default range goes back to the project's full history (400 days), which reverses the 2026-10-09 change made after Paul's
review, because an ended pitch project older than 30 days failed with no data and Ryan's skill says all-time; Paul's row-cap
concern is bounded by pitch-only projects and answered with a plain "pick a range" failure. A notes-panel warning flags any
brand above 90% visibility. Spec edits are targeted (§2 step 2, §7 step 4, §7 warning, §10 hub, §14 two rows, §15 two tests).
Commit `cca3218a`; review round 1 (changed lines): 0 BLOCKER, 2 MAJOR, 5 MINOR.
1. MAJOR, the bound wasn't measured (the trial's 1 and 13 days were inside the 30-day window): measured read-only on all 55
   usable pitch projects (notes repo `findings/2026-10-11-full-history-probe.md`): at most 9,809 rows, 2 calls, 5.0s, a data
   span of at most 13 days; 49 of 55 have no data in the last 30 days. Cited in §7 step 4; the plan's 90-day bound note updated.
2. MAJOR, a long history is likelier to time out at step 4 than to hit the cap: a default-range step-4 timeout now reads
   "Timed out at step 4. Pick a start and end date, at most 90 days."; §14 row and tests added.
MINOR, fixed in the same edit: a `rowCap` flag instead of matching the message; `{v}` is `toFixed(1)` over
`SnapshotData.brands`, after the rank notes; the parity row (§3 Data window) updated; the changed test expectations and the
exact hub sentence listed in the plan; the default is today − 400, the same earliest day a picked range may start.
Round 2 (`2952ec53`, changed lines): all 7 round-1 findings RESOLVED; 0 BLOCKER, 0 MAJOR, 4 MINOR. MINOR 1 (two phrases said
"the last 400 days") fixed as a wording edit. MINOR, for the plan (Task T2 brief): the default-range timeout test lives in
generate.test.ts; a peec.test.ts case that the cap error sets `rowCap` and a repeated-row error doesn't; the pick-a-range advice
means generating a new report from the hub, not Rerun (a rerun can't take a range); hub.tsx's import switches to
`MAX_LOOKBACK_DAYS`.

## v1.1 design (`2026-10-11-aeo-outbound-snapshot-v1-1-design.md`), 2026-10-11

My requests: everything on the page editable, an Edit button, an itinerary, 100% self-service, data contracts, opens done
properly; plus the three-auditor review (`aeo-outbound-audit-notes/findings/2026-10-11-three-auditor-review.md`).
Draft `66c5073f`; review round 1 (whole spec): 1 BLOCKER, 19 MAJOR, 14 MINOR. Fixed as targeted edits: the bullet add and
remove contract (BLOCKER); defaults resolved at creation so settings never alter existing drafts; a full page-key list
with one key per repeated phrase and the fixed-by-design exemptions; no wrappers or attributes in preview and final, with
a v1.0 parity golden; the frame handshake (ready, mode, locked, focus); links cancelled in edit mode; the edited brand
used everywhere and written to brand_name; grounding on every slot with avenuez.com allowed and the KPI comparison rule;
structured note kinds, groups, PATCH response and the count; per-project pending in the hub; an error_code table;
the unawaited progress_step guard; one CTE for opens; async outboundAccess with the env floor and fallback; settings
limits and a log table; pitchOnly stays in code (bound measured on pitch only); schema_version and a version 1 reader;
contract nullability and failure per boundary; the package.json amendment with zod pinned; the donut golden carve-out.
Cheap MINORs fixed in the same edit (CSP string, slot count, index citation, measured duration, ua_family, about-data
wording, hub columns and counts, actions page cap, Back-link dialog, migration dry runs and numbering, CSS-only chip,
header clone in every mode, the extra tests).
Round 2 (`c738ed07`, changed lines): 19 of the 20 round-1 fixes RESOLVED; the BLOCKER (bullet add and remove) NOT
RESOLVED end to end. New: 0 BLOCKER, 7 MAJOR, 16 MINOR. MAJOR: M1 a key shown in several places is edited in one only
(the frame keeps one element per path, `render.ts:18`); M2 the KPI comparison has no rule for the rank card
("#3 of 12 brands"); M3 `progress_step` needs `integer not null default 0` or the guard never passes; M4 cloning the table
header drops the edit listeners unless the clone runs first or the script delegates; M5 a contract break shows the Peec
error text, so it needs its own `contract_violation` code with the field; M6 no frame-to-parent message asks for add or
remove; M7 a structural PATCH outside the save queue leaves the queue's revision stale (`save-queue.ts:22-27,73`).
Per my rule (a MAJOR after round 2 stops the loop), these go to me as decisions; no round 3.
Thomas's decision (2026-10-11): "Yes, go ahead": apply my recommended fixes for the 7 round-2 MAJORs, no round 3, then plan
and build. Applied as targeted edits: a `structure` frame message and structural items in the save queue (M6, M7, the
BLOCKER); one editable spot per key with mirrors (M1); the rank-card token rule (M2); `progress_step integer not null
default 0` (M3); header clone before the editor script plus a delegated listener (M4); a `contract_violation` code carried
on the error object (M5). The 16 round-2 MINORs go to the plan.


## v1.1 amendment 5 (§16), 2026-10-12

Ryan's answers, the share link, live progress. Draft `22c39ba6`.

- **Round 1** (opus, whole amendment, fixed checklist): 1 BLOCKER, 4 MAJOR, 14 MINOR. BLOCKER: the hub's progress poll
  stopped on the first `{ step: null }`, which arrives before the generating row exists (`generate/route.ts:33-76`).
  MAJORs: the editor's Rerun got no progress; the category fallback contradicted itself; the server-only origin had no
  path to the client components; no plan lines named. All fixed in `2b71690d` with targeted edits, plus the minors that
  were wrong statements.
- **Round 2** (opus, changed lines only): BLOCKER and 4 of 5 MAJORs resolved. 2 new MAJOR, 11 MINOR. N1: Task 4 replaces
  `generate.ts` wholesale and its plan:2100 restores the old category rule. N2: Task 6 replaces `slots.ts` wholesale and
  its `limitFor` (plan:2998-3002) gives `category` 1,000. Both are missing plan lines in §16.4, no design change. Per my
  regimen, a MAJOR after round 2 goes to Thomas as a decision. The 11 MINORs (N3 to N13) go to the plan edits.
