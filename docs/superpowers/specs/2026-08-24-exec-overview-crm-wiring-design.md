# Executive Overview — CRM Wiring (Half B)

**Date:** 2026-08-24
**Status:** Design approved, not yet implemented
**Plan:** `docs/superpowers/plans/2026-08-16-renaissance-crm-pipeline.md`, Tasks 7–10
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

Task 7 was a rebase gate that is now satisfied — PR #207 merged, so
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
| 9 | Task 9 omits the Prior Year Week tile when `priorYearWeek` is absent | This design renders it dashed instead. `priorYearWeek` is undefined both when the compare fetch failed and when no bucket carried the matching ISO week number (`contacts.ts:163-168`), so dropping the tile hides which. Reconciled with §3.3 there. |
| 10 | `StageInput` gains `pipeline` and `contacts` only | It also gains `crmConnected`, for the same reason `peecConnected` exists: whether data arrived is not the same question as whether the client is configured. See §3.6. |
| 11 | Enablement says to "confirm what the extra recorded migrations are before running `db:migrate` against dev" | Global Constraint line 35 of that same plan bans `db:migrate` outright, and `scripts/migrate-http.ts` is the hash-diffed path that works against Neon. 0021 is in any case already applied and verified on dev (2026-08-21). See §6. |
| 12 | Global Constraints ban em and en dashes outside pre-existing null glyphs | Applied to this design's own copy: the partial-week line reads `Partial week: 3 of 7 days.`, not an em-dashed variant, and no new on-screen string introduces one. Rendered `—` null glyphs in `KpiCard` values and stage stats stay verbatim, which the constraint allows. |
| 13 | `index.tsx` keeps its page-level `Last 30 days` line | That line (`index.tsx:119`) becomes a false caption the moment CRM blocks on other windows sit under it. It moves into the Web Analytics `<section>`, and each CRM block and card names its own window. See §3.5. |

### 2.1 The plan's failure-fallback claim is wrong for pipeline

Task 10 states: *"A configured client whose fetch fails also falls back to
needs-connection."*

That is false for pipeline. `getSalesforcePipelineImpl` wraps all four of its
queries in `.catch(() => null)` (`lib/salesforce/pipeline.ts:254–276`) and always
resolves. A total CRM outage therefore returns a fully-populated object with
`openUnavailable: true`, `wonUnavailable: true`, and all four tiles at `0`.
Without the caveat rendering in §4.1, that renders as `$0` / `0 open deals` —
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

**The same rule governs `priorYearWeek`, so the two blocks agree.**
`WeeklyContacts.priorYearWeek` is undefined in exactly the same two-cases-one-value
way: the compare fetch failed and degraded to null, or it succeeded and held no
bucket carrying the matching ISO week number (`contacts.ts:163-168`). The plan's
Task 9 drops the tile in that state, which is the opposite of the treatment chosen
for Closed Won above, for the identical ambiguity one screen away. Dropping it is
worse on both counts: it still does not say which case happened, and it changes
the block's shape, so a reader cannot tell a comparison that is missing from one
that was never offered.

**Decision: render the Prior Year Week tile always, with the `—` glyph as its
value when `priorYearWeek` is absent.** One rule now covers both blocks: an
absent comparison renders as a placeholder, never as a removed surface. It also
makes §4.2 and §4.3 agree, since the inbound journey card's Prior Year Week stat
already dashes rather than disappearing.

### 3.4 A suppressed value suppresses its delta

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

**Rule, applied everywhere in §4:** whenever a flag replaces a value with the `—`
glyph, or marks it as not-real, that same flag suppresses the tile's `delta`.
Where a comparison was genuinely expected and merely cannot arrive,
`comparisonExpected` stays on, so the reader gets the greyed `— vs …` placeholder
rather than a silent gap; where the whole tile is unavailable, both come off. The
same audit applies to every other field on a degraded object: a `subMetric`, a
`stat`, or a `subValue` that keeps stating a plausible figure while the value
beside it dashes is the same defect wearing different clothes.

The rule stops at `stageTruncated` and `unrecognizedClosedFlags`. Those two
describe numbers that are real but possibly low, not numbers that are absent, so
their tiles keep both value and delta and the caveat region says what is wrong
with them.

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

### 3.6 One connectedness predicate, pinned to the query's precondition

Two new places need to know whether this client has a CRM: `index.tsx`, to choose
between `LoadFailed` and `NeedsConnection`, and `stages.ts`, to choose whether a
stub says "Not connected". A third place already answers that question for real:
`salesforceQuery` throws unless `salesforceConfig.salesforceAccountId` **and**
`smApiKeyEnvVar` are both set (`base.ts:33`) **and** the env var they name
actually holds a value (`base.ts:35`).

`!!client?.salesforceConfig` is weaker than all three. A row with config but no
Supermetrics key, or any environment where that key is unset (a preview deploy, a
local shell without the var), passes the guard, issues two doomed fetches on every
render, and shows the reader an outage for a source they never connected.

**Decision: the precondition lives in one exported predicate.** A new
`lib/salesforce/configured.ts`:

```ts
export function isSalesforceConfigured(client: Client | null | undefined): boolean {
  const envVar = client?.smApiKeyEnvVar
  return !!(client?.salesforceConfig?.salesforceAccountId && envVar && process.env[envVar])
}
```

Its own module rather than an addition to `base.ts`, so a test can import it
without pulling in `smQuery` (which `pipeline.orchestration.test.ts` mocks
wholesale). `salesforceQuery` keeps its two distinct throws, since they name
*which* half is missing and a boolean cannot, and gains a comment pointing at the
predicate; `configured.test.ts` asserts the predicate against exactly those two
throw conditions, so guard and precondition cannot drift apart again. Pinned
individually in `vitest.config.ts` alongside the other `lib/salesforce` suites,
which are listed file by file rather than by glob.

`index.tsx` calls it once and passes the result to both surfaces: the block guard
and `buildStages`' `crmConnected`. They cannot disagree, because there is only one
answer.

---

## 4. Component design

### 4.1 `pipeline-performance.tsx` — `PipelinePerformance({ data: PipelineData })`

Server component. Four `KpiCard`s in `grid grid-cols-2 gap-5 lg:grid-cols-4`
(Open Deals, Total Pipeline, Closed Won, Weighted Pipeline), a caveat region, then
an `Open Deals by Owner` `h3` over a horizontal bar list.

USD via `toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })`.

**Signal rendering:**

| Signal | Treatment |
|---|---|
| `openUnavailable` | Open Deals / Total Pipeline / Weighted Pipeline show `—`, not `$0`. Each gets `subValue: "Couldn't load open pipeline."`, replacing that tile's window label. Neither `delta` nor `comparisonExpected` is set (§3.4), so nothing promises a comparison that cannot arrive. Touches neither Closed Won nor the owner list: those come from separate queries (`pipeline.ts:247-277`) with their own flags. |
| `wonUnavailable` | Same treatment on Closed Won alone: value `—`, `subValue: "Couldn't load closed-won data."`, **`delta` suppressed**, no `comparisonExpected`. Suppressing the delta is not optional: `closedWon.delta` is `-100` whenever this fires against a healthy prior year (§3.4). |
| `wonStageUnmatched` | Closed Won keeps its genuine `$0` — the query succeeded — with `subValue: "No deals matched the won stage; it may have been renamed."` **`delta` suppressed, `comparisonExpected` kept**, so the tile reads `— vs same period last year` above the caveat. Same `-100` trap as the row above: a stage renamed this year still matches its old label in the prior-year window (§3.4). Only meaningful when `wonUnavailable` is false; the unavailable copy wins if both are set. |
| `stageTruncated` | Muted line in the caveat region below the grid: `Deal totals hit the row limit and may be undercounted.` Values and deltas still render: these numbers are real but possibly low, not absent (§3.4). Never folded into the owner note below, which covers different numbers. |
| `unrecognizedClosedFlags > 0` | Muted line in the caveat region: `{n} rows had an unreadable open/closed status, so these totals are shifted by an unknown amount.` **Worded in rows, never "N deals"** — the field's doc comment is explicit that the open and won query windows overlap, so one bad deal can contribute more than once. Values and deltas still render, per §3.4. |

**Owner list — three distinct states**, per the type's null/`[]` contract:

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
`subValue: "Year to date"`. A degradation caveat from the table above **replaces**
that label when one is set, on the same precedence rule the Closed Won caveats
already follow. The `Open Deals by Owner` list is covered by the section line: it
is sourced from the same open scope and the same wide window.

**Deltas:** Closed Won is the only tile that can carry one
(`deltaLabel="vs same period last year"`), and it carries one only when **neither**
`wonUnavailable` **nor** `wonStageUnmatched` is set; in either of those states the
delta is suppressed per §3.4. See §3.3 for why the other three tiles carry no
delta at all.

### 4.2 `contact-pacing.tsx` — `ContactPacing({ data: WeeklyContacts })`

Server component. Three `KpiCard`s over a bar row.

| Tile | Value | Delta |
|---|---|---|
| Current Week | `currentWeek` | none. `subValue: "Partial week: {daysElapsedInCurrentWeek} of 7 days."` when `currentWeekPartial`. A colon, not an em dash: the plan's Global Constraints allow em dashes only as pre-existing rendered null glyphs (§2, drift row 12) |
| Previous Week | `previousWeek` | `completedWeekOverWeek`, `deltaLabel="vs prior complete week"`, `comparisonExpected` |
| Prior Year Week | `priorYearWeek`, or the `—` glyph when absent | none. **Always rendered**, never dropped: absent covers both a failed compare fetch and an unmatched week, and removing the tile hides which (§3.3) |

**Window label** (§3.5): a muted line under the section `h2`,
`Year to date, by ISO week.` The three tiles name their own windows in their
titles, so they need no per-tile label.

Bar row: one `div[data-week={week}]` per `weeks` bucket, height ∝ `contacts / max`,
a single neutral colour (no lead-quality split — no such field exists in the
source), label beneath parsed from `2026-W33` to `W33`.

Guards: empty `weeks` renders `NoData`; `max === 0` short-circuits the height
division rather than producing `NaN%` — the same guard §4.1's owner bars take.

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
and this flag, so the card and the block cannot disagree. Three branches per stub,
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
- `badge`: `'WEEK TO DATE'` — the window label for this card (§3.5)
- `subMetric`: `{daysElapsedInCurrentWeek} of 7 days so far`
- `delta: undefined` — per §3.2, a partial-week metric cannot take a
  prior-complete-week badge
- `stats`: Previous Week, Week over Week (`completedWeekOverWeek` as a signed
  percentage, or `—`), Prior Year Week (or `—`, matching §4.2's tile)
- `heroLabel: 'new contacts created so far this week'` — **written out, not
  "retained".** The shipped stub carries no `heroLabel` at all (`stages.ts:138-143`),
  so there is nothing to retain and the card would ship with a blank hover reveal.
  Recorded in §2, drift row 7
- `connector: 'becomes pipeline'` and `color: CHART_COLORS.positive` are genuinely
  retained from the stub

**Pipeline stage**, when `pipeline` is present:

- `metric`: `fmtUsd(pipeline.totalPipeline.value)`, or `—` when `openUnavailable`
- `badge`: `'AS OF TODAY'` — the window label for this card (§3.5), since open
  pipeline is not on the page's 30-day window
- `subMetric`: `{n} open deals`, or `Couldn't load open pipeline.` when
  `openUnavailable`. It must not keep stating a deal count beside a dashed
  value: that is the §3.4 defect in a different field
- `delta: undefined`, named explicitly rather than reading
  `totalPipeline.delta` — which is always undefined, but would read like a live
  wire waiting to be "fixed"
- `stats`: Closed Won (`—` when `wonUnavailable` **or** `wonStageUnmatched`, since
  the card has no room for the caveat that makes a `$0` legible and the block
  below carries it), Weighted Pipeline (`—` when `openUnavailable`)
- `heroLabel: 'open pipeline as of today'` — **written out** for the same reason as
  the inbound card: the shipped stub has none (`stages.ts:144-150`) and §4.3
  previously omitted the field outright. Recorded in §2, drift row 8
- `connector` stays absent, as on the stub: this is the last stage in the row
- `color: CHART_COLORS.neutral`

Both stubs **keep** `unconnectedHint: 'Connect your CRM to see this'` (see §2,
drift row 5). It can stay on the object in every branch, exactly as the AEO stage
keeps its own hint unconditionally: `demand-journey.tsx:128-133` reads it only
when `connected === false`. So `connected` is the whole decision, and the
dashed-but-configured branch never shows the hint because it never sets `false`.
When data is present, `connected` is omitted, not set true — the `DemandStage`
contract is that only `false` triggers the unconnected treatment.

`DemandStage` gains **no new field.** The journey cards dash on bad data, which is
exactly what the AEO card already does for an unresolvable brand. The prose
caveats live in the block below, where there is room for them. Adding a caveat
field would mean touching the client component for no reader benefit.

`fmtUsd` is added to `reshape.ts` alongside `fmtNum` / `fmtPct` — the section's
existing formatter module, and the only way both `stages.ts` and
`pipeline-performance.tsx` share one implementation. The plan's suggestion of a
`stages.ts`-local helper would duplicate it.

**One existing test changes.** `stages.test.ts`'s *"always marks the two CRM
stages unconnected and gives them no metric: this page has no CRM data source"* is
false by construction once this ships. It is reworded to assert the
no-data-and-not-connected path specifically, keeping its coverage of the
`connected: false` / no-metric / hint behaviour.

### 4.4 `index.tsx`

`const hasCrm = isSalesforceConfigured(client)` (§3.6) — the `client` lookup
already exists above the fetch block (line 49), so no extra query. **Not**
`!!client?.salesforceConfig`: that is weaker than what `salesforceQuery` actually
requires (`base.ts:33`, `:35`), so a row with config but no Supermetrics key, or
any environment where the key is unset, would pass the guard, fire two doomed
fetches per render, and show an outage to somebody who never connected anything.
Two entries appended to the existing `Promise.allSettled` array and its
destructure, guarded on `hasCrm` so an unconfigured client issues no CRM request
at all:

```ts
hasCrm ? getSalesforcePipeline(clientSlug)      : Promise.resolve(null),
hasCrm ? getSalesforceWeeklyContacts(clientSlug) : Promise.resolve(null),
```

Unwrapped with the existing `val()` helper, and `hasCrm` is passed straight
through to `buildStages` as `crmConnected` alongside `pipeline` and `contacts`, so
the journey cards read the same guard the blocks do (§4.3).

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
connected client to connect their CRM — the same class of error the `peecConnected`
fix in `stages.ts` was written to correct, where a configured client whose fetch
failed was being told to connect a source it had already connected. `LoadFailed`
already exists in `no-data.tsx` for exactly this distinction, and `index.tsx`
already uses that pattern for `trendFailed` / `audienceFailed` / `channelFailed`.

Pipeline takes the same three-way shape for symmetry, though its middle branch
will rarely trip (§2.1) — which is why the §4.1 caveats carry the real weight
there.

---

## 5. Testing

TDD per file, as the plan specifies: write the failing test, run it, confirm it
fails **for the right reason**, then implement.

Every fixture is written against `lib/salesforce/types.ts`, not against the plan.
Fixture values are chosen distinct from one another so `getByText` assertions
cannot pass by coincidence — the plan's Task 9 fixture has `currentWeek: 131` and
a `2026-W33` bucket of `131`, which would make its first assertion ambiguous.

**`pipeline-performance.test.tsx`** — formatted tile values; owner order preserved;
`ownersTruncated` note appears only when flagged; `byOwner: null` vs `[]` render
differently; `openUnavailable` dashes three tiles instead of showing `$0`;
`wonUnavailable` dashes Closed Won; `wonStageUnmatched` annotates a real `$0`;
`stageTruncated` note; `unrecognizedClosedFlags` note, asserted to say rows and
not deals; no vendor name on screen. Plus, for §3.4 and §3.5:

- **Suppressed deltas.** A fixture with `closedWon: { value: 0, delta: -100 }` and
  `wonUnavailable: true` renders no `100.0%` anywhere — this is the regression
  test for the fabricated collapse, and it must fail before the fix, not just
  pass after it. The same fixture with `wonStageUnmatched: true` instead renders
  no `100.0%` **and** does render the `— vs same period last year` placeholder.
- **Deltas that survive.** `stageTruncated: true` and
  `unrecognizedClosedFlags: 3` each keep Closed Won's real delta on screen, so the
  suppression rule cannot be over-applied into "any flag hides everything".
- **Zero-division guard.** `byOwner: [{ owner: 'A', count: 0, amount: 0 }]`
  produces a finite width; the rendered markup contains no `NaN`.
- **Window labels.** The section line and the per-tile `Open as of today` /
  `Year to date` labels render, and a degradation caveat replaces the tile label
  rather than appearing alongside it.

**`contact-pacing.test.tsx`** — three tiles with their figures; **the Prior Year
tile is present and dashed when `priorYearWeek` is absent**, never removed (§3.3);
Current Week carries no delta; `completedWeekOverWeek` renders on Previous Week;
partial-week disclosure appears when `currentWeekPartial`, asserted on the exact
string `Partial week: 3 of 7 days.` so the em-dash variant fails; one
`[data-week]` per bucket; empty `weeks` renders `NoData`; the `Year to date, by
ISO week.` label renders; no vendor name.

**`stages.test.ts`** — the three new cases from the plan (pipeline populated,
inbound populated, both null), with `peecConnected` supplied per §2 drift row 4;
plus the reworded existing test; plus:

- `crmConnected: false` with null data keeps `connected: false` and
  `unconnectedHint: 'Connect your CRM to see this'` on both stubs.
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

**`lib/salesforce/configured.test.ts`** (new, pinned in `vitest.config.ts`) — the
predicate is true only with an account id, an `smApiKeyEnvVar`, and that env var
actually set; false for each of those three missing in turn, and for a null
client. Those cases are exactly `salesforceQuery`'s two throw conditions
(`base.ts:33`, `:35`), which is what keeps the guard and the precondition from
drifting (§3.6).

**Vendor-name assertion.** Every new component test asserts
`not.toMatch(/Salesforce|HubSpot/)` on rendered output. The client may switch CRMs,
and a client-facing report should not need editing when they do.

**Gates**, run after each file:

```
npx vitest run components/report-sections/executive-overview/ lib/salesforce/
npx tsc --noEmit
npm run check:rsc
```

Both new components are server components — no `'use client'`.

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
- **A `PipelineKpi` discriminant** — §3.3.
- The three auth/connections pages hardcoding `[PLATFORM_IDS.SALESFORCE]: false`.
- Lead-quality colouring, form tables, and the online/offline contact split — none
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
- §3.3 now covers both blocks: Closed Won renders a placeholder rather than
  hiding the comparison, and §4.2's Prior Year Week tile does the same rather
  than disappearing. That also brings §4.2 into line with §4.3, whose inbound
  card's Prior Year Week stat already dashed.
- §3.4 (a suppressed value suppresses its delta) is the rule; §4.1 applies it to
  `wonUnavailable` and `wonStageUnmatched`, §4.3 applies it to the pipeline card's
  `subMetric` and Closed Won stat, and both places name the exception
  (`stageTruncated`, `unrecognizedClosedFlags` caveat without dashing).
- §3.5 (each block names its own window) is applied in §4.1 (section line plus
  per-tile `subValue`), §4.2 (section line), §4.3 (`WEEK TO DATE` and
  `AS OF TODAY` badges) and §4.4 (the page-level line moves into Web Analytics).
- §3.6 (one connectedness predicate) is the single guard in §4.4 and the single
  `crmConnected` value in §4.3, so the card and the block cannot tell a client
  two different stories about the same fetch.

**Ambiguity check.** The three-state owner rendering, the two-state Closed Won
caveat precedence (`wonUnavailable` wins over `wonStageUnmatched`), the
three-branch stub table in §4.3, and the three-way block fallback in §4.4 are each
stated explicitly rather than left to implementation. The two bar renderings both
state their `max === 0` guard.

**Copy check.** Every new on-screen string was swept for em and en dashes per the
plan's Global Constraints. The one offender, the partial-week disclosure, now
reads `Partial week: 3 of 7 days.` Rendered `—` glyphs standing in for a null
value (`KpiCard` values, the `— vs …` placeholder, stage stats) are pre-existing
and stay verbatim, which the constraint allows. The doc's own prose still uses em
dashes; the constraint's scope for this design is the copy that ships.

**Type consistency.** Every field, line number and signature named here was read
from `origin/dev` at commit `c0fe747` (`Merge pull request #214`), not from the
plan: `lib/salesforce/{types,pipeline,contacts,base}.ts`,
`components/report-sections/executive-overview/{index,stages,kpi-card,demand-journey,no-data}.tsx`,
`lib/constants.ts`, `lib/db/schema.ts`, `vitest.config.ts` and
`MIGRATIONS-PENDING.md`.

**Two imprecisions in the design review that produced this revision.** It described the
open-tile window as 18 years; `openWindow()` spans January 1 of `y - 9` through
December 31 of `y + 9` (`pipeline.ts:69-72`), which is 19 calendar years. §3.5
states the derivation rather than a year count, since the number is not what the
reader needs: openness is evaluated as of now, not over the window. It also named
`stageTruncated` and `wonUnavailable` as the two flags lacking a "consumer must
surface" directive; `ownersTruncated` lacks one too, so §3.1 supplies three.
Neither imprecision changes a finding: both were undercounts, and both are fixed
in the direction the finding pointed.
