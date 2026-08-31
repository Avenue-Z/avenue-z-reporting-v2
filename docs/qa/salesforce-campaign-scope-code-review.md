# Salesforce campaign scoping (Executive Overview CRM): code review record

**Scope.** PR [#230](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/230),
*feat(salesforce): scope Executive Overview CRM figures to the agency-sourced
campaigns* (`feat/salesforce-campaign-filter` → `dev`), author `paulramirez`.

**Diff range reviewed.** `889ada5..c624f7f` (9 commits, merge-base `889ada5`).
No unrelated code is in scope. Twenty files change, and the review covers all of
them:

- `lib/salesforce/campaign-filter.ts` (new) and its test
- `lib/salesforce/leads.ts` (new) and its two test files
- the scoping and caching blocks in `lib/salesforce/pipeline.ts`, and its
  orchestration test
- the `WeeklyContacts` / `PipelineData` additions in `lib/salesforce/types.ts`
- `lib/salesforce/contacts.ts`, which gains only a contract comment
- the `campaignNames` field in `lib/db/schema.ts`
- three Executive Overview components that read the new flags
  (`index.tsx`, `pipeline-performance.tsx`, `contact-pacing.tsx`) plus
  `stages.ts`, the Demand Journey builder, and the four test files beside them
- `scripts/set-renaissance-campaign-scope.ts`
- `vitest.config.ts`, three lines

**This document changes no code.** It is the Stage-1 gate artifact per
`CLAUDE.md` § *Branch Flow & Promotion Pipeline*. It was written against
`afb76c4` and has been brought forward to `c624f7f`, because a gate artifact that
describes code the branch no longer holds certifies nothing. Four review rounds
are folded in; §3 records who found what and where it stands.

---

## §1. How it works

### The problem being solved

The Executive Overview reported Renaissance's **entire CRM** under a heading a
client reads as agency contribution: 3,965 open deals and ~$174M of open
pipeline, nearly all of it their own renewal book. Scoped to the campaigns the
agency actually sourced, the same tiles read **1 open deal / $51,731**. The gap
is three orders of magnitude.

### Why campaign name is the attribution signal

It is the only one this CRM carries. Verified live 2026-08-28:

| Candidate signal | State |
|---|---|
| `opportunity_lead_source` | populated on **3 of 89,654** records |
| UTM / agency / vendor field | not exposed by the connector at all |
| CampaignInfluence / CampaignMember | no such report type |
| `campaign_name` | populated on the 229 opportunities that carry a campaign |

So the filter is on campaign name, and nothing else was available to use.

### Where every number comes from

**Config.** `salesforce_config.campaignNames` (`lib/db/schema.ts:88`) holds exact
campaign names per client. **Absent means whole-org**, so every client that is
not explicitly scoped keeps the pre-existing behaviour untouched.

**The matcher.** `filterByCampaign` (`lib/salesforce/campaign-filter.ts:105`)
normalises with `trim().toLowerCase()` and tests set membership. Exact, never
substring. An empty or absent name list short-circuits to `{active: false}` and
passes every row through. `hasCampaignScope` (`:79`) is the single predicate the
UI must ask, and it is built from the same `wantedSet` helper, so a config of
`[' ']` cannot report "scoped" in one place while applying no filter in another.

**Scope for Renaissance: three campaigns.** Confirmed live 2026-08-31 against
the **Campaigns** report type (`campaign_count` is Campaigns-only, so this query
sees campaigns that hold no opportunities, which the opportunity-dimensioned
probes structurally cannot):

| Campaign (2026 year to date, scoped) | Opportunities | Distinct leads |
|---|---|---|
| `2026 - Inbound Prospecting` | 3 | 53 |
| `2026 - Inbound Prospecting - Employers` | 2 | 22 |
| `2026 - Inbound Prospecting - Brokers` | 0 | 0 |
| **Scoped total** | **5** | **75** |

The 75 here and the 88 in the dedup table below are the same window measured
either side of the filter: 88 is every lead the unfiltered query returns, 75 is
the subset on these three campaigns. They are consistent, not a discrepancy.

Those three are the only campaigns in the org whose name mentions prospecting,
and all three were confirmed byte-for-byte against the live strings (plain ASCII,
hyphen-minus, single spaces, no en-dash contamination). That check matters
because exact matching turns a typo into a silent $0 rather than an error.
Brokers carries nothing today; it is scoped in so the first deal it produces is
counted without a deploy.

**Pipeline tiles** (`lib/salesforce/pipeline.ts:533-536`). `campaign_name` is
added to `STAGE_FIELDS` (`:18`) and `OWNER_FIELDS` (`:26`), then **all four** row
sets are filtered before any transform: open, won-current, won-prior, owner.
Scoping only the current sets would measure this year's agency slice against last
year's entire book, i.e. a permanent false decline on Closed Won.

| Tile | Derivation after scoping |
|---|---|
| Open Deals | Σ `opportunity_count` over scoped rows where `is_closed` is not true |
| Total Pipeline | Σ `opportunity_amount` over the same rows |
| Weighted Pipeline | Σ `amount × probability / 100` over the same rows |
| Closed Won | close-date-basis query, scoped, stage literal `Closed Won` |
| Owner breakdown | scoped owner rows, open only, grouped and sorted by count desc |

Live scoped values, and there are five of them: 1 open deal, $51,731 pipeline,
$12,933 weighted, $20,584 Closed Won YTD, and 75 leads year to date.
Independently recomputed from raw API rows by the reviewer, with the business
rules applied outside the code under review; all five match, as does the
per-campaign split (53 + 22 + 0 = 75 leads, 3 + 2 + 0 opportunities).

**Inbound block: leads, not contacts.** For a scoped client
(`index.tsx:80`, `:113`) the section fetches `getSalesforceWeeklyLeads` and is
titled *Lead Creation* (`:183`); unscoped clients keep *Contact Creation*
unchanged. The reason is a hard connector limit: dimensioning contacts by
`campaign_name` returns **HTTP 400 SETTING_KEY_INVALID**, independently
reproduced, so contacts cannot be scoped at all, and an unscoped inbound count
sitting beside scoped revenue invites a comparison neither supports.

**Lead dedup, and an honest account of what it buys.** Leads are **many-to-many**
with campaigns, unlike opportunities, which carry one primary campaign, so
summing `lead_count` over the returned rows can count one lead twice. `lead_id`
is therefore requested (`leads.ts:44`) and `dedupeLeadWeeks` (`:103`) counts each
id once, earliest week wins.

An earlier version of this document, and of the code comment, claimed "363
lead-campaign rows over 222 distinct leads, 141 on more than one campaign, ~63%
inflation". **That figure does not reproduce at any window** and is retracted.
Re-measured live 2026-08-31:

| Window | Rows | Distinct leads | Multi-campaign | Inflation |
|---|---|---|---|---|
| **2026 YTD, what the code actually queries** | **88** | **88** | **0** | **0.0%** |
| 2025 YTD, the compare window | 6 | 6 | 0 | 0.0% |
| Org-wide, 2017 to 2035 | 19,002 | 18,861 | 141 | 0.7% |

The 141 is real but org-wide, and even there the inflation is 0.7%. In the window
this code queries there is no duplication at all, so **the dedup is currently
inert**. It is kept as deliberately defensive code, because the many-to-many
shape is real and a scoped client's campaign programme can grow into it, and
`leads.ts`
now says so plainly, so nobody diffs the output with and without it, concludes it
is dead, and deletes it.

**Id-less lead rows are disclosed, not counted.** `dedupeLeadWeeks` drops rows
carrying no `lead_id`, because admitting them would collapse every such row onto
one key and report them all as a single lead. Dropping them undercounts instead,
so the count is surfaced as `unusableRows` and `contact-pacing.tsx:57` renders it
rather than letting an all-id-less response fall through to "No data for this
period." This is a recorded **decision**, not an oversight: the number a client
sees is still an undercount, it is just caveated.

**Honesty flags.** `campaignScoped` (`pipeline.ts:566`) drives the UI line naming
the scope. That line is mandatory: scoped and unscoped tiles carry identical titles
and differ by orders of magnitude. Then **three** separate unmatched flags, not
one:

| Flag | Row set | Backs |
|---|---|---|
| `openCampaignUnmatched` (`:579`) | open, wide created-date window | Open Deals, Total Pipeline, Weighted Pipeline |
| `wonCampaignUnmatched` (`:580`) | closed-won, YTD close-date window | Closed Won |
| `ownerCampaignUnmatched` (`:613`) | owner rows | the by-owner breakdown, no tile |

Each means *rows arrived and none matched*, which is far more often a campaign
renamed in the CRM than a genuine zero. They are separate because the windows are
different questions and either can be empty alone: open pipeline with no close
yet is the **ordinary opening state** of a newly scoped client. While they were
OR'd into one flag, that client got "these totals are 0, the campaigns may have
been renamed" printed above a live six-figure Total Pipeline. The owner flag is
separate again because the tile caveat promises to explain *dashed tiles*, and
the breakdown has none. Filtered to empty it would render "No open deals by
owner.", a claim about the client's deals rather than about the filter.

The prior-year window raises no flag: it backs no visible figure, and matching
nothing there is an ordinary empty baseline `pct()` already degrades to no delta.

**The dash and the accusation are separate questions**, and two further flags
answer the first: `openValueUnknown` (`pipeline.ts:595`) and `wonValueUnknown`
(`:601`). They are what dash the tiles. The three campaign flags above are only
the accusation, meaning the sentence blaming a renamed campaign.

The separation exists because collapsing them produced a falsehood by a route
neither had been checked against. A capped response holds its `unmatched` flag
false on purpose (the in-scope rows may sit past the cap), so while one boolean
did both jobs, suppressing the accusation also turned off the dash and the tiles
printed `0` / `$0` / `$0` under "may be undercounted". Nothing on screen was
strictly false, but a reader takes the zero as the number and the caveat as
hedging. `pipeline.ts:540-542` states the rule the rest of the branch follows: a
value that could not be established must never render as a confident zero.

| Flag | True when |
|---|---|
| `openValueUnknown` | the open fetch failed, **or** a complete response matched nothing, **or** a capped response left an empty scoped set |
| `wonValueUnknown` | the same three, **plus** `wonStageUnmatched` |

`wonValueUnknown` carries the extra term because `wonStageUnmatched` cannot
cover the capped case either: it also requires a non-empty input, so an emptied
scoped set reports false there exactly as the campaign flag does. Both UI
consumers read these two fields rather than re-OR'ing the narrow ones, which is
what keeps the Demand Journey card (`stages.ts:128-129`) and the Pipeline
Performance block from disagreeing about the same figure on one screen. The
tile's caveat line still reads the narrow flags, because *which* sentence to
print is a different question from *whether* to dash.

The leads block has the same state and now names it: a capped lead response with
nothing in scope renders its own empty state (`contact-pacing.tsx:77`) instead
of falling through to "No data for this period.", which the query returning its
full cap of rows makes false.

**Truncation outranks the accusation.** `filterByCampaign` takes a `truncated`
argument and suppresses `unmatched` when the row set was capped
(`campaign-filter.ts:105`). Only a response we saw *all of* can support "the
campaigns may have been renamed": on a capped one, the in-scope rows may simply
sit past the cap. Truncation is computed once off the **raw** arrays
(`pipeline.ts:527-530`), before a scoped set exists to measure by mistake, and
fed both to the filter and to `stageTruncated` / `ownersTruncated`. The filter
itself still runs on a capped response; only the accusation is withheld.

There is a pleasant property worth recording: because the campaign filter runs
*before* `wonRowsFor`, the one genuinely contradictory pair
(`wonStageUnmatched` blaming a renamed stage while `wonCampaignUnmatched` blames
renamed campaigns) is unreachable by construction. It holds by ordering, not by
accident.

### Why the filter is client-side

Deliberate, and consistent with `salesforceQuery`, which exposes no `filters`
parameter at all. A typo'd server-side filter field returns **HTTP 200 with empty
data**, indistinguishable from a legitimate zero. Filtering in-process means a
mistake fails a test rather than silently zeroing a client's report. The cost was
measured before the choice: adding `campaign_name` takes the stage query from 31
to 92 rows against a 500-row cap.

**Read that headroom as a best case.** Every headroom figure on this branch was
measured against Renaissance, which is the friendliest possible org for adding
this dimension: 89,425 of its 89,654 opportunities carry no campaign at all, so
`campaign_name` collapses to a single blank value across almost the whole book. A
client running a real campaign programme multiplies much harder against the same
cap, and no other org has been measured. The truncation flags, not these numbers,
are what protects a client-facing total. `pipeline.ts:50` now says so.

### Where the caches sit, and why it matters here

Both CRM blocks cache **raw rows** and apply scoping outside the cache, so a
`campaignNames` correction takes effect on the very next render.

- Pipeline: four per-query wrappers (`pipeline.ts:390-436`), all on
  `CACHE_VERSION` (`:383`), currently **v2**. The bump is not hygiene: adding
  `campaign_name` changed the response shape, and a v1 entry written by
  pre-branch code holds rows with no `campaign_name` key, so `norm(undefined)` is
  `''`, nothing matches, and all four tiles dash under "The campaigns may have
  been renamed." on a client that renamed nothing.
- Leads: `getLeadRows` / `getLeadRowsCompare` (`leads.ts:247`, `:263`), with the
  composer deliberately unwrapped (`:271`). This previously cached the assembled,
  already-scoped series under a key that omits `campaignNames`, which meant
  fixing a renamed campaign corrected the tiles immediately and left the Lead
  Creation block repeating the accusation for up to an hour, on the same page.

Both leads wrappers also carry `negativeTtlSeconds`, and that is a consequence
of the boundary move rather than boilerplate. While the cached entry was the
assembled composite, a failing compare query was caught *inside* the wrapper, so
the call fulfilled with a degraded result and `unstable_cache` stored it for the
hour. That was accidental, and it was also a brake: one real upstream attempt an
hour. With the catch correctly outside, a rejection stores nothing, so without
the key a persistently failing query is re-issued on **every render**, each one
paying `smQuery`'s 15s timeout plus retries. `pipeline.ts` applied the same
reasoning to all four of its fetchers when it made the same move.

**There is no invalidation escape hatch.** No Salesforce `cached()` call passes
`tags:`, so `revalidateTag` cannot reach these entries; the only remedies are the
one-hour TTL and `CACHE_DISABLE=1`. That is why the version bump has to land
*before* the scope script is run, because the exposure window is created by
exactly the deploy-then-run sequence.

---

## §2. Verification method

| Claim | How it was actually probed |
|---|---|
| Three campaigns exist, exact names | Live query against the SF **Campaigns** report type (`campaign_name, campaign_status, campaign_count`, `campaign_name =@ Prospecting`), 2026-08-31. Returned exactly three rows; all three compared byte-for-byte against the config, and 3 of 178 campaigns in the org mention "prospect". |
| Brokers holds 0 opportunities / 0 leads | Opportunity- and lead-dimensioned live queries over `2017-01-01..2035-12-31`; Brokers produces **no row**, which is why the earlier probes could not see it: those group opportunities, so a campaign with no deals is absent rather than zero. |
| Adding Brokers changes no tile | Same live rows tallied under a two-name and a three-name scope. Identical: 1 / $51,731 / $12,933 / $20,584 / 75 leads. |
| The five tile figures | Recomputed from raw API rows with the business rules applied **outside** the code under review, then again through the real `filterByCampaign` after the round-two refactor. Match on every figure, both times. |
| Contacts cannot be campaign-dimensioned | Reproduced independently: `HTTP 400 SETTING_KEY_INVALID`. The Lead Creation swap is forced, not chosen. |
| The ~63% dedup inflation claim | **Did not reproduce.** Re-measured at three windows (table in §1); the queried window shows 0.0%. Claim retracted in `dfeee53`, in both the code comment and this document. |
| `campaignNames` is unset in production | `SELECT slug, salesforce_config FROM clients` against the live DB, twice, most recently 2026-08-31. Renaissance is `{"salesforceAccountId":"00D15000000Em4GEAS"}`, with **no** `campaignNames`, and is the only client with any `salesforce_config` at all. |
| All four opportunity row sets are scoped | Confirmed by mutation: dropping any one of the four filter calls fails a targeted test. All four queries request `campaign_name`. |
| Absent `campaignNames` is a genuine no-op | `filterByCampaign` returns the input array by reference; `crmScoped` defaults false and both new flags are false with no campaign list, so `openGone` / `wonGone` reduce exactly to the pre-branch conditions. |
| Every flag combination renders truthfully | The composer was driven with each degrade path across all five row sets: reject renders "unavailable", empty renders the generic no-data, rows-none-matching renders the specific message. No path produces a confident number. `wonStageUnmatched` + `wonCampaignUnmatched` is unreachable by ordering. |
| Truncation is judged on raw counts | Confirmed live (90 open rows, 29 won) against the scoped counts (4 and 3), and pinned per-window by tests that cap exactly one window at a time. |
| Truncation suppresses the accusation | Mutation: removing `!truncated` from `filterByCampaign` fails two named tests, one unit and one end-to-end through the composer. |
| The leads cache boundary | Pinned by recording which fetcher names `cached()` wraps at import; re-wrapping the composer fails that test. Verified by mutation. |
| `LEAD_SETTINGS`'s value | Now asserted as a **literal** in `leads.orchestration.test.ts`, not as the imported constant. Verified by mutation: changing it to `lead_converted` previously left 976 green and now fails two tests. |
| No cross-client cache collisions | Keys lead with the slug. |
| The scope script is safe | `{ ...cfg, campaignNames }` spreads the raw jsonb, so keys not on the interface survive; idempotent; refuses on a missing config; can only reach the renaissance row. What protects it is `salesforceAccountId` being required on the type, **not** a test, since `scripts/**` is excluded from vitest. |
| No migration needed | `campaignNames` is a new optional key inside the existing `salesforce_config` jsonb column, so `drizzle-kit` has nothing to diff. |
| No vendor name leaks | No CRM vendor name reaches any user-visible string. |
| Record Type = Sales | **Not verified.** The connector exposes record type for Account, Order and Contract, not Opportunity. Flagged rather than asserted, because it needs the client. |
| The dash survives the suppressed accusation | Mutation, at both ends. Reverting either UI consumer to the narrow OR fails a named test, and dropping the truncated term from either value flag fails its composer test. |
| Each window is filtered with its own truncation verdict | Mutation: crossing the `openTruncated` / `wonCurTruncated` arguments at `pipeline.ts:533-534` fails two tests. Previously interchangeable, because every existing case capped all three stage windows together or none of them. |
| `version` is passed by each fetcher, not just declared once | Mutation: dropping `version:` from one of the four wrappers fails a per-fetcher assertion. The shared constant stops a hand-typed half-bump; this stops the line being deleted. |
| The leads composer goes through its wrappers | Mutation: calling `leadRowsImpl` directly fails. The registry alone could not see this, so the distinct-wrapper plus `cacheCalls` pattern from `pipeline.orchestration.test.ts:26-30` was ported into the file where the boundary actually moved. |
| Both leads wrappers brake a failing query | `negativeTtlSeconds` and `healthCritical` are asserted off the recorded options; dropping either fails. |
| Suite | `1006 passed` (117 files), `tsc --noEmit` clean, `check:rsc` clean, lint unchanged at its 66 pre-existing errors with none in the touched files. Green on the PR: `test`, `rsc-boundary`, Vercel. |

---

## §3. Findings

Sev: **●** correctness · **○** cleanup/convention.
Status: CONFIRMED (proven in-tree) · PLAUSIBLE (code assumption confirmed, external trigger unverified).
Round: **R0** found writing this record · **R1** to **R4** the reviewer's rounds on the PR.

| # | Sev | Rnd | Status | Location | Finding |
|---|---|---|---|---|---|
| 1 | ● | R0 | CONFIRMED | `lib/salesforce/leads.ts` | `campaignUnmatched` computed and discarded, so a renamed campaign rendered "No data for this period." while Pipeline Performance blamed the rename. **Fixed `afb76c4`.** |
| 2 | ● | R1 | CONFIRMED | `pipeline.ts` | One `campaignUnmatched` OR'd two independent windows, so the page asserted "these totals are 0" directly above a live $51,731 tile, which is the ordinary state of a newly scoped client. **Fixed `fa7d39c`** (split into two flags). |
| 3 | ● | R1 | CONFIRMED | `stages.ts` | The Demand Journey funnel ignored the flag and rendered a confident `$0` above the block saying the totals cannot be trusted. **Fixed `fa7d39c`.** |
| 4 | ● | R1 | CONFIRMED | `pipeline.ts` | Nothing pinned the truncation flags to **raw** pre-filter counts; moving them to post-filter counts left the suite green. **Fixed `fa7d39c`.** |
| 5 | ● | R1 | CONFIRMED | `index.tsx` | No test at all, so the Contact→Lead swap, the heading and the scoped label were unguarded. **Fixed `fa7d39c` / `4e07761`.** |
| 6 | ● | R1 | CONFIRMED | `leads.ts` | The leads path lacked both guards the pipeline path had: no test that `campaign_name` is requested, and no truncation flag. **Fixed `fa7d39c`.** |
| 7 | ○ | R1 | CONFIRMED | `pipeline.ts:27` | Owner cap comment cited a pre-`campaign_name` measurement. Re-measured 127→184 rows, 2.72x. **Fixed `fa7d39c`.** |
| 8 | ● | R2 | CONFIRMED | `pipeline.ts` | `scopedOwner.unmatched` computed and thrown away, so the breakdown said "No open deals by owner." when the truth was that no owner was on a configured campaign. **Fixed `4e07761`** (third flag). |
| 9 | ● | R2 | CONFIRMED | `index.tsx` / `leads.ts` | Three unpinned seams: the `crmScoped` wiring, the leads field-list call site, and per-window `stageTruncated` terms. Each reverted green. **Fixed `4e07761`.** |
| 10 | ● | R3 | CONFIRMED | `pipeline.ts:383` | The four cache wrappers sat on default `v1` after a response-shape change, so a stale entry would dash all four tiles under a false rename accusation. **Fixed `f46ffaf`.** |
| 11 | ● | R3 | CONFIRMED | `campaign-filter.ts:105` | `unmatched` could not tell "none matched" from "the in-scope rows are past the cap", so exactly 500 out-of-scope rows raised the accusation *and* the truncation flag, with the speculative sentence printed first. **Fixed `f46ffaf`.** |
| 12 | ● | R3 | CONFIRMED | `leads.ts:271` | The leads cache stored the post-filter value under a key omitting `campaignNames`, so a config fix left the block accusing the client for up to an hour beside corrected tiles. **Fixed `f46ffaf`.** |
| 13 | ● | R3 | CONFIRMED | `leads.orchestration.test.ts` | `LEAD_SETTINGS` pinned by a tautology: the assertion imported the constant it checked, so `lead_converted` rebased every weekly bucket with 976 green. **Fixed `f46ffaf`.** |
| 14 | ○ | R3 | CONFIRMED | `types.ts:253` | Cross-reference to `PipelineData.campaignUnmatched`, a field split into three. **Fixed `f46ffaf`.** |
| 15 | ○ | R3 | CONFIRMED | `types.ts:81` | `unrecognizedClosedFlags` is a row count, so the new dimension inflates it ~3x for **unscoped** clients over identical data. Magnitude only, since the caveat already says "rows, never deals". **Documented `f46ffaf`.** |
| 16 | ○ | R3 | CONFIRMED | `pipeline.ts:50` | Every headroom re-measurement came from Renaissance, the friendliest possible org. **Documented `f46ffaf`.** |
| 17 | ○ | R0 | CONFIRMED | `pipeline.ts:539` | `OWNER_MAX_ROWS` is passed to `transformByOwner` purely to compute a `truncated` the composer ignores. Vestigial; a future reader who wires it back up gets a false all-clear. **Open.** |
| 18 | ○ | R0 | CONFIRMED | `index.tsx:185` | "Scoped to agency-sourced campaigns." renders under the heading even when the block below is `NeedsConnection` or `LoadFailed`. **Open.** |
| 19 | ○ | R1 | CONFIRMED | `set-renaissance-campaign-scope.ts:52`, `:56` | Em dashes in operator-facing strings. **Open.** |
| 20 | ● | R0 | PLAUSIBLE | live CRM | Record Type = Sales is not applied, because the connector does not expose record type for Opportunity. Five opportunities are in scope. **Open: needs the client.** |
| 21 | ● | R0 | CONFIRMED | production DB | Renaissance has **no** `campaignNames`, so merging changes no live number. **Open: a decision, not a defect.** |
| 22 | ● | R4 | CONFIRMED | `leads.ts:247`, `:263` | Neither leads wrapper carried `negativeTtlSeconds`, which the boundary move made necessary: the composite used to store a degraded-but-fulfilled compare result for the hour, so a persistently failing query went from one attempt an hour to one per render at a 15s timeout each. **Fixed `c624f7f`.** |
| 23 | ● | R4 | CONFIRMED | `pipeline-performance.tsx:43` | `openCampaignUnmatched` drove both the dash and the rename caveat, so suppressing it on a capped response (finding 11) also stopped the dash, and the tiles printed a confident `0` / `$0` / `$0`. **Fixed `c624f7f`** (split into `openValueUnknown` / `wonValueUnknown`, applied to the won tile and to `stages.ts` as well). |
| 24 | ○ | R4 | CONFIRMED | `types.ts:127` | The truncation clause reached one flag contract of four, and the owner block's "same contract as the other two" then listed clauses the other two did not carry. **Fixed `c624f7f`.** |
| 25 | ○ | R4 | CONFIRMED | `contact-pacing.tsx` | A capped lead response with nothing in scope fell through to "No data for this period.", which `types.ts` itself calls false. Unreachable for this client (20,000 rows against a measured 88), but the pipeline block prints a compensating line and this one printed nothing. **Fixed `c624f7f`.** |
| 26 | ○ | R4 | CONFIRMED | tests | Four gaps, all confirmed by mutation and none a live defect: `version` droppable from a wrapper invisibly, a crossed truncation argument invisible, the leads cache boundary blind to the impl being called directly, and `healthCritical: false` on `leadRowsCompare` unpinned. **Fixed `c624f7f`.** |
| 27 | ○ | R4 | CONFIRMED | `leads.ts:209` | The boundary docblock said every scoping decision is "made fresh on each render", but `getClientBySlug` is cached at 5 minutes, so the real bound is five minutes. Still the fix working against the old hour; the sentence was stronger than the mechanism. **Fixed `c624f7f`.** |

---

## §4. Detail on what is still open

Findings 1 to 16 and 22 to 27 are closed on the branch, and their mechanisms are
described in §1, where the code now explains itself. The five below are not.

### Finding 17. Vestigial cap argument on the owner transform ○

**Mechanism.** `transformByOwner(rows, maxRows)` uses `maxRows` only for
`truncated: rows.length >= maxRows`; it never slices. The composer judges
truncation on the **raw** row count at `pipeline.ts:530`, which is correct
(the cap applies to what the API returned, and unseen rows could have been in
scope), and ignores the returned flag. So `:539` computes a value whose own neighbouring
comment explains why it must not be trusted.

**Suggested fix.** Have the composer stop asking for it, or return it from a
shape that cannot be misread. Low stakes; the risk is a future reader wiring
`owner.truncated` back up and getting the false all-clear.

### Finding 18. Scope caption over an absent block ○

**Mechanism.** `index.tsx:185-186` gates the caption on `crmScoped` alone, while
the body below is a three-way branch (`ContactPacing` / `LoadFailed` /
`NeedsConnection`). A client with no CRM connected sees *"Lead Creation / Scoped
to agency-sourced campaigns. / [connect your CRM]"*, describing the scope of
numbers that are not on screen.

**Suggested fix.** Gate the caption on the data branch, not on config.

### Finding 19. Em dashes in the scope script's operator-facing strings ○

**Mechanism.** `scripts/set-renaissance-campaign-scope.ts:52` and `:56` print em
dashes in the lines an operator reads when running the script. The house rule
that removed them from client-facing copy was never applied to operator output,
so the two diverge. Nothing renders wrong and no client sees it.

**Suggested fix.** Replace both with a colon or a comma, the same substitution
the UI strings took. It is a two-line edit and it is only listed separately
because the script is excluded from vitest (`scripts/**`), so nothing would
catch a regression.

### Finding 20. Record Type = Sales ●

**Mechanism.** The connector exposes record type for Account, Order and Contract
but not Opportunity, so a non-Sales opportunity on a scoped campaign would be
counted in the tiles. Five opportunities are in scope. Whether all five are Sales
cannot be established from the connector.

**Suggested fix.** Ask the client. If any are not Sales, the tiles need a
different discriminator, and there may not be one available.

### Finding 21. The feature is inert until the script runs ●

**Mechanism.** `campaignNames` is client config in the DB. Live value today is
`{"salesforceAccountId":"00D15000000Em4GEAS"}` with no campaign list, so
`filterByCampaign` short-circuits to whole-org for Renaissance. The two-name
scope from the earlier work was never applied either. Re-verified against the
production database on 2026-08-31: no client has `campaignNames` set.

`scripts/set-renaissance-campaign-scope.ts` is what applies it. Committing the
names rather than leaving a hand-typed SQL edit is deliberate: this is the single
value deciding whether the client reads $174M or ~$52K, and against an
exact-match filter a typo degrades to a silent $0 rather than an error, so the
names get reviewed like code. The script is idempotent and refuses to write onto
a client with no `salesforce_config`.

**Sequencing, and this is the part that has teeth.** Merging this PR changes no
client-facing number. Running the script does. They are two decisions and should
stay separate. And the **cache version bump (finding 10) must be deployed
before the script runs**, because there is no invalidation escape hatch and the stale-entry
window is opened by exactly that sequence.

---

## §5. Follow-ups

**Correctness: all closed on the branch**
- [x] **Findings 1 to 9.** Leads flag threaded through; the unmatched flag split into
  three; the Demand Journey funnel taught the flag; every truncation term and
  wiring seam pinned by a test that fails under its own mutation.
- [x] **Findings 10 to 13.** Cache version bumped to `v2`; a capped response no longer
  accuses the client of renaming a campaign; the leads cache boundary moved onto
  the raw query to match the pipeline; `LEAD_SETTINGS` pinned by value.
- [x] **Findings 22 and 23.** Both leads wrappers given `negativeTtlSeconds`, so
  the brake the boundary move removed is deliberate again; and the dash split
  away from the accusation, so suppressing the rename sentence on a capped
  response no longer restores a confident `$0`. The split was applied to the
  Closed Won tile and the Demand Journey card as well as to the three open
  tiles, because the same collapse was reachable there and `wonStageUnmatched`
  does not cover it.

**Documentation and test strength: closed on the branch**
- [x] **Findings 14 to 16.** The stale `campaignUnmatched` cross-reference now
  points at the flags that exist; `unrecognizedClosedFlags` states that the new
  dimension inflates its **row** count roughly threefold for unscoped clients
  over identical data; and every headroom figure is labelled a best case, with
  the reason (89,425 of Renaissance's 89,654 opportunities carry no campaign).
  None of the three changed behaviour, which is why they are separated from the
  correctness list rather than folded into it.
- [x] **Findings 24 to 27.** The truncation clause reaches all four flag
  contracts; the leads block has its own capped-and-empty empty state; the four
  test-strength gaps are closed and each was confirmed by reproducing its
  mutation before the fix and after; and the boundary docblock no longer claims
  a corrected campaign name lands on the next render.

**Needs a live call / the client first**
- [ ] **Finding 20.** Confirm all five in-scope opportunities are Record Type = Sales.
  Blocks nothing technically, but it is the one open question that could change
  a client-facing number.

**Decide together: the highest-value items on this list**
- [ ] **Finding 21.** When to run `scripts/set-renaissance-campaign-scope.ts`. Until it
  runs, the whole feature is a no-op and staging keeps showing the $174M renewal
  book. Recommend running it on staging first so Tina QAs the scoped numbers, not
  the unscoped ones. **Deploy the `v2` bump first.**
- [ ] Confirm **Brokers belongs in scope**. It was deliberately excluded in
  `af46b7f` and added in `dea198f`. Reviewed and answered *yes* in R1 (verified
  to exist, correctly spelled, and to change no tile today), recorded here so the
  answer is not only in a PR thread.

**Cleanup**
- [ ] **Finding 17.** Drop the vestigial `OWNER_MAX_ROWS` argument at `pipeline.ts:539`.
- [ ] **Finding 18.** Gate the "Scoped to agency-sourced campaigns." caption on the
  rendered branch rather than on config.
- [ ] **Finding 19.** Em dashes in the scope script's operator-facing strings
  (`set-renaissance-campaign-scope.ts:52`, `:56`). Detail in §4.

**Raised and withdrawn**
- The 75 and 88 lead counts were queried as inconsistent and are not: both are
  2026 year to date, and 75 scoped leads are a subset of the 88 the unfiltered
  query returns. §1's campaign table now carries a scope label so the two cannot
  read as a contradiction.

**Recorded decisions, not findings**
- Id-less lead rows are **disclosed rather than counted**. The client-facing
  number is still an undercount; it is caveated instead of silently wrong.
  Admitting the rows would collapse them onto one key and report them as a single
  lead, which is further from the truth.
- The lead dedup is **currently inert** and kept deliberately. See §1.

**Watch, not a finding**
- Client-side filtering means truncation is judged before scoping. Correct today
  and now guarded on both sides: the truncation flags fire on raw counts, and a
  capped response suppresses the rename accusation. The residual risk is a client
  with a large campaign programme against the same 500-row cap, on which no
  measurement exists; that needs the cap revisited, not the approach.
