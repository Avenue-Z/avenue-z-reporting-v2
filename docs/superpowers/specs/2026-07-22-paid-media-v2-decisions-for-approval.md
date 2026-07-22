# Decisions for Approval: Paid Media

Covering the six changes you asked for: the Overview subpage, Total Leads rows,
the keyword table filter, Cost / LPV, Spend formatting, and the LinkedIn check.

**If you disagree with any item, or it's not what you expected, flag it now.**
Anything marked ⚠️ is a choice you might not expect.

---

## ⚠️ 1. Meta doesn't report leads at all

The agreed metrics are Spend, Clicks, Leads and Cost per lead. Paid Search and
LinkedIn report all four. Meta reports Spend and Clicks only. It sends us no
lead or conversion data whatsoever today, and there's no setting anywhere
recording which Meta action should count as a lead.

Greg's answer was to use the "leads" event and drop Conversions, which works for
the other two channels. For Meta there is no leads event connected yet, so this
isn't a matter of picking the right one.

Three ways forward. We can set Meta up the same way Paid Search works, where
each client has a named list of actions that count as leads, which is the most
consistent but needs someone to specify those actions per client. We can pick
one Meta action and apply it to every client, which is fastest but assumes every
client optimises toward the same thing. Or we ship the Overview now with Meta
showing no lead figure, and add it once the above is settled.

*→ Which of the three? This is the one item that decides whether the Overview
can be built as specified.*

---

## ⚠️ 2. "Leads" and "Clicks" are counted differently on each channel

The question of whether metrics needed reconciling came back as "I can't think
of anything that would be different." Two things are.

**Clicks.** Meta counts link clicks only, meaning clicks on the link itself.
Paid Search and LinkedIn count all clicks, including likes, comments and
expands. Adding them produces one number containing two different definitions,
and Meta's share will look artificially low next to the others.

**Leads.** On Paid Search a lead is one of the eight form-fill actions
configured for Renaissance, split across employer, broker and contact. On
LinkedIn a lead is only a LinkedIn native lead form submission, so someone who
clicks through and converts on the website isn't counted. These aren't wrong,
they're just measuring different things, and the Overview would be adding them
together.

*→ For Clicks, do we switch Meta to all clicks so the three match, or keep link
clicks and label the column accordingly? For Leads, is adding them as-is fine
for a top-line view?*

---

## ⚠️ 3. Cost / LPV has been showing $0

Greg confirmed the formula is spend divided by landing page views, and that part
is right. The display is not.

The figure is being rounded to whole dollars, and cost per landing page view is
usually well under a dollar. A real cost of 42 cents shows as $0. A cost of
$1.92 shows as $2. Anything under 50 cents reads as zero on the page. The two
metrics next to it, CPM and CPC, both show cents correctly, so this one is the
odd one out.

This has been live, so any client who looked at that number saw a wrong one.
The fix is small and we'd like to ship it ahead of everything else.

*→ Confirm it should show cents, for example $0.42, and we'll send it through on
its own.*

---

## ⚠️ 4. Only Renaissance has all three channels set up

Renaissance is the only client configured for Paid Search, Meta and LinkedIn.
The other six clients have none of the three connected.

So for most clients an Overview would open with nothing in it. That makes
"a channel has no data" the normal case rather than an edge case, which changes
what we should build. Dianna's guidance covers part of it: if a broken figure
feeds a calculation, show the result as unavailable rather than risk a wrong
number reaching a client. That tells us what to do with Cost per lead, but not
what a Spend total should do when one channel is missing entirely.

*→ When a channel isn't connected, should the totals leave it out and say so, or
should the whole Overview show as unavailable? And should the Overview appear at
all for clients with no paid media?*

---

## ⚠️ 5. The region total will only cover the 10 rows shown

The Region to DMA table shows the top 10 regions, while the card directly above
it displays the true count of every region with activity. Whenever that count is
above 10, a "Total Leads" summing the table would sit right underneath a card
saying there are more regions than were added up.

We can total just the 10 shown, total every region including those not
displayed, or show both, for example "1,240 across top 10 of 34 regions".

There's a related point worth confirming: if a single lead can be attributed to
more than one metro area, adding the rows up would count it twice. On the Leads
by Action table this can't happen, but on the region table it can.

*→ Which of the three? And should the total be a plain sum, or does it need to
avoid double-counting?*

---

## 6. The Overview becomes the page Paid Media opens on

Today, clicking Paid Media lands on Paid Search. Adding an Overview in the way
the other sections work would make Overview the landing page, with Paid Search
becoming a tab alongside Meta and LinkedIn.

That's how AEO and Web Analytics already behave, so it's the consistent choice,
but it does change where existing links and bookmarks land.

*→ Confirm Overview should be the default, or say if Paid Search should stay the
page it opens on.*

---

## 7. Totals on every Paid Search table, or only the two you named

The original request named two tables. Amir's note widened it to "this and all
tables on the Paid Search reporting tab."

Taken literally that also covers the campaign table and the keyword table, which
roughly doubles the work. Not a problem, we'd just rather confirm than guess.

*→ All four tables, or only Leads by Action and Region to DMA?*

---

## ⚠️ 8. We can't look at LinkedIn without knowing what went wrong

The request was to check LinkedIn for API issues, but no symptom was recorded,
so there's nothing specific to chase. We've read through LinkedIn's setup
alongside Meta's and found two small differences, neither of which obviously
explains a fault. We also can't call the LinkedIn data source from a developer
machine, so we can't reproduce anything blind.

*→ What was actually seen, and roughly when? A screenshot or a date range is
enough. Without one we'd be guessing, and this is the only item we can't
estimate.*

---

## 9. Smaller assumptions, flag any you'd expect differently

- The keyword table opens filtered to 10 or more clicks, and the viewer can
  clear or change it rather than it being locked.
- If nothing reaches 10 clicks, we show a short message rather than switching to
  Amir's 50-impressions fallback. Amir left this to us and called the case
  unlikely.
- Cost / LPV keeps using Meta's own figure rather than us dividing spend by
  landing page views ourselves. These normally agree, and Meta's accounts for
  its own attribution window.
- Spend on the Top Regions chart shows cents, matching the requested format. The
  card above it stays in whole dollars, so the two differ in precision on the
  same screen. Say if you'd rather both matched.
- The Overview gets one commentary box of its own, separate from the Paid
  Search, Meta and LinkedIn ones. It would need an owner, since the other three
  are assigned to Amir and Greg.
- Everything here applies to both the internal view and the client portal.

*→ Any of these not what you'd expect?*
