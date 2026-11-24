# Decisions for Approval — AEO Overview v2

**If you disagree with any item, or it's not what you expected, flag it now.** Anything marked ⚠️ is a choice you might not expect.

This covers the Overview page iteration from Tina's brief and mockup (23 Nov 2026): five clearly separated sections, a KPI strip the AEO strategist can configure, competitor toggles on the trend chart, speedometers per AI model, a topic matrix, one Prompt Performance table, URLs instead of domains, and sortable deltas throughout. It applies to every AEO client, whether their AI data comes from Peec or Profound. The other AEO tabs (Content Impact, PR Influence, Sentiment, Technical Audit) don't change.

---

### ⚠️ 1. Clients keep today's page until the whole new page is signed off

We build the new page in pieces next to the current one, rather than changing the live page piece by piece. Renaissance gets the new page on staging first, and it fills in section by section as each piece is finished, so you can review it as it grows. No client sees anything new in the meantime.

Once you sign off on the complete page, every AEO client switches to it at the same time with one settings change, and the old page is retired. The upside is that no client ever sees a page that is half old and half new. The trade-off is that nothing reaches clients until the last section is done.

→ **Confirm one switch for everyone at the end — or say you'd rather ship each section to clients as it's ready.**

---

### 2. Five numbered sections, with a section menu

The page is organized the way the AMU mockup is, in this order:

1. **Snapshot KPIs**
2. **Visibility vs Competitors**
3. **Performance by AI Model**
4. **Topics & Prompts**
5. **Cited Sources**

Each section opens with a small numbered label, a question as its headline and a one-line description, and a divider separates the sections. A menu at the side links to each one and stays in view while you scroll (on desktop). Insights stay at the top, unchanged. We take the mockup's layout, not its palette: the page keeps the reporting site's existing look.

→ **Confirm.**

---

### ⚠️ 3. A "Compare to" choice, and a switch to hide every change figure

The date control gets a **Compare to** choice:

- **Previous period** (the default, and what the page does today)
- **Same period last year**
- **No comparison**

Choosing **No comparison** hides every change figure on the page. A separate **Show deltas** switch hides them by hand too, for a cleaner screenshot or client view. Both are saved in the page link, so a shared link or PDF opens the same way.

Two things to know:

- **Last year has no data yet.** Most clients started AI tracking this year (Renaissance's chart starts in mid-January), so "Same period last year" will show "–" for most of them until next year.
- **The choice carries across tabs.** As today, the date choice carries over when you switch to another AEO tab.

→ **Confirm.**

---

### 4. Every change figure gets its own column you can sort by

Wherever a number has a change figure, the change sits in its own column (headed Δ) right next to it, instead of in small text beside the value. Every column can be sorted by clicking its header, change columns included.

We'd also standardize what the change figures mean, because today's "↓ 4.4% vs previous period" doesn't say which it is:

| Kind of number | Example metrics | Change shown as | Example |
|---|---|---|---|
| Rates | visibility, share of voice, used as a source %, share of traffic, conversion rate | points | +1.2 pts |
| Counts | sessions, leads | percent | +114.6% |
| Rank | AI visibility rank | places | ↑ 2 places |

Green means better and red means worse. For rank, a lower number is better.

When there's nothing to compare against (a new client, or a prompt added this month), the cell shows "–" rather than 0, and a new prompt or page is marked **New**.

→ **Confirm.**

---

### ⚠️ 5. Only the Avenue Z team can choose the KPIs, and the choice is per client

An **Edit KPIs** button opens an on/off list of these 9 KPIs. Up to 5 can be on; once 5 are on, the others are greyed out until one is turned off.

| From Peec or Profound | From GA4 |
|---|---|
| AI visibility | AI search sessions |
| AI share of voice | Share of traffic from AI |
| AI visibility rank | AI search leads |
| Used as a source % | AI search CVR |
| Sentiment | |

How it works:

- **Who sees it:** only the Avenue Z team sees the button. Client admins, who can change some of their own report settings today, can't change these.
- **Per client:** the choice is saved for the client, so everyone who views that client sees the same strip.
- **Not connected:** a KPI whose source isn't connected for that client (for example, no GA4) is greyed out with "Source not connected".
- **Default:** until someone picks, a client gets AI visibility, AI share of voice, Used as a source %, AI search sessions and AI search leads.

Three of the GA4 KPIs are new data, not a relabel: share of traffic from AI, AI search leads and AI search CVR. Today the page only pulls AI sessions from GA4.

→ **Confirm team-only, per client, and the default five.**

---

### ⚠️ 6. Citation Share isn't in the new list

Today's strip shows **Citation Share** (12.1% for Renaissance over the last 30 days), but it isn't one of the 9. If we follow the list, it disappears from the page. It's closest to "Used as a source %" but not the same number: citation share counts how many of all citations point at your site, while used as a source counts how many AI answers used your site at all.

→ **Drop it, or add it as a 10th option?**

---

### ⚠️ 7. What "AI visibility rank" means

There are two reasonable readings:

- **Rank among tracked brands by visibility** ("#9 of 29"). This is what the mockup shows.
- **The AMU style** ("#1 in 13 of 41 topics").

→ **Pick one.** We'd default to rank among tracked brands.

---

### ⚠️ 8. The trend chart's "previous period" line needs a decision

The chart shows the year so far, always. The new competitor switch works as in Profound's chart:

- **Competitors on:** one line per brand with a checkbox each. It starts with the client plus the top 4 competitors; the client's line is bolder and always shown.
- **Competitors off:** the client against an earlier comparison line.

Because the chart covers the whole year while "Compare to" follows the date control, "previous period" isn't obvious here. The options:

- **(a) The same stretch last year.** Mostly empty: most clients have no tracking from last year.
- **(b) One line for the year, with the selected period and its comparison period shaded on it.** Works for every client.
- **(c) The chart follows the date control instead of the whole year**, with the comparison period as a grey line. The headline "How has AI visibility grown this year?" would change.

→ **Pick one.** We recommend (b).

We'd also limit the chart to about 8 lines at once and show a note when more are checked, so it stays readable. Each brand keeps the same color in the chart, the brand table and the topic matrix.

---

### 9. Brand table moves under the chart, with "Used as a source %" instead of Position

Columns:

- #, Brand
- Visibility, Δ
- Share of voice, Δ
- Used as a source %, Δ

For each brand, "Used as a source %" is the share of AI answers that used that brand's own website as a source.

- **Peec clients:** Peec tells us each brand's website.
- **Profound clients:** we may need to enter each tracked brand's website once per client. We'll confirm with Profound before building.

The client's row stays highlighted, and "See all" stays.

→ **Confirm.**

---

### ⚠️ 10. Speedometers use a true 0–100% scale

Each AI model the client is tracked on gets a speedometer, with a small tick showing the competitor average on that model. Under each one we show the value, the change ("↓ 3.1 pts vs previous period") and the competitor average. A switch flips all the speedometers between Visibility, Share of voice and Used as a source. Position is dropped here too, to match the brand table.

On a true 0–100% scale, share of voice will look nearly empty: Renaissance is around 2–8% per model.

→ **Keep the true scale (our recommendation, so the gauge never overstates) — or use a lower fixed maximum for share of voice?**

---

### 11. Topic matrix, directly above Prompt Performance

A heat map of visibility by topic, like AMU's "Visibility by program topic". Darker cells mean higher visibility. A **Competitors / Platforms** switch changes the columns:

- **Competitors:** the client plus its top 7 competitors, with a "Show all brands" option that scrolls sideways.
- **Platforms:** the client's visibility on each AI model.

The rows are the client's topics, as set up in Peec or Profound, sorted by the client's visibility. Hovering a cell shows its change.

→ **Confirm top 7 competitors by default.**

---

### 12. One Prompt Performance table replaces Biggest Winners / Biggest Losers

The table is full width, so prompts are never cut off. Columns:

- Prompt, Topic
- Rank, Rank Δ
- Visibility, Δ

Rank Δ is positive when the client moved up. The table opens with the biggest gainers first; one click shows the biggest losers first. Filters: All / Gained / Lost / No change. A prompt added this period shows **New** and sorts last.

→ **Confirm.**

---

### ⚠️ 13. URLs instead of domains, but Profound may only give domains

"Which domains do AI engines cite most?" becomes **"Which URLs do AI engines cite most?"** Columns:

- #, Page (title and full web address)
- Source type (yours, competitor, third party)
- Page type (product page, article, listicle…)
- Used as a source %, Δ
- Citation rate, Δ

Filters: All / Your URLs / Competitor URLs / Third-party. "Retrieved" is renamed **Used as a source %** everywhere on the page, so one idea has one name.

Peec gives page-level data. We haven't yet confirmed that Profound does. If it doesn't, Profound clients keep a domain-level version of this table, and we'll tell you before release.

→ **Confirm — including the domain-level fallback for Profound clients.**

---

### ⚠️ 14. Removing the competitor sections reverses a 20 Nov decision

As asked, four sections come off the page:

- "What kinds of sources do AI models cite?"
- "What do these domain types mean?"
- "Competitor visibility"
- "Where competitors are cited and you aren't"

The last two only just moved here. In the Content Impact decisions (20 Nov) you made them part of the default Overview, and Renaissance had asked for the competitor gap list. Removing them means it disappears for Renaissance and doesn't exist anywhere else in the report. Some of the same ground is covered by the new topic matrix and URL table, but the "cited where you aren't" list itself goes away.

→ **Confirm removal — or say where the "cited where you aren't" list should live instead (for example, back on Content Impact).**

---

### ⚠️ 15. Non-branded prompts only? This would change the headline numbers

The brief suggests a rule agreed for AMU:

- **Non-branded prompts only** for visibility, share of voice, rank, used as a source, the topic matrix and prompt performance.
- **Branded prompts only** for sentiment.

Today the Overview counts every tracked prompt. Switching would change Renaissance's headline numbers from what they've seen so far. We haven't measured by how much yet.

- **Peec clients:** feasible.
- **Profound clients:** we'd need to check how branded prompts are marked.

If we adopt it, it applies to every number on the page at once, so nothing on the page is measured two different ways.

→ **Adopt it in v2, or keep counting every prompt?** If you want it, we'd show you Renaissance's before-and-after numbers first.

---

### ⚠️ 16. Where "AI search leads" come from

The brief lists AI search leads as a GA4 number: lead events from visitors who came from AI search. Some clients also have a CRM connected, which knows which leads were real.

→ **GA4 for every client, or the CRM where a client has one?** We'd default to GA4.

---

### 17. Smaller assumptions — flag any you'd expect differently

- KPI tiles keep a one-line note underneath, such as the competitor average or the client's website.
- Fewer than 5 KPIs on: the tiles stretch to fill the row. None on: the team sees a prompt to pick some; clients don't see the section.
- KPI tiles appear in the order of the list, with no drag-to-reorder in this version.
- The trend chart keeps its Daily / Weekly / Monthly / Quarterly control.
- The model filter at the top still applies wherever it does today.
- A client with both Peec and Profound keeps the two provider tabs, each showing the new page from its own data.
- The PDF export matches what's on screen: compare choice, deltas on or off, selected competitors and matrix mode.
- Long prompts and web addresses wrap; they're never cut off.
- Everything applies to both the internal view and the client portal, except the Edit KPIs button, which is team-only.

→ **Any of these not what you'd expect?**

---

## What we need from the team

- **Tina:** answers to items 6, 7, 8, 10, 14, 15 and 16. Items 6, 7 and 16 hold up the KPI strip; item 10 holds up the speedometers. Everything else can start now.
- **AEO strategists:** which 5 KPIs each client should start with, if not the default in item 5.
- **Profound clients:** which clients are on Profound today, so we test the new page on one of them before the switch.
