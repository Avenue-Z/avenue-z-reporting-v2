# Decision Record: PR Influence matchback, article-level citation matching

| | |
|---|---|
| **Issue** | Bug: PR Influence Dashboard (Renaissance Focus) |
| **Investigation** | [`docs/official-feedback/tina-2026-07-20-pr-changes.md`](../official-feedback/tina-2026-07-20-pr-changes.md) |
| **PR** | [#162](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/162) |
| **Raised** | 2026-07-20 |
| **Raised by** | Thomas Chang |
| **Decision owner (blocking)** | Tina Fleming |
| **Status** | **OPEN.** 6 decisions awaiting Tina. Implementation blocked. |

---

## How to use this document

This is the approval gate for the PR Influence matchback fix. No implementation
starts until every **D** decision below has an answer recorded in it.

- **§2 needs Tina.** Product and truth questions. Written in plain English, no code
  required to answer them. These block the build.
- **§3 is ours.** Engineering calls we are making ourselves, recorded so the trail is
  complete. Tina does not need to read §3 to unblock us, but it is here so nobody has to
  reconstruct our reasoning later.
- **§4 is the log.** Every answer gets dated and attributed here as it lands.
- Technical detail lives in **§5 Appendix**, deliberately separated so §2 stays readable.

**To answer:** fill the `Decision:` and `Rationale:` lines under each item, or reply in
the PR and we will transcribe them here with attribution. Do not delete the options that
were not chosen. The rejected options are part of the record.

**Status legend**

| Status | Meaning |
|---|---|
| `OPEN` | Raised, no answer yet. Blocks implementation if in §2. |
| `DECIDED` | Answer recorded with who and when. |
| `SUPERSEDED` | Changed after the fact. The original stays visible, with the reason for the change. |

---

## §1. What you are being asked to decide, and why it matters

**The problem in one paragraph.** The PR Influence table says "Cited by AI: Yes" next to
a PR placement when it has only checked whether AI cited *anything at all on that
publisher's domain*, not whether it cited *our specific article*. Bristol's Digital
Insurance placement shows Yes because other dig-in.com articles were cited. Ours was
not. We are currently claiming PR-driven citations we cannot support, for every client
with a PR Proof sheet, not just Renaissance.

### ⚠️ Read this before answering D1

**Domain-level matching was not an accident. It was specified on 2026-07-09, and the
request came from Tina.** It is recorded in three places in the codebase (see §5.1). The
reasoning at the time was consistency: the card already reported engines at domain
granularity, so the match was built the same way.

So D1 is not a neutral choice between two new options. It is a request to reverse a prior
decision. That is completely legitimate, the prior decision produced a result nobody
wants, and reversing it is the right call. But it should be made knowingly, because:

1. We will be intentionally inverting a passing test that currently protects the old
   behavior (`matchback.test.ts:192`).
2. The numbers on the dashboard will drop, visibly, for every client, on the day this
   ships. That is D4.

If the reversal is right, say so and we proceed. This section exists so nobody is
surprised later.

---

## §2. Decisions needed from Tina (blocking)

### D1. What does "Cited by AI" mean?

**Status:** `OPEN`

**The question.** When AI cites a different article on the same publisher's site, but not
our placement, what should the row say?

**Why it matters.** This is the whole bug. It determines whether the number we report is
defensible when a client asks us to prove it.

| Option | What the client sees | Trade-off |
|---|---|---|
| **A. Article-only** ⭐ recommended | Yes appears only when our exact article URL was cited | Matches the literal ask. Smallest change. We lose the publisher-level signal entirely, which does have real value. |
| **B. Article-only, plus a separate "Publisher cited" column** | Two distinct columns: did AI cite *our article*, and separately, did AI cite *this publisher at all* | Keeps the PR value story without the overclaim. Wider change, needs new column copy from you, and collides with in-flight work ([#146](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/146)). |
| **C. Article-only, publisher signal demoted to row detail** | One honest Yes/No column, publisher context available on hover or expand | Middle ground. Less table churn than B, but the publisher signal becomes easy to miss. |

**Our recommendation: A**, on the grounds that it is exactly what was asked for and it is
the option we can ship soonest. **But B is the better product** if you think "this
publisher is citing us generally" is a story worth telling clients. If you want B, say so
now rather than after A ships, because retrofitting the column later costs more.

- **Decision:**
- **Decided by / date:**
- **Rationale:**

---

### D2. Should placements that were NOT cited appear in the table?

**Status:** `OPEN`

**The question.** Today the table hides every placement that did not match, so every
visible row says Yes. There is no way to see how many placements did not get cited.

**Why it matters.** Right now the "Cited by AI" column cannot say No. It is a column of
Yes by construction, which makes it decorative rather than informative. It also hides the
hit rate.

| Option | What the client sees | Trade-off |
|---|---|---|
| **A. Show all placements with honest Yes/No** ⭐ recommended | A full list, most rows likely No after the fix | The column becomes meaningful and the real hit rate is visible. Harder conversation, the table gets long, and it will look worse. It will also be true. |
| **B. Keep hiding uncited rows** | Short list, all Yes, as today | Minimal change. The column stays informationally empty and the hit rate stays hidden. |
| **C. Keep hiding rows, but state the denominator loudly** | Short list, plus a prominent "3 of 47 placements cited by AI" | Honest headline number without a wall of No rows. Probably the best client-facing compromise. |

**Our recommendation: C**, unless you specifically want the full list. C gives you the
honesty of A without a table that reads as a wall of failure. Worth noting the card
already computes both numbers, so C is cheap.

- **Decision:**
- **Decided by / date:**
- **Rationale:**

---

### D3. Should the "First cited" column be renamed?

**Status:** `OPEN`

**The question.** "First cited" currently means "first cited *within the date range you
have selected*", not "first cited ever". In Bristol's screenshot every row shows the same
date, which is the start of the selected window, not a real first-citation date.

**Why it matters.** Not a bug, it works as designed (§5.2). But a client reading "First
cited: 2026-05-21" reasonably concludes that is the first time AI ever cited them. It is
not. This is a labeling problem that will eventually produce the same kind of "how is
this calculated" conversation the current bug did.

| Option | Trade-off |
|---|---|
| **A. Rename to something window-explicit**, e.g. "First cited in period" ⭐ recommended | Trivial change, removes the ambiguity. Needs your wording. |
| **B. Leave it, add a tooltip explanation** | The `?` tooltip already exists on this column. Cheapest option. Tooltips get missed. |
| **C. Leave it entirely** | Zero work. The ambiguity stays. |

**Our recommendation: A.** If you pick A, please supply the exact column label you want,
same as the copy you have specified on previous items.

- **Decision:**
- **Decided by / date:**
- **Rationale:**

---

### D4. The numbers will drop for every client. Does anyone get told first?

**Status:** `OPEN`
**Also needs:** Thomas

**The question.** This fix is not scoped to Renaissance. Every client with a PR Proof
sheet is currently overstating AI citation of their PR placements. When the fix ships,
their citation counts drop, in some cases to zero.

**Why it matters.** A client who screenshots the dashboard this week and looks again next
week will see a number fall with no explanation. That is a trust problem, and it is worse
if they notice before we mention it.

| Option | Trade-off |
|---|---|
| **A. Proactive note to affected clients before it ships** ⭐ recommended | Controls the narrative: we found it, we fixed it, here is the accurate number. Costs outreach effort. |
| **B. Ship it, brief the service leads, respond if asked** | Less effort. Risk of a client noticing first. |
| **C. Ship quietly** | Not recommended. This is exactly the situation the honesty is for. |

**Our recommendation: A**, at minimum for any client where the number goes to zero or
near-zero. We can generate the before/after per client so you know the size of each
conversation before you have it. Worth deciding this before the fix ships, not after.

- **Decision:**
- **Decided by / date:**
- **Rationale:**

---

### D5. Confirm the fix applies to all clients, not just Renaissance

**Status:** `OPEN`

**The question.** The ticket is titled "Renaissance Focus". The defect is in shared code
and cannot technically be scoped to one client (§5.3). Confirming this is deliberate.

**Why it matters.** We want it on the record that "all clients" was an explicit decision,
not something engineering did quietly because it was easier.

| Option | Trade-off |
|---|---|
| **A. Fix for all clients** ⭐ recommended, and effectively the only option | Correct behavior everywhere. It is also what the architecture forces. |
| **B. Renaissance only** | Would require building per-client branching that does not currently exist, to deliberately keep other clients on known-wrong numbers. We do not recommend this and would want it in writing. |

**Our recommendation: A.** Truth requirements should never be per-client configurable.
Layout and styling can be, correctness cannot.

- **Decision:**
- **Decided by / date:**
- **Rationale:**

---

### D6. Who backfills the empty Article column in the PR Proof sheet?

**Status:** `OPEN`
**Also needs:** Paul

**The question.** The Article column is blank because the Headline column in the PR Proof
Google Sheet is empty for these rows. There is also a code bug that stops the fallback
from working (§5.4), which we will fix regardless. But the real fix is populating the
sheet.

**Why it matters.** We can make the column stop rendering blank. We cannot invent article
titles. Without the sheet data the column will show a URL or a domain instead of a
headline, which is better than blank but still not what you asked for.

| Option | Trade-off |
|---|---|
| **A. PR team backfills the sheet, we fix the code fallback in parallel** ⭐ recommended | Correct outcome. Needs an owner and a date. |
| **B. Code fix only, accept a degraded fallback label** | Ships faster, column shows something rather than nothing, but not real headlines. |

**Our recommendation: A**, with B shipping immediately as the safety net so the column is
never blank again even when a sheet row is incomplete.

- **Decision:**
- **Decided by / date:**
- **Owner for the backfill:**
- **Rationale:**

---

## §3. Decisions we are making ourselves (non-blocking, recorded for the trail)

These are implementation calls. Tina does not need to approve them. They are documented
so the reasoning survives, per the CYA principle. If any of them turns out to have a
product consequence, it gets promoted to §2.

### E1. Reuse the existing URL normalizer rather than writing a new one

**Status:** `DECIDED` (2026-07-20, Thomas + Claude)

`urlJoinKey` (`lib/url.ts:12-32`) already exists, is already used across the codebase, and
already handles protocol, `www.`, casing, trailing slashes, query strings and `utm_*`
params. We will use it as-is rather than building matching-specific normalization.

**Rationale:** less new surface, and consistency with how the rest of the app already
joins URLs. Writing a second normalizer would create two sources of truth for "are these
the same page."

### E2. AMP URL variants: not handled in v1

**Status:** `DECIDED` (2026-07-20, Thomas + Claude), revisit if evidence appears

`urlJoinKey` does not fold AMP variants (`/amp` suffix, `amp.` subdomain). If AI cited the
AMP version of a placement, we would report No.

**Rationale:** we have no evidence Peec returns AMP URLs for these clients. Building for it
now is speculative complexity in the exact code path where a mistake recreates the bug we
are fixing. We will check the live citation data for AMP patterns before ruling on it
permanently. If any appear, this gets promoted to §2 as a product decision, because it
changes what counts as a citation.

**Verification owed:** confirm absence of AMP URLs in Peec citation data before ship.

### E3. The existing domain-level test gets inverted, not deleted

**Status:** `DECIDED` (2026-07-20, Thomas + Claude)

`matchback.test.ts:192` currently asserts that two placements sharing a cited domain are
both marked cited. Under D1-A that becomes wrong. We will rewrite it to assert the
opposite and leave a comment citing this decision record, rather than removing it.

**Rationale:** the inverted test is the regression guard. Deleting it would let the old
behavior creep back silently. The comment makes the reversal legible to whoever reads it
next, which is the failure mode that produced this ticket.

### E4. The FB-067 decision record in code gets updated in the same PR

**Status:** `DECIDED` (2026-07-20, Thomas + Claude)

`matchback.ts:5-10` documents the old domain-level direction as Tina's 2026-07-09 request.
It gets rewritten to reflect the new decision and to link here.

**Rationale:** if we change the code and leave the comment, the next person reads the
comment, concludes we broke it, and reverts. Stale decision comments are worse than none.

### E5. Sequencing against the in-flight parts migration

**Status:** `OPEN` (ours to resolve, needs Paul)

[#146](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/146) migrates PR Influence
onto the versioned-parts system and touches the same files. Whichever lands second pays a
merge cost.

**Leaning:** land the correctness fix first, because it is a live client-facing accuracy
problem and #146 is a refactor. To be confirmed with Paul.

### E6. `urlJoinKey` test coverage gets added to CI

**Status:** `DECIDED` (2026-07-20, Thomas + Claude)

`lib/url.test.ts` is a bare assertion script and is not in the `vitest.config.ts` include
list, so its assertions never run in CI. This fix makes `urlJoinKey` load-bearing for
correctness, so it gets ported to Vitest and added to the include list.

**Rationale:** we are about to depend on a function that nothing verifies on every commit.

---

## §4. Decision log

Chronological record. Every answer lands here as it is given, with attribution.

| Date | ID | Decision | Decided by | Note |
|---|---|---|---|---|
| 2026-07-20 | E1, E2, E3, E4, E6 | Recorded as above | Thomas Chang | Engineering calls, no stakeholder approval sought |
| | D1 | _awaiting_ | Tina Fleming | |
| | D2 | _awaiting_ | Tina Fleming | |
| | D3 | _awaiting_ | Tina Fleming | |
| | D4 | _awaiting_ | Tina Fleming + Thomas | |
| | D5 | _awaiting_ | Tina Fleming | |
| | D6 | _awaiting_ | Tina Fleming + Paul | |
| | E5 | _awaiting_ | Paul Ramirez | Sequencing vs #146 |

---

## §5. Appendix: technical backing

Included so the claims in §1 and §2 are checkable. Not required reading to answer.

### 5.1 Evidence that domain-level matching was deliberate

| Source | Location |
|---|---|
| Code comment attributing the direction to Tina, 2026-07-09 | `lib/pr-proof/matchback.ts:5-10` |
| Plan doc: "Matching is **domain-level** (a placement counts as cited if any URL on its domain is cited in the period)" | `docs/superpowers/plans/2026-07-09-pr-influence-matchback-cited-in-timeframe.md:14` |
| Passing test locking the behavior in | `lib/pr-proof/matchback.test.ts:192` |

### 5.2 Why "First cited" dates repeat across rows

`docs/superpowers/specs/2026-07-09-pr-influence-citation-dates-design.md:16-20` specifies
dates bounded to the selected window. Identical dates across publications means the window
starts there, not that the data is wrong.

### 5.3 Why the fix cannot be scoped to one client

The defect is in `lib/pr-proof/matchback.ts`, shared library code below the template
layer. `section_templates` has `section_slug` as its primary key with no client column, so
per-client templates are not representable. `report_section_config` governs layout only
and has no lever for matching logic. There is no client gating in the matchback path. Full
detail in the investigation doc §8.

### 5.4 Why the Article column renders blank

`lib/pr-proof/client.ts:148-151` returns `''` for a blank sheet cell.
`lib/pr-proof/matchback.ts:120` then uses `??`, which only catches null and undefined, so
an empty string passes through and the intended fallback never fires.
`pr-influence-tables.tsx:415-425` renders that empty string inside a link, producing an
invisible row entry.

### 5.5 Why article-level matching is cheap to build

`UrlCitation` already carries `url` and `urlKey` per row (`lib/peec/url-citations.ts:44`).
The matchback receives this data and discards everything except `domain`
(`matchback.ts:74`). The article-level data needed is already in memory at the point of
the match, so no new data fetching is required.

---

## §6. Note on this document's format

This is the first decision record in `docs/decisions/`. It is intended to double as the
template for the approval step in our QA process. The reusable shape is:

1. Header with issue, owner, and blocking status
2. Plain-English context, including any prior decision being reversed
3. Stakeholder decisions, each with options, trade-offs, an explicit recommendation, and
   blank lines for the answer and its rationale
4. Engineering decisions, recorded but not gated
5. A dated decision log
6. A technical appendix, separated so the stakeholder sections stay readable

Rejected options are never deleted. The record of what we chose not to do is as useful as
the record of what we did.
