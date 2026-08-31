# Salesforce campaign scoping (Executive Overview CRM) — Code Review Record

**Scope.** PR [#230](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/230)
— *feat(salesforce): scope Executive Overview CRM figures to the agency-sourced
campaigns* (`feat/salesforce-campaign-filter` → `dev`), author `paulramirez`.

**Diff range reviewed.** `889ada5..afb76c4` (3 commits, merge-base `889ada5`).
No unrelated code is in scope. The review covers `lib/salesforce/campaign-filter.ts`,
`lib/salesforce/leads.ts`, the scoping block in `lib/salesforce/pipeline.ts`, the
`WeeklyContacts` / `PipelineData` additions in `lib/salesforce/types.ts`, the
`campaignNames` field in `lib/db/schema.ts`, the two Executive Overview components
that read the new flags, and `scripts/set-renaissance-campaign-scope.ts`.

**This document changes no code.** It is the Stage-1 gate artifact per
`CLAUDE.md` § *Branch Flow & Promotion Pipeline*. Finding **#1** was found during
this review and fixed on the feature branch (`afb76c4`) rather than here; every
other finding in §5 is an open follow-up.

---

## §1 — How it works

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

**The matcher.** `filterByCampaign` (`lib/salesforce/campaign-filter.ts:67`)
normalises with `trim().toLowerCase()` and tests set membership. Exact, never
substring. An empty or absent name list short-circuits to `{active: false}` and
passes every row through.

**Scope for Renaissance — three campaigns.** Confirmed live 2026-08-31 against
the **Campaigns** report type (`campaign_count` is Campaigns-only, so this query
sees campaigns that hold no opportunities — which the opportunity-dimensioned
probes structurally cannot):

| Campaign | Opportunities | Distinct leads |
|---|---|---|
| `2026 - Inbound Prospecting` | 3 | 53 |
| `2026 - Inbound Prospecting - Employers` | 2 | 22 |
| `2026 - Inbound Prospecting - Brokers` | 0 | 0 |

Those three are the only campaigns in the org whose name mentions prospecting.
Brokers carries nothing today; it is scoped in so the first deal it produces is
counted without a deploy.

**Pipeline tiles** (`lib/salesforce/pipeline.ts:483-487`). `campaign_name` is
added to `STAGE_FIELDS` (`:18`) and `OWNER_FIELDS` (`:26`), then **all four** row
sets are filtered before any transform — open, won-current, won-prior, owner.
Scoping only the current sets would measure this year's agency slice against last
year's entire book, i.e. a permanent false decline on Closed Won.

| Tile | Derivation after scoping |
|---|---|
| Open Deals | Σ `opportunity_count` over scoped rows where `is_closed` is not true |
| Total Pipeline | Σ `opportunity_amount` over the same rows |
| Weighted Pipeline | Σ `amount × probability / 100` over the same rows |
| Closed Won | close-date-basis query, scoped, stage literal `Closed Won` |
| Owner breakdown | scoped owner rows, open only, grouped and sorted by count desc |

Live scoped values: 1 open deal, $51,731 pipeline, $12,933 weighted, $20,584
Closed Won YTD.

**Inbound block — leads, not contacts.** For a scoped client
(`index.tsx:73`) the section fetches `getSalesforceWeeklyLeads` and is titled
*Lead Creation*; unscoped clients keep *Contact Creation* unchanged. The reason
is a hard connector limit: dimensioning contacts by `campaign_name` returns
**HTTP 400**, so contacts cannot be scoped at all, and an unscoped inbound count
sitting beside scoped revenue invites a comparison neither supports.

**Lead dedup.** Leads are **many-to-many** with campaigns, unlike opportunities,
which carry one primary campaign. Live: 363 lead-campaign rows over 222 distinct
leads, 141 of them on more than one campaign. So `lead_id` is requested as a
dimension (`leads.ts:26`) and `dedupeLeadWeeks` (`:58`) counts each id once,
earliest week wins. Summing `lead_count` instead would inflate the chart ~63%.
The deduped output is re-emitted in the contacts query's shape so the already
tested `transformWeeklyContacts` does the bucketing and gap-filling.

**Honesty flags.** `campaignScoped` (`pipeline.ts:519`) drives the UI line naming
the scope — mandatory, because scoped and unscoped tiles carry identical titles
and differ by orders of magnitude. `campaignUnmatched` (`:523`, and
`types.ts:153` for the leads side) means rows arrived and **none** matched, which
is almost always a campaign renamed in the CRM rather than a genuine zero. Both
blocks render a caveat instead of a confident zero.

### Why the filter is client-side

Deliberate, and consistent with `salesforceQuery`, which exposes no `filters`
parameter at all. A typo'd server-side filter field returns **HTTP 200 with empty
data** — indistinguishable from a legitimate zero. Filtering in-process means a
mistake fails a test rather than silently zeroing a client's report. The cost was
measured before the choice: adding `campaign_name` takes the stage query from 31
to 92 rows against a 500-row cap. There is no volume argument for the risky option.

---

## §2 — Verification method

| Claim | How it was actually probed |
|---|---|
| Three campaigns exist, exact names | Live query against the SF **Campaigns** report type (`campaign_name, campaign_status, campaign_count`, `campaign_name =@ Prospecting`), 2026-08-31. Returned exactly three rows. |
| Brokers holds 0 opportunities / 0 leads | Opportunity- and lead-dimensioned live queries over `2017-01-01..2035-12-31`; Brokers produces **no row**, which is why the earlier probes could not see it — those group opportunities, so a campaign with no deals is absent rather than zero. |
| Adding Brokers changes no tile | Same live rows tallied under a two-name and a three-name scope. Identical: 1 / $51,731 / $12,933 / $20,584 / 75 leads. |
| `campaignNames` is unset in production | `SELECT slug, salesforce_config FROM clients` against the live DB. Renaissance is `{"salesforceAccountId":"00D15000000Em4GEAS"}` — **no** `campaignNames`. |
| Finding #1 is real, not a misreading | `grep` for every non-test consumer of `.unmatched`: only `pipeline.ts:236` and `:523`. `WeeklyContacts` had no such field. Then executed: reverted the one-line fix and confirmed `leads.orchestration.test.ts` fails, restored it and confirmed it passes. |
| Finding #1's rendered symptom | Traced `gapFill` (`contacts.ts:91`, returns `[]` on empty input) → `ContactPacing` `weeks.length === 0` → `<NoData />`. Confirms the symptom is a **false explanation**, not a fabricated number — the initial read of "confident zero chart" was wrong and is corrected here. |
| Finding #2 | `owner.truncated` has no reader after `pipeline.ts:490`; `transformByOwner` (`:245-265`) uses `maxRows` **only** to compute that flag and never slices rows. |
| Record Type = Sales | **Not verified.** The connector exposes record type for Account, Order and Contract, not Opportunity. Flagged rather than asserted — needs the client. |
| Suite | `919 passed` (116 files), `tsc --noEmit` clean, `check:rsc` clean. Green on the PR: `test`, `rsc-boundary`, Vercel. |

---

## §3 — Findings

Sev: **●** correctness · **○** cleanup/convention.
Status: CONFIRMED (proven in-tree) · PLAUSIBLE (code assumption confirmed, external trigger unverified).

| # | Sev | Status | Location | Finding |
|---|---|---|---|---|
| 1 | ● | CONFIRMED | `lib/salesforce/leads.ts:109` | `campaignUnmatched` was computed and discarded, so a renamed campaign rendered "No data for this period." while Pipeline Performance blamed the rename. **Fixed on the branch in `afb76c4`.** |
| 2 | ○ | CONFIRMED | `lib/salesforce/pipeline.ts:490` | `OWNER_MAX_ROWS` is passed to `transformByOwner` purely to compute a `truncated` the composer then ignores. Vestigial, and a future reader who trusts it gets a false all-clear. |
| 3 | ○ | CONFIRMED | `components/report-sections/executive-overview/index.tsx:179` | "Scoped to agency-sourced campaigns." renders under the heading even when the block below is `NeedsConnection` or `LoadFailed` — describing the scope of numbers that are not on screen. |
| 4 | ● | PLAUSIBLE | `lib/salesforce/pipeline.ts:483` | Record Type = Sales is not applied, because the connector does not expose record type for Opportunity. Five opportunities are in scope; whether all five are Sales is unconfirmed. |
| 5 | ● | CONFIRMED | production DB | Renaissance has **no** `campaignNames`, so merging this changes no live number. Every CRM figure on staging is still whole-org until the script is run. |

---

## §4 — Detail

### #1 — The leads path dropped its own honesty flag ●

**Mechanism.** `dedupeLeadWeeks` returned `{rows, unmatched}` and
`getSalesforceWeeklyLeadsImpl` used only `.rows`. `WeeklyContacts` had no field
to carry the flag, so it died at the call site. `pipeline.ts` consumed the
equivalent flag correctly, which is what made the asymmetry invisible: each piece
was right in isolation and the value was lost between them.

**Consequence.** When the configured campaigns match nothing, the scoped set is
empty → `gapFill` returns `[]` → `ContactPacing` renders `<NoData />`, whose
message is *"No data for this period."* That asserts the period was empty. The
query in fact returned rows, none in scope. Directly below it, Pipeline
Performance says *"The campaigns may have been renamed."* One rename, two
contradictory explanations, and the leads one points away from the cause.

Not hypothetical: exact-match filtering over three hand-entered names is exactly
the configuration where a rename goes unnoticed.

**Fix applied (`afb76c4`).** `WeeklyContacts.campaignUnmatched` added as
**required** — optional is what allowed the omission, and `tsc` immediately
caught the one existing fixture. `transformWeeklyContacts` takes it as a
defaulted trailing param so the contacts path is not made to pass a constant
false everywhere. `ContactPacing` checks it *before* the `weeks.length` check,
since both branches are live at once and the generic message would otherwise win
by accident. Regression coverage is `leads.orchestration.test.ts` — an
end-to-end test through the impl, because a unit test of either piece alone
passes with the bug present.

### #2 — Vestigial cap argument on the owner transform ○

**Mechanism.** `transformByOwner(rows, maxRows)` uses `maxRows` only for
`truncated: rows.length >= maxRows`; it never slices. Since scoping, the composer
judges truncation on the **raw** row count at `:502` — correct, because the cap
applies to what the API returned and unseen rows could have been in scope — and
ignores the returned flag. So `:490` computes a value whose own inline comment at
`:499` explains why it must not be trusted.

**Suggested fix.** Have the composer stop asking for it, or return it from a
shape that cannot be misread. Low stakes; the risk is a future reader wiring
`owner.truncated` back up and getting the false all-clear.

### #3 — Scope caption over an absent block ○

**Mechanism.** `index.tsx:178-183` gates the caption on `crmScoped` alone, while
the body below is a three-way branch (`ContactPacing` / `LoadFailed` /
`NeedsConnection`). A client with no CRM connected sees *"Lead Creation / Scoped
to agency-sourced campaigns. / [connect your CRM]"*.

**Suggested fix.** Gate the caption on the data branch, not on config.

### #4 — Record Type = Sales ●

**Mechanism.** The connector exposes record type for Account, Order and Contract
but not Opportunity, so a non-Sales opportunity on a scoped campaign would be
counted in the tiles. Five opportunities are in scope. Whether all five are Sales
cannot be established from the connector.

**Suggested fix.** Ask the client. If any are not Sales, the tiles need a
different discriminator, and there may not be one available.

### #5 — The feature is inert until the script runs ●

**Mechanism.** `campaignNames` is client config in the DB. Live value today is
`{"salesforceAccountId":"00D15000000Em4GEAS"}` with no campaign list, so
`filterByCampaign` short-circuits to whole-org for Renaissance. The two-name
scope from the earlier work was never applied either.

`scripts/set-renaissance-campaign-scope.ts` is what applies it. Committing the
names rather than leaving a hand-typed SQL edit is deliberate: this is the single
value deciding whether the client reads $174M or ~$52K, and against an
exact-match filter a typo degrades to a silent $0 rather than an error, so the
names get reviewed like code. The script is idempotent and refuses to write onto
a client with no `salesforce_config`.

**Note for the promotion path.** Merging this PR does not change any client-facing
number. Running the script does. Those are two separate decisions and should stay
separate.

---

## §5 — Follow-ups

**Correctness**
- [x] **#1** — leads `campaignUnmatched` threaded through and covered by an
  end-to-end regression test. Fixed on the feature branch in `afb76c4`.

**Needs a live call / the client first**
- [ ] **#4** — confirm all five in-scope opportunities are Record Type = Sales.
  Blocks nothing technically, but it is the one open question that could change
  a client-facing number.

**Decide together**
- [ ] **#5** — when to run `scripts/set-renaissance-campaign-scope.ts`. This is
  the highest-value item on the list: until it runs, the whole feature is a
  no-op and staging keeps showing the $174M renewal book. Recommend running it
  on staging first so Tina QAs the scoped numbers, not the unscoped ones.
- [ ] Confirm **Brokers belongs in scope**. It was deliberately excluded in
  `af46b7f` and added in `dea198f`. It changes no number today, so this is a
  cheap decision to make now and an expensive one to discover later.

**Cleanup**
- [ ] **#2** — drop the vestigial `OWNER_MAX_ROWS` argument at `pipeline.ts:490`.
- [ ] **#3** — gate the "Scoped to agency-sourced campaigns." caption on the
  rendered branch rather than on config.

**Watch, not a finding**
- Client-side filtering means truncation is judged before scoping. Correct today
  (92 rows against a 500 cap) and `stageTruncated` guards it, but a client with a
  large campaign programme would need the cap revisited rather than the approach.
