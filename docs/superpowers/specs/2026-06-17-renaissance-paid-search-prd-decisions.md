# Renaissance Paid Search — PRD Conflict Decision Log

**Date:** 2026-06-17
**Acting product sign-off:** Paul Ramirez (for the build; to be reviewed with Amir as PRD owner)
**Related:** `2026-06-17-renaissance-paid-search-design.md`, `renaissance_dashboard_additions_prd.md`

## Purpose

During design validation we queried the live Renaissance Google Ads account
(`4136001852`) and found two places where the approved PRD conflicts with what
the data supports. Paul approved resolutions so the build is not blocked. This
log records each conflict, the evidence, the decision, the rationale, and the
alternative — so the decisions can be reviewed with Amir (PRD owner) and
reverted cleanly if product disagrees.

---

## C1 — Per-category CPL (Employer vs Broker vs Contact)

- **PRD reference:** §139 (required: "a CPL comparison by lead category for
  Employer vs Broker vs Contact"). It sits inside the "most important section."
- **Conflict:** Google Ads attributes **Cost at the campaign/keyword level, not
  per conversion action**. There is no cost-per-conversion-action dimension, so
  cost cannot be split by lead category directly.
- **Evidence (YTD, account 4136001852):** A campaign × conversion-action
  cross-tab shows lead categories do **not** map to campaigns. The largest lead
  driver, `REN | AVZ | SEM | Brand | All Users | Select Geos`, generates leads of
  **every** category at once (employer, broker, contact); the "Brokers" campaign
  also produces a mix. So there is no campaign→category boundary to attribute
  cost across.
- **Decision (approved, Paul, 2026-06-17):** Do **not** build per-category CPL.
  Instead ship:
  - Leads by category — counts, subtotals, and **share-of-leads** (accurate).
  - Page-level blended **Cost/Lead** KPI (accurate).
  - **Campaign-level CPL** in the campaign table (accurate — both cost and leads
    exist per campaign; e.g. Brokers ≈ $802/lead vs Brand ≈ $91/lead YTD).
- **Rationale:** Campaign-level CPL is honest and arguably more actionable than
  category CPL; it avoids fabricated precision.
- **Alternative considered (rejected):** Distribute total cost across categories
  proportionally to each category's lead share. Rejected because it is
  mathematically identical to blended CPL for every category — fake precision
  that would mislead the client.
- **To revert:** If product insists on category CPL, the only defensible source
  would be a confirmed campaign→category mapping (requires Renaissance to
  restructure campaigns so each maps to one category). Not currently true.

---

## C2 — Headline "Leads" definition / "all conversions are form-fills"

- **PRD references:** §125 ("**All** conversions are form-fill lead submissions
  tracked through GTM container GTM-MBF9FP6"); §133 ("The headline Leads metric
  is the sum of **all 14**.").
- **Conflict:** §125's assumption is factually wrong against live data. The
  account carries non-form-fill conversions in addition to the 14 form-fill
  actions.
- **Evidence (YTD, account 4136001852):** Alongside the form-fill actions
  (category "Submit lead form"), the account reports `Calls from ads` (category
  "Phone call lead", 13 YTD) and `Local actions - Directions` (category "Get
  directions", 3 YTD). The raw `Conversions` metric includes these.
- **Decision (approved, Paul, 2026-06-17):** Headline **Leads = sum of the 14
  configured form-fill actions only** (category "Submit lead form"), excluding
  calls and directions. `Cost/Lead` and `Conversion Rate` use this scoped number.
- **Note on §133 (no conflict):** Scoping to the 14 form-fill actions **is** the
  PRD's "sum of all 14" — the 14 actions are the form fills. This decision is
  faithful to §133; it only corrects §125's claim that those are the account's
  *only* conversions.
- **Rationale:** Using raw `Conversions` as "Leads" would over-count by ~16 YTD
  and break reconciliation between the headline KPI and the lead breakdown.
- **Alternative considered (rejected):** Count all conversions (incl. calls +
  directions) as "Leads" per a literal read of §125. Rejected — it misrepresents
  lead volume on the client's most important metric.
- **To revert:** If product wants calls/directions counted, change the scope of
  the Leads aggregation in `PaidSearchConfig.leadActions` (or add a flag). Cheap
  to change; the categorization layer already isolates this.

---

## Talking points for the Amir review

1. C1: Are Renaissance campaigns ever going to be restructured so each maps to a
   single audience category? If not, category CPL stays off the table.
2. C2: Confirm the headline Leads number should exclude phone-call and
   directions conversions (we believe yes; client-facing "leads" = form fills).
3. Confirm the authoritative 14-action → Employer/Broker/Contact map (also a
   blocking dependency for acceptance — see design spec §9).
