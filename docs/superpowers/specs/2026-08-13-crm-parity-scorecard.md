# CRM parity scorecard: HubSpot on Avenue Z vs Salesforce for Renaissance

**Purpose.** Every number on Avenue Z's two CRM sections, with what produces it in HubSpot and what would produce it in Salesforce for Renaissance. This is the input to the second PR.

**Standing note from Nick:** parity does not have to be exact. Where a metric has no clean Salesforce equivalent, we render what we do have and flag the gap internally rather than forcing a match.

**Renaissance connection, confirmed by read-only probe:**

| | |
|---|---|
| Supermetrics data source | `SF` |
| Account | `00D15000000Em4GEAS`, "Renaissance Life and Health" |
| Salesforce connections visible to our key | exactly one, Renaissance's |
| Field catalog | 727 fields across 18 report types |

Account resolution must always pin that ID. `list.all_accounts` is never used.

---

## Legend

| Mark | Meaning |
|---|---|
| **Clean** | Direct equivalent, same meaning |
| **Close** | Equivalent exists, definition differs in a way worth knowing |
| **Gap** | No equivalent found. Needs a decision |

---

## Pipeline Performance

Avenue Z pulls every deal in one HubSpot pipeline and does all filtering in the component.

| On the dashboard | HubSpot today | Salesforce field | Verdict |
|---|---|---|---|
| Open Deals | count of deals whose stage is not in a 3-id exclusion set, closing this calendar year | `opportunity_stage_name` + `opportunity_close_date` | **Close.** Salesforce exposes `opportunity_is_won` and stage names rather than opaque stage IDs, which is more portable |
| Total Pipeline | sum of `amount` over that same set | `opportunity_amount` | **Clean** |
| Closed Won | sum of `amount` where stage ID equals one specific value | `opportunity_stage_name` filtered to the `Closed Won` literal, never `opportunity_is_won` | **Close.** Salesforce's won flag looks like the cleaner filter but is not: it also covers roughly 1,822 renewals carrying $0. The stage literal is the correct filter, same shape as HubSpot's hardcoded stage ID |
| Weighted Pipeline | sum of `amount × hs_deal_stage_probability` | `opportunity_amount × opportunity_probability` | **Close. See the scale warning below** |
| Open Deals by Lead Source | groups by custom property `deal_source_1`, raw value as the bucket | `opportunity_lead_source` | **Gap.** The field exists but is blank on 99.99 percent of Renaissance's records. Replaced by the by-owner breakdown instead |

### The one that will bite

**Probability scale.** HubSpot returns `hs_deal_stage_probability` as a decimal between 0 and 1, and the code multiplies directly. Salesforce's `opportunity_probability` is labelled "Probability (%)", so it looked like it would be 0 to 100 but needed confirming before anything was built on it.

Porting the formula unchanged would have made Weighted Pipeline come out **100 times too large**: a plausible-looking number, wrong by two orders of magnitude, the worst kind of wrong. **Resolved:** confirmed 0 to 100 against live data (see Open questions below). The code divides by 100 before weighting, and a test pins it.

### Also worth noting

Avenue Z's version hardcodes a pipeline ID, ten stage IDs and a portal ID in shared library code. That is the entire reason those sections cannot serve a second client. The Salesforce work must not repeat it: the account ID goes in the client's database row, following the Meta and LinkedIn pattern already in place.

---

## Contact Creation

| On the dashboard | HubSpot today | Salesforce field | Verdict |
|---|---|---|---|
| Weekly contact pacing | contacts created this week, bucketed Mon to Fri | `contact_created_date` or `lead_created_date` | **Clean.** Pacing arithmetic is ours and carries over unchanged |
| Prior week, prior year week, quarter average | same source, different windows | same | **Clean** |
| Online contacts only | filters out `hs_analytics_source = OFFLINE` | no direct equivalent found | **Gap.** Needs either a Salesforce lead-source convention or dropping the online/offline split |
| **ICP / MCP classification** | custom contact property `profile`, substring match on "ICP" and "MCP" | **nothing found.** Nearest is `account_rating` | **Gap. Biggest one on the page** |
| Form Performance table | attributes by `hs_analytics_first_form_name` | no form-name field found in the catalog | **Gap** |
| Top Forms by Lead Quality | same source, ranked by ICP rate | depends on both gaps above | **Gap** |

### What the ICP/MCP gap actually means

ICP and MCP drive the colour of every bar in the pacing chart, both form tables, and the lead-quality ranking. Without an equivalent, roughly half of Contact Creation has no way to render as designed.

Three options, and this is a business decision rather than a technical one:

1. Renaissance has a custom Salesforce field serving this purpose that is not surfaced in Supermetrics' standard catalog. Worth asking before assuming.
2. `account_rating` is repurposed, if their team populates it meaningfully.
3. The section ships without the quality split: contact volume and pacing only, no ICP/MCP colouring. Still useful, visibly simpler than Avenue Z's.

---

## Summary

| Section | Clean | Close | Gap |
|---|---|---|---|
| Pipeline Performance | 1 | 3 | 1 |
| Contact Creation | 2 | 0 | 4 |

**Pipeline Performance is buildable now.** Four of the five rows have a working Salesforce equivalent; the one gap, Lead Source, is covered by substituting the by-owner breakdown, which has a clean Salesforce field of its own.

**Contact Creation is half buildable.** Volume and pacing work. Everything depending on lead quality or form attribution needs a decision first.

---

## Decisions taken during the build

### Year over year is suppressed on the three open-pipeline tiles. Reversible.

**Decided 2026-08-16. Applies to Open Deals, Total Pipeline, and Weighted Pipeline. Closed Won keeps its delta.**

Avenue Z shows a delta on all four tiles, labelled "vs 2025", so this is a deliberate divergence from the thing we are copying. The mechanism is not different: Avenue Z buckets deals by close-date year and treats "open deals with a 2025 close date, still open right now" as the prior-year figure. I do the same. The flaw is inherent to that approach and Avenue Z's code does not work around it either. Openness is evaluated as of now, so a window a year old has had a full year for its deals to close.

The difference is the data, not the design. Avenue Z's HubSpot carries stale 2025 deals still sitting open, so their comparison has a real baseline. Renaissance closes their deals, so the same window a year back holds exactly one still-open opportunity, a $0 Renewal Released.

What that means concretely, running Avenue Z's own logic unmodified against Renaissance:

| Tile | Avenue Z's logic on Renaissance data | What we ship |
|---|---|---|
| Open Deals | **+29,600%** | no delta |
| Total Pipeline | no delta (prior is $0, their zero guard fires) | no delta |
| Weighted Pipeline | no delta (prior is $0, their zero guard fires) | no delta |
| Closed Won | +15.7% | +15.7% |

So three of the four tiles already behave identically, because Avenue Z guards a zero baseline exactly the way we do. The divergence is one tile, Open Deals, and it exists only to stop an absurd number reaching a client.

**To reverse it:** the suppression lives in `transformPipeline` in `lib/salesforce/pipeline.ts`, where the three tiles call `kpiNoDelta` instead of `kpi`. Swap those three calls and the deltas come back. Tests pin the current behavior, so they will fail and need updating too, which is intentional: it should not be possible to flip this by accident.

**When reversing would make sense:** if Renaissance starts carrying meaningful open pipeline on prior-year close dates, or if we replace the proxy with a real point-in-time snapshot (which needs pipeline history we do not have today), or if Nick tells us the comparison is wanted regardless and a large percentage is acceptable in context.

### "Open Pipeline" means overdue deals, not forward-looking pipeline. Confirmed live.

**Confirmed 2026-08-16.**

The date range on the pipeline queries filters on close date, not on when a deal was created or entered a stage. I confirmed live that the Supermetrics connection cannot return deals with a future close date: extending the query window through 2027 returns zero additional deals, and a window that only covers future dates returns nothing at all. So the 297 open deals and roughly $18M in the current tiles are not forward-looking pipeline in the usual sense. They are deals that are past their close date and have not yet been closed out, i.e. overdue.

This is the same root cause as the delta-suppression decision above, not a separate issue. Comparing this year's overdue deals against last year's overdue deals is comparing two different kinds of thing: a fresh batch of deals that just became overdue versus a batch that has had a full extra year to get closed out. That mismatch is what produced the +29,600 percent figure on Open Deals before I suppressed the delta.

A question is out to the client contact about whether Renaissance needs genuine forward-looking pipeline (deals with a future close date, tracked as they move through stages). If they do, that is a different data path than what this build queries, since the current query structurally excludes future-dated deals. I am not building that here; this is a decision for Nick and the client contact, not a technical call.

---

## Open questions

1. Does Renaissance's Salesforce carry a lead-quality field equivalent to ICP/MCP? If yes, is it exposed through Supermetrics?
2. Is there form or campaign attribution on their contacts, or does that concept not exist for them?
3. ~~Is `opportunity_probability` 0 to 100?~~ **Answered: yes, 0 to 100.** Confirmed against live data. The code divides by 100 before weighting and a test pins it, so the 100x error is prevented.
4. Should Contact Creation ship reduced, showing volume and pacing only, or wait for the gaps to close?

## Technical notes for the build

Salesforce returns **records, not aggregates**. A simple query returned over a thousand rows. Totals are computed by us, the same way the HubSpot sections already work, but unlike every other Supermetrics source in this codebase. Row limits and pagination need attention.

Report type does not need to be passed. Supermetrics infers the object from the requested field names, so a query using `opportunity_*` fields resolves to Opportunities on its own. Mixing fields across objects in one query is untested and probably unsupported, so expect one query per section.
