# Executive Overview CRM Wiring (Half B) — Code Review Record

**Scope.** PR #220, branch `feat/exec-overview-crm-wiring`, diff range `0360fef^..96a6081` (six commits). No unrelated code: the diff touches thirteen files, all of them either the Executive Overview section or the new `lib/salesforce/configured.ts`, plus a one-line pin in `vitest.config.ts` and a comment-only change to `lib/salesforce/base.ts`.

**This document changes no code.** Every fix it names is tracked in §5 as a follow-up.

Design of record: `docs/superpowers/specs/2026-08-24-exec-overview-crm-wiring-design.md` and `docs/superpowers/plans/2026-08-25-exec-overview-crm-wiring.md` (PR #219). Half A, the data layer being consumed, shipped in PR #208 and is not re-reviewed here except where Half B's rendering depends on its contract.

---

## 1. How it works

The page had two hardcoded "connect your CRM" blocks and two hardcoded unconnected journey cards. Half A shipped a Salesforce data layer that nothing consumed. This wires the two together.

### 1.1 Where each number comes from

All six Salesforce queries go through `salesforceQuery` (`lib/salesforce/base.ts`), which resolves the client's Supermetrics account id from `clients.salesforce_config` and the API key from the env var named in `clients.sm_api_key_env_var`.

**Pipeline Performance block** — four tiles from `getSalesforcePipeline` (`lib/salesforce/pipeline.ts:310`), which runs four queries in parallel.

| Tile | Derivation |
|---|---|
| **Open Deals** | Sum of `opportunity_count` over rows where `is_closed` is false, from the open query. |
| **Total Pipeline** | Sum of `opportunity_amount` over those same open rows (`pipeline.ts:191`). |
| **Weighted Pipeline** | Sum of `amount x (probability / 100)` over those rows (`pipeline.ts:193`). Probability arrives 0 to 100, so the divide is load-bearing; without it the tile is 100x too large. |
| **Closed Won** | Sum of `amount` over rows that are **both** `is_closed` **and** in the won stage (`pipeline.ts:145`). The won stage is `salesforce_config.wonStageName`, defaulting to the literal `'Closed Won'` (`pipeline.ts:40`). |

The two query windows are different on purpose, and this is the single most important thing to be able to explain:

- The three **open** tiles use a **created-date** basis over a wide window, `openWindow()` (`pipeline.ts:69-72`): January 1 of `y - 9` through December 31 of `y + 9`. **That is 19 calendar years, not 18** (probe, §2). Openness is evaluated *as of now*, so windowing these by close date would show only the overdue subset. The window is derived from the clock rather than hardcoded because Supermetrics' Salesforce historical floor is a rolling "today minus ten years".
- **Closed Won** uses a **close-date** basis over `year_to_date`, compared against the same window a year earlier via `resolveCompareIso(range, 'previous_year')`.

**Why only Closed Won carries a year-over-year delta.** The other three call `kpiNoDelta` (`pipeline.ts:190-193`). Openness is measured as of now, so every deal in a prior-year window has had a full year to close and the prior-year open count trends to zero by construction; a live check on 2026-08-16 rendered **+29,600 percent** before this was withheld. Closed-won is a historical fact recorded at close time, so year-over-year is sound there.

**How the owner list is ranked.** `transformByOwner` (`pipeline.ts:204-225`) keeps only not-closed rows, aggregates by `opportunity_owner` (blank or missing falls back to `'Unassigned'`), and **sorts by open deal count descending** (`pipeline.ts:223`). The bar width is that same count over the largest count. **Dollar amounts are aggregated but never rendered** — see finding 2.

**Contact Creation block** — three tiles and a weekly bar row from `getSalesforceWeeklyContacts` (`contacts.ts:218`), two queries over `year_to_date` on a created-date basis, bucketed into ISO weeks and gap-filled with zeros so consecutive bars are genuinely consecutive weeks.

| Tile | Derivation |
|---|---|
| **Current Week** | Contacts in the ISO week in progress, covering only days elapsed. Carries **no delta** by design: a partial week against a complete one renders as an ~85 percent collapse on a Monday. |
| **Previous Week** | The most recent **complete** ISO week. Its delta is `completedWeekOverWeek`, where both sides are full weeks. |
| **Prior Year Week** | The bucket carrying the same ISO week *number* as Previous Week, one year earlier. |

### 1.2 The three decisions that shape what a client sees

**Why Closed Won sometimes shows a dash with no percentage.** `KpiCard` tests `delta !== undefined` (`kpi-card.tsx:61`) **before** `comparisonExpected` (`kpi-card.tsx:73`), so nothing in that component stops a tile rendering a dash as its value with a confident percentage underneath. And the wire is live: `transformPipeline` builds Closed Won as `kpi(wonCur.amount, wonPrior?.amount)` (`pipeline.ts:194`), and `wonCur.amount` is `0` whenever the closed-won fetch degraded or the won stage was renamed. Against a healthy prior year, `pct()` returns exactly `-100` (proved by execution, §2). `PipelinePerformance` therefore computes the delta rather than reading it, withholding it for two distinct reasons:

- **the value is gone** — `wonUnavailable`, `wonStageUnmatched`
- **the baseline is corrupt** — `stageTruncated`, `unrecognizedClosedFlags`, both of which also fire on the *prior-year* won query, so the ratio is unsafe even when each total is merely low

`ownersTruncated` withholds nothing, and a test pins that so the rule cannot spread.

**Why a configured client never reads "not connected".** Two predicates, not one (`lib/salesforce/configured.ts`). `isSalesforceConfigured` reads the client row only. `canQuerySalesforce` adds `process.env[envVar]` and mirrors exactly the conjunction `salesforceQuery` enforces at `base.ts:39` and `:41`. They differ on one case: a fully configured client on a deployment whose *shared* Supermetrics key is unset. That key is shared with Meta, Paid Search, LinkedIn and the dashboard adapter, so whether it holds a value is a fact about the deployment, not the client. `index.tsx` uses `canFetch` to decide whether to **issue** the request and `hasCrm` to decide what to **tell** the reader.

**Why the cards and the blocks cannot disagree.** `buildStages` receives `crmConnected: hasCrm` (`index.tsx:137`). Keying the journey stubs off data presence alone would give a configured client whose fetch rejected "Connect your CRM to see this" on the card while the block below said "Couldn't load contact data" — verbatim the defect `peecConnected` was added to fix. Only `connected === false` triggers the unconnected treatment (`demand-journey.tsx:128`), so a configured client with no data omits the flag and dashes instead.

### 1.3 What replaced the page-level window label

`index.tsx` printed one `Last 30 days` line above the entire page. None of the CRM data is on that window: the open tiles are as-of-today, Closed Won is year to date, the contact bars are year-to-date ISO weeks. The line moved inside the Web Analytics section, and each new block carries its own window label.

---

## 2. Verification method

Findings were probed, not read.

**Static anchors confirmed at the stated line** (`grep -n` against the branch, all matched): `kpi-card.tsx:61` / `:73` for the delta-before-comparisonExpected ordering; `pipeline.ts:194` for the `kpi(wonCur.amount, wonPrior?.amount)` construction; `pipeline.ts:109` for `pct()`'s non-positive-prior guard; `pipeline.ts:223` for the owner sort; `contacts.ts:99` for `gapFill` returning `[]`; `contacts.ts:153` for `previousWeek`'s `?? 0`; `contacts.ts:173` for `currentWeekPartial: true`; `demand-journey.tsx:128` for the `connected === false` branch.

**Logic executed in a throwaway probe spec** (written, run, deleted; not part of the diff):

1. **The -100 is real.** Called `transformPipeline([], [], priorRows, 'Closed Won')` — the exact call `getSalesforcePipelineImpl` makes when the closed-won fetch caught and degraded (`pipeline.ts:278`, `wonCurRows ?? []`). Result: `closedWon.value === 0`, `closedWon.delta === -100`. Confirmed.
2. **A renamed stage produces the same -100** with `wonUnavailable` false and `wonStageUnmatched` true. Confirmed — this is the fourth instance the design review's sweep caught, and it is reachable without any outage.
3. **The component cuts both.** Fed both real transform outputs straight into `PipelinePerformance` and asserted no `%` renders. Confirmed.
4. **`openWindow` spans 19 calendar years.** `openWindow(new Date('2026-08-25Z'))` returns `2017-01-01,2035-12-31`. Confirmed; the "18 years" in the earlier review was an undercount, already recorded in the spec's §8.
5. **The Sunday case** (finding 1). Called `transformWeeklyContacts` with `now` = Sunday 2026-08-23, then rendered. Confirmed both contradictory strings on screen.
6. **Owner ranking by count** (finding 2). Rendered two owners, one holding 10 deals worth $50k and one holding 3 worth $3M, and confirmed the smaller-dollar owner ranks first with no dollar figure anywhere in the list.

**Flagged rather than asserted (external trigger unverified):** finding 3 needs a client row with `salesforce_config` populated and the shared key present, which no environment has yet. Nothing in this review was verified against live Salesforce data or a running dev server.

**Gates:** full repo suite 838 passing across 109 files; `npx tsc --noEmit` clean; `npm run check:rsc` clean. CI on PR #220 green (`rsc-boundary`, `test`). `tsc` is not in CI, so it was run manually before every commit.

---

## 3. Findings

Sev: **●** correctness · **○** cleanup/convention. Status: CONFIRMED (proven in-tree) / PLAUSIBLE (code assumption confirmed, external trigger unverified).

| # | Sev | Status | Location | Finding |
|---|---|---|---|---|
| 1 | ○ | CONFIRMED | `contact-pacing.tsx:50`, `:103` | On Sundays the block renders "Partial week: 7 of 7 days." and "current week in progress: 7 of 7 days." Both read as self-contradictions, one day in seven. |
| 2 | ○ | CONFIRMED | `pipeline-performance.tsx:103-117` | The owner list ranks and scales by deal **count**; `OwnerRow.amount` is aggregated by Half A and never rendered. An owner holding 3 deals worth $3M sits below one holding 10 worth $50k, with nothing on screen revealing it. |
| 3 | ○ | PLAUSIBLE | `index.tsx:97-98` | Six new Supermetrics queries per uncached Executive Overview render, and `cache-warm` self-fetches this page per client per date range. Latent until a client is enabled. |
| 4 | ○ | CONFIRMED | `stages.ts:154`, `contact-pacing.tsx:50` | The inbound journey card's "3 of 7 days so far" and the block's "Partial week: 3 of 7 days." state the same fact twice on one screen in different words. |

No **●** correctness findings. The defect class this feature exists to prevent (a fabricated delta under a dashed value) is closed and pinned by test in four places.

---

## 4. Detail

### Finding 1 — the Sunday contradiction

**Mechanism.** `daysElapsedInIsoWeek` returns `day.getUTCDay() || 7` (`contacts.ts:62`), which is **7** on Sunday, the last day of an ISO week. `transformWeeklyContacts` sets `currentWeekPartial: true` unconditionally (`contacts.ts:173`). `ContactPacing` consumes both faithfully, so on Sunday the Current Week tile reads "Partial week: 7 of 7 days." and the chart caption reads "Final bar is the current week in progress: 7 of 7 days."

Strictly the week is still running (a contact created Sunday evening still lands in it), so no number is wrong. But "7 of 7" and "partial" contradict each other to a reader, and this is a client-facing page.

**Suggested fix.** Rendering-side, no Half A change: when `daysElapsedInCurrentWeek === 7`, say "Final day of the week in progress." instead of "N of 7 days." Leave the tile's own disclosure, or drop it on that day.

### Finding 2 — the owner list ranks by count, not dollars

**Mechanism.** `transformByOwner` sorts by `b.count - a.count` (`pipeline.ts:223`) and carries `amount` per owner. `PipelinePerformance` renders `o.owner`, a bar scaled `o.count / ownerMax`, and `fmtNum(o.count)`. `amount` is dropped.

The heading says "Open Deals by Owner", so counting deals is defensible and the label is not lying. The risk is the question CLAUDE.md's review process exists to prevent: a client asks "who is carrying the most pipeline?" and reads this chart as the answer, when it answers a different question. This is exactly the "Tina asked how AIVX was ranked" shape.

**Suggested fix.** Cheapest honest option: render the dollar amount alongside the count, as the tile row already has space for it. Better: a decision on which the chart should rank by, since the data supports either. Worth a product call rather than a unilateral change.

### Finding 3 — cold-render and cache-warm cost

**Mechanism.** `index.tsx` appends two entries to the existing `Promise.allSettled`, and those two fetchers issue six Supermetrics queries between them (four in `pipeline.ts:247`, two in `contacts.ts:197`). Both are wrapped in `cached()` with the 1-hour default TTL, so steady-state cost is low, but every cold render pays all six on top of the page's ten GA4 queries and one Peec query.

`app/api/cache-warm/route.ts:110-116` self-fetches every enabled report per client per date range, so warming this page now carries that cost too. Cron fan-out has already caused Function CPU and Neon spikes once, bounded in PR #202 via `mapWithConcurrency`.

`canFetch` gates the queries, so today this costs nothing: no environment has a client with `salesforce_config` set. It becomes real at enablement, which is why it is PLAUSIBLE rather than CONFIRMED.

**Suggested fix.** Nothing now. Watch Function duration on the first environment where a client is enabled, before enabling a second.

### Finding 4 — duplicated partial-week copy

**Mechanism.** `stages.ts:154` sets the inbound card's `subMetric` to `` `${contacts.daysElapsedInCurrentWeek} of 7 days so far` ``; `contact-pacing.tsx:50` sets the Current Week tile's `subValue` to `` `Partial week: ${daysElapsedInCurrentWeek} of 7 days.` ``. Both appear on one screen.

The card and the block are separate surfaces and the card's badge does need a window, so this is not obviously wrong. Recording it so the duplication is a choice rather than an accident.

**Suggested fix.** None required. If it reads as noise in QA, drop the card's `subMetric` and let the `WEEK TO DATE` badge carry the window.

### Decisions recorded, not findings

Three deliberate choices that look like defects until you know why:

- **`wonStageUnmatched` dashes the value but keeps the "— vs same period last year" placeholder** (`pipeline-performance.tsx:40`). A comparison was genuinely expected and merely cannot arrive, which is what `comparisonExpected` means. The placeholder comes off only under `wonUnavailable`, where the tile could not be loaded at all and promises nothing. Spec §3.3 and §4.2 were reconciled to this treatment.
- **`weeks.length < 2`, not `currentWeekPartial`, is the no-completed-week discriminant** (`contact-pacing.tsx:35`). `currentWeekPartial` is set `true` unconditionally (`contacts.ts:173`) and cannot discriminate anything. The derivation rests on `gapFill`'s contract: a contiguous run of ISO weeks ending at the current one, so fewer than two elements means no completed week and `previousWeek`'s `0` is the `?? 0` at `contacts.ts:153` rather than a count.
- **The two blocks fail differently on one outage.** `getSalesforceWeeklyContactsImpl` leaves its primary query uncaught (`contacts.ts:197`), so a failure rejects and the whole Contact Creation block becomes `LoadFailed`. `getSalesforcePipelineImpl` catches all four of its queries (`pipeline.ts:247-277`) and always resolves, so Pipeline Performance renders fully with its flags set and caveats showing. That asymmetry is correct — pipeline degrades per query, so partial data is worth showing — but it means one Salesforce outage presents two different ways on one screen. Do not "fix" it into symmetry without deciding that deliberately.

---

## 5. Follow-ups

Not applied in this PR.

**Correctness** — none. No finding blocks the ship.

**Decide together (highest value here)**
- Finding 2, the owner list's ranking basis. The only item that could produce a wrong answer to a client question, and the data already supports either choice. Worth settling before this reaches stakeholder QA.

**Cleanup**
- Finding 1, the Sunday copy. Small, self-contained, rendering-side only.
- Finding 4, the duplicated partial-week line. Cosmetic; defer until QA says whether it reads as noise.

**Needs a live environment first**
- Finding 3, cold-render and warm-cron cost. Cannot be measured until a client is enabled.
- **Enablement itself**, which blocks anything being visible at all: the per-environment `UPDATE clients SET salesforce_config = ...`. Migration 0021 is already applied and verified on dev (2026-08-21); staging and production still need it, run via `DATABASE_URL_UNPOOLED='<target-direct-url>' npx tsx --env-file=.env.local scripts/migrate-http.ts`, never `npm run db:migrate`.
- **Live verification against a running dev server**, which needs the service cookie the crons mint and cannot be done from an agent session.

**Out of scope, named so nothing absorbs them quietly**
- The three auth/connections pages hardcoding `[PLATFORM_IDS.SALESFORCE]: false`.
- A `PipelineKpi` discriminant separating "no baseline available" from "not comparable". Spec §3.3 decided against it: no rendered surface needs the distinction today.
- Owner names being real people on a client-facing page. The existing HubSpot equivalent does the same; worth a product call, not a code change.
