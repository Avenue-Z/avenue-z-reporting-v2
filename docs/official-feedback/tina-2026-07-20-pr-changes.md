# Bug: PR Influence Dashboard (Renaissance Focus)

Tracking and investigation record for Tina's 2026-07-20 Asana ticket.

| | |
|---|---|
| **Ticket** | Bug: PR Influence Dashboard (Renaissance Focus) |
| **Reporter** | Tina Fleming |
| **Date** | 2026-07-20 |
| **Client context** | Renaissance / Bristol |
| **Branch** | `7-20-pr-changes` off `dev` |
| **This pass** | **Read only. No code changed.** See §2. |
| **Next gate** | Spec sign-off from Tina before any fix (§4 explains why) |

---

## §1. The Asana ticket, verbatim

Reproduced in full for team visibility. Nothing paraphrased or dropped.

### 1.1 Task name

> Bug: PR Influence Dashboard (Renaissance Focus)

### 1.2 Task description

> Stakeholder Feedback Doc: https://docs.google.com/document/d/1msTIQB0PyjPq3JQhs0lxWgkIx1pX5F3sxf6OqpWNG5Y/edit?tab=t.iwmqj3n0ezn#heading=h.fxu9vf6jvvtd
>
> Requirements:
>
> 1. Investigate what Bristol is seeing in the dashboard and if it is a bug or the table is set up incorrectly. It should only be saying "yes" if the exactly article is cited as a source.

### 1.2a Stakeholder feedback doc, relevant excerpt

Supplied by Thomas from the linked doc. Verbatim.

> Looking at the report here, Bristol asked me to dig in to see if their PR placement in Digital Insurance (https://www.dig-in.com/opinion/why-insurance-ai-needs-clean-workflows-and-accountability) was actually being cited in ChatGPT, so I dug into Peec and couldn't find any reference to our specific placement in Digital Insurance. There were other articles and URLs from dig-in.com listed in Peec, but not our specific URL where the PR placement was recently published.
>
> So I guess the question we now have is if this info is being pulled from Peec, and if so, what exactly is it showing here?

This is the single most useful piece of evidence on the ticket. It independently
confirms F1 from the data side: other dig-in.com URLs **are** in Peec, our placement URL
is **not**, and the row still says Yes. That is precisely the behavior F1 predicts.
Answered directly in §3.0.

> **Note:** only the excerpt above has been read. The rest of the doc has not. No Google
> Docs access from the environment this investigation ran in. If it carries requirements
> beyond the ticket text and this excerpt, they are not reflected here.

### 1.3 Comment thread

**Paul Ramirez, 2 hours before ticket capture**

> Tina Fleming Just want to make sure I'm understanding correctly here, we had a PR placement in digin through this link: https://www.dig-in.com/opinion/why-insurance-ai-needs-clean-workflows-and-accountability
>
> This link does not show in Peec as a citation source, but the dashboard is showing that DigIn was cited in ChatGPT due to one of our PR placements. This means that we're incorrectly claiming citations coming as a result of our PR work.
>
> Does that sounds like an accurate description of the problem?

Reactions: 👍 👀 🙌

**Tina Fleming, 2 hours before ticket capture**

> Correct!

Reactions: 👍 👀 🙌

**Tina Fleming, 2 hours before ticket capture**

> It also looks like the "Article" column is empty, which might be part of the problem.

Reactions: 👀 🙌

> **Capture note:** the source paste showed Paul's comment and both of Tina's replies
> twice each. Treated as an Asana UI duplication artifact, recorded once. Flagging it
> so nobody assumes content was trimmed.

### 1.4 Attached screenshot, transcribed

Placement matchback table, five rows. Column headers each carry a sort control and a
filter control; First cited, Most recent, Cited by AI, and AI Engines additionally
carry a `?` help tooltip.

| Publication | Article | Publish Date | First cited | Most recent | Cited by AI | AI Engines |
|---|---|---|---|---|---|---|
| Digital Insurance | _(blank)_ | July 8, 2026 | 2026-05-21 | 2026-07-10 | Yes | ChatGPT |
| BenefitsPRO | _(blank)_ | May 4, 2026 | 2026-05-21 | 2026-07-19 | Yes | Perplexity, Google, ChatGPT |
| Employee Benefit News | _(blank)_ | April 7, 2026 | 2026-05-21 | 2026-07-19 | Yes | Google, ChatGPT, Perplexity |
| BenefitsPro | _(blank)_ | February 24, 2026 | 2026-05-21 | 2026-07-19 | Yes | Perplexity, Google, ChatGPT |
| HR Executive | _(blank)_ | February 24, 2026 | 2026-05-21 | 2026-07-05 | Yes | `--` |

Five observations from the image, each mapped to a finding in §3:

| # | Observation | Finding |
|---|---|---|
| A | Article blank on all five rows | F3 |
| B | First cited identical (2026-05-21) across five unrelated publications | F5 |
| C | Cited by AI reads Yes on every row, no No anywhere | F2 |
| D | HR Executive reads Yes with no engines (`--`) | F4 |
| E | `BenefitsPRO` and `BenefitsPro` render as two rows (case variant) | F6 |

---

## §2. Scope of this pass: read only

No product code was read-modified. No fix applied. No test changed. No data touched.
The only write to the repo is this markdown file.

Verified on the branch:

```
$ git diff --name-status origin/dev...HEAD
A	docs/official-feedback/tina-2026-07-20-pr-changes.md

$ git diff --stat origin/dev...HEAD
 1 file changed, 174 insertions(+)

$ git status --porcelain
(clean)
```

Investigation method was static read plus existing in-repo design docs. No live API
call, no database read, no client data pulled. Every finding below is either proven
from source at a cited `file:line` or explicitly marked as needing verification.

---

## §3. Findings

### 3.0 Direct answer to the stakeholder question

> "if this info is being pulled from Peec, and if so, what exactly is it showing here?"

**Yes, it is Peec.** `pr-influence.tsx:185` calls
`getUrlCitations(clientSlug, { startDate, endDate })` for the selected range, and
`pr-influence.tsx:252` feeds that into `computePlacementMatchback` alongside the PR Proof
sheet placements (`getPRProofData`, `pr-influence.tsx:154`).

**What the row is actually showing:**

> At least one URL on dig-in.com was cited by ChatGPT during the selected window.

**What a reader reasonably assumes it is showing:**

> Our dig-in.com placement was cited by ChatGPT.

Those are different claims, and the table presents the first as the second. The "other
articles and URLs from dig-in.com" found in Peec are exactly what lights the row up. Our
placement URL is never consulted.

Mechanically: `matchback.ts:74` reads `c.domain` off each citation and discards the rest.
The `UrlCitation` type already carries `url` and `urlKey` per row
(`lib/peec/url-citations.ts:42-55`), so the article-level data needed to answer Bristol's
actual question is **already in memory at the point of the match** and is simply thrown
away. That materially lowers the cost of the fix (see §6).

So the honest framing for Bristol: the number is not fabricated and it is not a Peec
data problem. It is a real Peec signal at the wrong granularity, labeled as if it were at
article granularity.

### 3.1 Findings

Paul's description is accurate. It is a real defect, not a misread table. Severity
legend: **●** correctness, **○** cleanup or labeling.

| # | Sev | Status | Location | Finding |
|---|---|---|---|---|
| F1 | ● | CONFIRMED | `lib/pr-proof/matchback.ts:110` | Placements match on domain, never on the article URL |
| F2 | ● | CONFIRMED | `lib/pr-proof/matchback.ts:123` | `citedByAI` hardcoded true, column can never say No |
| F3 | ● | CONFIRMED | `lib/pr-proof/matchback.ts:120` | `??` does not catch `''`, so the Article fallback never fires |
| F4 | ○ | CONFIRMED | `lib/pr-proof/matchback.ts:70-81` | Yes with zero engines is reachable by design |
| F5 | ○ | CONFIRMED, not a bug | `docs/superpowers/specs/2026-07-09-pr-influence-citation-dates-design.md:20` | "First cited" is window-bounded, label misleads |
| F6 | ○ | NEEDS VERIFICATION | PR Proof sheet | Publication case variants split into separate rows |
| F7 | ○ | CONFIRMED | `vitest.config.ts:13-25` | `lib/url.test.ts` is not in the CI include list, so `urlJoinKey` is untested in CI |

### F1. Matchback matches on domain, never on the placement URL ●

`lib/pr-proof/matchback.ts:71-81` builds `citedHostsInPeriod` from the **domain** of
every Peec citation. Line 110 then admits a placement if its domain is in that set:

```ts
const h = normHost(p.domain)
if (!citedHostsInPeriod.has(h)) continue
```

`p.link`, the actual article URL, is never compared against the cited URLs. It is
carried through to the row for display only (`matchback.ts:121`).

So a single citation of *any* page on dig-in.com marks *every* dig-in.com placement as
cited. That is exactly what Paul saw: the opinion piece is absent from Peec, but the
row claims ChatGPT cited it. Directly contrary to Tina's requirement that it only say
yes if the exact article is cited.

### F2. "Cited by AI" is hardcoded true ●

`matchback.ts:123` sets `citedByAI: true` unconditionally. Uncited placements are
already filtered out one loop earlier at line 110, so every row reaching the table is a
Yes by construction. The column carries no information today (observation C).

This compounds F1: the table shows a wall of Yes with no visible denominator, so a
reader cannot see how much of the placement list failed to match.

### F3. Empty Article column, two causes ●

- **Data.** `headline` comes from column C of the PR Proof Google Sheet
  (`lib/pr-proof/client.ts:29,167`). Blank cells there yield blank headlines.
- **Code.** `client.ts:148-151` `cell()` always returns a string, `''` for a blank
  cell. `matchback.ts:120` then does `headline: p.headline ?? p.domain`. `??` only
  catches null and undefined, so an empty string passes through and the intended
  domain fallback never fires. `pr-influence-tables.tsx:415-425` renders that empty
  string inside an `<a>`, producing an invisible link with nothing to click.

`||` instead of `??` restores the fallback, but that only substitutes the domain, which
is not an article title either. The real fix is populating the sheet.

Tina's instinct that this "might be part of the problem" is half right: it is a
separate defect, but it shares a root with F1. Because nothing downstream ever reads
`p.link`, an empty headline has no visible consequence to the matching logic, and the
blank column is the symptom that makes the domain-level match hard to spot by eye.

### F4. Yes with no engines is reachable ○

`matchback.ts:70-81` deliberately builds `citedHostsInPeriod` from all citations
*including* ones with no engine attribution, so a host can be admitted as cited and
render with no engine chips. That is the HR Executive row (observation D). Defensible
when the match is genuine. Indefensible while F1 stands.

### F5. "First cited" is window-bounded, and the label misleads ○

Not a bug. `docs/superpowers/specs/2026-07-09-pr-influence-citation-dates-design.md:16-20`
specifies it: "First cited: the earliest day **in the selected window** … Both dates are
bounded by the selected timeframe." Five publications sharing 2026-05-21 (observation B)
means the window starts there and all five were cited on day one.

The defect is the label. A client reads "First cited" as first ever, not first within
this date range. Worth raising with Tina alongside the main fix.

### F6. Publication case variants split rows ○ NEEDS VERIFICATION

`BenefitsPRO` and `BenefitsPro` appear as separate rows (observation E). `normHost()`
(`matchback.ts:45-47`) normalizes the *domain* for matching, but `outlet` renders raw
from the sheet (`matchback.ts:119`, `pr-influence-tables.tsx:408`). Most likely two
sheet rows with inconsistent casing rather than a code defect. Confirm against the PR
Proof sheet before changing anything.

### F7. `urlJoinKey` has assertions that never run in CI ○

`lib/url.test.ts` is a bare `node:assert` script with a `npx tsx` run comment, not a
Vitest suite, and `vitest.config.ts:13-25` uses an explicit allowlist of test paths that
does not include it. Its nine `urlJoinKey` assertions therefore do not run in CI.

Not a problem today. It becomes one the moment we fix F1, because `urlJoinKey` becomes
the load-bearing correctness primitive for placement matching. Port it to Vitest and add
it to the include list as part of that work.

---

## §4. This is a spec reversal, not a coding slip. Read before fixing.

The domain-level match was **deliberate, specified, and tested**.

- `lib/pr-proof/matchback.ts:5-10` records it as Tina's own 2026-07-09 direction.
- `docs/superpowers/plans/2026-07-09-pr-influence-matchback-cited-in-timeframe.md:14`
  states it outright: "Matching is **domain-level** (a placement counts as cited if any
  URL on its domain is cited in the period), same granularity the card already uses."
- The behavior is locked in by a passing test:
  `lib/pr-proof/matchback.test.ts:192`, `it('includes both placements when two
  placements share a cited domain (domain-level)')`.

So the exact behavior Tina is now reporting as a bug is a codified requirement from
eleven days earlier. Fixing F1 means intentionally inverting that test, not repairing
broken logic.

Two consequences:

1. **Do not ship a fix before Tina signs off on the new semantics.** We would be
   reversing her own prior direction on our own authority.
2. **The FB-067 decision record needs updating too**, not just the code, or the next
   person reads `matchback.ts:5-10` and reverts us.

---

## §5. Open questions

Blocking, needs answers before implementation.

| # | For | Question |
|---|---|---|
| Q1 | Tina | Does article-level matching **replace** domain-level, or sit beside it as a separate clearly-labeled signal? "Publisher was cited" has real value as long as it is not labeled as our placement being cited. |
| Q2 | Tina | Should uncited placements show as visible No rows (giving an honest denominator), or stay filtered out? |
| Q3 | Tina | Rename "First cited" to something window-explicit (F5)? |
| Q4 | Tina / Paul | Who backfills the Headline column in the PR Proof sheet (F3)? |
| Q5 | Team | Ticket says Renaissance Focus, but the defect is in shared matchback code and affects **every client with PR Influence enabled**. Confirm we fix globally, and decide whether other clients need a heads-up about previously overstated numbers. |
| Q6 | Team | Sequencing against [#146](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/146), which migrates the PR Influence tab onto the versioned-parts system and touches the same surface. |
| Q7 | Thomas | Relevant excerpt supplied (§1.2a) and it confirms F1. Does the rest of the doc add anything beyond it? |
| Q8 | Paul | Does an AMP-variant citation of a placement count as a match (§6.1)? Does Peec even return AMP URLs for this client? |

---

## §6. Proposed direction, NOT approved

Sketch only, pending §5. Sequenced smallest blast radius first.

1. Match on normalized placement URL against cited URLs, not host. Keep `normHost` for
   the engine roll-up.
2. Stop filtering uncited placements out. Render an honest No so F2's column means
   something and the denominator is visible.
3. Fix `??` to `||` (F3), and get the sheet's Headline column populated.
4. Re-label "First cited" (F5).
5. Decide whether domain-level survives as a separate signal (Q1).
6. Update the FB-067 decision record and `matchback.test.ts:192` to match the new spec.
7. Port `lib/url.test.ts` to Vitest and add it to `vitest.config.ts` (F7).

### 6.1 Step 1 is cheaper than it first looked

The earlier draft of this doc flagged URL normalization as an unresolved design
question. Mostly resolved on inspection. `urlJoinKey` (`lib/url.ts:12-32`) already exists,
is already used across the codebase, and already handles nearly every case listed:

| Concern | Handled? | Where |
|---|---|---|
| Query string and `utm_*` params | Yes | `lib/url.ts:18`, drops everything after `?` and `#` |
| http vs https | Yes | `lib/url.ts:27`, strips protocol |
| `www.` prefix | Yes | `lib/url.ts:29` |
| Case | Yes | `lib/url.ts:30` |
| Trailing slash | Yes | `lib/url.ts:31` |
| **AMP variants** (`/amp` suffix, `amp.` subdomain) | **No** | Not handled anywhere |

And the inputs are already in scope. `UrlCitation` carries a precomputed `urlKey` per row
(`lib/peec/url-citations.ts:44`, built via `urlJoinKey` at line 91), so step 1 is roughly:
build a `Set` of `urlKey` alongside the existing `citedHostsInPeriod`, then test
`urlJoinKey(p.link)` against it. **Zero new fetches**, same principle FB-035 and FB-039
followed.

That leaves one genuine open item rather than a whole spec conversation: **AMP**. Decide
whether an AMP-variant citation of our placement counts as a match. Worth checking
whether Peec even returns AMP URLs for this client before building for it.

The remaining blockers are product decisions (§5 Q1, Q2), not technical unknowns.

---

## §7. References consulted

All read only.

| Path | Why it matters |
|---|---|
| `lib/pr-proof/matchback.ts` | The defect. F1, F2, F3, F4 |
| `lib/pr-proof/matchback.test.ts` | Locks in domain-level behavior (§4) |
| `lib/pr-proof/client.ts` | Sheet parsing, blank-cell handling (F3) |
| `lib/pr-proof/types.ts` | `PRPlacement.headline` is non-optional `string` (F3) |
| `components/report-sections/peec-ai/pr-influence-tables.tsx` | Column rendering (F3, F6) |
| `components/report-sections/peec-ai/pr-influence.tsx` | Peec data path, answers §3.0 |
| `lib/peec/url-citations.ts` | `UrlCitation` already carries `url` and `urlKey` (§3.0, §6.1) |
| `lib/url.ts` | `urlJoinKey` normalization, already covers most of §6.1 |
| `lib/url.test.ts`, `vitest.config.ts` | F7, assertions not in the CI include list |
| `docs/superpowers/plans/2026-07-09-pr-influence-matchback-cited-in-timeframe.md` | Original domain-level spec (§4) |
| `docs/superpowers/specs/2026-07-09-pr-influence-citation-dates-design.md` | Window-bounded dates (F5) |
| `docs/official-feedback/status.md` | Ground rules below |
| `CLAUDE.md` | Branch flow, review gates |

---

## §8. Client scope, verified programmatically

Thomas: "Renaissance and Ave Z both share a base template and whatever we change on the
template affects both, and this change needs to work for both."

**Confirmed, and the reality is broader than that.** It is not two clients sharing a
template. It is every client sharing one, and the defect sits below the template system
entirely.

### 8.1 The template really is global

| Evidence | Location | What it proves |
|---|---|---|
| `sectionSlug` is the **primary key** of `section_templates` | `lib/db/schema.ts:230-236` | One template row per section slug for the whole platform. There is no client column. Per-client templates are not representable. |
| `getSectionTemplate(section)` takes no client argument | `lib/db/queries.ts:255-258` | Every client's render resolves the same row. |
| `const template = dbTemplate ?? PEEC_TEMPLATE` | `components/report-sections/peec-ai/index.tsx:129` | The fallback is a single hardcoded constant, `template.ts:6`. |
| `BESPOKE_PARTS` is `{}` | `parts/bespoke/registry.ts:6` | No client currently has a divergent part. The bespoke escape hatch exists but is unused. |

Per-client deviation exists only through `clients.report_section_config`
(`ReportSectionConfig` overrides: order, hidden, labels, thresholds, extraParts). That
system governs **layout composition**, meaning which parts render, in what order, with
what labels. It has no lever for **matching logic**.

### 8.2 The defect is below the template layer, so scope is even wider

The bug is in `lib/pr-proof/matchback.ts`, plain shared library code called directly by
`pr-influence.tsx:252`. It is not a part, not a template entry, and not overridable.

- **Zero client gating in the matchback path.** The only `clientSlug ===` reference in
  `pr-influence.tsx` is a comment at line 197 noting a hardcoded `'avenue-z'` gate that
  was **removed** in #138 P6.
- **PR Influence is not on the parts system yet.** `parts/` holds Overview-tab parts
  only. The tab still renders monolithically. That migration is
  [#146](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/146).

**So there is no way to fix this for one client and not another, and no way to get it
wrong for one client while right for another.** One code path, every client with a PR
Proof sheet configured. That satisfies Thomas's "needs to work for both" requirement by
construction rather than by effort.

This is the right outcome. Tina's requirement is a truth requirement (only say yes if
the exact article was cited), not a styling preference, so it should never have been
per-client configurable.

### 8.3 The per-client surface that does exist, and why it does not threaten the fix

Two per-client columns feed this path:

| Column | Purpose | Risk to the fix |
|---|---|---|
| `clients.pr_proof_sheet_id` | Which Google Sheet holds that client's placements | None. Absent means zero placements and an empty table (`client.ts:198-207`). |
| `clients.pr_proof_column_map` | Which sheet columns map to which fields, defaults `A-G` (`client.ts:26-34`) | Low. See below. |

The column map is the one thing that varies, and the fix depends on `p.link`. That is
already safe: `client.ts:161-162` **skips any row without a link** before it becomes a
placement, and `domain` is derived from `link` via `extractDomain(link)`. So every
`PRPlacement` reaching the matchback is guaranteed to carry a non-empty link.

Practical consequence: article-level matching cannot silently degrade to all-No because
of missing link data. Contrast F3, where the `headline` column has no such guarantee,
which is exactly why the Article column renders blank.

### 8.4 What this means operationally

Every client with a PR Proof sheet configured and PR Influence enabled is currently
overstating AI citation of PR placements, at whatever rate their placement domains
happen to get cited for unrelated articles. Renaissance is where it was noticed, not
where it is happening.

That is a client-communications question as much as an engineering one, and it is Q5 in
§5. Worth deciding before the fix ships, because the numbers will visibly drop for
everyone the day it lands.

---

## §9. Ground rules, carried from `status.md`

1. Match Tina's literal ask. No silent reinterpretation.
2. Design, layout, and UX changes apply universally. New clients inherit by construction.
3. Sandbox to Avenue Z only when the content is hardcoded Avenue Z data.
4. Glean Chat API for any LLM inference. No Vertex, OpenAI, or Anthropic direct.
5. No em-dashes or AI-tell punctuation in any copy.
6. Every item documented with verbatim ask, decisions made, and risks.

Per `CLAUDE.md`, fixes land on this feature branch, get reviewed on this PR, and merge
to `dev` only after sign-off. Each fix graduates into `feedback-log.md` with an FB-ID
once triaged.
