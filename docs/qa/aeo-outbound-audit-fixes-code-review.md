# Code Review Record: `feat/aeo-outbound-audit-fixes` (PR #388)

**Feature under review:** PR #388, `AEO Outbound: audit fixes, numbers written by code in Ryan's format → dev`

**Diff range reviewed:** `e27125b5..ae8694a0`, fifteen commits. `e27125b5` is #368's last reviewed commit, which `dev`
holds through `cfb8cc55`, so this range is exactly #388's own work. No unrelated code. The last commit, `ae8694a0`, is
docs only: `MIGRATIONS-PENDING.md` records `0026` to `0029` as applied on staging (2026-10-14); the code reviewed here
ends at `41b92756`.

**Spec:** `docs/superpowers/specs/2026-10-11-aeo-outbound-snapshot-v1-1-design.md`, §19 (Amendment 8)
**Plan:** `docs/superpowers/plans/2026-10-11-aeo-outbound-snapshot-v1-1.md`, Tasks 37 to 45
Both are on branch `docs/aeo-outbound-audit-spec` (#367).

**Reviewers:** Paul and me.

**This document changes no code.**

| Area | Files |
|---|---|
| Numbers and sentences | `lib/aeo-outbound/sentences.ts` (new), `metrics.ts`, `prompt.ts`, `slots.ts`, `generate.ts`, `config.ts` |
| Checks | `lib/aeo-outbound/grounding.ts`, `notes.ts`, `contracts.ts` |
| Editor | `components/aeo-outbound/editor.tsx`, `save-queue.ts`, `use-leave-guard.ts`, `messages.ts`, `lib/aeo-outbound/render.ts` (frame and page scripts) |
| Access and routes | `lib/aeo-outbound/access.ts`, `app/actions/aeo-outbound.ts`, `app/api/aeo-outbound/reports/[id]/slots/route.ts`, `.../view/route.ts`, `app/tools/new-business/page.tsx`, `.../[reportId]/page.tsx` |
| Records | `MIGRATIONS-PENDING.md` (no migration; rollback caveat; staging applied for `0026` to `0029`), `.env.example` (`CONTRACT_DISABLED` removed), `vitest.config.ts` (tool page tests included) |

---

## §1 How it works

**Why this PR exists.** A fresh-eyes audit of the tool (six reviewers, plus a live run compared with a raw Peec pull)
found every number on the page correct, but the sentences around them were written by Glean, and the only check was
whether a number appeared somewhere in the Peec data. A sentence could pair a right number with the wrong brand. This PR
moves every sentence that carries a number into code.

**Where every number comes from** (`lib/aeo-outbound/metrics.ts`):
- AI visibility, share of voice and position: Peec's `/reports/brands` row for the brand, `visibility` and
  `share_of_voice` times 100 at one decimal, half to even (`pct1`, `:120`), position at one decimal (`:154`).
- Rank: 1 plus the number of brands with a higher displayed visibility (`:155`), among every roster brand (a roster
  brand with no row counts as 0).
- Leader gaps: the competitor's printed value minus the brand's printed value, in tenths (`tenths`, `:122`, used at
  `:191-197`), so the gap always equals the subtraction a reader can do on the page. This replaces the gap from exact
  ratios, which differed from the printed values about a quarter of the time (issue #383).
- Own-site retrievals: Peec's `retrieved_chat_count` for the brand's own domain (spec 5a row 14 measured Ryan's
  "approximately 2.0K retrievals" as this field); the own site's rank among domains is 1 plus the domains with more
  (`:216`).
- Source mix: each domain's `retrieval_count` summed by Peec's classification, as a share of the total, at one decimal
  (`:228`). Competitor domain gaps: domains that mention a competitor and not the brand, are not a roster site, and were
  retrieved at least once (`:235-243`), top four by `retrieved_chat_count`.
- Methodology counts: brands compared (the rank set), Peec's prompt `total_count`, and the models Peec answered with.

**Who writes what.** Code writes the competitive context, both findings boxes and the methodology
(`dataSentences`, `lib/aeo-outbound/sentences.ts:64`) in the format of Ryan's example readout, and `generate.ts:60`
passes them in as fixed slots Glean never sees as its own. Percents print whole at 10 or more and with one decimal below
10, never round up to 100, and two different values in one sentence never read the same (`pctAll`, `:55`). Glean writes
only the headline, summary, why and opportunities, under the rule "Do not write any numbers" (`prompt.ts:75`), and the
reply contract requires only those four (`contracts.ts`, `GLEAN_SLOTS`).

**What Before you send checks** (`grounding.ts`, notes never block Approve; Ryan is the lead QA):
- `unchecked_number`: any number or number word in a field Glean wrote (`NUM_ALONE`, `:16`; `NUMBER_WORDS`, `:12`),
  after brand names and Peec's action titles are removed, so "H1" or a brand like "7-Eleven" is not a number.
- An edited code-written sentence is compared with Peec's own sentence for that path (a bullet matched by its lead):
  any number, rank word or count word not in it is `number_not_in_data` (`:222-237`). The exact comparison runs only
  for rows written by the current `SENTENCES_VERSION` (`config.ts:34`, `grounding.ts:147`).
- `peec_recommends`: a "Peec recommends" line that shares no key word with Peec's actions (`:246-247`).
- Domains: any domain not in the Peec data; in a code-written sentence Peec's domains are removed whole and in any case
  before brand names (`withoutDomains`, `:165`).
- Older rows (no `sentences` field) keep exactly the flags they had (`sentencesRow`, `:125`).

**Data contract** (`contracts.ts`): no off switch. Every Peec field a printed number or name depends on is enforced, so
a malformed answer fails the run with `contract_violation` naming the field: the roster (`:44`), `domains_by_date.date`
(`:51`), `brands_report` brand id, name, visibility, share of voice and position (`:56`), and `domains_report` domain,
counts, classification and `mentioned_brands` (`:67`). Shapes were measured on 6,000 live domain rows and 206 roster rows
on 2026-10-14.

**Editor.**
- Back and Forward with unsaved edits ask first, through the browser's Navigation API: a same-document traversal is
  cancelled, and Leave redoes it with `traverseTo` (`use-leave-guard.ts:21-38`). Nothing is kept in history state, so
  Next's refresh cannot disturb it. Where the API is missing, Back is left alone.
- An editor restored from the router cache saves against the current row: the view route sends `X-Report-Revision`
  (`view/route.ts:61`), the save queue adopts it before anything is sent (`save-queue.ts:108`, `editor.tsx:171`), and a
  draft refreshes its page data once on open (`editor.tsx:185`).
- Each report load is a new iframe created with its HTML (`editor.tsx:504`), so loads add no history entries and Back
  never blanks the frame. After a bullet add or remove the new frame scrolls to where the old one was
  (`editor.tsx:211`, `render.ts:58`).
- Unreadable settings answer "try again" (503 or `UNAVAILABLE`) instead of "no access" on the hub, the editor page, the
  four actions and the slots and view routes (`access.ts:40`).
- Prepared is never before the window's last day (`preparedDay`, `metrics.ts:107`).

## §2 Verification method

- **Test first.** Every task wrote its failing test before the code; each fix in the final round was proven red at its
  parent commit by the re-reviewer (eight tests, one per finding, fail at `23bae08f` and pass at `d13f58d9`).
- **Gate.** `make check` at `41b92756`: typecheck, 335 test files, 3,669 tests, `check:rsc`, build, all green. CI on
  #388: every check green.
- **Reviews.** Four rounds, each by a fresh reviewer with no build history: Tasks 37 to 40, Tasks 41 to 44, the whole
  branch, and a scoped re-review of the final fixes. Logic was exercised in throwaway probes (about 25 brand, tie, zero,
  own-site and source-mix shapes for the sentences; about 2 million inputs for the legend rounding).
- **Live, on the dev database** (local `next dev`):
  - Generated sentences for A Place for Mom (Sep 20 to 21) and Stripe (Jun 10 to 17) match a raw Peec API pull made
    with no tool code.
  - Edits save and survive a reload. Back into a draft from the router cache, then an edit: saves.
  - Back with an unsaved edit: the dialog asks, history does not grow; Stay keeps and saves the edit; Leave goes.
    Back with nothing unsaved: one press.
  - Bullet add and remove save and reopen at the same scroll position (1443 and 1469 px).
  - Approve, the public link (frozen, no editing code, no sideways scroll at 1282 and 375 px), revoke ("This link is
    not available") and Edit a copy.
- **Not verified:** a Back that leaves the site entirely falls to the browser's own leave prompt, which the test
  browser does not show. Whether live Peec ever sends a null brand name or an empty domain (now a named failure).

## §3 Findings

Sev: **●** correctness, **○** cleanup or convention. Status: CONFIRMED (proven in tree) / PLAUSIBLE (mechanism read,
trigger not reproduced). Locations are at `41b92756` unless the finding was about removed code.

| # | Sev | Status | Location | Finding | Outcome |
|---|---|---|---|---|---|
| 1 | ● | CONFIRMED | `sentences.ts:55-63` | Brands ranked apart printed the same whole percent (15% and 15%). | **Fixed** `6ee6c7d6`, `23bae08f` (`pctAll`) |
| 2 | ● | CONFIRMED | `grounding.ts:16` | A digit inside a word ("H1", "B2B") was flagged and cost a Glean retry. | **Fixed** `6ee6c7d6`, `23bae08f` |
| 3 | ● | CONFIRMED | `sentences.ts` own-site bullet | "Retrievals" labels `retrieved_chat_count`, not `retrieval_count`. | **Kept**: spec 5a row 14 measured Ryan's figure as this field |
| 4 | ○ | CONFIRMED | `sentences.ts:103-120` | Zero-visibility context dropped the runner-up. | **Fixed** `6ee6c7d6` |
| 5 | ● | CONFIRMED | `sentences.ts:51` | Uncapped name lists could push the context past 1000 characters and fail the run. | **Fixed** `6ee6c7d6` (lists capped at five) |
| 6 | ○ | CONFIRMED | `sentences.ts:83-101` | Runner-up's share of voice unlabeled when the leader had none. | **Fixed** `6ee6c7d6` |
| 7 | ○ | CONFIRMED | `sentences.ts:83-101` | A tie at second named one brand. | **Fixed** `6ee6c7d6` |
| 8 | ○ | CONFIRMED | `sentences.ts:103-120` | When the brand leads, the runner-up was named twice. | **Fixed** `6ee6c7d6` |
| 9 | ○ | CONFIRMED | `sentences.ts:51` | "and 2 more" used digits. | **Fixed** `6ee6c7d6` (count word) |
| 10 | ● | CONFIRMED | `grounding.ts:23` | `peec_recommends` matched on common words. | **Fixed** `6ee6c7d6` (five letters, stop words) |
| 11 | ● | CONFIRMED | `grounding.ts:222-237` | An edited wrong number in a code sentence passed if it appeared anywhere in the data. | **Fixed** `6ee6c7d6` (exact comparison) |
| 12 | ○ | CONFIRMED | `sentences.ts:46` | An own site could print as "Www.own.example". | **Fixed** `6ee6c7d6` |
| 13 | ○ | CONFIRMED | several | Duplicated helpers and a weak older-row test. | **Fixed** `6ee6c7d6` |
| 14 | ● | CONFIRMED | `use-leave-guard.ts` (old design) | The history-entry Back guard was erased by Next's refresh `replaceState`, so Back stopped asking. | **Fixed** `23bae08f` (Navigation API, verified live) |
| 15 | ● | CONFIRMED | `sentences.ts:83-101`, `:180-200` | A tie at second and the source-mix tail still printed equal-looking percents. | **Fixed** `23bae08f` |
| 16 | ○ | CONFIRMED | `grounding.ts:16` | `NUM_ALONE` backtracked and flagged partial tokens ("H10" flagged "0"). | **Fixed** `23bae08f` |
| 17 | ○ | CONFIRMED | old `use-leave-guard.ts` | Leave did nothing when the editor was the tab's first entry. | **Moot**: the old design is gone |
| 18 | ● | CONFIRMED | `[reportId]/page.tsx:20`, `actions:31` | Unreadable settings still read as "no access" on the page and in the actions. | **Fixed** `23bae08f` |
| 19 | ● | CONFIRMED | `config.ts:34`, `grounding.ts:147` | Edited-sentence checks compared with today's sentence, so a wording change would flag old rows. | **Fixed** `23bae08f` (`SENTENCES_VERSION`) |
| 20 | ○ | CONFIRMED | `contracts.ts`, `editor.tsx` | Stale comments (kill switch, a moved effect). | **Fixed** `23bae08f` |
| 21 | ● | CONFIRMED | `editor.tsx:185` | The mount refresh was removed for the old guard's sake; a draft reopened from the cache showed a stale panel. | **Fixed** `d13f58d9`, verified live |
| 22 | ● | CONFIRMED | `grounding.ts:165`, `:128` | False domain note when a brand name starts its own domain ("Giggle", "Gigglefinance.com") or a www. own site has no roster domain. | **Fixed** `d13f58d9` |
| 23 | ● | CONFIRMED | `grounding.ts:20` | An edited count word ("five" to "nine") was not flagged. | **Fixed** `d13f58d9` |
| 24 | ● | CONFIRMED | `contracts.ts:56`, `:67` | Brand name and id and the domain were observe-only; a null name could print as "null". | **Fixed** `d13f58d9` (enforced) |
| 25 | ○ | CONFIRMED | `metrics.ts:239` | A domain with no retrieved chats could be listed as a gap "at 0". | **Fixed** `d13f58d9` |
| 26 | ○ | CONFIRMED | `app/tools/new-business/page.tsx:20` | The hub said "no access" when settings could not be read. | **Fixed** `d13f58d9` |
| 27 | ○ | CONFIRMED | `render.ts:154` | Phone donut legend rounded half up, the sentence half to even (6.3% against 6.2% on an exact tie). | **Fixed** `d13f58d9` |
| 28 | ○ | CONFIRMED | `sentences.ts:192` | A 0.0% second type was called a leading type. | **Fixed** `d13f58d9` ("almost entirely") |
| 29 | ○ | CONFIRMED | `grounding.ts:128` | The www.-less domains applied to older rows too. | **Fixed** `41b92756` |
| 30 | ○ | PLAUSIBLE | `editor.tsx:185` | A save landing in the same moment as the open-time refresh can be overwritten in the panel until the next save. | **Declined**: narrow, self-correcting |
| 31 | ○ | CONFIRMED | `grounding.ts:232-237` | The count-word check flags an added or changed word, not a deleted one, and not two numbers swapped. | **Declined**: recorded as a limit in spec §19.11 |

## §4 Detail

**1, 15.** `pctText` rounds to a whole number at 10 or more, so 15.4 and 14.6 both read 15%. `pctAll` reads every
percent in one sentence together and keeps one decimal where whole numbers would collide but the values differ.

**2, 16.** The Glean-field scan matched digit runs inside words and backtracked into partial tokens. `NUM_ALONE` now
reads a number whole, not touching a letter, with K, M or x as part of it; Peec's action titles are removed first.

**3.** Kept by ruling: spec 5a row 14 measured Ryan's own "approximately 2.0K retrievals" as `retrieved_chat_count`.

**4 to 9.** Sentence edge cases from probes; each now has a test in `sentences.test.ts` pinning the exact sentence.

**10.** Any shared four-letter word ("with") matched an action. Now a shared word of five letters or more that is not a
stop word.

**11, 19, 23.** An edited code sentence is compared with Peec's own sentence for that path, token by token as a count
(numbers, then rank words, then count words), only for rows of the current `SENTENCES_VERSION`.

**12, 22, 29.** A sentence prints a domain capitalised and without "www.". The check removes Peec's domains whole, in any
case, before brand names, and allows the www.-less form only on rows with code-written sentences.

**14, 17.** The first Back guard marked a history entry; Next 16's `router.refresh()` rewrites the entry's state and
erased the mark, so after a reload or a return to the editor Back stopped asking (reproduced in a probe and live). The
guard now cancels the browser's `navigate` event for a traversal and replays it on Leave.

**18, 26.** `outboundAccess` distinguishes a failed settings read (`unavailable`) from a refusal; every surface that
reads it now shows "try again".

**21.** Restored after the Navigation API design removed the reason for dropping it; verified live that Back still asks.

**24.** `pull.ts` already read these fields as paging keys, so a missing one failed as `internal`; now it fails as a
named `contract_violation`.

**25, 27, 28.** Each is a small rule change with its own test; 27 was checked against `pyRound` on about 2 million
inputs with no mismatch.

**30, 31.** Declined with reasons above.

## §5 Follow-ups

- **Needs a live call first:** confirm Peec never sends a null brand name or an empty domain for a pitch project (now a
  named failure rather than a printed "null").
- **Decide together:** whether an edited sentence should also flag a deleted count word or two swapped numbers (31).
- **Cleanup:** the donut legend clips its last label ("Competito") at 1440 px; that is chart code this PR does not
  touch.
- **After merge:** close issue #383 (leader gaps from the printed values, §1, commit `609b8f4b`).

None blocks the merge.
