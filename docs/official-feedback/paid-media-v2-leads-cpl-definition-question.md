# For Dianna: blended Leads and Cost per Lead on the Paid Media Overview

**Status:** ✅ RESOLVED — blended Leads / Cost per Lead **stay dropped** (re-affirming the 2026-08-04 team decision). The Paid Media Overview top line shows **blended Spend + Clicks only**, summed across **every channel the client runs** (so "Blended Spend" = total paid spend). Per-channel Leads remain in the by-channel breakdown (Paid Search + LinkedIn where available; Meta shows '—'). No blended lead metric ships.
**Decided by:** Dianna Gatto / team (2026-08-04), re-affirmed by Paul 2026-08-06.
**Raised by:** Paul, 2026-08-04.
**Traces to:** "Decisions for Approval, Paid Media" tab, item 3, comment `[p]`; working-feedback spec, RESOLVED 1 (`docs/superpowers/specs/2026-07-31-paid-media-v2-working-feedback-spec.md`).

> **History (2026-08-06):** PR #204 briefly *re-added* blended Leads/CPL scoped to Paid
> Search + LinkedIn (Meta excluded). On review that was reversed: Meta has no lead data
> and LinkedIn reports 0 leads today (landing-page traffic), so the blended lead figure was
> misleading and a blended CPL charged lead-less spend against Paid Search's leads. **The
> blended Leads/CPL is scrapped again**, which also clears the two governance gates it
> raised (re-adding a dropped client-facing metric; sourcing leads from ad platforms rather
> than HubSpot per item 3 `[p]`). Blended Spend/Clicks revert to summing **all** configured
> channels. The narrative below describes the original 2026-08-04 decision and remains the
> current state. Code review: `docs/qa/paid-media-blended-leads-code-review.md`.

## The short version

The Paid Media Overview shows a blended top line across the three paid channels
(Paid Search, Meta, LinkedIn). Spend and Clicks work. The doc also asks for
blended **Leads** and **Cost per Lead** on that line.

Under the earlier 2026-08-04 approach (now superseded), we could not show a blended Leads number honestly, for a concrete
reason: **we have no way to get lead data from Meta.** The earlier approach showed **leads per channel**
in the By-Channel breakdown, for the channels that have them, and no blended
Leads total. This note originally explained that constraint and requested Dianna's confirmation.

## Why the 2026-08-04 approach dropped blended Leads (historical)

Under the earlier approach, the reasoning was: a blended Leads total has to include every channel that ran, or it understates
the real number and the matching Cost per Lead overstates. Where each channel stood at that time:

- **Paid Search:** leads were available (Google Ads conversion actions). In use.
- **LinkedIn:** leads were available (LinkedIn Lead Gen Form leads). In use.
- **Meta:** **no lead data.** The client's Meta was not tracking lead
  conversions, so there was nothing to pull. This was a data-tracking gap
  on the Meta side, not something the code could fix.

Because every Paid Media client runs Meta, a blended Leads number would always
be missing Meta's contribution, so a blended number built from partial channels
would understate leads and overstate Cost per Lead. That was why the earlier decision dropped blended Leads /
Cost per Lead rather than showing them. This was true regardless of how "a
lead" was defined (whether from the ad platforms or from HubSpot); the blocker was
the missing Meta data.

Note this is separate from the HubSpot question in comment `[p]`. Even the
HubSpot path is not available (no Paid Media client has HubSpot connected, and
the integration is wired specifically to Avenue Z's own account), so neither
route can produce a blended number today.

## What the 2026-08-04 approach shipped (historical)

Under that decision:
- **No blended Leads or Cost per Lead** on the Overview top line. The top line
  showed only Spend and Clicks.
- **Leads per channel** in the By-Channel breakdown: Paid Search and LinkedIn
  showed their lead counts; Meta showed a dash, with a caption that Meta lead
  conversions were not currently available.

That approach gave real lead visibility for the channels that had it, with no blended
number built from partial data and nothing that read as a Meta zero.

## Decision (2026-08-04, team) — SUPERSEDED (2026-08-06)

The 2026-08-04 team decision was to **drop anything relating to or influenced by Meta leads**,
because we did not have access to Meta lead conversions. That decision was:

1. **Display confirmed:** per-channel Leads in the By-Channel breakdown for Paid
   Search and LinkedIn; Meta shows `—`. No blended Leads or Cost per Lead on the
   Overview top line. This was stated as the final state at that time.

2. **Blended Leads / Cost per Lead: dropped, not parked.** The `leads`/
   `costPerLead` fields were removed from `PaidMediaOverview`. A blended number
   would have required Meta lead data under either definition (ad-platform conversions
   or HubSpot), which we did not have — so it was not shown.

3. **Meta lead tracking** was an account-team question outside that work. If Meta
   were ever set up to track lead conversions, it was to be revisited; until
   then per-channel Leads (excluding Meta) was the planned state.

**This decision has been superseded (2026-08-06).** Blended Leads and Cost per Lead are now re-added to the Overview, scoped to Paid Search + LinkedIn only. See the Status block above.
