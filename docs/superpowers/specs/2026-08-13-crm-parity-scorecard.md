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
| Closed Won | sum of `amount` where stage ID equals one specific value | `opportunity_amount_closed_won`, or `opportunity_is_won` as a filter | **Clean, and better.** Salesforce has a real won flag. HubSpot matches a hardcoded stage ID |
| Weighted Pipeline | sum of `amount × hs_deal_stage_probability` | `opportunity_amount × opportunity_probability` | **Close. See the scale warning below** |
| Open Deals by Lead Source | groups by custom property `deal_source_1`, raw value as the bucket | `opportunity_lead_source` | **Close.** Standard Salesforce field rather than a custom one. Bucket labels will differ from Avenue Z's |

### The one that will bite

**Probability scale.** HubSpot returns `hs_deal_stage_probability` as a decimal between 0 and 1, and the code multiplies directly. Salesforce's `opportunity_probability` is labelled "Probability (%)", so it is almost certainly 0 to 100.

Port the formula unchanged and Weighted Pipeline comes out **100 times too large**. It will look like a plausible number, just wrong by two orders of magnitude, which is the worst kind of wrong. Confirm the scale on a single record before trusting the tile.

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
| Pipeline Performance | 2 | 3 | 0 |
| Contact Creation | 2 | 0 | 4 |

**Pipeline Performance is buildable now.** Every tile has a Salesforce equivalent, and two are arguably better sourced than Avenue Z's because Salesforce exposes real flags where HubSpot relies on hardcoded IDs.

**Contact Creation is half buildable.** Volume and pacing work. Everything depending on lead quality or form attribution needs a decision first.

---

## Open questions

1. Does Renaissance's Salesforce carry a lead-quality field equivalent to ICP/MCP? If yes, is it exposed through Supermetrics?
2. Is there form or campaign attribution on their contacts, or does that concept not exist for them?
3. Is `opportunity_probability` 0 to 100? One record settles it and prevents a 100x error.
4. Should Contact Creation ship reduced, showing volume and pacing only, or wait for the gaps to close?

## Technical notes for the build

Salesforce returns **records, not aggregates**. A simple query returned over a thousand rows. Totals are computed by us, the same way the HubSpot sections already work, but unlike every other Supermetrics source in this codebase. Row limits and pagination need attention.

Report type does not need to be passed. Supermetrics infers the object from the requested field names, so a query using `opportunity_*` fields resolves to Opportunities on its own. Mixing fields across objects in one query is untested and probably unsupported, so expect one query per section.
