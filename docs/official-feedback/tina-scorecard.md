# AEO Feedback Scorecard — Tina

A direct mapping of every piece of feedback you sent on the AEO Overview and PR Influence tabs to exactly what shipped. Use this to spot-check the live report. If any change looks different from what you intended, flag it and I'll adjust — the goal here is to make any miscommunication immediately obvious instead of buried.

**Live link (PR Influence tab):** https://reports.avenuez.com/dashboard/avenue-z/reports?section=peec-ai&tab=pr-influence

---

## Overview tab

### Consistent header treatment across all 4 AEO tabs

> "I would like to have a consistent header across all the tabs and I REALLY like the style of the Content one. Can we basically copy/paste this across each of the 4 tabs and then just change out the icon / copy to be tailored to the purpose of each tab?"

| What changed | Where to look |
|---|---|
| All 4 AEO tabs (Overview, PR Influence, Content Impact, Technical Performance) now use the same green icon + bold question + subtitle treatment from your Content Impact reference. | Top of each AEO tab. |
| Icons tailored per tab: Sparkles (Overview), Megaphone (PR Influence), the existing Content + Technical icons retained. | |
| Technical Performance icon flipped from yellow to green for consistency. | |

---

### Overview tab redesign batch

> Drop the rolling-week pills (a). Swap KPIs to Visibility / Citation Share / AI Referral Traffic (b). Add an AI-generated executive synopsis at the top (c). Add a "Snapshot KPIs" eyebrow (d). Move the trend chart below the KPI grid (e).

| What changed | Where to look |
|---|---|
| Rolling pills removed. | Top of Overview tab. |
| 3 KPI cards: Visibility, Citation Share, AI Referral Traffic (with period-over-period deltas). | Snapshot KPIs section. |
| Executive Synopsis card added at the top, Glean-generated, executive style with recommended actions. | First card under the page header. |
| "Snapshot KPIs" eyebrow label added above the KPI grid. | Just above the 3 KPI cards. |
| Visibility trend chart moved below the KPI grid. | Below the Snapshot KPIs. |

---

### Vertical axis on the visibility trend chart

> "Add a vertical axis."

| What changed | Where to look |
|---|---|
| Five percent-tick labels (0% → 100%) on the left side of the Visibility Over Time chart. | Y-axis of the trend chart on the Overview tab. |

---

### Domain Types chart recolored to the Avenue Z brand palette

> Recolor the Domain Types chart and legend with the brand palette.

| What changed | Where to look |
|---|---|
| All gray bars/dots removed. Now uses the 5 brand accents (cyan, green, blue, yellow, purple) for primary categories. Secondary categories use parent-accent colors at lower opacity. | "What kinds of sources do AI models cite?" section. |

---

### Brand categories section removed; Leaderboard stretched full-width

> Remove the brand-categories chart + its definitions block. Stretch the Leaderboard.

| What changed | Where to look |
|---|---|
| The "Which categories of brands earn AI share of voice?" chart and the "What do these brand categories mean?" definition box are both gone. | Used to live in the right column on the Overview tab — now removed. |
| The Rankings / Leaderboard table now spans the full width of the page. | Same section. |

---

### Biggest Winners + Biggest Losers cards

> Add static winners + losers (Avenue Z's actual prompt-level changes from the AEO Analysis doc).

| What changed | Where to look |
|---|---|
| Two cards added side-by-side: Biggest Winners (17 prompts) and Biggest Losers (20 prompts), using the verbatim data from your AEO Analysis doc (Profound, Last 14 Days, ChatGPT). | "Snapshot" section, between Model Breakdown and the Leaderboard. |
| Scoped to Avenue Z only — other clients (iPullRank, Shopify, Renaissance) do not see these cards, since the content is static and Avenue Z-specific. | |

---

### Model Breakdown "Google" disambiguated from Gemini

> (Found during build, not directly requested) — discovered the "Google" row in the Model Breakdown was silently absorbing Gemini data because of an upstream bucketing bug.

| What changed | Where to look |
|---|---|
| Fixed: Google AI Overview and Gemini now show as separate rows in the Model Breakdown. The "Google" label was renamed to "Google AI Overview" to disambiguate. | "How does each AI engine rank our brand?" section, Model Breakdown table. |

---

## PR Influence tab

### Recommended layout — top of tab

> "ADD: AI-generated synopsis of overall PR influence on AEO & recommended actions during the period, executive overview style."

| What changed | Where to look |
|---|---|
| Executive Synopsis card added at the top of the PR Influence tab. 2-3 paragraphs of executive prose + a "Recommended Actions" bulleted list. AI-generated using the same Glean-based synopsis pattern as the Overview tab. | First card on PR Influence tab, under the page header. |

> "REMOVE: The pills for 'How is AI-driven PR coverage performing?'"

| What changed | Where to look |
|---|---|
| The 6-pill KPI strip that used to sit under the question is gone. The page header itself still asks "How is AI-driven PR coverage performing?" (the icon + question + subtitle treatment from the consistent-header batch). | Top of PR Influence tab. |

> "ADD: Sentiment Insights"

| What changed | Where to look |
|---|---|
| Sentiment Insights card added directly under the Executive Synopsis. | Second card on PR Influence tab. |

---

### Sentiment Insights spec

> "Sentiment as a KPI pill."

| What changed | Where to look |
|---|---|
| "POSITIVE 89.4%" pill (brand green) sits in the top-right of the Sentiment Insights card header. | Top-right of the Sentiment Insights card. |

> "Positive Themes & Negative Themes side-by-side."

| What changed | Where to look |
|---|---|
| Two-column grid inside the card. Left column: "Positive Themes." Right column: "Negative Themes." | Inside the Sentiment Insights card. |

> "When you click on a theme, it opens an accordion to show the corresponding sources cited."

| What changed | Where to look |
|---|---|
| Each theme row is a clickable accordion. Click expands the row and reveals the source URLs cited under it. Click again to collapse. Chevron icon rotates 90° on expand. | Either column inside the Sentiment Insights card. |

**Note on data:** the content (themes, URLs, percentages) is your verbatim AEO Analysis doc, hardcoded for Avenue Z while we validate the layout. Other clients do not see Sentiment Insights yet — we'll wire it to live per-client data once the shape is signed off.

---

### Top Editorial Domains — columns + subtitle revision

> Citation Count → Citation Share. Remove Avg Citation column. Remove PR column. Remove legend on bottom left corner.

| What changed | Where to look |
|---|---|
| "Citation Count" column renamed to "Citation Share." | Top Editorial Domains card column header. |
| "Avg. Citations" column removed. | Gone. |
| "PR" column removed. | Gone. |
| Bottom-left legend ("Editorial domain" / "Has PR placement") removed. | Gone. |
| Final 3 columns: Domain · Citation Share · Prompt Coverage %. | Top Editorial Domains card. |

> "Rephrase subtitle... New: These domains are the most likely to surface as cited sources in AI-generated results, so they should be prioritized on the media target list."

| What changed | Where to look |
|---|---|
| Subtitle replaced verbatim. | Directly under the Top Editorial Domains card title. |

**Interpretation note:** the "Old" subtitle text you pasted actually matched a different card (PR Placement Matchback), but your "New" text clearly describes editorial-domain pitch targeting, so I applied it to Top Editorial Domains. If you meant Matchback to get rephrased instead, let me know.

---

### Top Editorial Domains side-by-side with Prompt Clusters

> "Maybe this one can go side-by-side with the next chart since we are reducing both of them?"

| What changed | Where to look |
|---|---|
| Top Editorial Domains card (left) and the Prompt Clusters chart (right) now sit in a side-by-side wrapper, both reduced. | Below the Sentiment Insights card. |

---

### Prompt Clusters — chart revision

> "Chart Revision: Turn this into a simple bar chart with the dimension being 'Topic' and the metric being % citation share from editorial sources."

| What changed | Where to look |
|---|---|
| The old 7-column sortable table is gone. Replaced with a simple horizontal bar chart. Y-axis: cluster name. X-axis: % editorial citation share (0–100). Sorted descending so the top opportunity is at top. | "Which prompt clusters offer the biggest PR opportunity?" card. |
| All-bars colored editorial blue. Hovering a bar shows the cluster name + exact percentage in white text. | |

**One thing we found:** the underlying calculation that drove this metric had a pre-existing bug — it was computed globally once and copied to every cluster, so every bar would have rendered at 100%. We fixed the calculation to compute per-cluster from your real Peec data before this shipped, so the bar lengths now reflect actual editorial citation share per topic.

---

### Top Editorial Opportunities — full rebuild

> "Title Revision Old: Which editorial domains cite our competitors but not us? New: What are the top pitch opportunities for getting our brand mentioned in AI?"

> "Subtitle Revision New: Prompt-level citations on the rise where your brand is not mentioned, revealing outreach opportunities that may require different strategies depending on the type of article being cited."

| What changed | Where to look |
|---|---|
| Title and subtitle replaced verbatim. | Last card on the PR Influence tab. |

> "Columns Revision: Publication, Article (combine article title and hyperlink it with the URL), Competitors Mentioned, Citation Share, Delta of Citation Share."

| What changed | Where to look |
|---|---|
| 5-column layout in this order: Publication · Article · Competitors Mentioned · Citation Share · Delta of Citation Share. | Top Editorial Opportunities card. |
| "Article" cell shows the article title as a clickable hyperlink to the article URL. If only the URL is available, it links the URL directly. If neither, shows `--`. | "Article" column. |
| Brand Mentioned, Opportunity Priority, and Suggested PR Angle columns all removed. | Gone. |

> "Chart Revision: Only show articles where the brand is not mentioned (or if it has no data so we can check manually). Only show articles with a positive delta on citation share. Remove the footnote at the bottom of the chart."

| What changed | Where to look |
|---|---|
| Filter 1: only rows where the brand is not mentioned in the article (or where article-level mention data is unavailable, so the row is preserved for manual review). | Filter active by default. |
| Filter 2: only rows with a positive delta on citation share. | Filter active by default. |
| Footnote at the bottom removed. | Gone. |

**Heads up on what you'll see:** for Avenue Z's current data, both filters combined leave one qualifying row (growthmarketingpro.com). That's the filter doing its job — only outlets with rising citation share and no brand mention surface here. If you want to relax the filter (e.g., delta ≥ 0 instead of > 0), say the word.

---

### REMOVES

> "REMOVE: Where should we pitch next to close AI visibility gaps?"

| What changed | Where to look |
|---|---|
| The entire "Next Pitch Opportunities" section is gone. | Used to live below Top Editorial Opportunities. |

> "REMOVE: How is the opportunity score calculated?"

| What changed | Where to look |
|---|---|
| The 4-weight methodology block at the bottom of the page is gone. | Used to live at the very bottom of the tab. |

---

### Final layout order

Per your recommended-layout screenshot, the PR Influence tab now flows top-to-bottom as:

1. **How is AI-driven PR coverage performing?** (section header)
2. **Executive Synopsis**
3. **Sentiment Insights**
4. **Top Editorial Domains** + **Which prompt clusters offer the biggest PR opportunity?** (side-by-side)
5. **What are the top pitch opportunities for getting our brand mentioned in AI?** (Top Editorial Opportunities)

PR Placement Matchback was also removed. Your recommended-layout mockup consistently omitted it across multiple feedback rounds, so we treated that as intentional. If you actually wanted Matchback kept, easy to restore.

---

## What's still open

| Tab | Status |
|---|---|
| Overview | Fully shipped per your June 17 batch. Awaiting any iteration feedback after you've had a chance to look at the live version. |
| PR Influence | Fully shipped per your June 17 batch. This scorecard reflects the live state. |
| Content Impact | Not yet touched. Will start the next batch when you send Content Impact feedback. |
| Technical Performance | Not yet touched. Same as above. |

---

## How to use this scorecard

If anything you see in the live report doesn't match what you intended, point at the row in this doc and I'll adjust. The goal is to surface any miscommunication immediately — if I interpreted something differently than you meant, this is the place to catch it before it festers.
