# For Dianna: blended Leads and Cost per Lead on the Paid Media Overview

**Status:** ✅ RESOLVED (2026-08-04, team). Blended Leads / Cost per Lead are **dropped** — we don't have access to Meta lead data, so anything relating to or influenced by Meta leads is dropped. Per-channel Leads (Paid Search + LinkedIn) remain; Meta shows `—`.
**Decided by:** Dianna Gatto / team.
**Raised by:** Paul, 2026-08-04.
**Traces to:** "Decisions for Approval, Paid Media" tab, item 3, comment `[p]`; working-feedback spec, RESOLVED 1 (`docs/superpowers/specs/2026-07-31-paid-media-v2-working-feedback-spec.md`).

## The short version

The Paid Media Overview shows a blended top line across the three paid channels
(Paid Search, Meta, LinkedIn). Spend and Clicks work. The doc also asks for
blended **Leads** and **Cost per Lead** on that line.

We cannot show a blended Leads number honestly right now, for a concrete
reason: **we have no way to get lead data from Meta.** So instead of a blended
number built from incomplete data, the Overview now shows **leads per channel**
in the By-Channel breakdown, for the channels that have them, and no blended
Leads total. This note explains why and asks Dianna to confirm that approach.

## Why there is no blended Leads number

A blended Leads total has to include every channel that ran, or it understates
the real number and the matching Cost per Lead overstates. Where each channel
stands today:

- **Paid Search:** leads are available (Google Ads conversion actions). In use.
- **LinkedIn:** leads are available (LinkedIn Lead Gen Form leads). In use.
- **Meta:** **no lead data.** The client's Meta is not tracking lead
  conversions, so there is nothing for us to pull. This is a data-tracking gap
  on the Meta side, not something we can fix in code.

Because every Paid Media client runs Meta, a blended Leads number would always
be missing Meta's contribution, so a blended number built from partial channels
would understate leads and overstate Cost per Lead. That is why blended Leads /
Cost per Lead are dropped rather than shown. This is true regardless of how "a
lead" is defined (whether from the ad platforms or from HubSpot); the blocker is
the missing Meta data.

Note this is separate from the HubSpot question in comment `[p]`. Even the
HubSpot path is not available (no Paid Media client has HubSpot connected, and
the integration is wired specifically to Avenue Z's own account), so neither
route can produce a blended number today.

## What we are shipping now

- **No blended Leads or Cost per Lead** on the Overview top line. The top line
  shows Spend and Clicks.
- **Leads per channel** in the By-Channel breakdown: Paid Search and LinkedIn
  show their lead counts; Meta shows a dash, with a caption that Meta lead
  conversions are not currently available.

This gives real lead visibility for the channels that have it, with no blended
number built from partial data and nothing that reads as a Meta zero.

## Decision (2026-08-04, team)

The team decided to **drop anything relating to or influenced by Meta leads**,
because we do not have access to Meta lead conversions. Concretely:

1. **Display confirmed:** per-channel Leads in the By-Channel breakdown for Paid
   Search and LinkedIn; Meta shows `—`. No blended Leads or Cost per Lead on the
   Overview top line. This is the final state, not an interim one.

2. **Blended Leads / Cost per Lead: dropped, not parked.** The `leads`/
   `costPerLead` fields were removed from `PaidMediaOverview`. A blended number
   would require Meta lead data under either definition (ad-platform conversions
   or HubSpot), and we don't have it — so it is not shown.

3. **Meta lead tracking** is an account-team question outside this work. If Meta
   is ever set up to track lead conversions, revisit as a fresh sub-spec; until
   then per-channel Leads (excluding Meta) is the final state.
