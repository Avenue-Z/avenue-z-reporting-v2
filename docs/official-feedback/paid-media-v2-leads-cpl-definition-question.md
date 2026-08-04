# Open Question for Dianna: how to define blended Leads and Cost per Lead on the Paid Media Overview

**Status:** open question, needs a decision before the Leads / Cost per Lead metrics can be built.
**Owner of the answer:** Dianna Gatto.
**Raised by:** Paul, 2026-08-04.
**Traces to:** "Decisions for Approval, Paid Media" tab, item 3, comment `[p]`; and the working-feedback spec, Blocker 1 (`docs/superpowers/specs/2026-07-31-paid-media-v2-working-feedback-spec.md`).

## Background, in plain terms

The Paid Media Overview shows a blended top line across the three paid channels
(Paid Search, Meta, LinkedIn). Spend and Clicks are built and working. The doc
also asks for two more headline numbers on that top line:

- **Leads** (blended across the paid channels)
- **Cost per Lead** (blended Spend divided by blended Leads)

The doc defines Cost per Lead as "spend across all platforms / hubspot leads
attributed to AVZ" (item 3, comment `[p]`).

## Why those two numbers are not built yet

Two separate problems, both real:

1. **The definition is missing.** The doc never says which HubSpot figure counts
   as "a lead attributed to AVZ." There are several different HubSpot counts in
   our system (created contacts in the range, contacts at lifecycle stage
   "lead", ICP contacts), and they do not agree with each other. We cannot build
   a number without knowing which one is meant.

2. **The HubSpot data is not obtainable right now.** No Paid Media client has
   HubSpot connected, and our HubSpot integration is currently wired
   specifically to Avenue Z's own account (a fixed pipeline, fixed audience
   buckets, fixed date windows). There is no general per-client "how many leads
   did this client get in this date range" path today. So even with a
   definition, there is no data to feed it for these clients.

## What we did in the meantime

Rather than ship two permanently blank tiles to a client, we **removed the Leads
and Cost per Lead tiles from the Overview**. The Overview now shows Spend and
Clicks, which are accurate today. Nothing about the rest of the tab changed.

Note: this does **not** affect the **Paid Search "Total Leads" / "Leads by
Action"** numbers. Those come from Google Ads conversion actions, not HubSpot,
and are unaffected and still shown.

## The proposal we would like a decision on (option 3)

Instead of waiting on HubSpot, define the Overview's blended **Leads** as the
sum of **paid-conversion lead actions** already reported by the ad platforms:
the same Google Ads lead-action data that powers the Paid Search "Total Leads"
number today, extended across the paid channels that report conversions. Blended
**Cost per Lead** would then be blended Spend divided by that leads number.

The important caveat: this is a **different metric** than "HubSpot leads
attributed to AVZ." It counts leads the ad platforms recorded as conversions,
not leads confirmed in the CRM. It would need to be labeled that way on the
report so nobody reads it as a CRM-verified number.

## The questions

1. **Is a paid-conversion lead an acceptable definition** of "Leads" for the
   Paid Media Overview, in place of a HubSpot-attributed lead? (This is the one
   we can actually build today.)

2. **If yes, which conversion actions count** toward the blended lead? Paid
   Search already has a per-client allowlist of which Google Ads conversion
   actions are "leads" (`paidSearchConfig.leadActions`). Do Meta and LinkedIn
   conversion actions count too, and if so, which ones?

3. **If HubSpot attribution is required** as the definition of record, please
   confirm we **hold Leads and Cost per Lead off the Overview** until a
   per-client HubSpot lead path exists. There is no such path today, so this
   would not be a near-term deliverable, and we would keep the two tiles absent
   until then.

## What each answer unblocks

- **Answer to Q1 = yes** unblocks building blended Leads and Cost per Lead now,
  from data we already have, with a clear label. This is the fastest path to a
  complete Overview.
- **Answer to Q3 = confirmed** keeps the current shipped state (Spend and Clicks
  only) and formally parks Leads / Cost per Lead until HubSpot is connectable
  per client.
