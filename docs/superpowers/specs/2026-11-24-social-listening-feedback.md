# Social Listening feedback, 2026-11-24

The feedback list for this PR. Each item gets traced to the code before anything is built.

## 1. Analysis boxes sit apart from the charts

**What I want:** the analysis boxes come out of the chart cards and sit apart from them, so the charts inside a row of
cards line up evenly.

**Why it looks off today:** every chart card puts its analysis box inside the card, under the chart
(`components/report-sections/organic-social/design/frames.tsx:17-31`). Two cards side by side stretch to the same
height, but when one card has an extra line under its chart (the brand-owned note, `social-listening/brand.tsx:124`)
or a longer analysis, its chart and box sit at a different height from its neighbor's.

**Things to check before building:**
- The box went inside the card because the team asked for that on 2026-11-19 (`frames.tsx:1-3`). This reverses it.
- `SlCard` is also used by the Organic Social kit's YTD block (`parts/ytd-kit.tsx:17`), so a change there reaches
  that block too unless it is scoped to Social Listening.
- A card is one block in the PDF export (`data-export-block`, `frames.tsx:21`). The box needs to stay with its chart
  in the PDF.

The call confirms this. Jasmine wants every graph the same size, I said the boxes go underneath, outside the card, and
she said "That works" (call 00:23:12 to 00:24:04). So the 2026-11-19 placement is reversed by the team, not only by me.

## 2. From the call and the checklist

Sources: **call** is the 2026-11-24 weekly sync transcript (timestamps), **list** is Savannah's Slack checklist sent
after the call (4:42 PM), **notes** are Gemini's notes of the call. Paths: `SL/` is
`components/report-sections/organic-social/social-listening/`, `KIT/` is `components/report-sections/organic-social/design/`,
`LIB/` is `lib/organic-social/social-listening/`. Every line below was read in this branch (head a5cb6d04).

Where the call and the list disagree, the list wins (it is written, and it came after the call) and the item says so.

### Brand and industry, both topics

**F1. Analysis boxes outside the cards, cards in a row the same size.** Item 1 above. Call 00:23:12 to 00:24:04; notes.
- Today: the box is inside the card under the chart (`KIT/frames.tsx:28`), 14px under it (`KIT/kit.module.css:165`).
  Two-card rows: brand `SL/brand.tsx:117` (share of sentiment, without brand-owned) and `:139` (positive + neutral,
  Reddit); industry `SL/industry.tsx:39` (share of sentiment, sentiment year to date).
- Change: when a card has a box, the card and the box become two siblings in one wrapper, and the wrapper is the PDF
  block, so the box never leaves its chart (the export keeps a block on one page, `app/export/export-theme.css:24-26`).
  In a row, every card gets the row's tallest card height and every box starts on the same line.
- A card with no box renders exactly as today. That keeps the kit YTD block unchanged: it never passes a box
  (`components/report-sections/organic-social/parts/ytd-kit.tsx:33`).

**F2. A tooltip on every metric.** Call 00:05:42 to 00:08:08 ("tool tips in the data pills", "for all these", Jasmine:
"do the outline for everything now" since this gets copied to other clients); list; notes next step.
- Today: the kit tile already takes a tooltip and draws the shared hover hint (`KIT/charts.tsx:69-79`), but Social
  Listening passes none (`SL/brand.tsx:104`, `SL/industry.tsx:23`, `:25`). Chart cards have no tooltip (`KIT/frames.tsx:17-18`).
  The hint is dropped from the PDF (`components/charts/hover-hint.tsx:16`, `data-export-hide`).
- Change: one fixed table of tooltip text per tile and per chart, drawn on tiles and beside chart titles.
- Waiting on: the text. Savannah's list says the team is adding the definitions to the existing appendix doc and will
  send the link (Jasmine, call 00:06:31). No text gets invented.

**F3. The graph with the "jack-knife".** Call 00:06:31 to 00:07:17 (I saw it; Jasmine flagged it that morning); notes
next step ("fix the broken graph"). Not in Savannah's list.
- Not mapped yet: nobody named the graph. What the code rules out: the daily rows must be every day of the month once,
  in order, or the upload is refused (`LIB/export-parse.ts:227-244`), so the Results over time line cannot fold back on
  itself from bad row order. Staging last changed 2026-11-23 13:11 (`origin/staging` a16ad0cb), so a change "in the last
  30 minutes" on staging came from data, not code. Dev changed at 14:29 and 14:47 that day (#510, #515).
- Needs: which graph and which site. Then it gets debugged and reproduced before any fix.

**F4. Top conversation themes move into Themes.** Call 00:21:53 to 00:23:12; list (brand and industry); notes.
- Today: its own section and heading through `AnalysisOnly` (`SL/brand.tsx:57-61`, used at `:176`; `SL/industry.tsx:66`).
- Change: the same box drawn inside the Themes section, under its own small label. Box ids `b-conv` and `i-conv` stay,
  so written text keeps working (`LIB/boxes.ts:3-5`).
- Edge: industry's Themes section only draws with an upload (`SL/industry.tsx:57`, inside `r &&`), so without one the
  box would vanish for staff. It keeps showing in that case.

**F5. Keyword appendix carries over month to month.** Call 00:20:58, 00:21:53 (Jasmine checks it was said); list.
- Today: a box shows only an entry for the month on screen (`lib/commentary/month.ts:12-29`). Boxes `b-keywords` and
  `i-keywords` (`LIB/boxes.ts:10-11`, `:63-66`).
- Change: for these two boxes only, a month with no entry shows the newest earlier approved appendix. Nothing is copied
  or deleted. Editing it saves this month's own entry through the same draft and approve steps as today.
- Paul sends the industry appendix (call 00:28:24, his next step). It differs from brand's.

**F6. Optional annotations on the line graphs.** Call 00:24:04 to 00:25:03 (Jasmine: call out an AMA; optional, "if we
don't have anything to say it would still look normal, similar to what we did in the year-to-date graphs"; I said all
the graphs that become line graphs); list: brand Results over time, Sentiment YTD, Positive + neutral, Reddit YTD;
industry Results over time; notes.
- Today: Social Listening has no annotations. The Organic Social graphs store notes in `chart_notes`
  (`lib/db/schema.ts:427-450`): text columns for channel and chart, a day, up to 80 characters, draft and approve. A
  year to date note is stored on its month's 1st (`:431`). Saving checks the chart and needs notes on for the client
  (`app/actions/chart-notes.ts:40-65`, `lib/organic-social/chart-notes/enabled.ts`).
- Change: Social Listening notes in the same table and the same draft and approve steps, under a Social Listening
  channel value and one chart value per graph. Day notes on Results over time, month notes on the year to date graphs.
  No database migration (the columns are text). A graph with no approved note draws exactly as without notes.

### Brand only

**F7. Owned-channels note text.** List: "Excludes results from the brand's owned channels"; call 00:07:17 ("a text update").
- Today: `SL/brand.tsx:124`. Change: that string, word for word.

**F8. Year to date graphs: line by default, a toggle to today's columns, each full width and stacked.** Call 00:08:08 to
00:12:31 (three separate graphs, not combined, so each can have its own analysis; I offered a line/columns toggle,
Jasmine: "I like that"; "I'll make the default for all three of those line graphs"); list; notes decisions.
- Today: Sentiment YTD is full width columns (`SL/brand.tsx:135-138`); Positive + neutral (a line already,
  `KIT/charts.tsx:275-305`, drawn 480 wide at `:276`) and Reddit (columns) share a half-width row (`SL/brand.tsx:139-151`).
- Change: Sentiment YTD and Reddit YTD get a three-line view (positive, neutral, negative by month, a gap stays a gap,
  as `KIT/charts.tsx:5`), shown first, with a Line / Columns toggle. All three full width, one under the other.
- Open: Positive + neutral is already a line and has no columns form today, so what its toggle switches to is unclear.
- List also says "AI for OS: make a sheet with the YTD data". I read that as the Organic Social team's action. Not mapped.

**F9. Share of media types: change only, colour coded.** Call 00:12:31 to 00:15:01; list ("remove the column for the
September values, keep MoM % changes only; colour code them and adjust with +/-"); notes.
- Today: columns are media type (with this month's count), share bar, share %, change (`KIT/charts.tsx:205-220`). The
  change is grey on purpose (`neutral`, `:215`). It is the percent change in results against last month's uploaded
  export; delivered-report rows hold no media types, so with no September upload every change is "n/a"
  (`LIB/compare.ts:167-174`). That is why the screen showed n/a, as I said on the call.
- There is no September values column today. If the list means something on screen, it needs naming.
- Change: up arrows green, down red, with the sign, through the tiles' existing change line (Paul: "we already have
  this mechanism").
- Open: where September's baseline comes from (Jasmine: "it should just on the back end get it").

**F10. Share of media types by sentiment (deck slide 9).** Call 00:10:36 to 00:11:44 and 00:15:01 (Paul: the volume
cut by sentiment; colour coded); list.
- Today: share bars are one colour (`KIT/charts.tsx:213`). A separate Sentiment by media type card already shows each
  type's split as a 100% bar (`SL/brand.tsx:130-132`, `KIT/charts.tsx:183-202`) and stays as is (call 00:27:23).
- Not mapped yet: I can't see slide 9. Needs the slide. My guess, unconfirmed: each share bar keeps its length and is
  split into sentiment colours.

**F11. Top influencers: pull 25, remove per month, sort by reach and engagement.** Call 00:15:01 to 00:20:58; list
("don't permanently remove authors, only for the current month"); notes next step.
- Today: the parser keeps the export's first 5 (`LIB/export-parse.ts:37`, sliced at `:356`); the table keeps export
  order (`SL/brand.tsx:192-221`). Talkwalker exports only the rows its widget shows (Paul, call 00:17:08), so 25 needs
  the widget widened in Talkwalker first. Uploads already stored hold 5 rows (the raw file is kept, `lib/db/schema.ts:639`,
  but it only ever had 5), so October needs a new export.
- Change: keep up to 25; staff hide or restore an author for one month (stored per month, never deleted, a new small
  table, so a migration); clients see only kept authors; sort by posts, reach or engagement.
- Unchanged: the four overview cards (call 00:20:58, "okay how it looks right now"). They come from Talkwalker's own
  Overview widget (`LIB/view-model.ts:146`).

**F12. Trends in keyword themes not filling in.** Call 00:19:47 (Paul: "pull it against September trends and
keywords"; I said I'd look); list (slide 12); notes next step ("investigate").
- Today: nothing pulls trends. Talkwalker's export does not hold them, so staff type them each month (`LIB/trends.ts:1-3`);
  an empty month reads "Not entered yet. Type the trends from the Talkwalker dashboard." (`SL/trends.tsx:86`). Saved
  and read per month (`app/actions/social-listening.ts:269-280`, `LIB/store.ts:31`, `:103`). How trends get filled was
  an open choice before the build (`docs/social-listening/export-coverage.md:61`: screenshot, typed, or our own estimate).
- Needs: a read-only look at staging for the October trends row, then a choice: keep typing, or work them out from
  this month's themes against last month's (which needs the same September baseline as F9).

### Industry only

**F13. Remove "Sentiment, May to October".** List. The call (00:27:23) said the industry bar charts turn into line
graphs with a toggle; the list, written after, says remove this one. Following the list.
- Today: `SL/industry.tsx:44-46`, box `i-ytd`. Change: the card goes. Share of sentiment is left alone in its row. The
  `i-ytd` id stays in the box list, so any text written there is kept, just not shown (`LIB/boxes.ts:3-5`).

**F14. Sentiment over time: line by default, toggle to today's columns.** List; call 00:27:23.
- Today: stacked daily columns (`SL/industry.tsx:48-51`, `KIT/charts.tsx:307-332`). Change: a three-line daily view
  first, the same toggle as F8.

**F15. Keyword themes by sentiment.** List ("needs to be sorted by sentiment"); call 00:27:23 to 00:28:24 ("we usually
cut this by sentiment so the colors will change", "coming from export", "Correct").
- Today: the industry cloud uses decoration colours with a note saying so (`SL/industry.tsx:58-60`, `KIT/charts.tsx:355`).
  The October industry export's theme colours are 25 one-off colours that mean nothing (`LIB/colors.ts:31-34`), unlike
  brand's five sentiment colours read by `themeTone` (`LIB/colors.ts:35-40`).
- So the export can't give sentiment today. The industry theme widget in Talkwalker has to be set to colour by
  sentiment first; then the cloud reads it as brand does and the decoration note goes.

### Heard on the call, no code change

- **N1. October differs from the delivered report.** Talkwalker kept counting posts that picked up after the report
  (call 00:25:03 to 00:27:23). The page already compares with the numbers as presented (`LIB/compare.ts:111-138`).
- **N2. Positive, neutral and negative stay as separate graphs**, not combined (call 00:09:47). Paul's part-of-a-whole
  point is for future clients (Jasmine, 00:10:36).
- **N3. Sentiment by media type keeps its format** (call 00:27:23).
- **N4. Most relevant posts:** not tested by the team yet (call 00:21:53). No change.
- **N5. Two exports, brand sentiment and industry sentiment** (call 00:26:12 to 00:27:23). Matches the upload today.
- **Phase 3 (an analysis box under every chart on the other Organic Social tabs):** not on the call or the list. "The
  analysis stuff in all these boxes" (00:23:12) was about this tab. Its two open questions were not discussed.
- Not this build: Renaissance influencer approvals, comment engagement, the content calendar, the Dash competitor
  audit, Glean, Asana, the AEO dashboard.
