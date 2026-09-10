# Renaissance GA4 conversions fix — working notes

Not a review record. Scratch space for this fix while it's in progress; superseded
by `docs/qa/ga4-conversion-definition-code-review.md` once the change is ready to
go through the standard review-record process (see `CLAUDE.md`).

Source: `Renaissance Dashboard Turnover.md`, section 9, dated 2026-09-01.

## The problem

Every Conversions figure on the platform sums GA4's `conversions` metric with no
event filter — whatever the client's GA4 property has flagged as a "key event."
For Renaissance (property `310998391`), August 2026: dashboard shows 16,824
conversions / 29.58% conversion rate; real form-fill leads were 81-82. Visible in
4 places on the Executive Overview (`executive-overview/index.tsx:27,99,169`,
`stages.ts:180`), which is the only Renaissance-enabled report that shows it.

## Event inventory (Supermetrics GAWA, account 310998391, last 90 days, pulled 2026-09-08)

Flagged as GA4 key event today (`isConversionEvent = true`):

| Event | Count (90d) | Classification |
|---|---|---|
| outbound_click | 45,388 | soft engagement — not a lead |
| pdf_view | 2,231 | soft engagement |
| contact_link_click | 1,029 | soft engagement |
| contact_individual_lead | 121 | real lead |
| broker_group_lead | 36 | real lead |
| contact_employee_lead | 36 | real lead |
| contact_other_lead | 25 | → merged into `form_submission`, see Decisions |
| broker_individual_lead | 8 | real lead |
| via_form | 7 | → merged into `form_submission`, see Decisions |
| contact_employer_lead | 6 | real lead |
| employer_group_vision_lead | 6 | real lead |
| contact_broker_lead | 4 | real lead |
| whitelabel_form | 3 | → merged into `form_submission`, see Decisions |

NOT flagged as key event today (real leads, currently invisible to the dashboard):

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

## Decisions

**2026-09-10 (Nick):** `via_form`, `contact_other_lead`, and `whitelabel_form` are
combined into one synthetic line item, `form_submission` (35 events/90d combined:
7 + 25 + 3), rather than kept as three separately-categorized events. This is an
internal working decision, not a confirmation from Renaissance or their GTM
owner — turnover doc step 9.4.3's client reconciliation for these three specific
events is being skipped for now, not completed. Revisit if the client later says
these are meaningfully different (e.g. different lead quality/source).

Schema implication: `leadEvents` entries need a `sourceEvents: string[]` (not a
single `name`), so one allowlist row can map to N underlying GA4 event names,
summed. Keep this shape uniform for every entry (even single-event ones) rather
than special-casing merged vs. unmerged — e.g. `{ name: "contact_individual_lead",
category: "contact", sourceEvents: ["contact_individual_lead"] }` alongside
`{ name: "form_submission", category: "form", sourceEvents: ["via_form",
"whitelabel_form", "contact_other_lead"] }`.

## Open questions — need Renaissance / their GTM owner (turnover doc step 9.4.3)

- `employer_*` (Google Ads action names, account 4136001852) vs `employer_group_*`
  (GA4 event names) — live `paid_search_config.leadActions` only has 3 employer
  entries (`dental`, `accident`, `vision`), all mismatched by the `_group_` infix.
  `employer_group_life_lead` fired once in the 90-day window with no corresponding
  Google Ads action at all — confirm whether that's expected.

## Implementation status (2026-09-10)

Steps 1-3 below are done on `feat/renaissance-ga4-conversions`, scoped to
exactly what was asked: the Executive Overview KPI grid's Conversions /
Conversion Rate cards, and the same numbers surfaced on the Web Analytics
journey-stage card (kept in sync deliberately — leaving one fixed and one
stale would show two different conversion rates on one page). The Channel
Tabs chart's per-channel "By Conversion" ranking (doc's item #4, ranks
channels by `sessionConversionRate`) is **not touched** — that needs
per-channel event filtering, a separate, harder problem, not in scope here.
`ga4/index.tsx`, `demand-overview`, `exec-summary` (the doc's other 3 call
sites) also untouched — none are enabled for Renaissance.

Also done, a separate decision from the GA4 fix: `hidden_journey_stages`
(new `clients` column, `text[]`, Renaissance-only) drops Inbound Funnel and
Pipeline from the top journey row for Renaissance, pending those being fixed
separately. `stages.ts`'s `buildStages` filters on it; `DemandJourney`
needed no change — it derives connector-arrow placement from array position
(`isLast`), so a shorter stages array just renders cleanly with no dangling
arrow.

Files touched: `lib/db/schema.ts` (+`Ga4Config`/`Ga4LeadEvent` types, `form`
added to `LeadCategory`, `ga4Config` + `hiddenJourneyStages` columns),
`drizzle/0022_calm_silver_sable.sql` (generated via `drizzle-kit generate`,
purely additive, applied to dev), `lib/ga4/lead-events.ts` (new — pure
helpers: `leadEventNames`, `leadEventFilter`, `sumLeadEventConversions`),
`components/report-sections/executive-overview/stages.ts` (`trueConversions`
+ `hiddenStages` params), `components/report-sections/executive-overview/index.tsx`
(2 new `ga4Query` calls gated on `ga4Config`, wires `trueConversions`/rate
into both the KPI cards and `buildStages`). `lib/paid-search/leads.ts` and
its test needed a one-line fix for the new `LeadCategory` member.

`npx tsc --noEmit`, `npm test` (236 passed), and `npm run check:rsc` all
clean. Renaissance's `ga4_config.leadEvents` (15 rows, 4 categories,
`form_submission` merging `via_form`+`whitelabel_form`+`contact_other_lead`
per the Decisions above) and `hidden_journey_stages: [inbound, pipeline]`
are live on the dev DB. Not yet verified against the actual rendered page —
needs a real login (Nick's own Google OAuth), not something to script.

No cache-version bump: this doesn't change what any *existing* `ga4Query`
call shape returns, only adds new call shapes (different metrics/dimensions),
which get fresh cache keys automatically. The turnover doc's step 5 assumed
a shape change that this implementation doesn't actually make.

Not yet on any commit — still working tree changes on `feat/renaissance-ga4-conversions`.

## Planned implementation (turnover doc 9.4 steps 4-7, partially started)

1. ~~Decide final allowlist~~ — done for the form-event merge (see Decisions);
   the `employer_`/`employer_group_` naming question above is still open but
   doesn't block starting the schema/code work, since it only affects 3 rows in
   an allowlist arrays contains.
2. Schema: `clients.ga4_config = { leadEvents: [{ name, category, sourceEvents }] }`,
   per-client, loosely mirrors `clients.paid_search_config.leadActions` shape.
   Hand-written Drizzle migration.
3. Code: swap bare `conversions` metric for `eventCount` + `dimensionFilter`
   `inListFilter` on `eventName` (flattened across all `sourceEvents`), summed
   per `leadEvents` row, at the 5 call sites in section 9.1 of the turnover doc.
   Fall back to current behavior for clients with no `ga4_config`
   (avenue-z, begin-health) — must stay correct for them too.
4. Decide the conversion-rate denominator explicitly — `eventCount` is event-scoped,
   `sessionConversionRate` is session-scoped, this doesn't follow automatically.
5. Bump the GA4 cache version in `lib/cache.ts` — response shape changes.
6. Verify against a closed month, reconciled exactly.
7. Real review record + normal branch-flow gates before this goes anywhere near
   `staging` — flag Tina before it lands there, since it moves numbers on 4 pages
   at once.
