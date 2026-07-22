# Decisions for Approval: Paid Media

Covering the six changes you asked for: the Overview subpage, Total Leads rows, the
keyword filter, Cost / LPV, Spend formatting, and the LinkedIn check.

**If you disagree with any item, or it's not what you expected, flag it now.**
Anything marked ⚠️ is a choice you might not expect. Silence means we proceed as
written. Items are lettered so they don't clash with your numbered requirements.

Dianna asked if we had anything specific in mind on metric definitions. Yes, A and B.
Requirements 3, 5 and 6 are settled and sit in the assumptions at the end.

---

## Already fixed, no action needed

**Cost / LPV was showing $0.** It rounded to whole dollars, and cost per landing
page view is usually under a dollar, so a real 42-cent cost read as $0. Greg
confirmed the formula is right, only the display was wrong. This is live, so anyone
who looked saw a wrong number. The fix ships first.

---

## ⚠️ A. Meta sends us no lead data at all

Of the four agreed metrics, Meta only reports Spend and Clicks. It sends no lead or
conversion data, and nothing records which Meta action should count as a lead, so
"use the leads event" isn't a matter of picking the right one. There isn't one
connected. For contrast, Paid Search counts eight configured lead actions and
LinkedIn counts only native lead-form submissions.

Amir's agreement was conditional on whether Meta bids on anything beyond Form
Submissions. This closes that too. **No default here:** the Overview can't show
Leads or Cost per lead until it's answered.

*→ Greg: which Meta action counts as a lead, and is it the same for every client?*

---

## ⚠️ B. "Clicks" means something different on Meta

Meta counts link clicks. Paid Search and LinkedIn count all clicks. Blended, that's
one number holding two definitions, and Meta's share looks artificially low.

We'd switch Meta to all clicks so the three match.

*→ Greg: confirm, or say if you'd rather keep link clicks and label the column that
way.*

---

## C. What a total does when a channel is missing

Renaissance is the only client with all three connected, so a missing channel is the
normal case, not an edge case. Your rule covers calculated metrics: if a broken
figure feeds a formula, show it unavailable. That settles Cost per lead, not Spend
or Clicks.

We'd have totals cover the channels we do have and name the ones missing.

*→ Dianna: confirm, or say if a missing channel should make the whole total
unavailable.*

---

## D. The region total would cover only the 10 rows shown

The Region to DMA table shows the top 10 regions, while the card above it shows the
true count. A total underneath would sum less than the card advertises.

1. Total just the 10 shown. 2. Total every region. 3. Show both, e.g. "1,240 across
top 10 of 34 regions". We'd do 3.

*→ Amir: reply 1, 2 or 3.*

---

## E. The keyword table needs a total, and it's the one with the filter

You already ruled the 10-click filter out for Leads by Action, and it doesn't touch
Region to DMA. This is only about the keyword table's own total, which can reflect
what's on screen or every keyword behind the filter.

We'd have it reflect what's on screen, so it moves when the filter moves.

*→ Amir: confirm, or say it should always total every keyword.*

---

## F. The Overview commentary box has no owner

Paid Search, Meta and LinkedIn each have one, owned by Amir and Greg. The Overview
would be a fourth with nobody on it, and getting the wiring wrong risks existing
Paid Search commentary appearing on the wrong page.

We'd give it no box.

*→ Dianna: name an owner, or confirm no box.*

---

## G. Smaller assumptions, flag any you'd expect differently

- The Overview shows Spend, Clicks, Leads, Cost per lead in that order. CTR and
  Conversions dropped, per Amir and Greg.
- It shows both a combined top line and a per-channel breakdown. If both isn't
  possible, blended is the default, per Greg.
- ⚠️ Paid Media will open on the Overview, so existing links and bookmarks land
  there rather than on Paid Search.
- All four Paid Search tables get a total. Campaign already has one, so this adds
  three: Leads by Action at the top, Region to DMA and Keywords at the bottom.
- Totals are plain sums. If one lead can sit in two metro areas or fire two actions
  it would count twice. That was assigned to Amir and never closed, so we'll check
  it against live data before building.
- The keyword table opens at 10 or more clicks and can be cleared. If nothing
  reaches 10 we show a message, which was Dianna's call. Amir's 50-impression
  fallback only if it were easier to build, and it isn't.
- Cost / LPV keeps using Meta's own figure. We'll compare it against spend divided
  by landing page views before the fix ships.
- The Top Regions chart shows cents while the card above stays in whole dollars, so
  the same figure appears at two precisions.
- All of this applies to both the internal view and the client portal.

*→ Any of these not what you'd expect?*
