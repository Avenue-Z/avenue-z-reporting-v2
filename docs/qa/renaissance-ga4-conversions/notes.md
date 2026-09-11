# Renaissance GA4 conversions fix — working notes

Not a review record. Scratch space for this fix; the actual review-record doc
(`docs/qa/ga4-conversion-definition-code-review.md`, per `CLAUDE.md`'s Stage-1
process) hasn't been opened yet — this isn't superseding it prematurely.

Source: `Renaissance Dashboard Turnover.md`, section 9, dated 2026-09-01.

## The problem

Every Conversions figure on the platform sums GA4's `conversions` metric with no
event filter — whatever the client's GA4 property has flagged as a "key event."
For Renaissance (property `310998391`), August 2026: dashboard shows 16,824
conversions / 29.58% conversion rate. The turnover doc's own reconciliation
called 81-82 of those "the actual lead events" — **that number turned out to be
an undercount by construction, not the ground truth; see "Ground truth,
corrected" below.** Visible in 4 places on the Executive Overview
(`executive-overview/index.tsx:27,99,169`, `stages.ts:180`), which is the only
Renaissance-enabled report that shows it.

## Event inventory (Supermetrics GAWA, account 310998391, last 90 days, pulled 2026-09-08)

Flagged as GA4 key event today (`isConversionEvent = true`):

| Event | Count (90d) | In shipped allowlist |
|---|---|---|
| outbound_click | 45,388 | no — soft engagement, not a lead |
| pdf_view | 2,231 | no — soft engagement |
| contact_link_click | 1,029 | no — soft engagement |
| contact_individual_lead | 121 | yes |
| broker_group_lead | 36 | yes |
| contact_employee_lead | 36 | yes |
| contact_other_lead | 25 | yes — merged into `form_submission`, see Decisions |
| broker_individual_lead | 8 | yes |
| via_form | 7 | yes — merged into `form_submission` |
| contact_employer_lead | 6 | yes |
| employer_group_vision_lead | 6 | yes |
| contact_broker_lead | 4 | yes |
| whitelabel_form | 3 | yes — merged into `form_submission` |

NOT flagged as key event today (real leads per the turnover doc's own finding
(b), invisible to the dashboard until this fix — all included in the shipped
allowlist):

| Event | Count (90d) |
|---|---|
| contact_provider_lead | 34 |
| employer_group_dental_lead | 10 |
| employer_group_disability_lead | 10 |
| employer_group_supplemental_lead | 8 |
| employer_group_accident_lead | 7 |
| employer_group_pfml_lead | 5 |
| employer_group_life_lead | 1 |

Plus standard noise, all unflagged: `page_view`, `session_start`, `first_visit`,
`user_engagement`, `scroll`, `video_*`, `view_search_results`, `feedback_submit`.

Re-pull anytime: `data_query(ds_id="GAWA", ds_accounts="310998391",
fields="eventName,isConversionEvent,eventCount", date_range_type="last_90_days")`
via the Supermetrics connector.

## Ground truth, corrected (2026-09-11, PR `#235` review)

Thomas's review on PR `#235` checked whether the shipped 15-row allowlist
reconciles to the 81-82 figure above and found it doesn't: the same allowlist
summed over the full 90-day window is 327 events (~112.6/31-day-month), about
37% above 81-82. Flagged as blocking, correctly — a number that's wrong by 37%
still spends the credibility this fix exists to restore, even if it's nowhere
near the original 205x error.

Verified directly against August 2026 (a closed month) via Supermetrics:

```
data_query(ds_id="GAWA", ds_accounts="310998391", fields="eventName,eventCount",
           date_range_type="custom", start_date="2026-08-01", end_date="2026-08-31")
```

Per-event August 2026 count, every row in the shipped allowlist (so this is
checkable against a fresh pull, not a bare assertion):

| Event | August count | Group |
|---|---:|---|
| contact_individual_lead | 38 | flagged |
| broker_group_lead | 11 | flagged |
| contact_employee_lead | 10 | flagged |
| broker_individual_lead | 5 | flagged |
| contact_employer_lead | 1 | flagged |
| employer_group_vision_lead | 2 | flagged |
| contact_broker_lead | 2 | flagged |
| contact_other_lead | 12 | → `form_submission` |
| whitelabel_form | 1 | → `form_submission` |
| via_form | 0 | → `form_submission` |
| contact_provider_lead | 14 | unflagged |
| employer_group_dental_lead | 3 | unflagged |
| employer_group_disability_lead | 3 | unflagged |
| employer_group_supplemental_lead | 1 | unflagged |
| employer_group_accident_lead | 3 | unflagged |
| employer_group_pfml_lead | 1 | unflagged |
| employer_group_life_lead | 0 | unflagged |
| **Total** | **107** | |

Grouped: flagged (69) + `form_submission` (13) = **82** — matching the turnover
doc's own "81 (or 82 if `whitelabel_form` counts)" exactly, since `whitelabel_form`
and `contact_other_lead` were already counted inside that 82. Plus unflagged (25)
= **107**.

**The shipped allowlist sums to exactly 107 for August 2026 — not 81-82, and
not the 90-day-derived ~112.6/month estimate either.** Both are close for a
real, mundane reason: `via_form` (7 over 90 days, 0 in August specifically)
accounts for roughly 2.4 of the ~5.6 gap between August and the 90-day
pro-rated figure (7/90 × 31); the rest is ordinary month-to-month variance in
the other 16 events, not something `via_form` alone explains.

The reconciliation: 81-82 was never a complete count of real leads. It came
from the turnover doc's `conversions`/`keyEvents`-metric analysis, and that
metric returns 0 for any event GA4 hasn't already flagged as a key event —
structurally, by how the API works, not as an approximation. The turnover
doc's own finding (b) already named the consequence: **7 event types**
(`contact_provider_lead` + 6 `employer_group_*` events, including
`employer_group_life_lead`) **are real leads sitting outside that flag,
invisible to any query built on `keyEvents`/`conversions`.** 81-82 excluded
those 7 event types by construction — the "unflagged" rows in the table above,
summing to exactly 25 for August. 82 + 25 = 107, exactly, not approximately.

So: the shipped allowlist is correct, and 81-82 was the number to correct, not
the allowlist. This is turnover doc step 9.4 step 6 ("verify against a closed
month, reconciled exactly") — now actually done, with a real number, rather
than left unmarked as this doc originally had it.

## Decisions

**2026-09-10 (Nick):** `via_form`, `contact_other_lead`, and `whitelabel_form` are
combined into one synthetic line item, `form_submission` (35 events/90d combined:
7 + 25 + 3), rather than kept as three separately-tracked leads. This is an
internal working decision, not a confirmation from Renaissance or their GTM
owner — turnover doc step 9.4.3's client reconciliation for these three specific
events is being skipped for now, not completed. Revisit if the client later says
these are meaningfully different (e.g. different lead quality/source).

**Correction (2026-09-11, PR `#235` review):** as first implemented, this
decision was cosmetic only — `Ga4LeadEvent` carried a `category` field and the
merge was framed as "one row instead of three, for display grouping," but
`sumLeadEventConversions` sums `eventCount` over every row the query returns
and never reads `name` or `category` at all. So whether these three were one
row or three was inert at runtime; the number on the tile is identical either
way. `category` has been dropped from `Ga4LeadEvent` entirely (see
`lib/db/schema.ts`) since nothing reads it, and this decision is now correctly
understood as what it actually controls: **whether `via_form`, `whitelabel_form`,
and `contact_other_lead` count as real leads at all** (they're in the
allowlist's flattened `sourceEvents` union either way), not how they're
grouped for display. That's the version of this decision worth taking to
Renaissance's GTM owner — not the grouping, which no longer exists as a
concept in the implementation.

Schema shape: `leadEvents: [{ name, sourceEvents }]`, `sourceEvents` always an
array even for the common one-event case, so merged and unmerged rows need no
special-casing in query-building code — e.g. `{ name: "contact_individual_lead",
sourceEvents: ["contact_individual_lead"] }` alongside `{ name: "form_submission",
sourceEvents: ["via_form", "whitelabel_form", "contact_other_lead"] }`.

## Open questions — need Renaissance / their GTM owner (turnover doc step 9.4.3)

- `employer_*` (Google Ads action names, account 4136001852) vs `employer_group_*`
  (GA4 event names) — live `paid_search_config.leadActions` only has 3 employer
  entries (`dental`, `accident`, `vision`), all mismatched by the `_group_` infix.
  `employer_group_life_lead` fired once in the 90-day window with no corresponding
  Google Ads action at all — confirm whether that's expected.
- Whether `via_form` / `whitelabel_form` / `contact_other_lead` are genuinely one
  kind of lead or three (see Decisions above) — this now controls allowlist
  membership, not just display grouping, so it's a real question, not a nice-to-have.

## Implementation status (2026-09-11)

On `feat/renaissance-ga4-conversions`, PR `#235` (opened against `dev`, reviewed
by Thomas and Paul). Scoped to exactly what was asked: the Executive
Overview's Conversions/Conversion Rate KPI cards and the same numbers on the
Web Analytics journey-stage card (deliberately kept in sync — leaving one
fixed and one stale would show two different conversion rates on one page).
**Explicitly not touched, and stated as such rather than silently left:** the
Channel Tabs chart's per-channel "By Conversion" ranking still reads raw
`sessionConversionRate` per channel — it needs per-channel event filtering, a
separate, harder problem. `ga4/index.tsx`, `demand-overview`, `exec-summary`
(the turnover doc's other 3 call sites) also untouched — none are enabled for
Renaissance today, but `ga4Config` is consumed only by `executive-overview`.
**This is a stated decision, not an oversight found afterward:** if Renaissance
ever gets the standalone `ga4` report enabled, its Web Analytics page would
show the raw ~16,824-scale number for the same month the Executive Overview
shows ~107, since neither `ga4Config` nor the filtered query is wired into
that file. Flag this before enabling `ga4` for Renaissance, not after Tina
notices two different numbers for what looks like the same metric.

Separate decision, bundled in the same PR but split into its own commit/
migration/config script so it's independently revertable: `hidden_journey_stages`
(new `clients` column, `text[]`, Renaissance-only) drops Inbound Funnel and
Pipeline from the top journey row, pending those being fixed separately.
Constrained to removing only a *trailing* run of the fixed stage order — a
review finding caught that hiding a middle stage would leave a connector
arrow's text describing a stage that's no longer next; `stages.ts` validates
this and ignores an invalid value rather than risk a mislabeled arrow.

### Review findings from Paul and Thomas (PR `#235`), and what changed

All four blocking findings, fixed:

1. **Conversion Rate regressed for every unconfigured client** (`index.tsx`,
   `stages.ts`) — the original ternary gated on `conversions != null`, which
   the raw-totals fallback always satisfies, so it silently took the
   filtered-rate branch for avenue-z and begin-health too, not just
   Renaissance. Rebuilt as an explicit three-state read on `trueConversions`
   itself (`undefined` = unconfigured, `null` = configured-but-failed, a
   number = real value) instead of inferring state from `conversions`.
2. **A failed lead-event fetch rendered a confident 0** — `sumLeadEventConversions`
   now returns `null` (not 0) for null/undefined input, so a fetch failure is
   distinguishable from a genuine zero-leads period and renders a dash,
   matching the existing `trendFailed`/`audienceFailed`/`channelFailed` pattern
   rather than inventing a new one.
3. **A malformed `ga4_config` row took the whole page down** — `leadEventFilter`
   was called synchronously while building the `Promise.allSettled` array, so
   a throw there escaped the settled-promise net entirely. `lib/ga4/lead-events.ts`
   is now defensive against missing/malformed `leadEvents`/`sourceEvents`, and
   `index.tsx` gates on a new `hasLeadEvents()` check (an empty allowlist is
   treated as unconfigured, not as "configured with nothing," since GA4's
   `inListFilter` rejects an empty `values` array outright).
4. **The shipped allowlist didn't reconcile to the doc's own 81-82** — see
   "Ground truth, corrected" above. Root cause was the framing of 81-82, not
   the allowlist; fixed by re-deriving and documenting the real number (107,
   verified live against August).

Also addressed, not blocking but real:

- Widening the shared `LeadCategory` union (for GA4's `form` category) broke
  an unchecked exhaustiveness assumption in the Paid Search leads report.
  Reverted — `Ga4LeadEvent` no longer carries `category` at all, since nothing
  read it (see Decisions).
- `getClientBySlug` and `getAllClients` (`lib/db/queries.ts`) cache
  `clients` rows and hadn't had their cache `version` bumped despite the row
  shape changing (two new columns) — bumped to `v2`.
- No test coverage on `lib/ga4/lead-events.ts`, and `vitest.config.ts` pins
  `lib/ga4/*.test.ts` files individually rather than via glob, so a new test
  file wouldn't have run without a config change either. Added
  `lib/ga4/lead-events.test.ts` (covering exactly the failure modes above —
  null-vs-zero, malformed config, de-duplication) and added it to the include
  list.
- Renaissance's config was originally set with a raw hand-typed SQL `UPDATE`.
  Replaced with `scripts/set-renaissance-ga4-config.ts` and
  `scripts/hide-renaissance-pipeline-stages.ts` (idempotent, committed,
  reviewable — same pattern as `scripts/set-renaissance-campaign-scope.ts`),
  kept as two scripts matching the two-commit split.
- `MIGRATIONS-PENDING.md` now has a `0022` section (staging and production are
  both behind this migration — and production is behind `0021` too, a
  pre-existing gap this PR didn't create but that blocks it from reaching
  production regardless).
- Journey-stage hiding was validated to only accept a trailing suffix of the
  fixed stage order (`aeo, ga4, inbound, pipeline`), so a future config that
  hides a non-trailing stage can't mislabel a connector arrow.
- The Conversion Rate tooltip claimed "percentage of sessions," which isn't
  what the query computes (event count over sessions — a session with two
  lead events counts twice, and the value can exceed 100%). Relabeled honestly
  instead of rebuilding the query to be truly session-scoped, which is a
  separate, larger change; the doc's original step 4 ("decide the
  conversion-rate denominator explicitly") is still genuinely open as a
  product question, this just stopped the tooltip lying about which one was
  chosen.

Also addressed, partially: the two features were originally one commit and
one migration (a process finding — Avenue Z's multi-feature convention wants
these independently revertable). The **migration** is now genuinely split —
`0022_military_the_santerians` for `ga4_config`, `0023_clever_nightcrawler`
for `hidden_journey_stages`, regenerated via `drizzle-kit generate` rather
than hand-split, then reapplied to dev (the original combined `0022` never
reached staging or production, so this was safe to redo) — and there are two
config scripts, one per feature. The **commit history** is not split: the
original commit (`5661054`) already has review comments anchored to it, and
splitting it means rewriting pushed history the reviewers have already
commented on, which needs an explicit ask, not an assumption. This round of
fixes lands as one new commit on top instead. Flagged here rather than
silently left as if fully resolved.

### Round three (2026-09-11) — both reviewers re-reviewed `0f02af2` and confirmed all four round-one blockers hold, then found two new blocking gaps in the fix itself plus several real smaller issues

Both blocking:

1. **Neither of the two round-one fixes had a pinning test.** Reverting
   `stages.ts`'s conversion-rate gate, or `index.tsx`'s `hasLeadEvents(raw) ?
   raw : null` gate, back to the exact original bugs left the full 1015-test
   suite green — the bug that already shipped once could ship again silently.
   Root cause: the module-level `stages.test.ts` fixture
   (`sessions: 89234, conversions: 1847, sessionConversionRate: 0.021`)
   formats identically on both the buggy and fixed code paths
   (`1847/89234 = "2.1%"`, and `0.021` also formats to `"2.1%"`), so no
   existing assertion could distinguish them. Added a `stages.test.ts` block
   with a fixture where the two numbers genuinely differ
   (`sessions: 1000, conversions: 300, sessionConversionRate: 0.05`), pinning
   all three `trueConversions` states, plus an `index.test.tsx` block that
   renders the full RSC through the `ga4Config` gate and asserts which query
   fires and which number lands on the page. Both self-verified the way the
   reviewers did: reverted each fix, confirmed the new tests fail, restored
   the fix, confirmed green.
2. **`leadEventNames` guarded against null/undefined but not against a
   present, wrongly-typed `leadEvents` or `sourceEvents`** (a string, a
   number, a bare object) — `{"leadEvents": "oops"}` in the jsonb column
   still threw and took the whole page down, one line later than round one's
   version of the same bug. Switched from `?? []` to `Array.isArray(...) ?
   ... : []` at both levels, and now also drops any non-string or blank
   source-event name before it reaches the GA4 filter. Test file extended to
   cover the wrongly-typed cases explicitly, matching what the test's own
   name already claimed.

Also fixed:

- **Ground truth table.** Pasted the actual per-event August 2026 breakdown
  (not just the assertion) into the section above, so 107 is checkable
  against a fresh pull rather than taken on faith. Fixed three smaller
  issues in the prose: said "6 event types" where the table above it already
  said 7; used "81-82 + 25 = 107" as if it worked for either endpoint when
  only 82 actually reconciles (69 flagged + 13 `form_submission` = 82,
  matching the turnover doc's own "82 if `whitelabel_form` counts" exactly);
  and overstated what `via_form` explains about the August-vs-90-day-average
  gap (accounts for less than half of it, the rest is ordinary variance).
- **`isTrailingSuffix` had two edge cases that fell through the size check**:
  a duplicate entry (`['pipeline','pipeline']`) failed the length-vs-set-size
  comparison and silently un-hid everything; hiding all four stages was
  accepted and rendered an empty bordered card. Both fixed (dedupe via the
  Set itself; reject hiding every stage). Added a `console.warn` on any
  rejected config, so a typo like `['pipelien']` is greppable instead of a
  silent no-op. New `stages.test.ts` coverage for all of `STAGE_ORDER`/
  `isTrailingSuffix`/the warn path, which had none before this round.
- **`scripts/set-renaissance-ga4-config.ts` overwrote `ga4Config` instead of
  merging** — inert today since `Ga4Config` has exactly one key, but the
  precedent script (`set-renaissance-campaign-scope.ts`) merges for exactly
  the reason a second key might get added later and silently erased. Fixed
  to spread the existing config first.
- **`MIGRATIONS-PENDING.md`'s own entry recommended the migrator it bans one
  paragraph earlier** (`npm run db:migrate:staging` internally runs
  `drizzle-kit migrate`, the timestamp-gated one) — switched to
  `migrate-http.ts` for staging too, consistent with `0021`'s precedent.
  Also documents: `.env.staging` needs `DATABASE_URL_UNPOOLED`; dev carries
  an orphan ledger row from the pre-split combined migration (harmless,
  self-heals); the "safe because it never reached staging/prod" justification
  for the migration renumbering didn't cover preview branches or other
  local databases (still safe, `migrate-http.ts` self-heals via its
  already-exists handling, but the claim as originally written was narrower
  than the actual safety argument); and, the significant one — **production's
  ledger tip is `0019`, not `0021`**, so it needs `0020` (which creates the
  `top_content_snapshots` table plus a foreign key) before either `0021`,
  `0022`, or `0023` can apply. Materially bigger than "two additive columns"
  and now stated explicitly rather than left for whoever schedules the prod
  apply to discover.
- Cross-page divergence (`ga4Config` only wired into `executive-overview`,
  not the standalone `ga4` report) — added an explicit note above rather than
  leaving it implicit, per the review.
- Commit-history split: Thomas's second pass said not to bother — the actual
  goal (independent revertability) is already delivered at the database
  level via the `0022`/`0023` split, and rewriting history the round-one
  comments are anchored to is a cost with no matching benefit. Leaving as is,
  now with explicit agreement rather than just a unilateral call.

The nine bare `#235` references (`notes.md`, `MIGRATIONS-PENDING.md`,
`lib/db/queries.ts`, `lib/db/schema.ts`) are now wrapped in backticks so
GitHub doesn't autolink them. Not done this round: the escalating em-dash
count across `notes.md` and `MIGRATIONS-PENDING.md` — cosmetic, and pushed
down in priority behind the two blocking items and the data/process fixes
above.

`npx tsc --noEmit`, `npm test` (full suite, now with the new pinning tests),
and `npm run check:rsc` all clean after round three. Verified live on a
Vercel Preview deployment — Nick confirmed the Conversions/Conversion Rate
numbers and the journey-row change before the review round; not yet
re-verified live against the round-three build.

## Planned implementation (turnover doc 9.4 steps 4-7)

1. ~~Decide final allowlist~~ — done, including the corrected ground-truth
   reconciliation above. The `employer_`/`employer_group_` naming question and
   the `form_submission` merge question are both still genuinely open with the
   client (see Open questions), but don't block what's shipped.
2. ~~Schema~~ — done, `clients.ga4_config = { leadEvents: [{ name, sourceEvents }] }`.
3. ~~Code~~ — done for the Executive Overview KPI cards + journey card.
   Channel Tabs "By Conversion" intentionally not done (see Implementation
   status).
4. Decide the conversion-rate denominator properly (sessions-that-fired-an-
   allowlisted-event, vs. relabeling as "leads per session" permanently) — the
   tooltip fix above is a stopgap, not a resolution.
5. ~~Cache versioning~~ — not needed for `ga4Query` itself (new call shapes get
   fresh cache keys automatically); was needed and is now done for
   `getClientBySlug`/`getAllClients`, which DO reuse the same key across this
   deploy.
6. ~~Verify against a closed month, reconciled exactly~~ — done, see Ground
   truth above.
7. Real review record + normal branch-flow gates before this goes anywhere
   near `staging` — flag Tina before it lands there, since it moves numbers on
   4 pages at once.
