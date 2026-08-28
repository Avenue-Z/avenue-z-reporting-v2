# Executive Overview: CRM Wiring (Half B)

**Date:** 2026-08-24
**Status:** Design approved, not yet implemented
**Plan:** `docs/superpowers/plans/2026-08-16-renaissance-crm-pipeline.md`, Tasks 7 to 10
**Branch:** `feat/exec-overview-crm-wiring`, cut from `dev`

---

## 1. What this is

Half A (PR #208) shipped the Salesforce data layer under `lib/salesforce/`. It is
built, tested, and **unconsumed**: nothing outside that directory imports it. On
the Executive Overview page, Contact Creation and Pipeline Performance render
`<NeedsConnection sourceName="CRM" />` unconditionally at
`components/report-sections/executive-overview/index.tsx:142` and `:147`.

This design covers Half B: wiring that data layer into the page. Two new
presentational server components, two journey cards, and the fetch plumbing.

Task 7 was a rebase gate that is now satisfied. PR #207 merged, so
`components/report-sections/executive-overview/` exists on `dev`. There is
nothing to rebase; the branch is cut fresh from `dev`.

---

## 2. Corrections to the plan

The plan was written before Half A's code-review rounds. It has drifted from what
shipped. Every fixture and signature below was verified against `origin/dev`
before this design was written; **the plan's own code snippets must not be copied
verbatim.**

| # | Plan says | What actually shipped |
|---|---|---|
| 1 | `PipelineData` fixture with 7 fields | Requires 4 more: `unrecognizedClosedFlags: number`, `wonStageUnmatched: boolean`, `openUnavailable: boolean`, `wonUnavailable: boolean`. The plan's fixture does not compile. |
| 2 | `WeeklyContacts` fixture with 5 fields | Requires `currentWeekPartial: boolean` and `daysElapsedInCurrentWeek: number`. |
| 3 | `weekOverWeek` | Does not exist. It is `completedWeekOverWeek`, and it compares the two most recent **complete** weeks. Its doc comment refuses the partial-vs-complete comparison the plan's Task 9 and Task 10 snippets both specify. |
| 4 | `buildStages({ totals, cmpTotals, peec, trendRows })` | Signature also carries `peecConnected` and `now`. The plan's new tests omit `peecConnected`. |
| 5 | Task 10's stage replacement snippet | Drops `unconnectedHint: 'Connect your CRM to see this'` from both CRM stubs. Dropping it regresses the unconnected branch to the generic hint that PR #207 fixed. |
| 6 | Handles `ownersTruncated` only | Half A ships **six** degradation signals plus the `byOwner` null/`[]` contract. The plan has UI for the least consequential one. Only three of the six carry a doc comment telling the consumer to surface them; see §3.1. |
| 7 | Task 10's inbound stub carries `heroLabel: 'new contacts created this week'` and `connector: 'becomes\npipeline'` | The shipped stub (`stages.ts:138-143`) has **no `heroLabel`** at all, and its connector is `'becomes pipeline'` with a space, not a newline. There is nothing to "retain": the populated card must name its own hero label or ship a blank hover reveal. §4.3 names it explicitly. |
| 8 | Task 10's pipeline stub carries `heroLabel: \`across ${n} open deals\`` | The shipped stub (`stages.ts:144-150`) has no `heroLabel` and no `connector` (it is the last stage in the row). Same consequence as row 7, and §4.3 previously omitted the field outright rather than restating it. Now named explicitly. |
| 9 | Task 9 omits the Prior Year Week tile when `priorYearWeek` is absent | This design renders it dashed instead. `priorYearWeek` is undefined three ways, not two: the compare fetch failed, or it succeeded and carried no bucket for the matching ISO week number, or there is no completed week to match against at all so `lastCompleteKey` is undefined (`contacts.ts:163-167`). Dropping the tile hides which. Reconciled with §3.3 there. |
| 14 | Nothing on `WeeklyContacts` marks the no-completed-week state | `previousWeek` is `completed.at(-1)?.contacts ?? 0` (`contacts.ts:153`), so the tile publishes a confident `0` from January 1 until the first ISO week completes. No flag exists for it; §3.4 derives it as `weeks.length < 2` from `gapFill`'s contract and §4.2 dashes the tile. |
| 10 | `StageInput` gains `pipeline` and `contacts` only | It also gains `crmConnected`, for the same reason `peecConnected` exists: whether data arrived is not the same question as whether the client is configured. See §3.6. |
| 11 | Enablement says to "confirm what the extra recorded migrations are before running `db:migrate` against dev" | Global Constraint line 35 of that same plan bans `db:migrate` outright, and `scripts/migrate-http.ts` is the hash-diffed path that works against Neon. 0021 is in any case already applied and verified on dev (2026-08-21). See §6. |
| 12 | Global Constraints ban em and en dashes "in prose, comments, or commit messages" outside pre-existing null glyphs (plan line 33) | Applied to the shipping copy: the partial-week line reads `Partial week: 3 of 7 days.`, not an em-dashed variant, and no new on-screen string introduces one. Applied to **this document's own prose** as well, since the constraint says prose and a design doc is prose. Rendered `—` null glyphs in `KpiCard` values and stage stats stay verbatim, which the constraint allows. See §8. |
| 13 | `index.tsx` keeps its page-level `Last 30 days` line | That line (`index.tsx:119`) becomes a false caption the moment CRM blocks on other windows sit under it. It moves into the Web Analytics `<section>`, and each CRM block and card names its own window. See §3.5. |

### 2.1 The plan's failure-fallback claim is wrong for pipeline

Task 10 states: *"A configured client whose fetch fails also falls back to
needs-connection."*

That is false for pipeline. `getSalesforcePipelineImpl` wraps all four of its
queries in `.catch(() => null)` (`lib/salesforce/pipeline.ts:254-276`) and always
resolves. A total CRM outage therefore returns a fully-populated object with
`openUnavailable: true`, `wonUnavailable: true`, and all four tiles at `0`.
Without the caveat rendering in §4.1, that renders as `$0` / `0 open deals`:
confident, fabricated data, which is precisely the failure this page exists to
avoid.

Contacts behaves as the plan describes: `getSalesforceWeeklyContactsImpl` leaves
its primary query uncaught, so a failure rejects, `val()` yields `null`, and the
block falls back.

**Verified correct in the plan:** `getSalesforcePipeline(slug)` and
`getSalesforceWeeklyContacts(slug)` exist as cached exports
(`lib/salesforce/pipeline.ts:310`, `lib/salesforce/contacts.ts:218`); tests use
the `…Impl` variants, as `lib/salesforce/contacts.test.ts` does, because
`cached()` throws outside a request context. `KpiCard` supports `deltaLabel`,
`comparisonExpected`, and `subValue`. `CHART_COLORS.positive` and `.neutral`
exist. `clients.salesforce_config` exists (`lib/db/schema.ts:152`).

---

## 3. Decisions

### 3.1 Surface all six degradation signals, plus the `byOwner` contract

`PipelineData` carries **six** degradation fields, not five: `ownersTruncated`,
`stageTruncated`, `unrecognizedClosedFlags`, `wonStageUnmatched`,
`openUnavailable`, `wonUnavailable` (`lib/salesforce/types.ts:49-90`). The
`byOwner` null-versus-`[]` contract (`:43-48`) is a seventh signal in everything
but name. All seven are rendered here.

Only three of the six carry a doc comment telling the consumer to surface them:
`unrecognizedClosedFlags` ("so the UI can caveat the tiles"), `wonStageUnmatched`
("unless the UI reads this flag and says so"), and `openUnavailable` ("render them
as unavailable"). `byOwner` carries the fourth such directive ("a failed fetch
must never render as 'this client has no owners'"). The remaining three,
`ownersTruncated`, `stageTruncated`, and `wonUnavailable`, describe the condition
and stop there.

That silence is a gap in the type's documentation, not a licence to drop them.
`stageTruncated` gates all four headline tiles, and `wonUnavailable` is the only
thing standing between a failed closed-won fetch and a confident `$0`. Their
rendering directives are supplied here instead:

- **`ownersTruncated`** must annotate the owner list as possibly incomplete; it
  keys off the RAW row count, so a complete-looking list is exactly when a false
  all-clear hurts (`pipeline.ts:20-27`).
- **`stageTruncated`** must caveat the tile grid as possibly undercounted, and
  must not be collapsed into the owner note: it covers different numbers.
- **`wonUnavailable`** must render Closed Won as unavailable, value and delta
  both, on the same reasoning `openUnavailable`'s own comment spells out.

Combined with §2.1 (pipeline never rejects, so there is no fallback to catch an
outage), shipping fewer than all seven means a CRM outage renders as real zeros.
The page's design premise is that a plausible zero is worse than a placeholder.

### 3.2 Contact Creation headlines Current Week, with no delta on it

`currentWeek` stays the headline for wireframe parity, but carries **no delta**.
`completedWeekOverWeek` moves to the Previous Week tile, where both sides of the
comparison are complete weeks.

This keeps the layout the plan asked for while refusing the comparison
`completedWeekOverWeek`'s doc comment explicitly refuses to compute: a partial
week measured against a complete one is structurally invalid and renders as a
large false decline early in the week. The partial state is disclosed on the tile
itself via `daysElapsedInCurrentWeek`.

### 3.3 The `delta: undefined` ambiguity does not render

`PipelineKpi.delta` being `undefined` cannot be distinguished from "the compare
fetch failed." The plan flags this for Half B to decide. **Decision: do not render
the distinction, and record why.**

Rationale: `openDeals`, `totalPipeline`, and `weightedPipeline` are undefined *by
design* (openness is measured as of now, so a prior-year window has had a year to
close and trends to ~0 open by construction). Those three set neither `delta` nor
`comparisonExpected`, so they render no delta line at all and expose no ambiguity
to the reader. Only `closedWon` sets `comparisonExpected`, and its
`— vs same period last year` placeholder is equally honest whether the baseline
was 0 or the compare fetch failed. That holds only while the tile's own value is
real: when `wonUnavailable` takes the value away too, the placeholder goes with it
(§3.4).

Adding a discriminant would mean reopening Half A's shipped types, transform, and
tests to serve a distinction no rendered surface currently needs. The type's own
doc comment asks for a richer shape only "once real UI requirements exist to
design it against." This PR is the UI, and it does not produce one. Recorded in a
code comment on the tile and in §4 of the review-record doc.

**The same rule governs `priorYearWeek`, and it is ambiguous three ways, not
two.** `WeeklyContacts.priorYearWeek` is undefined when any one of these holds
(`contacts.ts:163-167`), and the rendered value is identical in all three:

1. the compare fetch failed and degraded to `null`, so `cmpRows` is falsy;
2. the compare fetch succeeded but held no bucket carrying the matching ISO week
   number;
3. **there is no completed week to match against at all**, so `lastCompleteKey`
   is `undefined` and the guard on line 165 never runs its lookup. This is the
   same `weeks.length < 2` state that dashes Previous Week, per §3.4, and it is
   the case both an earlier revision of this section and §2 drift row 9 missed.

The plan's Task 9 drops the tile whenever the value is absent, which is the
opposite of the treatment chosen for Closed Won above, for the same ambiguity one
screen away. Dropping it is worse on every count: it still does not say which of
the three happened, and it changes the block's shape, so a reader cannot tell a
comparison that is missing from one that was never offered.

**Decision: render the Prior Year Week tile always, with the `—` glyph as its
value when `priorYearWeek` is absent.** One rule now covers both blocks: an
absent comparison renders as a placeholder, never as a removed surface. It also
makes §4.2 and §4.3 agree, since the inbound journey card's Prior Year Week stat
already dashes rather than disappearing.

### 3.4 A suppressed value suppresses its delta, and so does a corrupted baseline

The flags in §4.1 decide what a tile's *value* shows. They must decide that tile's
*delta* in the same breath, because `KpiCard` tests `delta !== undefined` **before**
it tests `comparisonExpected` (`kpi-card.tsx:61-77`). A tile can therefore render
the `—` glyph as its value and a confident percentage directly underneath it, in
the same card, with nothing in the component to stop it.

That is not hypothetical. `transformPipeline` builds Closed Won as
`kpi(wonCur.amount, wonPrior?.amount)` (`pipeline.ts:194`), and `wonCur.amount` is
`0` in two separate broken states: the closed-won fetch failed and degraded to
`null`, which reaches the transform as `[]` (`pipeline.ts:258-261`, `:278`), or the
won stage was renamed in the CRM so nothing matched (`pipeline.ts:145-149`). If the
prior-year fetch succeeded and returned a positive amount, `pct()` yields exactly
`-100` (`pipeline.ts:105-111`) and the card renders

```
—
↓ 100.0% vs same period last year
```

a fabricated total collapse, published to a client, during an outage or a stage
rename.

**First half of the rule, applied everywhere in §4:** whenever a flag replaces a value with the `—`
glyph, or marks it as not-real, that same flag suppresses the tile's `delta`.
Where a comparison was genuinely expected and merely cannot arrive,
`comparisonExpected` stays on, so the reader gets the greyed `— vs …` placeholder
rather than a silent gap; where the whole tile is unavailable, both come off. The
same audit applies to every other field on a degraded object: a `subMetric`, a
`stat`, or a `subValue` that keeps stating a plausible figure while the value
beside it dashes is the same defect wearing different clothes.

**The rule has a second half, for flags that corrupt the baseline rather than the
value.** `stageTruncated` and `unrecognizedClosedFlags` describe numbers that are
real but possibly wrong, not numbers that are absent, so their tiles keep their
values and the caveat region says what is wrong with them. Their *deltas* still
come off, because both flags can fire on the prior-year won query alone:

- `stageTruncated` is the OR of three row-count checks, and one of them is
  `wonPriorRows.length >= STAGE_MAX_ROWS` (`pipeline.ts:296-299`). A truncated
  prior-year window undercounts the baseline, so `pct()` divides a whole current
  year by a partial prior one and publishes an inflated growth percentage. The
  flag exists for exactly this: the comment directly above it says a truncated
  won-prior set "would otherwise silently overstate the closedWon
  year-over-year delta" (`pipeline.ts:292-294`).
- `unrecognizedClosedFlags` counts rows across all four queries, `wonPriorRows`
  included (`pipeline.ts:295`). Unreadable rows fail closed, so a bad flag in the
  prior-year set inflates the baseline while a bad flag in the current set
  inflates the numerator. The count is a single integer and cannot say which, so
  the direction of the error in the ratio is unknown even though the direction of
  the error in each total is not.

An undercounted total is bounded, one-directional, and legible once caveated. A
ratio of two independently corrupted totals is none of those three. So under
either flag Closed Won keeps its value and its caveat line, suppresses its
`delta`, and keeps `comparisonExpected`, and the tile reads
`— vs same period last year` with the caveat below it explaining why the
comparison is withheld.

`ownersTruncated` is the one flag that reaches no tile at all. It describes the
completeness of the owner list and nothing else, so it suppresses nothing in the
grid; §5 pins that, so the suppression rule cannot creep into "any flag hides
everything".

**The audit runs over `WeeklyContacts` too, and finds one there.** The rule above
is about flags, and `WeeklyContacts` carries none, which is exactly how this one
stayed hidden. `transformWeeklyContacts` builds `previousWeek` as
`completed.at(-1)?.contacts ?? 0` (`contacts.ts:153`). When no completed week
exists the `?? 0` fires and the tile publishes a confident `0` for a week that
does not exist. That is the same defect as the fabricated `-100`: a plausible
number standing in for an absent one. It is not an edge case reachable only in
theory either, because the window is year to date on created date
(`contacts.ts:194`), so it is the state of every client from January 1 until the
first ISO week of the year completes, plus any client whose first contact ever
landed in the week now in progress.

The condition is derivable without reopening Half A's types, from the shape
`gapFill` already guarantees. `gapFill` returns a contiguous run of ISO weeks
from the first observed week through the current one, and returns `[]` for no
input at all (`contacts.ts:98-122`). The window cannot produce a bucket dated
after the current week, so the last element of `weeks` is always the week in
progress and every earlier element is a completed week:

> **`weeks.length < 2` means no completed week exists.**

`currentWeekPartial` is not a usable discriminant for any of this: the shipped
transform sets it to `true` unconditionally (`contacts.ts:173`).

Under `weeks.length === 1`, §4.2 dashes Previous Week and suppresses its delta.
Prior Year Week is dashed in that state too, for a third reason §3.3 now names.
Current Week is untouched: it is a real partial-week count, and it is the one
figure on the block that is genuinely known. `weeks.length === 0` is a different
problem and is handled in §4.2's guards, since with no buckets at all
`currentWeek` is `0` too and there is nothing on the block worth rendering.

### 3.5 Every CRM block names its own window

`index.tsx:119` prints one `Last 30 days` line above the entire page. None of the
CRM data is on that window. The open tiles are as-of-today (the query spans
January 1 of nine years ago through December 31 of nine years ahead, and openness
is evaluated as of now, not over the window, `pipeline.ts:69-72`); Closed Won is
year to date (`pipeline.ts:241`); the contact bars are year-to-date ISO weeks
(`contacts.ts:194`). Left where it is, that line becomes a false caption for six
new numbers.

The AEO card already solved this exact problem in this section: its hero metric is
the last complete week while its share-of-voice sub-metric is year to date, so it
names the window inline (`… share of voice, year to date`) and carries
`badge: 'LAST FULL WEEK'` (`stages.ts:86`, `:93`). The CRM blocks and cards take
the same treatment, spelled out per surface in §4.1, §4.2 and §4.3, and the
page-level line moves down into the Web Analytics `<section>` it actually
describes.

### 3.6 Two predicates: is the CLIENT configured, and can THIS DEPLOYMENT reach it

Two new places need to know whether this client has a CRM: `index.tsx`, to choose
between `LoadFailed` and `NeedsConnection`, and `stages.ts`, to choose whether a
stub says "Not connected". A third place answers a related but genuinely different
question: `salesforceQuery` throws unless `salesforceConfig.salesforceAccountId`
**and** `smApiKeyEnvVar` are both set (`base.ts:33`) **and** the env var they name
actually holds a value (`base.ts:35`).

Those are two questions, and collapsing them into one predicate fails in both
directions:

- `!!client?.salesforceConfig` is too weak for either. A row with config but no
  `sm_api_key_env_var` passes it, issues two doomed fetches on every render, and
  shows the reader an outage.
- The full `base.ts:33` plus `:35` conjunction is too strong **as a connectedness
  test**. `sm_api_key_env_var` names the client's shared Supermetrics key, the
  same one Meta, Paid Search, LinkedIn and the configurable dashboard all read
  (`lib/meta/base.ts:13`, `lib/paid-search/base.ts:14`, `lib/linkedin/base.ts:13`,
  `lib/dashboard/adapters/supermetrics.ts:106`). Whether that variable holds a
  value is a property of the **deployment**, not of the client. A preview build, a
  staging environment scoped without it, or a local shell would then render
  `Connect your CRM to see this` to a client who is fully configured. That is the
  `peecConnected` defect pointing the other way, and it is the worse direction:
  the reader is being told to go do a thing they have already done, for a reason
  that has nothing to do with them.

**Decision: one module, two exported predicates.** A new
`lib/salesforce/configured.ts`:

```ts
/**
 * Whether this CLIENT has a CRM configured. Row state only, and deliberately
 * does not read process.env: a missing shared Supermetrics key is a deployment
 * problem, and rendering it as "not connected" tells a configured client to
 * connect something they already connected.
 */
export function isSalesforceConfigured(client: Client | null | undefined): boolean {
  return !!(client?.salesforceConfig?.salesforceAccountId && client?.smApiKeyEnvVar)
}

/**
 * Whether THIS DEPLOYMENT can actually run the query: exactly the conjunction
 * salesforceQuery enforces (base.ts:33 and :35). Used to skip a doomed fetch,
 * never to decide connectedness.
 */
export function canQuerySalesforce(client: Client | null | undefined): boolean {
  const envVar = client?.smApiKeyEnvVar
  return isSalesforceConfigured(client) && !!(envVar && process.env[envVar])
}
```

Each decision takes the predicate that matches the question it is asking, and
that separation is the whole point:

| Decision | Predicate | Why |
|---|---|---|
| Issue the two CRM fetches at all (§4.4) | `canQuerySalesforce` | Matches `salesforceQuery`'s precondition exactly, so a doomed fetch is never issued |
| `LoadFailed` versus `NeedsConnection` (§4.4) | `isSalesforceConfigured` | Client configuration, not environment configuration |
| `crmConnected` on `StageInput` (§4.3) | `isSalesforceConfigured` | The same value, so the card and the block cannot disagree |

The configured-but-unreachable case then lands where it belongs: no fetch is
issued, `pipeline` and `contacts` stay null, `hasCrm` is true, and both surfaces
render the load-failure treatment. A deployment missing the key reads as a failure
to load, which is what it is, and never as a client who has not connected a CRM.

Its own module rather than an addition to `base.ts`, so a test can import it
without pulling in `smQuery` (which `pipeline.orchestration.test.ts` mocks
wholesale). `salesforceQuery` keeps its two distinct throws, since they name
*which* half is missing and a boolean cannot, and gains a comment pointing at
`canQuerySalesforce`. `configured.test.ts` pins `canQuerySalesforce` to exactly
those two throw conditions and pins `isSalesforceConfigured` to the first of them
alone, so neither the guard nor the precondition can drift, and neither can quietly
absorb the other. Pinned individually in `vitest.config.ts` alongside the other
`lib/salesforce` suites, which are listed file by file rather than by glob.

---

## 4. Component design

### 4.1 `pipeline-performance.tsx`, `PipelinePerformance({ data: PipelineData })`

Server component, in this order: four `KpiCard`s in
`grid grid-cols-2 gap-5 lg:grid-cols-4` (Open Deals, Total Pipeline, Closed Won,
Weighted Pipeline), then an `Open Deals by Owner` `h3` over a horizontal bar
list, then the caveat region. The region is last because one of its lines
describes the owner list as well as the tiles; see **Caveat region placement**
below.

USD via `toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })`.

**Signal rendering:**

| Signal | Treatment |
|---|---|
| `openUnavailable` | Open Deals / Total Pipeline / Weighted Pipeline show `—`, not `$0`. Each gets `subValue: "Couldn't load open pipeline."`, replacing that tile's window label. Neither `delta` nor `comparisonExpected` is set (§3.4), so nothing promises a comparison that cannot arrive. Touches neither Closed Won nor the owner list: those come from separate queries (`pipeline.ts:247-277`) with their own flags. |
| `wonUnavailable` | Same treatment on Closed Won alone: value `—`, `subValue: "Couldn't load closed-won data."`, **`delta` suppressed**, no `comparisonExpected`. Suppressing the delta is not optional: `closedWon.delta` is `-100` whenever this fires against a healthy prior year (§3.4). |
| `wonStageUnmatched` | Closed Won shows `—`, not `$0`, with `subValue: "No deals matched the won stage; it may have been renamed."` **`delta` suppressed, `comparisonExpected` kept**, so the tile reads `— vs same period last year` above the caveat. The query succeeding is not the same as the number being real: if the stage was renamed, the true closed-won figure is unknown, and `$0` is the most plausible wrong number on the page. §3.1's premise is that a plausible zero is worse than a placeholder, and the flag's own doc comment says `$0` here "is indistinguishable from a genuine 'won nothing this period' unless the UI reads this flag and says so". Dashing plus the caveat is how this block says so. It also keeps the tile agreeing with the pipeline journey card, which dashes the same stat on the same screen (§4.3). The delta is the same `-100` trap as the row above: a stage renamed this year still matches its old label in the prior-year window (§3.4). Only meaningful when `wonUnavailable` is false; the unavailable copy wins if both are set. |
| `stageTruncated` | Muted line in the caveat region: `Deal totals hit the row limit and may be undercounted.` The four tile **values** still render: these numbers are real but possibly low, not absent. Closed Won's **delta comes off** (`comparisonExpected` kept), because the flag also fires on the prior-year won query and an undercounted baseline inflates the growth percentage without bound (§3.4). Never folded into the owner note, which covers different numbers. |
| `unrecognizedClosedFlags > 0` | Muted line in the caveat region: `{n} rows had an unreadable open/closed status, so these totals and the owner breakdown are shifted by an unknown amount.` **Worded in rows, never "N deals"** (the field's doc comment is explicit that the open and won query windows overlap, so one bad deal can contribute more than once) and **worded to name both surfaces**: the count is taken across all four queries, the owner query included (`pipeline.ts:295`), and `transformByOwner` filters on the same failed-closed parse (`pipeline.ts:208`), so an unreadable flag on an owner row silently drops that deal out of the breakdown. A caveat naming only "these totals" would fire over four exact tiles while leaving the list it actually distorts uncaveated. Tile values still render; Closed Won's **delta comes off** for the same baseline reason as the row above (§3.4). |

**Caveat region placement.** The region sits at the foot of the block, **below
the owner list**, not between the grid and the list. `unrecognizedClosedFlags`
describes both surfaces, so a line about it printed above the owner list would
visually disclaim only the tiles. Each line names its own scope in its wording,
which is what lets one region serve both. `ownersTruncated` is the exception and
stays directly under the list: it is a statement about that list's completeness
rather than about any number, and it reads as a list footnote, not a caveat on
the block.

**Owner list, three distinct states**, per the type's null/`[]` contract:

- `byOwner === null` → `Owner breakdown unavailable.` (fetch failed)
- `byOwner === []` → `No open deals by owner.` (fetch succeeded, genuinely empty)
- populated → one bar per owner, width ∝ `count / max`, label left, `count` right,
  in the order given (the transform already ranks them). `max === 0`, which is
  every owner sitting at a zero count, short-circuits the division rather than
  producing `width: NaN%`. This is the same guard §4.2 states for its bar row;
  the identical division appears twice in this design, so it is written out twice
  rather than guarded in one place and forgotten in the other. Plus
  `Owner list may be incomplete.` when `ownersTruncated`.

Collapsing `null` into the `[]` rendering would misreport a failed fetch as "this
client has no owners," which is the exact confusion the null/empty distinction was
introduced to prevent.

**Window labels** (§3.5). A muted line under the section `h2`:
`Open pipeline is as of today. Closed won is year to date.` Per tile, the three
open figures carry `subValue: "Open as of today"` and Closed Won carries
`subValue: "Year to date"`. A per-tile degradation `subValue` from the table
above, meaning `openUnavailable`, `wonUnavailable` or `wonStageUnmatched`,
**replaces** that label when one is set, since a tile has one `subValue` slot and
the caveat is the more urgent thing to put in it. The `stageTruncated` and
`unrecognizedClosedFlags` lines do not compete for that slot: they live in the
caveat region at the foot of the block, not on a tile, so the window labels stay
put under them. The `Open Deals by Owner` list is covered by the section line: it
is sourced from the same open scope and the same wide window.

**Deltas:** Closed Won is the only tile that can carry one
(`deltaLabel="vs same period last year"`), and it carries one only when **none**
of `wonUnavailable`, `wonStageUnmatched`, `stageTruncated` or
`unrecognizedClosedFlags > 0` is set. The first two take the value away, the
second two corrupt the baseline; §3.4 gives the reasoning for both halves.
`comparisonExpected` survives three of those four, so the tile shows the greyed
`— vs same period last year` placeholder rather than a silent gap, with the
caveat saying why. `wonUnavailable` is the exception and takes
`comparisonExpected` off too: that is §3.4's whole-tile-unavailable clause, and a
tile whose value could not be loaded should not still be promising a comparison.
`ownersTruncated` suppresses nothing here. See §3.3 for
why the other three tiles carry no delta at all.

### 4.2 `contact-pacing.tsx`, `ContactPacing({ data: WeeklyContacts })`

Server component. Three `KpiCard`s over a bar row.

| Tile | Value | Delta |
|---|---|---|
| Current Week | `currentWeek` | none. `subValue: "Partial week: {daysElapsedInCurrentWeek} of 7 days."` when `currentWeekPartial`. A colon, not an em dash: the plan's Global Constraints allow em dashes only as pre-existing rendered null glyphs (§2, drift row 12) |
| Previous Week | `previousWeek`, or the `—` glyph when `weeks.length < 2` | `completedWeekOverWeek`, `deltaLabel="vs prior complete week"`, `comparisonExpected`. **Both suppressed when the value is dashed** (§3.4): with no completed week there is no comparison to promise, so this is the whole-tile-unavailable case, not the placeholder case. `subValue: "No completed week yet this year."` in that state |
| Prior Year Week | `priorYearWeek`, or the `—` glyph when absent | none. **Always rendered**, never dropped: absent covers a failed compare fetch, an unmatched ISO week number, and no completed week to match against, and removing the tile hides which of the three (§3.3) |

**Window label** (§3.5): a muted line under the section `h2`,
`Year to date, by ISO week.` The three tiles name their own windows in their
titles, so they need no per-tile label.

Bar row: one `div[data-week={week}]` per `weeks` bucket, height proportional to
`contacts / max`, a single neutral colour (no lead-quality split, since no such
field exists in the source), label beneath parsed from `2026-W33` to `W33`.

**The final bar is the week in progress, and is marked as such.** `gapFill` runs
the series through the current ISO week (`contacts.ts:98-122`), so the last
bucket holds only the days elapsed so far. Plotted at full scale with nothing
distinguishing it, that bar reads on a Monday as a collapse to roughly a seventh
of normal. That is the exact misreading §3.2 refuses to publish as a number, and
refusing it numerically while drawing it is the same claim in a different medium.

Dropping the bar is not the answer either. Current Week is the block's headline
tile (§3.2), so a series that stops one bar short of the headline invites the
reader to assume the number is missing from the chart rather than still
accumulating. The bar renders, marked three ways:

- `data-partial="true"` on that bucket's `div`, so a test can assert the marking
  rather than the absence of a bar
- a visually distinct fill: the same neutral colour at reduced opacity with a
  dashed top edge, so it reads as open ended rather than short
- a caption under the row:
  `Final bar is the current week in progress: {daysElapsedInCurrentWeek} of 7 days.`
  The same figure the Current Week tile carries, stated on each surface rather
  than left to be carried across from the tile above

The marking is driven by position, not by a date comparison inside the component:
the last element of `weeks` is the current week by `gapFill`'s contract, and
`currentWeekPartial` is `true` unconditionally on the shipped transform
(`contacts.ts:173`), so it cannot serve as the discriminant.

**Guards, and what each one replaces:**

- **`weeks.length === 0` renders `<NoData />` in place of the entire block,
  tiles included**, not in place of the chart alone. `gapFill` returns `[]` only
  when the query produced no usable bucket at all (`contacts.ts:99`), and in that
  state `currentWeek` and `previousWeek` are both `0` and both comparisons are
  undefined. Replacing only the chart would leave three tiles reading `0`, `0`
  and `—` stacked directly above the words `No data for this period.`: the
  confident-zero defect of §3.4 with the disclaimer printed underneath the
  numbers instead of on them. The section `h2` and the window label stay; the
  tiles, the chart and its caption all go.
- **`weeks.length === 1`** renders the block normally, with Previous Week and
  Prior Year Week dashed per the table above (§3.4). The chart draws its single
  in-progress bar, marked as above.
- **`max === 0`** short-circuits the height division rather than producing
  `NaN%`, the same guard §4.1's owner bars take.

### 4.3 `stages.ts`

`StageInput` gains `pipeline?: PipelineData | null`,
`contacts?: WeeklyContacts | null`, and `crmConnected?: boolean`.

**Optional, not required.** This matches the file's existing convention for
later-added fields (`peecConnected?`, `now?`) and avoids churning all 22
`buildStages` calls in `stages.test.ts` for no behavioural gain. There is exactly
one production call site.

**`crmConnected` is not optional to the design, only to the signature.** Keying
the stubs off data presence alone means a configured client whose contacts fetch
rejects gets `Not connected` / `Connect your CRM to see this` on the journey card
while §4.4's block, eight lines below it on the same screen, says
`Couldn't load contact data.` That is verbatim the defect `peecConnected` was
added to fix (`stages.ts:23-30`, `:101-108`): whether data arrived and whether the
client is configured are different questions, and only the second one decides
whether to tell somebody to go connect something.

`index.tsx` passes `isSalesforceConfigured(client)` (§3.6) as both the block guard
and this flag, so the card and the block cannot disagree. It is deliberately the
client-configuration predicate and not `canQuerySalesforce`: a deployment missing
the shared Supermetrics key must dash both surfaces, never tell a configured
client to go connect their CRM. Three branches per stub,
matching the block's three-way render exactly:

| State | Card |
|---|---|
| data present | populated card, `connected` omitted |
| data absent, `crmConnected` true | card dashes: `metric: '—'`, `connected` omitted. Same treatment the AEO card takes on a failed Peec fetch, and the same story the block's `LoadFailed` tells |
| data absent, `crmConnected` false | `connected: false`, so the not-connected treatment renders `unconnectedHint` |

When `crmConnected` is omitted entirely, each stub falls back to its own data
presence (`contacts != null` for inbound, `pipeline != null` for pipeline), the
same older-caller accommodation `peecConnected` makes.

**Inbound stage**, when `contacts` is present:

- `metric`: `fmtNum(contacts.currentWeek)`
- `badge`: `'WEEK TO DATE'`, the window label for this card (§3.5)
- `subMetric`: `{daysElapsedInCurrentWeek} of 7 days so far`
- `delta: undefined`, per §3.2: a partial-week metric cannot take a
  prior-complete-week badge
- `stats`: Previous Week (`—` when `weeks.length < 2`, matching §4.2's tile: no
  completed week means no previous week, and `previousWeek`'s `0` is the `?? 0`
  in `contacts.ts:153`, not a count), Week over Week (`completedWeekOverWeek` as
  a signed percentage, or `—`), Prior Year Week (or `—`, matching §4.2's tile)
- `heroLabel: 'new contacts created so far this week'`, **written out, not
  "retained".** The shipped stub carries no `heroLabel` at all (`stages.ts:138-143`),
  so there is nothing to retain and the card would ship with a blank hover reveal.
  Recorded in §2, drift row 7
- `connector: 'becomes pipeline'` and `color: CHART_COLORS.positive` are genuinely
  retained from the stub

**Pipeline stage**, when `pipeline` is present:

- `metric`: `fmtUsd(pipeline.totalPipeline.value)`, or `—` when `openUnavailable`
- `badge`: `'AS OF TODAY'`, the window label for this card (§3.5), since open
  pipeline is not on the page's 30-day window
- `subMetric`: `{n} open deals`, or `Couldn't load open pipeline.` when
  `openUnavailable`. It must not keep stating a deal count beside a dashed
  value: that is the §3.4 defect in a different field
- `delta: undefined`, named explicitly rather than reading
  `totalPipeline.delta`, which is always undefined but would read like a live
  wire waiting to be "fixed"
- `stats`: Closed Won (`—` when `wonUnavailable` **or** `wonStageUnmatched`),
  Weighted Pipeline (`—` when `openUnavailable`). §4.1's tile now dashes under
  both of those flags too, so the card and the block state the same thing about
  the same number on the same screen. An earlier revision had the card dashing
  while the block kept `$0`, on the reasoning that the card has no room for the
  caveat that makes a `$0` legible. That reasoning was sound about the card and
  wrong about the reconciliation: the fix is for the block to stop publishing a
  number it has to caveat into meaninglessness, not for the two surfaces to
  disagree eight lines apart
- `heroLabel: 'open pipeline as of today'`, **written out** for the same reason as
  the inbound card: the shipped stub has none (`stages.ts:144-150`) and §4.3
  previously omitted the field outright. Recorded in §2, drift row 8
- `connector` stays absent, as on the stub: this is the last stage in the row
- `color: CHART_COLORS.neutral`

Both stubs **keep** `unconnectedHint: 'Connect your CRM to see this'` (see §2,
drift row 5). It can stay on the object in every branch, exactly as the AEO stage
keeps its own hint unconditionally: `demand-journey.tsx:128-133` reads it only
when `connected === false`. So `connected` is the whole decision, and the
dashed-but-configured branch never shows the hint because it never sets `false`.
When data is present, `connected` is omitted, not set true: the `DemandStage`
contract is that only `false` triggers the unconnected treatment.

`DemandStage` gains **no new field.** The journey cards dash on bad data, which is
exactly what the AEO card already does for an unresolvable brand. The prose
caveats live in the block below, where there is room for them. Adding a caveat
field would mean touching the client component for no reader benefit.

`fmtUsd` is added to `reshape.ts` alongside `fmtNum` / `fmtPct`, the section's
existing formatter module, and the only way both `stages.ts` and
`pipeline-performance.tsx` share one implementation. The plan's suggestion of a
`stages.ts`-local helper would duplicate it.

**One existing test changes.** `stages.test.ts`'s *"always marks the two CRM
stages unconnected and gives them no metric: this page has no CRM data source"* is
false by construction once this ships. It is reworded to assert the
no-data-and-not-connected path specifically, keeping its coverage of the
`connected: false` / no-metric / hint behaviour.

### 4.4 `index.tsx`

Two flags, from the two predicates in §3.6. The `client` lookup already exists
above the fetch block (line 49), so neither costs a query:

```ts
const hasCrm  = isSalesforceConfigured(client)  // does the CLIENT have a CRM
const canFetch = canQuerySalesforce(client)     // can THIS DEPLOYMENT query it
```

**Not** `!!client?.salesforceConfig` for either: that is weaker than what
`salesforceQuery` requires (`base.ts:33`, `:35`), so a row with config but no
`sm_api_key_env_var` would fire two doomed fetches per render. And **not**
`canFetch` for the render decision: whether the shared Supermetrics key is
present in this environment is a fact about the deployment, and routing it to
`NeedsConnection` would tell a configured client to connect a CRM they already
connected (§3.6).

Two entries appended to the existing `Promise.allSettled` array and its
destructure, guarded on `canFetch` so no request is issued that is certain to
throw:

```ts
canFetch ? getSalesforcePipeline(clientSlug)       : Promise.resolve(null),
canFetch ? getSalesforceWeeklyContacts(clientSlug) : Promise.resolve(null),
```

Unwrapped with the existing `val()` helper. `hasCrm`, not `canFetch`, is what is
passed to `buildStages` as `crmConnected` and what the block fallbacks below
read, so the journey cards and the blocks tell one story (§4.3).

The configured-but-unreachable client therefore issues no request, gets `null`
for both, and renders `LoadFailed` on both surfaces: a deployment problem reads
as a failure to load, which is what it is.

**The page-level window label moves** (§3.5). `index.tsx:119`'s
`Last 30 days` line stops being true once these blocks land, so it moves inside
the existing Web Analytics `<section>`, directly above its KPI grid. The demand
journey and the two CRM sections then each carry their own window on the card or
under the heading. Recorded in §2, drift row 13.

**Three-way render, departing from the plan:**

```tsx
{contacts ? <ContactPacing data={contacts} />
  : hasCrm ? <LoadFailed message="Couldn't load contact data." />
  : <NeedsConnection sourceName="CRM" />}
```

The plan routes a configured-but-failed fetch to `NeedsConnection`. That tells a
connected client to connect their CRM, the same class of error the `peecConnected`
fix in `stages.ts` was written to correct, where a configured client whose fetch
failed was being told to connect a source it had already connected. `LoadFailed`
already exists in `no-data.tsx` for exactly this distinction, and `index.tsx`
already uses that pattern for `trendFailed` / `audienceFailed` / `channelFailed`.

Pipeline takes the same three-way shape. Its middle branch trips for a different
reason than contacts': `getSalesforcePipelineImpl` catches all four of its
queries and always resolves (§2.1), so a CRM outage returns a populated object
with its flags set rather than a null, and the §4.1 caveats carry the weight
there. What does reach `LoadFailed` on this block is the
configured-but-unreachable client above, where `canFetch` is false and no fetch
is issued at all.

---

## 5. Testing

TDD per file, as the plan specifies: write the failing test, run it, confirm it
fails **for the right reason**, then implement.

Every fixture is written against `lib/salesforce/types.ts`, not against the plan.
Fixture values are chosen distinct from one another so `getByText` assertions
cannot pass by coincidence. The plan's Task 9 fixture has `currentWeek: 131` and
a `2026-W33` bucket of `131`, which would make its first assertion ambiguous.

**`pipeline-performance.test.tsx`**: formatted tile values; owner order preserved;
`ownersTruncated` note appears only when flagged; `byOwner: null` vs `[]` render
differently; `openUnavailable` dashes three tiles instead of showing `$0`;
`wonUnavailable` dashes Closed Won; `stageTruncated` note;
`unrecognizedClosedFlags` note, asserted to say rows and not deals; no vendor
name on screen. Plus, for §3.4 and §3.5:

- **Suppressed deltas, value gone.** A fixture with
  `closedWon: { value: 0, delta: -100 }` and `wonUnavailable: true` renders no
  `100.0%` anywhere. This is the regression test for the fabricated collapse,
  and it must fail before the fix, not just pass after it.
- **Suppressed deltas, value dashed but query healthy.** The same fixture with
  `wonStageUnmatched: true` instead renders no `100.0%`, renders the
  `— vs same period last year` placeholder, dashes the Closed Won **value**, and
  renders no `$0` anywhere in that tile. The dashed value is the half that pins
  §4.1 and §4.3 to the same treatment, so this test is what stops the block and
  the card drifting apart again.
- **Suppressed deltas, baseline corrupted.** `stageTruncated: true` alone, and
  `unrecognizedClosedFlags: 3` alone, each render Closed Won's real **value** and
  its caveat line, and neither renders its `100.0%` delta; both render the
  `— vs same period last year` placeholder. These are the §3.4 second-half cases:
  the flags fire on the prior-year won query too, so the ratio is unsafe even
  though the total is merely low.
- **Suppression that must not spread.** `ownersTruncated: true` alone keeps Closed
  Won's real delta on screen and adds no caveat to the grid, so the rule cannot
  be over-applied into "any flag hides everything".
- **Caveat scope.** The `unrecognizedClosedFlags` line names the owner breakdown
  as well as the totals (§4.1, F6), and the caveat region renders below the owner
  list rather than between the grid and the list.
- **Zero-division guard.** `byOwner: [{ owner: 'A', count: 0, amount: 0 }]`
  produces a finite width; the rendered markup contains no `NaN`.
- **Window labels.** The section line and the per-tile `Open as of today` /
  `Year to date` labels render, and a degradation caveat replaces the tile label
  rather than appearing alongside it.

**`contact-pacing.test.tsx`**: three tiles with their figures; **the Prior Year
tile is present and dashed when `priorYearWeek` is absent**, never removed (§3.3);
Current Week carries no delta; `completedWeekOverWeek` renders on Previous Week;
partial-week disclosure appears when `currentWeekPartial`, asserted on the exact
string `Partial week: 3 of 7 days.` so the em-dash variant fails; one
`[data-week]` per bucket; the `Year to date, by ISO week.` label renders; no
vendor name. Plus, for §3.4 and §4.2:

- **No completed week.** A fixture whose `weeks` holds one bucket, the current
  one, with `previousWeek: 0`: Previous Week renders the `—` glyph and **no `0`**,
  renders `No completed week yet this year.`, and renders neither a percentage
  nor the `vs prior complete week` placeholder. Prior Year Week is dashed in the
  same fixture. This is the regression test for `contacts.ts:153`'s `?? 0`, and
  it must fail before the fix.
- **A completed week that is genuinely zero.** Two buckets, the earlier one at
  `contacts: 0` and `previousWeek: 0`: Previous Week renders `0`, not the glyph.
  Paired with the case above so the derivation cannot degenerate into "dash any
  zero".
- **The in-progress bar is marked.** The last `[data-week]` carries
  `data-partial="true"` and no earlier bucket does, and the caption
  `Final bar is the current week in progress: 3 of 7 days.` renders.
- **Empty `weeks` replaces the whole block.** With `weeks: []`, `NoData` renders
  and the tile titles `Current Week`, `Previous Week` and `Prior Year Week` are
  all absent from the output, so the tiles cannot sit above the disclaimer. The
  naive version of this test asserts only that `NoData` is present and passes
  against the defect, so it is written as an absence assertion on the tiles.

**`stages.test.ts`**: the three new cases from the plan (pipeline populated,
inbound populated, both null), with `peecConnected` supplied per §2 drift row 4;
plus the reworded existing test; plus:

- `crmConnected: false` with null data keeps `connected: false` and
  `unconnectedHint: 'Connect your CRM to see this'` on both stubs.
- A client configured but unreachable (account id and env-var name set, env var
  unset) reaches `buildStages` with `crmConnected: true`, so both cards dash
  rather than saying "Not connected". Asserted through `isSalesforceConfigured`
  rather than on a literal, so it fails if §4.4 is ever rewired to `canFetch`.
- `crmConnected: true` with null data dashes both cards: `connected` undefined
  (so the not-connected treatment never renders) and `metric` the `—` glyph. This
  is the case that currently contradicts §4.4's block, so it is the test that
  pins the fix.
- `crmConnected` omitted falls back to each stub's own data presence.
- Both populated cards carry a non-empty `heroLabel`, and the pipeline card
  carries `badge: 'AS OF TODAY'` (§2, drift rows 7 and 8).
- The pipeline card's Closed Won stat dashes under `wonUnavailable` and under
  `wonStageUnmatched`, and its `subMetric` does not state a deal count while
  `metric` is dashed.

**`lib/salesforce/configured.test.ts`** (new, pinned in `vitest.config.ts`): two
predicates, pinned to two different things (§3.6):

- `canQuerySalesforce` is true only with an account id, an `smApiKeyEnvVar`, and
  that env var actually holding a value; false for each of those three missing in
  turn, and for a null client. Those are exactly `salesforceQuery`'s two throw
  conditions (`base.ts:33`, `:35`).
- `isSalesforceConfigured` is true with an account id and an `smApiKeyEnvVar`
  **and the env var unset**, which is the case the two predicates must disagree
  on. Asserting that disagreement is the point of the file: collapsing them back
  into one is what would reintroduce "Connect your CRM to see this" on a preview
  deploy.
- `isSalesforceConfigured` does not read `process.env` at all: the same client
  yields the same answer with the variable set and unset.

**Vendor-name assertion.** Every new component test asserts
`not.toMatch(/Salesforce|HubSpot/)` on rendered output. The client may switch CRMs,
and a client-facing report should not need editing when they do.

**Gates**, run after each file:

```
npx vitest run components/report-sections/executive-overview/ lib/salesforce/
npx tsc --noEmit
npm run check:rsc
```

Both new components are server components, so no `'use client'`.

---

## 6. Out of scope

- **Live verification.** Task 10 Step 6 asks for a check against a running dev
  server using the service cookie the crons mint. That cannot be done from an
  agent session and is handed back to Paul, not claimed.
- **Enablement.** The per-environment
  `UPDATE clients SET salesforce_config = …` is a separate operational step.
  Migration `0021_old_silver_centurion` is **already applied and verified on the
  development database** (2026-08-21, recorded in Half A's review record,
  Follow-ups item 1), so this branch needs no migration step against dev at all.
  Staging and production still do, before the code reaches those branches, and
  when they run it the command is the hash-diffed HTTP migrator, never
  `npm run db:migrate`:

  ```
  DATABASE_URL_UNPOOLED='<target-direct-url>' npx tsx --env-file=.env.local scripts/migrate-http.ts
  ```

  `db:migrate` is banned outright by the plan's own Global Constraints (line 35),
  hangs against Neon, and is timestamp-gated rather than hash-diffed, so it can
  skip 0021 silently and still exit 0. Verify with the `information_schema` query
  in `MIGRATIONS-PENDING.md` regardless of what any migrator printed. The plan's
  enablement section says the opposite; see §2, drift row 11.
- **A `PipelineKpi` discriminant**, per §3.3.
- The three auth/connections pages hardcoding `[PLATFORM_IDS.SALESFORCE]: false`.
- Lead-quality colouring, form tables, and the online/offline contact split. None
  exists in the source data.
- Owner names being real people on a client-facing page. Worth a product call; the
  existing HubSpot equivalent does the same.

---

## 7. Process

Stage-1 flow per `CLAUDE.md`: feature branch off `dev`, its own PR, code review
before anything reaches `dev`. The review-record doc lands at
`docs/qa/exec-overview-crm-wiring-code-review.md` as its own PR off `dev`,
titled `docs(review): Executive Overview CRM wiring code review record`, changing
no code, and is the gate that must clear before the feature merges to `dev`.

§3.3's decision is recorded in that doc's §4 as well as in a code comment. So are
§3.4's suppression rule (on the Closed Won tile, where the `-100` would otherwise
be reintroduced by anyone "restoring" a missing delta) and §3.6's predicate (on
`salesforceQuery`'s two throws, which are what it is pinned to).

---

## 8. Self-review

**Placeholder scan.** No TBDs. Component bodies are described rather than
transcribed because they are presentational; §5 carries the behaviour they must
satisfy.

**Internal consistency.**

- §3.1 (all six signals plus the `byOwner` contract) is enumerated once in §4.1
  and tested once in §5. The three flags whose doc comments carry no directive get
  theirs in §3.1 itself.
- §3.2 (Current Week headlines, no delta) is applied identically in §4.2 (the
  block) and §4.3 (the journey card).
- §3.3 now covers both blocks and names all three ways `priorYearWeek` can be
  absent: Closed Won renders a placeholder rather than hiding the comparison, and
  §4.2's Prior Year Week tile does the same rather than disappearing. That also
  brings §4.2 into line with §4.3, whose inbound card's Prior Year Week stat
  already dashed.
- §3.4 has two halves and both are applied. **A suppressed value suppresses its
  delta:** §4.1 applies it to `wonUnavailable` and `wonStageUnmatched`, §4.2 to
  Previous Week under `weeks.length < 2`, and §4.3 to the pipeline card's
  `subMetric` and Closed Won stat. **A corrupted baseline suppresses its delta
  too:** §4.1 applies it to `stageTruncated` and `unrecognizedClosedFlags`, whose
  values still render behind a caveat. `ownersTruncated` is the only flag that
  suppresses nothing, and §5 pins that so the rule cannot spread.
- §3.4 is also run over `WeeklyContacts`, not just `PipelineData`. That block
  carries no degradation flags, which is how `previousWeek`'s `?? 0` went
  unexamined through the first pass; the condition is derived from `gapFill`'s
  contract instead and applied in §4.2.
- §4.1 and §4.3 now agree on Closed Won under `wonStageUnmatched`: both dash it.
  They previously disagreed, `$0` in the block against `—` on the card, eight
  lines apart on one screen.
- §3.5 (each block names its own window) is applied in §4.1 (section line plus
  per-tile `subValue`), §4.2 (section line), §4.3 (`WEEK TO DATE` and
  `AS OF TODAY` badges) and §4.4 (the page-level line moves into Web Analytics).
- §3.6 splits the question in two, and each half is used once. Whether the CLIENT
  is configured (`isSalesforceConfigured`) is the single render guard in §4.4 and
  the single `crmConnected` value in §4.3, so the card and the block cannot tell a
  client two different stories about the same fetch. Whether THIS DEPLOYMENT can
  reach the API (`canQuerySalesforce`) gates only the fetch, so a preview or
  staging build missing the shared Supermetrics key renders a load failure rather
  than telling a configured client to go connect their CRM.

**Ambiguity check.** The three-state owner rendering, the two-state Closed Won
caveat precedence (`wonUnavailable` wins over `wonStageUnmatched`), the
three-branch stub table in §4.3, and the three-way block fallback in §4.4 are each
stated explicitly rather than left to implementation. The two bar renderings both
state their `max === 0` guard. §4.2's three `weeks` guards each say what they
replace: `length === 0` replaces the whole block, tiles included, rather than the
chart alone, and `length === 1` replaces two tile values but nothing else. §4.1
states where the caveat region sits relative to the owner list, since a line that
names both surfaces has to be positioned below both.

**Copy check.** The plan's Global Constraint reads "**No em or en dashes** in
prose, comments, or commit messages. Rendered em dashes for null values in copied
formatters stay verbatim" (plan line 33). An earlier revision of this section
restated that as covering "the copy that ships," which narrowed a rule this
document is subject to in order to exempt this document from it. The rule says
prose, and a design doc is prose, so the correct response was to comply rather
than to redefine.

Both halves are now done. Every new on-screen string was swept: the one offender,
the partial-week disclosure, reads `Partial week: 3 of 7 days.` And this
document's own prose was swept as well, so no em or en dash appears here outside
a backticked `—` standing in for a null value (`KpiCard` values, the `— vs …`
placeholder, stage stats, journey-card metrics), which is the exemption the
constraint actually grants. There is no lint rule for this; the check is a grep
for the two characters over the changed files, then reading each hit to decide
whether it is a null glyph or prose.

**Type consistency.** Every field, line number and signature named here was read
from `origin/dev` at commit `c0fe747` (`Merge pull request #214`), not from the
plan: `lib/salesforce/{types,pipeline,contacts,base}.ts`,
`components/report-sections/executive-overview/{index,stages,kpi-card,demand-journey,no-data}.tsx`,
`lib/constants.ts`, `lib/db/schema.ts`, `vitest.config.ts` and
`MIGRATIONS-PENDING.md`. The second revision added
`lib/{meta,paid-search,linkedin}/base.ts` and
`lib/dashboard/adapters/supermetrics.ts`, read to establish that
`sm_api_key_env_var` is one shared key across four channels and therefore a
deployment-scoped fact rather than a per-source connection (§3.6).

**Second review round, and what it changed.** A second review of this document
found seven defects, all of them the same species as the first round's: a rule
stated in §3 that §4 then failed to apply to every surface it governs. Recorded
here so the review-record doc in §7 can cite them rather than rediscover them.

| # | Defect | Fixed in |
|---|---|---|
| 1 | §3.4 exempted `stageTruncated` from delta suppression, but the flag also fires on the prior-year won window, so an undercounted baseline publishes an inflated growth percentage. The source comment at `pipeline.ts:292-294` says so in as many words. `unrecognizedClosedFlags` had the same hole and was fixed with it | §3.4 second half, §4.1 |
| 2 | `isSalesforceConfigured` read `process.env`, so a preview or staging deploy missing the shared Supermetrics key rendered "Connect your CRM to see this" to a configured client: the `peecConnected` defect pointing the other way | §3.6, §4.4 |
| 3 | §3.4's audit was never run over `WeeklyContacts`. `previousWeek` is `?? 0` (`contacts.ts:153`), so the tile publishes a confident `0` when no completed week exists. The same condition gives `priorYearWeek` a third cause of absence that §3.3 and §2 drift row 9 both missed | §3.4, §3.3, §4.2, §2 rows 9 and 14 |
| 4 | §4.2 plotted the in-progress ISO week as an unmarked bar at full scale. Rendered on a Monday it reads as the collapse §3.2 refuses to publish numerically | §4.2 |
| 5 | "Empty `weeks` renders `NoData`" never said whether it replaced the block or only the chart. Only the chart would leave the tiles reading `0` above "No data for this period." | §4.2 guards |
| 6 | The `unrecognizedClosedFlags` caveat covered the tile grid only, but the count includes owner-query rows (`pipeline.ts:295`) and `transformByOwner` drops unreadable rows (`pipeline.ts:208`), so the caveat fired over exact tiles while the list it distorts carried none | §4.1 |
| 7 | §4.3's pipeline card dashed Closed Won under `wonStageUnmatched` while §4.1's tile kept `$0` for the same flag, on the same screen | §4.1, §4.3 |

The review also noted, as process rather than a finding, that §8's copy check had
narrowed the plan's em-dash constraint from "prose, comments, or commit messages"
down to "the copy that ships," which is this document rewriting the rule it claims
to comply with. Corrected in the copy check above, and the document's own prose
swept to match.

**Two imprecisions in the first design review.** It described the
open-tile window as 18 years; `openWindow()` spans January 1 of `y - 9` through
December 31 of `y + 9` (`pipeline.ts:69-72`), which is 19 calendar years. §3.5
states the derivation rather than a year count, since the number is not what the
reader needs: openness is evaluated as of now, not over the window. It also named
`stageTruncated` and `wonUnavailable` as the two flags lacking a "consumer must
surface" directive; `ownersTruncated` lacks one too, so §3.1 supplies three.
Neither imprecision changes a finding: both were undercounts, and both are fixed
in the direction the finding pointed.
