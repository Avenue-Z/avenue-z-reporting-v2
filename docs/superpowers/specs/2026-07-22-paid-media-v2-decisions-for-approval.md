# Decisions for Approval: Paid Media

Covering the six changes you asked for: the Overview subpage, Total Leads rows,
the keyword table filter, Cost / LPV, Spend formatting, and the LinkedIn check.

**If you disagree with any item, or it's not what you expected, flag it now.**
Anything marked ⚠️ is a choice you might not expect.

---

## ⚠️ 1. Meta doesn't report leads at all

Paid Search and LinkedIn report all four agreed metrics. Meta reports Spend and
Clicks only. It sends no lead or conversion data, and nothing records which Meta
action should count as a lead, so "use the leads event" isn't a matter of picking
the right one. There isn't one connected.

Three options: set Meta up like Paid Search, where each client has a named list
of lead actions, most consistent but someone must specify them per client; pick
one Meta action for every client, fastest but assumes everyone optimises the same
way; or ship the Overview with Meta showing no lead figure.

*→ Which of the three? This decides whether the Overview can be built as
specified.*

---

## ⚠️ 2. "Leads" and "Clicks" are counted differently on each channel

Reconciliation came back as "I can't think of anything that would be different."
Two things are.

**Clicks.** Meta counts link clicks only, the other two count all clicks. Added
together that's one number holding two definitions, and Meta's share looks
artificially low.

**Leads.** On Paid Search a lead is one of the eight form-fill actions configured
for Renaissance. On LinkedIn it's only a native lead form submission, so someone
who clicks through and converts on the website isn't counted.

*→ Switch Meta to all clicks so the three match, or keep link clicks and label
the column? And is adding the two lead types together fine for a top-line view?*

---

## ⚠️ 3. Cost / LPV has been showing $0

Greg confirmed the formula, spend divided by landing page views. That part is
right. The display isn't.

It rounds to whole dollars, and cost per landing page view is usually well under
a dollar, so a real cost of 42 cents shows as $0. CPM and CPC sit beside it and
both show cents correctly. This is live now, so anyone who looked at that number
saw a wrong one.

*→ Confirm it should show cents, and we'll ship the fix on its own ahead of
everything else.*

---

## ⚠️ 4. Only Renaissance has all three channels set up

The other six clients have none connected, so for most clients an Overview would
open empty. A missing channel is the normal case, not an edge case.

Dianna's guidance covers half of it: if a broken figure feeds a calculation, show
the result as unavailable rather than risk a wrong number reaching a client. That
settles Cost per lead, but not what a Spend total does when a channel is missing
entirely.

*→ Should totals leave a missing channel out and say so, or should the whole
Overview show as unavailable? And should it appear at all for clients with no
paid media?*

---

## ⚠️ 5. The region total will only cover the 10 rows shown

The table shows the top 10 regions, while the card directly above shows the true
count of every region with activity. Whenever that count is above 10, a total
summing the table sits right under a card saying there are more.

We can total the 10 shown, total every region, or show both, for example "1,240
across top 10 of 34 regions". Separately, if one lead can be attributed to more
than one metro area, summing the rows double-counts it. That can't happen on
Leads by Action, but it can here.

*→ Which of the three? And plain sum, or does it need to avoid double-counting?*

---

## 6. The Overview becomes the page Paid Media opens on

Today Paid Media opens on Paid Search. Adding an Overview the way the other
sections work makes Overview the landing page, with Paid Search becoming a tab.
That matches AEO and Web Analytics, but changes where existing links and
bookmarks land.

*→ Confirm Overview should be the default, or say if Paid Search stays.*

---

## 7. Totals on every Paid Search table, or only the two you named

The request named two tables. Amir's note widened it to "this and all tables on
the Paid Search reporting tab", which also covers the campaign and keyword tables
and roughly doubles the work. Not a problem, we'd rather confirm than guess.

*→ All four tables, or only Leads by Action and Region to DMA?*

---

## ⚠️ 8. We can't look at LinkedIn without knowing what went wrong

No symptom was recorded, so there's nothing specific to chase. We've read
LinkedIn's setup against Meta's and found two small differences, neither of which
obviously explains a fault, and we can't call the LinkedIn data source from a
developer machine to reproduce anything blind.

*→ What was seen, and roughly when? A screenshot or a date range is enough. This
is the only item we can't estimate.*

---

## 9. Smaller assumptions, flag any you'd expect differently

- The keyword table opens filtered to 10 or more clicks, and the viewer can clear
  or change it rather than it being locked.
- If nothing reaches 10 clicks we show a short message, rather than Amir's
  50-impressions fallback. He left this to us and called the case unlikely.
- Cost / LPV keeps using Meta's own figure rather than us dividing spend by
  landing page views. These normally agree, and Meta's accounts for its own
  attribution window.
- Spend on the Top Regions chart shows cents. The card above it stays in whole
  dollars, so the two differ in precision on one screen.
- The Overview gets its own commentary box, which needs an owner, since Paid
  Search, Meta and LinkedIn are assigned to Amir and Greg.
- All of this applies to both the internal view and the client portal.

*→ Any of these not what you'd expect?*
