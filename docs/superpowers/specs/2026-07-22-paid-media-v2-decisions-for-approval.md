# Decisions for Approval: Paid Media

Six decisions, each with what we'll do by default. **Silence means we proceed as
written**, so you only need to reply where you disagree or where we say there's no
default. Decisions are lettered so they don't get confused with your numbered
requirements.

**Who we need answers from:** Greg on A and B, Dianna on C and F, Amir on D and E.

Dianna asked whether we had anything specific in mind on metric definitions. Yes,
two things, and they're A and B below.

Requirement 3's keyword filter and Requirement 5's Spend formatting are settled and
sit in the assumptions at the end. Requirement 6, the LinkedIn check, has been
handled separately and needs nothing here. E below is about a *total* on the
keyword table, which is new and comes out of Requirement 2.

---

## Already fixing, no action needed

**Cost / LPV has been showing $0.** Greg confirmed the formula, spend divided by
landing page views, and that part is right. The display rounds to whole dollars,
and cost per landing page view is usually well under a dollar, so a real cost of
42 cents showed as $0. CPM and CPC sit beside it and both show cents correctly.
This is live now, so anyone who looked at that number saw a wrong one. We're
shipping the fix first, ahead of everything else.

---

## ⚠️ A. Meta sends us no lead data, so we need to know which action counts

Of the four agreed Overview metrics (Spend, Clicks, Leads, Cost per lead), Meta
only has two. It reports Spend and Clicks, but sends no lead or conversion data at
all, and nothing on our side records which Meta action should count as a lead. So
"use the leads event" isn't a matter of picking the right one. There isn't one
connected.

For context on the other two: on Paid Search a lead is one of the eight configured
lead actions, grouped into the three form-fill types Amir described. On LinkedIn
it's only a native lead form submission, so someone who clicks through and converts
on the website isn't counted.

Amir made his agreement conditional on whether Meta bids on any conversion action
beyond Form Submissions. Answering the below closes that too.

**There is no default here.** The Overview cannot show Leads or Cost per lead until
this is answered.

*→ Greg: which Meta action counts as a lead, and is it the same action for every
client or does it vary?*

---

## ⚠️ B. "Clicks" doesn't mean the same thing on Meta

Meta counts link clicks only. Paid Search and LinkedIn count all clicks. Added
together that's one number holding two definitions, and Meta's share looks
artificially low.

**Default: we switch Meta to all clicks so the three match.**

*→ Greg: confirm, or say if you'd rather keep link clicks and have the column
labeled that way.*

---

## C. What a total does when a channel is missing

Renaissance is the only client with all three channels connected, so a missing
channel is the normal case rather than an edge case. Dianna's guidance covers the
calculated metrics: if a broken figure feeds a calculation, show the result as
unavailable rather than risk a wrong number reaching a client. That settles Cost
per lead. It doesn't settle what a Spend or Clicks total does.

Clients without Paid Media enabled won't see the section at all, same as today.

**Default: totals cover the channels we do have, and name the ones missing.**

*→ Dianna: confirm, or say if a missing channel should make the whole total show as
unavailable.*

---

## D. The region total covers only the 10 rows shown

The Region to DMA table shows the top 10 regions, while the card directly above
shows the true count of every region with activity. Whenever that count is above
10, a total summing the table sits right under a card saying there are more.

- **1.** Total just the 10 shown.
- **2.** Total every region, including those not displayed.
- **3.** Show both, for example "1,240 across top 10 of 34 regions".

**Default: option 3.**

*→ Amir: reply 1, 2 or 3.*

---

## E. The keyword table has a filter and now also needs a total

You already ruled the 10-clicks filter out for Leads by Action, and it doesn't
touch Region to DMA either. This is only about the keyword table's own total, since
that table is the one carrying the filter. Its total can either reflect what's on
screen or every keyword behind the filter.

**Default: the total reflects what's on screen, so it changes when the filter
changes.**

*→ Amir: confirm, or say if it should always total every keyword.*

---

## F. The Overview needs a commentary owner

Paid Search, Meta and LinkedIn each have a commentary box, assigned to Amir and
Greg. The Overview would be a fourth, and nobody owns it. Getting this wrong also
risks existing Paid Search commentary showing on the wrong page, so we'd rather
settle it now than discover it later.

**Default: the Overview gets no commentary box.**

*→ Dianna: name an owner, or confirm no box.*

---

## Assumptions, correct by exception

**On the Overview**

- It shows Spend, Clicks, Leads and Cost per lead, in that order, per Greg's
  reorder. CTR and Conversions are dropped, per Amir and Greg.
- It shows both a combined top line and a per-channel breakdown, as all three of
  you preferred. If both proves infeasible, the all-channels blended view is the
  default, per Greg.
- ⚠️ Paid Media will open on the Overview rather than Paid Search, matching AEO and
  Web Analytics. **Existing links and bookmarks to Paid Media will land on the
  Overview instead.**

**On the Paid Search totals**

- All four Paid Search tables get a total, per Amir's note. The campaign table
  already has one, so this adds three: Leads by Action at the top, Region to DMA at
  the bottom, and the keyword table at the bottom.
- Both totals are plain sums. If one lead can be attributed to more than one metro
  area, or can fire more than one form-fill action, it would be counted twice. This
  was assigned to Amir and never closed, so we'll check it against the live data
  before building. Tell us now if you already know it can happen.

**On the keyword table**

- It opens filtered to 10 or more clicks, and the viewer can clear or change it
  rather than it being locked.
- If nothing reaches 10 clicks we show a short message. That was Dianna's call and
  Amir aligned with it, offering a 50-impressions fallback only if it were easier to
  build. It isn't, so we're doing the message. We've read Amir's threshold as "no
  single keyword reaches 10 clicks"; say if you meant fewer than 10 clicks across
  the whole account.

**On Meta**

- Cost / LPV keeps using Meta's own figure rather than us dividing spend by landing
  page views. These normally agree. We'll compare the two against the live account
  before the fix ships, and if they diverge we'll use Greg's definition and compute
  it ourselves.
- Spend on the Top Regions chart shows cents, while the card above it stays in
  whole dollars, so the same figure appears at two precisions on one screen.

**Everywhere**

- All of this applies to both the internal view and the client portal.

*→ Any of these not what you'd expect?*
