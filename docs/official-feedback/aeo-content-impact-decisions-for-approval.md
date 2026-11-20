# Decisions for Approval — AEO Content Impact

**If you disagree with any item, or it's not what you expected, flag it now.** Anything marked ⚠️ is a choice you might not expect.

This covers the changes asked for in the AEO dashboard training: the Content Impact tab, and the competitor section moving to the AEO Overview. The "pp" label and the model list affect every AEO tab, so they ship separately and sooner.

---

## ✅ Resolutions — 20 Nov 2026 (all decisions closed)

Every item is answered, from Tina Fleming's inline notes (marked TF below) and Danielle Lopez's comments on the doc, 19 Nov 2026. Two answers change the design; they're marked **Changed**.

| # | Decision | Resolution |
|---|---|---|
| 1 | Corrected numbers | **Confirmed.** No client comms needed at this time. |
| 2 | Renaissance sees the competitor gap list | **Confirmed.** |
| 3 | Competitors on Overview | **Changed:** part of the default Overview template, not switched on client by client. Tina: no other client has access besides Renaissance. We'll confirm that against production before release and flag any other client. |
| 4 | Prompt gaps internal; clients see counts only | **Confirmed.** |
| 5 | First search visit; new content only | **Confirmed.** |
| 6 | Overview compares with the previous period | **Confirmed.** |
| 7 | Citation counts stay on 30 days for now | **Confirmed.** Follow-up filed. |
| 8 | Movers: labels only | **Confirmed.** |
| 9 | Missing data shows "--" | **Confirmed** (Danielle), with a check: before staging review we'll show how many cells stay "--" in each column. If a column is mostly blank, she may drop it once she sees it in practice. |
| 10 | Smaller assumptions | **Confirmed.** "This sounds right to me!" |
| Q | "Declining" threshold | **One position**, confirmed by Danielle. |
| Q | New / Optimized labels | Content Types in column C are correct; refreshes are "Existing Blog Optimization", which reads as Optimized. Nothing for the content team to change. |
| Q | "Last updated" column | **Changed:** the calendar has no such column; Publish Date is the last date a page was pushed live. "Last updated" becomes **"Last optimized"**, taken from the Publish Date of the page's Optimized rows. "Published" comes from its New row. No new column needed. |

---

### ⚠️ 1. Some numbers will go up, because two data pulls were cut short

While designing this we found two Peec pulls that stop early on large accounts, and Renaissance is one. Prompt coverage read only part of its data, so prompts and pages that were cited could look uncited. Cited pages were capped at the 2,000 most-cited URLs across the whole web, so some of Renaissance's own pages fell outside the cap and looked uncited.

Fixing both is the only way to make the new tables trustworthy. The catch: **Prompt Coverage will likely rise, headline tile included**, and some citation shares will shift. We'd send before-and-after figures for Renaissance before staging review.

→ **Confirm we ship the corrected numbers — and say whether the client should get a note about the correction.** (TF) CONFIRMED, no comms needed at this time.

---

### ⚠️ 2. Renaissance will see where competitors get cited and Renaissance doesn't

The competitor section moves to Overview (item 3), and Renaissance asked for it there, so we'd switch it on for Renaissance at release. That includes the list of competitor pages AI cites for Renaissance's topics that never mention Renaissance. It's useful, and it's also a list of where they're losing, visible to their clients from day one.

Content Impact itself stays hidden for Renaissance until someone decides to turn it back on.

→ **Confirm you're comfortable with Renaissance's clients seeing this list.** (TF) CONFIRMED

---

### 3. The competitor section moves to Overview, switched on client by client

Both competitor tables leave Content Impact and sit together on the AEO Overview: who's visible at the domain level, and the specific pages that get cited when the brand doesn't. The gap table already worked page by page and was never limited to blog posts; its "Article" heading made it look that way, so it becomes "Page" with a page-type column.

Overview's layout is shared by every client, so adding the tables there would show competitor data to every client at once. We'd switch it on per client instead, starting with Renaissance and with every client who sees Content Impact today, so nobody loses tables they have now. No release is needed to switch a client on later.

→ **Confirm — or say it should appear for every client.** (TF) Make this the default for the template, and right now there shouldn't be any other clients that have access to this anyway besides Renaissance.

---

### 4. Prompt gaps stay internal until we switch them on

A new block lists the prompts that need content: where the brand isn't cited, where it lost its citation since the previous period, and where it's still cited but its ranking is slipping. That last one covers "trending down" from the training.

It starts hidden from clients. An Avenue Z admin can turn "Visible to client" on per client from the internal dashboard; until then clients don't see it in the portal or in PDF exports. For the same reason, the competitor gap table on Overview shows clients only how many prompts cite each page, not the prompt wording.

→ **Confirm — including that clients see prompt counts, not prompt wording, on Overview.** (TF) CONFIRMED

---

### ⚠️ 5. "Days to first traffic" becomes "days to first search visit", for new content only

The old card counted any first visit, so a team member opening a new page on launch day made it look found instantly. The new card counts the first visit from a search click, which is very unlikely to be us. The AI card keeps its meaning with a clearer name, "Days to first AI-referred visit": a person clicking through from an AI answer, never a crawler.

We'd also count new content only. Optimized pages already had traffic before we touched them, so they'd read as "found in 0 days" and drag the average down. They still appear in the table.

→ **Confirm — or ask for a separate figure for optimized pages.** (TF) CONFIRMED

---

### ⚠️ 6. Competitor changes on Overview always compare with the previous period

On Content Impact, the competitor change columns only appeared with Compare turned on. Everything on Overview always compares with the previous period, and Compare has no effect there, so the moved tables would follow Overview's rule. The calculations don't change, and change columns stay hidden while you filter to specific AI models, as today.

→ **Confirm — or ask for Compare to work across all of Overview, which is a larger change.** (TF) CONFIRMED

---

### ⚠️ 7. Page citation counts stay on the last 30 days for now

This is existing behavior. Citation counts per page always cover the last 30 days, while the rest of the tab follows the date picker, so with another range picked the two can disagree a little. Fixing it changes client numbers, so we'd do it as its own follow-up rather than fold it in here. Until then, the one change column it would distort only shows when "Last 30 days" is selected.

→ **Confirm it can wait for the follow-up.** (TF) CONFIRMED

---

### 8. The Movers chart gets labels, not a data change

The training asked for the chart to say it covers all site pages, not only Avenue Z's work. That's true for its two traffic views, which get that label and a note that they can surface opportunities on pages we haven't touched.

The third view, Citation Share, ranks every page AI cites, **including other websites**, so "All site pages" would be wrong there. We'd label it "All cited pages across the web" and leave the data alone.

→ **Confirm — or say the Citation Share view should show only your own pages, which is a small follow-up.** (TF) CONFIRMED

---

### ⚠️ 9. Missing data shows "--", not 0%

The two old content tables disagreed when data failed to load: one showed "--", the other "0%". The merged table always shows "--", because "0%" reads as "AI never cites this page".

They also measured a page's engagement rate differently when Google Analytics records it under two addresses (/page and /page/). We'd combine the two, weighted by visits, so a few pages' engagement rates will shift slightly. We'd list which ones before staging review.

→ **Confirm.**

> *Tina:* I'd like to get your call here. — *Danielle:* I'm good with this, I think! I'm curious how much will populate with these changes, because if it's still a lot of blanks, then we may want to omit it altogether. I think I may just need to see it in practice but in theory, this seems good to me.

---

### 10. Smaller assumptions — flag any you'd expect differently

- The two content tables merge into one with a switch: **Avenue Z content** (the default) or **All cited pages**, meaning your own pages AI cites plus all Avenue Z content.
- Avenue Z pages carry a **New**, **Optimized** or **New · Optimized** label from the content calendar, and every row shows a clickable link to the live page.
- A calendar row holding only a slug (/blog/x) gets the site address in front, and a page listed twice in the calendar shows and counts **once**.
- The planned-content rule doesn't change: a row appears only when its Status is exactly **Published**, with no date rule. That's why it seemed to stop at today. The table will now say so.
- The bot chart is relabelled in plain words; its human-visits axis says it **excludes AI-referred visits**. Splitting search bots from training bots waits on Peec crawl insights (Tina with Maddie and Kirk).
- Competitor tables show on the **Peec** view only; their data doesn't exist in Profound.
- All of this applies to **both the internal view and the client portal**, except where items 2–4 say otherwise.

→ **Any of these not what you'd expect?** (TF) This sounds right to me!

---

## Questions for the content team

1. **How much ranking slippage should count as "declining"?** We'd start at an average drop of one position or more, and it can be tuned per client. This is what item 4's third kind waits on.
   > *Danielle:* I think this makes sense. I'm fine with this.
1. **Are the New / Optimized labels right?** Renaissance's calendar has no new-or-optimized column, so the label is worked out from Content Type. We'll send the full list of Content Types with the label each gets; for example, is a "Blog" refresh being labelled New?
   > *Danielle:* The Content Types are correct in Column C. A refresh is labeled "Existing Blog Optimization". Is there something specific you would need us to change? — *Answer:* No. That maps to Optimized; nothing to change.
1. **Does Renaissance's calendar have a last-updated column?** "Last updated" shows blank. If the column exists under a heading or date format we don't read, we'll fix it on our side; if it doesn't exist, it needs adding to the calendar.
   > *Danielle:* We don't have a "last updated" column, but we do have a Publish Date column (column F). That is typically the last date that we updated or pushed anything live for that page or article. — *Answer:* That works; no new column. See the Resolutions table.
