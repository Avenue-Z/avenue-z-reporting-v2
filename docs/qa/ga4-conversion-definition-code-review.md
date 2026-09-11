# docs(review): GA4 conversion definition — code review record

**Scope.** PR `#235`, `feat/renaissance-ga4-conversions`, diff range
`a0b5eb9..d2ac04d` (5 commits: `5661054`, `0f02af2`, `d76a5a3`, `1612ed7`,
`d2ac04d`). This document changes no code.

Review conducted across five rounds on the PR itself (inline comments +
review summaries from Thomas and Paul), with the full working notes,
decisions, and event-inventory evidence in
`docs/qa/renaissance-ga4-conversions/notes.md`. This record compiles that
history into the standard shape; it does not repeat every line of it — see
`notes.md` for the blow-by-blow of each round.

Both required reviewers approved at `d2ac04d`:
- Thomas (`thomaschang-avez`), 2026-09-11T18:30:47Z
- Paul (`paul-rl-ave`), 2026-09-11T18:40:20Z

---

## §1. How it works

**The problem.** Every Conversions figure on the platform summed GA4's
`conversions` metric with no event filter — whatever the client's GA4
property has flagged as a "key event." For Renaissance (property
`310998391`), that flag set is 93% `outbound_click`/`pdf_view`/
`contact_link_click`: soft engagement, not leads. August 2026 reported
16,824 conversions against a real count of 101-107 (see below).

**The fix.** `clients.ga4_config.leadEvents` (`lib/db/schema.ts`) is a
per-client, explicit GA4 event-name allowlist: an array of
`{ name, sourceEvents: string[] }`, where `sourceEvents` lists the raw GA4
`eventName` values summed into that row (usually one, sometimes several —
see the `form_submission` merge below). Renaissance's 15-row allowlist is
set via `scripts/set-renaissance-ga4-config.ts`, not a hand-typed SQL edit,
so it's reviewable and idempotent.

`lib/ga4/lead-events.ts` is the pure-logic layer:
- `leadEventNames(config)` flattens every row's `sourceEvents` into one
  de-duplicated list, tolerant of malformed/wrongly-typed jsonb (the column
  is `.$type<Ga4Config>()`, a compile-time cast with no runtime
  enforcement).
- `hasLeadEvents(config)` is true only when that list is non-empty — an
  empty or malformed config is treated as *unconfigured*, not "configured
  with nothing," since GA4's `inListFilter` rejects an empty `values` array
  outright.
- `leadEventFilter(config)` builds the GA4 `dimensionFilter` (`eventName`
  `inListFilter`) from that list.
- `sumLeadEventConversions(rows)` sums `eventCount` across the filtered
  query's rows, returning `null` (not 0) if the fetch never ran, and `null`
  if any individual row's `eventCount` is blank or unparseable — a
  wholesale failure and a per-row data problem are both treated as "unknown
  total," never as a fabricated zero or a silent undercount.
- `deriveConversions(trueConversions, rawConversions, rawConversionRate,
  sessions)` is the single function BOTH the KPI tile (`index.tsx`) and the
  journey-stage card (`stages.ts`) call to decide what to render, given
  three possible states of `trueConversions`:
  - `undefined` — no effective `ga4Config`. Renders the client's original,
    unfiltered `conversions` / `sessionConversionRate` GA4 metrics,
    unchanged from before this feature existed.
  - `null` — `ga4Config` is set but the filtered fetch failed (or returned
    unparseable data). Renders a dash on both fields — never the inflated
    raw count, never a fabricated 0.
  - a number (including 0) — the real filtered value. The rate is derived
    from THIS over `sessions`, never blended with the raw
    `sessionConversionRate`, which is a different, session-scoped metric.

`components/report-sections/executive-overview/index.tsx` issues two
additional `ga4Query` calls (current period, compare period) only when
`hasLeadEvents` is true — `dimensions: ['eventName']`,
`dimensionFilter: leadEventFilter(ga4Config)`, `metrics: ['eventCount']` —
and feeds both periods' results through `deriveConversions` for the KPI
grid's Conversions/Conversion Rate cards. `stages.ts`'s `buildStages` takes
the same `trueConversions` value (current period only — the journey card
shows no delta on this field) and feeds it through the same function for
the "Conversions" stat and the "conv. rate" sub-metric on the Web Analytics
journey card. One function, one set of rules, both surfaces — deliberately,
so the two can never show different numbers for the same period.

**Where 107 comes from.** Verified live against August 2026 (a closed
month) via the Supermetrics GA4 connector: the shipped allowlist sums to
**107**, not the turnover doc's "81-82." That figure was never a complete
count — it came from GA4's `keyEvents`/`conversions` metric, which
structurally returns 0 for any event not already flagged as a key event, so
it excluded by construction the 7 event types (`contact_provider_lead` +
6 `employer_group_*` events) later confirmed as real leads sitting outside
the flag. 82 (flagged, including `whitelabel_form`) + 25 (August's count of
the 7 previously-excluded types) = 107 exactly. The full per-event August
breakdown is pasted in `notes.md`'s "Ground truth, corrected" section, so
the number is checkable against a fresh pull, not asserted.

**The `form_submission` merge.** Three low-signal, individually-ambiguous
events (`via_form`, `whitelabel_form`, `contact_other_lead`) are grouped
into one allowlist row. This is an internal working decision, not confirmed
with Renaissance's GTM owner (open question, tracked in `notes.md`). A
live check bounds the risk of this merge double-counting a lead also
captured by a `contact_*_lead` event: 101 distinct sessions vs. 107 total
qualifying events for August, so at most 6 events are attributable to a
session firing more than one qualifying event — the true over-count could
be anywhere from 0 to 6, i.e. the corrected total is 101-107, not an
open-ended risk.

**`hidden_journey_stages`.** A separate, unrelated decision bundled in this
PR (different migration, different config script): drops Inbound Funnel and
Pipeline from Renaissance's top journey row until those are fixed
separately (Renaissance's Salesforce pipeline figures are the client's own
broker renewals, not agency-sourced — a pre-existing, separate issue).
Constrained to only accept a *trailing* run of the fixed stage order
(`aeo, ga4, inbound, pipeline`), validated with a deduped `console.warn` on
an invalid value, because each stage's `connector` text names the stage
that immediately follows it — hiding a middle stage would leave a
connector describing a stage no longer next.

**Explicitly out of scope**, stated as such rather than silently left: the
Channel Tabs "By Conversion" per-channel ranking still reads the raw,
unfiltered `sessionConversionRate` (needs per-channel event filtering, a
separate problem); `ga4/index.tsx`, `demand-overview`, `exec-summary` (the
turnover doc's other 3 call sites, none enabled for Renaissance today, but
`ga4Config` is wired only into `executive-overview` — a future `ga4` report
enablement for Renaissance would show two different numbers for the same
month); the conversion-rate denominator is event-scoped (`eventCount` over
`sessions`) rather than session-scoped, disclosed honestly in the tile's
tooltip but not rebuilt to be session-scoped, which is a larger, separate
change.

---

## §2. Verification method

- **Live data, not assumption**, for every quantitative claim: the 90-day
  and August event inventories were pulled directly from the Supermetrics
  GA4 connector (`ds_id: GAWA`, account `310998391`) during the review, not
  taken from the turnover doc alone. The 101-vs-107 double-count bound was
  the same — a live query, not a guess either way.
- **Mutation testing** on every fix that shipped: each reviewer (and, for
  the fixes made in response, the author) reverted the specific fix under
  discussion to its pre-fix form and ran the full suite, confirming the
  regression tests actually fail on the bug and pass on the fix. This
  caught two cases where a first-pass fix was correct but unpinned by any
  test (round two → round three: the `stages.ts` conversion-rate gate;
  round three → round four: the `index.tsx` KPI-tile copy of the same
  logic; round four → round five: the `index.tsx` compare-period call
  site) — each closed by adding a test proven, by mutation, to catch the
  specific regression.
- **Render-level execution**, not just unit tests, for the RSC entry point:
  `ExecutiveOverviewReport` was rendered directly in tests
  (`index.test.tsx`) with mocked `ga4Query`/`getClientBySlug`, across all
  three `trueConversions` states, confirming the wiring (not just the pure
  function) behaves correctly.
- **Byte-identical regression check**: the unconfigured-client render
  (`avenue-z`, `begin-health`) was confirmed to produce HTML that hashes
  identically (sha256) to the same probe run against `origin/dev` — the
  clients this PR promises not to touch are provably untouched.
- **Independent database verification**: the migration-renumbering safety
  claim and the `MIGRATIONS-PENDING.md` corrections were checked against
  live `information_schema`/`drizzle.__drizzle_migrations` queries on dev,
  staging, and production (by Thomas, who has broader DB access than the
  author) rather than inferred from the migration files alone.
- **Static review** for the remaining findings (docstring accuracy,
  duplicated logic, unused fields, em-dash/formatting nits) — read and
  confirmed in-tree, not executed.

---

## §3. Findings

Sev: **●** correctness · **○** cleanup/convention. Status: CONFIRMED (proven
in-tree) / PLAUSIBLE (assumption confirmed, external trigger — e.g. a live
GA4 outage — not independently reproduced). All rows below are CONFIRMED
fixed as of `d2ac04d` unless noted otherwise in the Finding column.

| # | Sev | Status | Location | Finding |
|---|---|---|---|---|
| 1 | ● | CONFIRMED | `stages.ts`, `index.tsx` (fixed at `d76a5a3`→`1612ed7`) | Conversion-rate gate (`conversions != null`) was satisfied by the unconfigured fallback too, silently applying the filtered-rate formula to every client, not just configured ones. Rebuilt as an explicit three-state read on `trueConversions` itself. |
| 2 | ● | CONFIRMED | `notes.md` "Ground truth" | Shipped allowlist appeared not to reconcile to the turnover doc's "81-82" (327/90d ≈ 112.6/mo). Root cause was the 81-82 figure, not the allowlist — it structurally excluded 7 real-lead event types. Corrected to 107, verified against a live August pull, with the per-event table pasted for checkability. |
| 3 | ● | CONFIRMED | `lib/ga4/lead-events.ts` (`leadEventFilter` call site) | `leadEventFilter` was evaluated synchronously while building the `Promise.allSettled` array; a malformed `ga4_config` threw before any promise existed, crashing the whole Overview render, not just the conversion cards. Fixed with `Array.isArray` guards throughout `lib/ga4/lead-events.ts`. |
| 4 | ● | CONFIRMED | `lib/ga4/lead-events.ts` (`sumLeadEventConversions`) | A failed lead-event fetch rendered a confident `0` (and a fabricated `-100%` delta badge) rather than a dash. `sumLeadEventConversions` now returns `null` for a failed/never-run fetch, threaded through `deriveConversions`'s three-state model. |
| 5 | ● | CONFIRMED | `lib/db/schema.ts` (`LeadCategory`) | Widening the shared `LeadCategory` union to add a GA4 `form` category silently broke an unchecked exhaustiveness assumption in the Paid Search leads report (`leads-section.tsx`'s hardcoded 3-entry category array). Reverted — `Ga4LeadEvent` doesn't carry `category` at all, since nothing reads it at runtime. |
| 6 | ● | CONFIRMED | `MIGRATIONS-PENDING.md` | Deploying this code ahead of its migration is a Postgres `42703` on every `clients` read, backing the Auth.js session callback and every `/dashboard`/`/portal` page — app-wide, not section-scoped. Entry added documenting the apply order and verification query. |
| 7 | ● | CONFIRMED | `MIGRATIONS-PENDING.md` (`0020`) | An earlier draft of the migration entry claimed production was missing the `top_content_snapshots` table `0020` creates. Wrong — the table already exists there; only the ledger row is missing. Following the original instruction (paste `0020` into the Neon console) would have thrown on the first statement against production. Corrected, and production apply routed through `migrate-http.ts` (self-heals "already exists") instead of the console. |
| 8 | ○ | CONFIRMED | `components/report-sections/executive-overview/stages.ts` (`hiddenStages`) | Hiding a non-trailing journey stage would leave a connector arrow's text describing a stage no longer next. `isTrailingSuffix` constrains `hidden_journey_stages` to a trailing run of the fixed order; an invalid value is rejected (all stages shown) with a deduped `console.warn`, rather than risking a mislabeled arrow. |
| 9 | ● | CONFIRMED | `index.tsx` (KPI tile) | A second, independent copy of the three-state conversions logic lived in `index.tsx` feeding the KPI grid (as opposed to `stages.ts`'s copy feeding the journey card), and was exactly as unpinned as `stages.ts`'s had been. Root-caused: extracted into one shared `deriveConversions` function (`lib/ga4/lead-events.ts`), used by both call sites — a duplication the review caught only after the first copy alone had already regressed once. |
| 10 | ● | CONFIRMED | `index.tsx` (compare-period call site) | Even after the `deriveConversions` extraction, the compare-period call site was unpinned by any test that could distinguish it from a `??` fallback or an argument swap (`totals` for `cmpTotals`) — a shared function protects its own body from drifting, not a call site from being rewritten or handed the wrong arguments. Closed with a test exercising the one state where the two forms diverge (main succeeds, compare fails), self-verified against both mutations. |
| 11 | ● | CONFIRMED | `lib/ga4/lead-events.ts` (`sumLeadEventConversions`) | The per-row `eventCount` guard (`Number(x) \|\| 0`, later `Number.isNaN`) let blank values (`''`, whitespace, `[]`, all of which coerce to `0` in JS) and `null`/`undefined` cells through as silent `0` contributions — the same silent-wrong-number class this feature exists to eliminate. Tightened to an explicit blank check plus `Number.isFinite`, with a `console.warn` on the rejected path. |
| 12 | ● | PLAUSIBLE — checked, not fully closed | `notes.md` "Checked, not assumed" | Whether the `form_submission` merge double-counts a lead also captured by a `contact_*_lead` event was unverified. Bounded via a live query (101 sessions vs. 107 events, worst case 101), not fully resolved — the underlying question (are these genuinely one lead type or three) is still open with Renaissance's GTM owner. Not blocking; tracked as a follow-up. |
| 13 | ○ | CONFIRMED | `scripts/set-renaissance-ga4-config.ts` | Config-write script overwrote `ga4Config` wholesale rather than merging, unlike its `set-renaissance-campaign-scope.ts` precedent — inert today (one key in `Ga4Config`), but would silently erase a future second key. Fixed to merge. Also lacked the same malformed-jsonb `Array.isArray` hardening as the read path; fixed at both the read and merge sites. |
| 14 | ○ | CONFIRMED | `lib/db/queries.ts` (`getClientBySlug`, `getAllClients`) | Both cache `clients` rows via `cached()`, whose `version` bump policy applies whenever a fetcher's response shape changes — neither had been bumped despite two new columns. Bumped to `v2`. |
| 15 | ○ | CONFIRMED | Nine (later, +2 = eleven) bare `#235` references | Self-link when quoted into any PR comment on this repo. Escaped as inline code throughout `notes.md`, `MIGRATIONS-PENDING.md`, `lib/db/schema.ts`, `lib/db/queries.ts`, and the two round-four test files that introduced two more. |
| 16 | ○ | CONFIRMED, not fixed | Em-dash usage across `notes.md`/`MIGRATIONS-PENDING.md` | Flagged and escalating every round (28 → 80 → 117). Deliberately deprioritized behind substantive fixes each round; still open, documented as such rather than silently carried forward. |
| 17 | ○ | PLAUSIBLE — not blocking, not fixed | `lib/ga4/lead-events.ts:24` (`leadEventNames`) | Filters on `s.trim().length > 0` but returns the untrimmed string, so a padded event name would reach GA4's filter verbatim and match nothing (a silent `0`, not a crash). Cannot currently fire — all 17 shipped source-event literals are clean. Flagged as a follow-up, not required for this merge. |
| 18 | ○ | CONFIRMED, accepted tradeoff | `stages.ts` (`warnedInvalidHiddenStages`) | The invalid-config warn dedupes per unique bad value for the process lifetime, not per client — a second client with the identical bad config stays silent, and the message carries no client slug. Reviewed and accepted as a reasonable tradeoff (log-volume control), not requiring a fix. |

---

## §4. Detail

Full mechanism-level detail for each finding above — the exact line
numbers, the reverted-code mutation results, the reasoning for each design
choice — is in the PR review thread itself (5 rounds, `2026-09-10` through
`2026-09-11`) and in `docs/qa/renaissance-ga4-conversions/notes.md`'s
round-by-round sections, which were written contemporaneously as each round
landed rather than reconstructed after the fact. Duplicating that detail
here would drift from the source; this record indexes it instead.

---

## §5. Follow-ups

Tracked separately, not applied in this PR or this record:

**Correctness, worth doing soon:**
- Resolve the `form_submission` merge and the `employer_`/`employer_group_`
  naming mismatch with Renaissance's GTM owner (turnover doc step 9.4.3;
  `notes.md` "Open questions"). Currently an internal working decision on
  both.
- Decide the conversion-rate denominator properly (session-scoped vs.
  event-scoped) rather than leaving the current event-scoped behavior as a
  disclosed-but-unresolved stopgap.

**Needs a live call/data first:**
- `finding #12` above — settle whether `via_form`/`whitelabel_form`/
  `contact_other_lead` co-occur with `contact_*_lead` events for the same
  physical submission, closing the 101-107 band to an exact number.

**Decide together:**
- Whether to extend the filtered-conversions treatment to the Channel Tabs
  "By Conversion" ranking (needs per-channel event filtering) and to the
  standalone `ga4`/`demand-overview`/`exec-summary` reports if any of them
  are ever enabled for Renaissance.

**Cleanup:**
- `finding #17` — trim the returned event name in `leadEventNames`, not
  just the value tested.
- The em-dash count across `notes.md`/`MIGRATIONS-PENDING.md`.
- `lib/ga4/client.test.ts` and `content-derive.test.ts` (pre-existing, not
  introduced by this PR) aren't in `vitest.config.ts`'s file-by-file
  `lib/ga4/*` include list and may not be running under `npm test` — the
  same gap `lead-events.test.ts` would have had if not added explicitly.
