# For Dianna: blended Leads and Cost per Lead on the Paid Media Overview

**Status:** decision made on how to display leads now; one confirmation requested from Dianna.
**Owner of the confirmation:** Dianna Gatto.
**Raised by:** Paul, 2026-08-04.
**Traces to:** "Decisions for Approval, Paid Media" tab, item 3, comment `[p]`; working-feedback spec, Blocker 1 (`docs/superpowers/specs/2026-07-31-paid-media-v2-working-feedback-spec.md`).

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
be missing Meta's contribution. Under the rule we agreed for the blended totals
(all channels must report, or the number is not shown, so a gap never makes it
look off), that means a blended Leads number stays unavailable until Meta lead
tracking exists. This is true regardless of how "a lead" is defined (whether
from the ad platforms or from HubSpot); the blocker is the missing Meta data.

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

## What we need from Dianna

1. **Confirm the display:** per-channel Leads in the breakdown now (Paid Search
   and LinkedIn), no blended Leads or Cost per Lead until Meta lead data exists.
   Is that acceptable for the client-facing report?

2. **Decide on Meta lead tracking:** a blended Leads number, and Meta's own lead
   count, only become possible if Meta is set up to track lead conversions. Is
   that something the account team wants to pursue with the client? If yes, it
   becomes a separate work item; if no, blended Leads stays off indefinitely and
   per-channel Leads is the final state.

3. **Cost per Lead:** it stays off the Overview for the same reason (no complete
   lead base to divide spend by). Confirm that is fine for now.
