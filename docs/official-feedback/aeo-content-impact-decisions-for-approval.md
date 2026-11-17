# Decisions for Approval: AEO Content Impact and Competitors

These decisions cover the changes requested in the AEO dashboard training: the Content Impact tab, and moving the competitor
section to the AEO Overview.

**If you disagree with any item, or it isn't what you expected, flag it now.** Items marked ⚠️ are choices you might not
expect. Items marked *(Avenue Z call)* were made by the build team without a stakeholder answer, so look at those closely.

Workings and evidence:
[design](../superpowers/specs/2026-11-17-aeo-content-tab-redesign-design.md) ·
[build plan](../superpowers/plans/2026-11-17-aeo-content-tab-redesign.md).

---

## At a glance

| # | Decision | Status |
|---|---|---|
| 1 | "Days to first traffic" becomes "days to first search visit" | Decided (Paul) |
| 2 | The whole competitor section moves to Overview | Decided (Paul) |
| 3 | The gap table works page by page and covers every page type | Decided (Paul) |
| 4 | Prompt gaps are internal by default, with a per-client switch | Decided (Paul) |
| 5 | The merged table's "all" view is AI-cited pages | Decided (Paul, per the request) |
| 6 | Movers chart: labels only, no data change | Decided (Paul) |
| 7 | Competitor tables appear on the Peec view only | Decided (Paul) |
| 8 | ⚠️ Competitor changes on Overview always compare with the previous period | *(Avenue Z call)* |
| 9 | ⚠️ Time-to-first cards count new content only | *(Avenue Z call)* |
| 10 | ⚠️ AI citation numbers still cover the last 30 days, whatever date range is picked | *(Avenue Z call)*, follow-up filed |
| 11 | Competitors on Overview are switched on client by client | Decided (Paul) |
| 12 | Clients who see Content Impact today keep competitor data | *(Avenue Z call)* |
| 13 | ⚠️ Renaissance gets the Competitors block at release | Decided (Paul) |
| 14 | Clients see prompt counts, not prompt text, in the gap table | Decided (Paul) |
| 15 | Prompt gaps include prompts that are slipping, not only lost | *(Avenue Z call)* |
| 16 | ⚠️ Missing data shows "--", and engagement rate is measured one way | *(Avenue Z call)* |
| 17 | Calendar links point to the live site, and repeated rows merge | *(Avenue Z call)* |
| 18 | ⚠️ Some numbers will change because of data fixes | Heads-up |
| Q-1 | Should the Movers "Citation Share" view show only your own pages? | **Open: Tina** |
| Q-2 | How much slippage counts as "declining"? | **Open: Tina** |
| Q-3 | Are the New / Optimized labels right? | **Open: content team** |

Not in this change: the "pp" label and the model list (both affect every AEO tab, so they ship separately and sooner), and the
search-bot vs training-bot split (waiting on Peec crawl insights with Maddie and Kirk).

---

### 1. "Days to first traffic" becomes "days to first search visit"

The old card counted any first visit. Someone on the team opening a new page on launch day counted, so pages looked found
instantly. The new card counts the first visit from a search click (Google, Bing), which is very unlikely to be the team.

The AI card keeps its meaning but gets a clearer name: **"Days to first AI-referred visit."** It always measured a person
clicking through from an AI answer, never a crawler, and the new name says so.

*Considered and set aside:* counting visits in the first 30 days (team visits after day one still count, and new pages can't
be compared), and filtering out team traffic inside Google Analytics (not confirmed as set up for Renaissance, and it wouldn't
carry over to other clients).

→ **Confirm.**

---

### 2. The whole competitor section moves to Overview

Both competitor tables leave Content Impact and sit together on the AEO Overview: the domain-level visibility table, and the
table of competitor pages that get cited when the brand doesn't. That keeps the competitor story in one place.

→ **Confirm.**

---

### 3. The gap table works page by page and covers every page type

It already listed individual pages, not just domains, and it was never limited to blog posts. Its "Article" heading made it
look that way. It becomes **"Page"**, gains a page-type column (article, listicle, product page, forum, …), and shows how many
tracked prompts cite each page.

→ **Confirm.**

---

### 4. Prompt gaps are internal by default, with a per-client switch

A new block lists the prompts where the brand isn't cited, has lost its citation, or is slipping. It guides what to write next.
It starts hidden from clients. An Avenue Z admin can turn **"Visible to client"** on or off per client from the internal
dashboard, with no release needed. While it's off, clients don't see it in the portal or in a PDF export.

Only admins can flip it. Analysts can see that it's internal but can't change it, and clients can't turn it on for themselves.

→ **Confirm.**

---

### 5. The merged table's "all" view is AI-cited pages

The two content tables become one, with a switch: **Avenue Z content** (the default) or **All cited pages**. "All cited
pages" means your own pages that AI engines cite, plus all Avenue Z content, as the request said ("all-site cited-content").
Avenue Z pages carry a **New** or **Optimized** label, and every row shows a clickable link to the page.

→ **Confirm.**

---

### 6. Movers chart: labels only, no data change

The request asked for a label, so that's what changes. The two traffic views are labelled **"All site pages"**, with the
explanation that they include pages Avenue Z hasn't worked on and can surface opportunities there.

The third view, Citation Share, ranks every page AI engines cite, **including other websites**, so "All site pages" would be
wrong there. It's labelled **"All cited pages across the web"** instead. Whether it should show only your own pages is
question Q-1 below.

→ **Confirm.**

---

### 7. Competitor tables appear on the Peec view only

The data behind them comes only from Peec, so under the Profound view the block doesn't appear.

→ **Confirm.**

---

### ⚠️ 8. Competitor changes on Overview always compare with the previous period *(Avenue Z call)*

On Content Impact, the competitor change columns only appeared when you turned on Compare. Overview works differently:
everything on it always compares with the previous period, and the Compare switch has no effect there. The moved tables follow
Overview's rule so the page behaves one way. The calculations themselves don't change.

Two existing rules carry over. Change columns are hidden while you filter to specific AI models, as before. And the gap
table's citation-share change only shows when "Last 30 days" is selected, because of item 10.

→ **Confirm, or ask for the Compare switch to apply on Overview too** (a larger change to the whole page).

---

### ⚠️ 9. Time-to-first cards count new content only *(Avenue Z call)*

Optimized pages already had traffic before Avenue Z touched them, so they'd read as "found in 0 days" and pull the averages
down: the same problem item 1 fixes. The cards now measure **new** published content only, which matches the request's
"newly published page". Optimized pages still appear in the table.

→ **Confirm, or ask for a separate figure for optimized pages.**

---

### ⚠️ 10. AI citation numbers still cover the last 30 days, whatever date range is picked *(Avenue Z call; follow-up filed)*

This is existing behavior, not something new. Citation counts per page always use the last 30 days. Other numbers on the tab
follow the date picker. With a different range picked, the two can disagree a little.

Fixing it changes client numbers and is a separate piece of work, so it's filed as its own follow-up rather than mixed into
this change. In the meantime, the change column that this would distort is hidden unless "Last 30 days" is selected (item 8).

→ **Confirm it can wait for the follow-up.**

---

### 11. Competitors on Overview are switched on client by client

Overview's layout is shared by every client. Adding the competitor tables there for everyone would show competitor data,
including the list of competitor pages that don't mention the brand, to every Peec client at once. Instead, each client is
switched on deliberately, with no release needed.

→ **Confirm.**

---

### 12. Clients who see Content Impact today keep competitor data *(Avenue Z call)*

The competitor tables leave Content Impact for everyone. So that nobody loses tables they have now, the release switches
the Competitors block on for exactly the clients who can see Content Impact today. The list is shown in the release notes
before anything changes.

→ **Confirm.**

---

### ⚠️ 13. Renaissance gets the Competitors block at release

Renaissance asked for the competitor section on Overview, and its Overview isn't hidden, so it's switched on at release.
**Renaissance's clients will see the list of competitor pages that get cited when Renaissance doesn't, from day one.**
Content Impact itself stays hidden for Renaissance until someone decides to turn it back on.

→ **Confirm you're comfortable with Renaissance's clients seeing this list.**

---

### 14. Clients see prompt counts, not prompt text, in the gap table

The gap table shows how many tracked prompts cite each competitor page. Clients see **the count only**. The prompt wording
shows only for the Avenue Z team. Otherwise the table would give clients most of what the internal prompt-gaps block (item 4)
keeps private by default.

→ **Confirm.**

---

### 15. Prompt gaps include prompts that are slipping, not only lost *(Avenue Z call)*

The request asked for prompts that "lack brand citations **or are trending down**". So the block shows three kinds:

- **Not cited:** the brand's site isn't cited for the prompt.
- **Lost:** it was cited in the previous period and isn't now.
- **Declining:** it's still cited, but the brand's ranking for the prompt has dropped since the previous period.

All three compare with the previous period, whatever the Compare switch says, so they're always on the same footing. How big
a drop counts as "declining" is question Q-2.

→ **Confirm.**

---

### ⚠️ 16. Missing data shows "--", and engagement rate is measured one way *(Avenue Z call)*

The two old tables disagreed in small ways. When data failed to load, one showed "--" and the other showed "0%". They also
read engagement rate for a page differently when Google Analytics records it under two addresses (`/page` and `/page/`).

The merged table always shows **"--" when data is missing**, because "0%" would look like "AI never cites this page". It
combines a page's two addresses, weighted by visits. A few pages' engagement rates will shift slightly, and the release notes
list which ones.

→ **Confirm.**

---

### 17. Calendar links point to the live site, and repeated rows merge *(Avenue Z call)*

Some calendar rows hold only a slug, like `/blog/x`. Those get the client's website address in front, so the link opens the
live page instead of a page inside the reporting tool. When the calendar lists the same page twice, for example once as new
and later as optimized, it shows once, labelled **"New · Optimized"**, and counts once.

→ **Confirm.**

---

### ⚠️ 18. Some numbers will change because of data fixes (heads-up)

While designing this we found that two data pulls from Peec were cut short:

- **Prompt coverage** read only part of the data for large accounts. Renaissance is one of them. Prompts and pages that were
  cited could look uncited. Fixing this will likely **raise the Prompt Coverage numbers**, including the headline tile.
- **Cited pages** were limited to the 2,000 most-cited URLs across the whole web. Some of the client's own pages fell outside
  that limit and looked uncited.

The new numbers are more accurate, but they will move. Before-and-after figures for Renaissance go in the release notes, and
Tina gets them before staging review.

→ **Acknowledge before staging review, and decide whether the client needs a note about the correction.**

---

## Open questions

- **Q-1 (Tina): Movers "Citation Share" view.** It ranks every page AI cites, including competitors, Reddit and news sites,
  not just your own. Should it show only your own pages? If yes, that's a small follow-up.
- **Q-2 (Tina): "Declining" threshold.** We'll propose a starting point (a drop of one ranking position or more on average).
  What feels right?
- **Q-3 (content team): New / Optimized labels.** Renaissance's calendar has no "new or optimized" column, so the label is
  worked out from the Content Type column. We'll send the full list of Content Types and the label each one gets. Please check
  it, for example whether a "Blog" refresh is wrongly labelled New.

## Also being checked before build

- **Which items appear in the planned-content table.** Confirmed from the code: a calendar row appears only when its Status is
  exactly "Published". There is no date rule. Items seem to "stop at today" only because future items aren't marked Published
  yet. The table will now say this in its tooltip.
- **"Last updated" is blank.** We'll check whether Renaissance's calendar has an update-date column under a heading we don't
  recognise, or dates written in a format we can't read, and fix whichever it is. If the calendar has no such column, that's a
  calendar change, and we'll say so.
