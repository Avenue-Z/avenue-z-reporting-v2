# Decisions for Approval — AEO Overview Page

**If you disagree with any item, or it's not what you expected, flag it now.** Anything marked ⚠️ is a choice you might not expect.

This covers Tina's Overview brief and mockup (23 Nov 2026), for every AEO client on Peec or Profound. The other AEO tabs don't change.

---

## ✅ Resolutions — 25 Nov 2026

From Tina Fleming's inline notes (TF) and comments on the doc. Items marked **Changed** alter the design.

| # | Decision | Resolution |
|---|---|---|
| 1 | One switch at the end | **Confirmed.** "Can be staged as a new page to help keep the live Renaissance report safe." Renaissance is the only client on this page today. v2 stays on staging and is promoted only after the account lead approves (Paul, 25 Nov). |
| 2 | Five numbered sections | **Confirmed.** |
| 3 | Compare to and Δ columns | **Confirmed.** |
| 4 | KPIs team-only, per client, default five | **Confirmed.** Rank = rank among tracked brands. Leads = GA4 "conversions" (key events) by default, custom per client later. Melena sets each client's KPIs at rollout. Citation Share: not answered directly; we follow the list of 9 and drop it. |
| 4 | Leaderboards | **Changed (new):** when the client isn't in a top-N list, show it as the last row with its rank. |
| 5 | Trend chart "previous" | **(b)**: one line for the year, selected and comparison periods shaded. |
| 6 | Brand table | **Confirmed.** |
| 7 | Speedometer scale | **Keep the true scale.** |
| 8 | Topic matrix and Prompt Performance | **Confirmed.** |
| 9 | URLs instead of domains | **Confirmed. Changed:** Profound provides page-level data, so no domain-level fallback. |
| 10 | Remove competitor sections | **Removal confirmed.** |
| 11 | Prompt scope | **Changed:** Peec uses all prompts (branded prompts aren't put in Peec). Profound uses "Visibility"-type prompts for visibility metrics and "Sentiment"-type prompts for sentiment. |
| 12 | Smaller assumptions | **Changed:** one primary tool per client (Peec or Profound), so nothing is built for clients with both. |
| — | Profound test client | Renaissance is Peec; Avenue Z is Profound. Future clients' tools will be provided. |

---

### ⚠️ 1. Clients keep today's page until the whole new page is signed off

We build the new page next to the current one. Renaissance sees it on staging first, filling in section by section, while no client sees anything new. Once you sign off, every AEO client switches at once. Nobody ever sees a half-old, half-new page; the trade-off is that nothing reaches clients until the last section is done.

**→ Confirm one switch at the end — or say you'd rather ship each section as it's ready.**

---

### 2. Five numbered sections, with a side menu

Snapshot KPIs, Visibility vs Competitors, Performance by AI Model, Topics & Prompts, Cited Sources. Each opens with a numbered label, a question headline and one line of description, like AMU. Insights stay at the top. We take the mockup's layout, not its colors.

**→ Confirm.**

---

### ⚠️ 3. "Compare to", and every change figure in its own sortable column

The date control gets **Compare to**: Previous period (default, as today), Same period last year, or No comparison. No comparison, or a new **Show deltas** switch, hides every change figure on the page. Both are kept in the page link, so PDFs match.

Every change figure moves into its own Δ column, and every column sorts. Changes in rates (visibility, share of voice, used as a source) show in **points**, counts (sessions, leads) in **percent**, and rank in **places**. Today's "↓ 4.4%" doesn't say which. Nothing to compare against shows "–", never 0; a new prompt or page shows **New**.

Most clients started tracking this year, so "Same period last year" will mostly show "–" until 2027.

**→ Confirm.**

---

### ⚠️ 4. KPIs: only the Avenue Z team picks them, per client

An **Edit KPIs** button, visible only to the team (not client admins), turns up to 5 of these 9 on: AI visibility, AI share of voice, AI visibility rank, Used as a source %, Sentiment (from Peec or Profound); AI search sessions, Share of traffic from AI, AI search leads, AI search CVR (from GA4). The choice is saved per client. Until someone picks, a client gets visibility, share of voice, used as a source %, AI sessions and AI leads. KPIs whose source isn't connected are greyed out.

Three questions before we build it:

- **Citation Share** (12.1% for Renaissance today) isn't in the 9, so it would disappear. Drop it, or add it as a 10th?
- **AI visibility rank:** rank among tracked brands ("#9 of 29", as in the mockup), or the AMU style ("#1 in 13 of 41 topics")?
- **AI search leads:** GA4 lead events for every client, or the CRM where a client has one? We'd default to GA4.

**→ Confirm team-only and the default five, and answer the three questions.**

---

### ⚠️ 5. Trend chart: what the "previous period" line should be

With competitors on, the chart shows one line per brand with checkboxes, starting with the client plus the top 4 competitors (about 8 lines at most). With competitors off, it shows the client against a comparison line. The chart always covers the year so far, while Compare to follows the date control, so "previous" needs a decision:

- (a) The same stretch last year. Mostly empty, since most clients started tracking this year.
- (b) One line for the year, with the selected period and its comparison period shaded. Works for every client.
- (c) The chart follows the date control instead, with the comparison period in grey. The "this year" headline would change.

**→ Pick one. We recommend (b).**

---

### 6. Brand table under the chart, with "Used as a source %" instead of Position

Columns: Brand, Visibility, Share of voice, Used as a source % (the share of AI answers that used that brand's website), each with Δ. Peec tells us each brand's website. For Profound we may need to enter competitors' websites once per client. Each brand keeps one color across the chart, the table and the topic matrix.

**→ Confirm.**

---

### ⚠️ 7. Speedometers use a true 0–100% scale

One speedometer per AI model, with a tick for the competitor average and the change underneath. A switch flips them between Visibility, Share of voice and Used as a source. On a true scale, share of voice looks nearly empty: Renaissance is about 2–8% per model.

**→ Keep the true scale (we recommend it, so the gauge never overstates) — or use a lower maximum for share of voice?**

---

### 8. Topic matrix above one Prompt Performance table

A heat map of visibility by topic, as in AMU, with a **Competitors / Platforms** switch: the client plus its top 7 competitors (or all brands), or the client on each AI model. Below it, one full-width **Prompt Performance** table replaces Biggest Winners / Biggest Losers: full prompt text, Topic, Rank and Rank Δ, Visibility and Δ, opening with the biggest gainers. Filters: All, Gained, Lost, No change.

**→ Confirm.**

---

### ⚠️ 9. URLs instead of domains, but Profound may only give domains

The cited-sources table lists pages: title and full address, source type, page type, Used as a source % and Citation rate, each with Δ. "Retrieved" becomes **Used as a source %** everywhere. Peec gives page-level data; we haven't confirmed Profound does. If not, Profound clients keep a domain-level table.

**→ Confirm, including the fallback.**

---

### ⚠️ 10. Removing the competitor sections reverses a 20 Nov decision

Four sections come off: the source-type chart, the domain-type legend, "Competitor visibility", and "Where competitors are cited and you aren't". On 20 Nov you made the last two part of the default Overview, and Renaissance had asked for the gap list. Removed, it no longer appears anywhere in the report.

**→ Confirm removal — or say where the "cited where you aren't" list should live (for example, back on Content Impact).**

---

### ⚠️ 11. Non-branded prompts only would change the headline numbers

The brief suggests the AMU rule: non-branded prompts for visibility, share of voice, rank, used as a source, the matrix and prompt performance; branded prompts for sentiment. Today the Overview counts every prompt, so switching changes Renaissance's numbers (by how much, we haven't measured). It works for Peec; Profound needs checking. It would apply to every number at once.

**→ Adopt it, or keep every prompt? If you want it, we'll show Renaissance's before-and-after first.**

---

### 12. Smaller assumptions — flag any you'd expect differently

- KPI tiles keep a one-line note (competitor average, client website) and stretch when fewer than 5 are on; no drag-to-reorder yet.
- The trend chart keeps Daily / Weekly / Monthly / Quarterly; the model filter still works.
- Clients with both Peec and Profound keep both tabs, each on the new page.
- The PDF matches the screen; long prompts and addresses wrap rather than get cut off.
- Everything shows in the internal view and the client portal, except Edit KPIs.

**→ Any of these not what you'd expect?**

---

## What we need from the team

- **Tina:** answers to items 4, 5, 7, 10 and 11 (4 and 7 hold up the KPI strip and speedometers).
- **AEO strategists:** each client's starting 5 KPIs, if not the default.
- **Profound clients:** which clients are on Profound, so we test on one before the switch.
