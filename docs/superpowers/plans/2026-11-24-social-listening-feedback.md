# Plan: Social Listening feedback from 2026-11-24

Builds the items in `docs/superpowers/specs/2026-11-24-social-listening-feedback.md` (F1 to F15). That file holds the
map from each point to the code, with line citations, and my decisions. This plan holds only the build: what changes,
in what order, how each part is tested and what guards stay on. Status: **decided except the questions in section 3**. Nothing here is built yet. Review rounds (at most two, fresh-eyed, foreground, never Fable) run on this plan before
the first unit.

Paths use the same prefixes as the feedback list: `SL/`, `KIT/`, `LIB/`.

## 1. Shape and rules

- **Shape.** `feat/social-listening-1124-feedback` (#518) is the deliverable branch. Each unit below is its own branch
  off it and its own PR into it, standalone, mergeable in any order unless a unit says it waits for another. #518
  then goes to dev as one reviewed unit.
- **Social Listening on staging is approved.** Before the first change, measure the October brand and industry views
  on staging (staff view and client preview): the box of every card, tile and analysis box through `getComputedStyle`,
  plus one PDF export. Saved privately in `~/.claude/organic-social-work/` (it is client data), never in this repo.
  After each unit, the same measurements locally, and every difference is one the unit meant to make.
- **Renaissance byte-identical.** The Organic Social golden and parity tests (`parts/*.golden.test.tsx`,
  `parts/version-parity.test.tsx`) pass unchanged. Any test change outside Social Listening stops the unit, except the
  export request tests in Unit C, which must show every non-Social Listening request unchanged.
- **No conflicts with the open PRs.** #516 and #517 both edit `parts/ytd-kit.tsx`, and #517 edits
  `KIT/kit.module.css`, `ytd-notes-panel.tsx`, `note-form.tsx` and `note-actions.tsx`. No unit edits those. New styles
  go in a new CSS module next to the Social Listening components. Before #518 leaves draft: it merges clean with dev,
  with #516, with #517, and with both, each proved in a throwaway merge.
- **Test first.** Each unit's tests are written and fail before its code.
- **No database writes** anywhere without my go for that exact write, uploads included. Migrations are written and
  tested on PGlite (`*.pglite.test.ts`, as `LIB/store.pglite.test.ts` does), applied to dev and staging only on my go.
- **Approved text is never deleted.** No box id is renamed or removed (`LIB/boxes.ts:3-5`). New ids go at the end.
- **Client data never enters the repo.** Real exports and deck numbers are checked in private scratch only.
- **Commit and push each finished unit.** `git add` by name.

## 2. Decided (2026-11-24)

| # | Item | Decision |
|---|---|---|
| D1 | F3 | It was on Share of sentiment and is gone. Try to reproduce on October data; if it doesn't come back, close it |
| D2 | F8 | Positive + neutral: no toggle, full width |
| D3 | F8, F14 | Clients get the toggle; the PDF prints whichever view is on screen |
| D4 | F9, F11 | Every comparison works against what the client saw. November's baseline is the delivered October deck, stored once on October's history row (media counts and top five authors added) |
| D15 | All | The client first sees the tab with November. October is a stored baseline, never a client page, so no October upload is swapped and September's media and authors are not needed |
| D5 | F10 | The chart is slide 10 of the October deck (screenshot kept privately) |
| D6 | F11 | The team picks which authors show, per month; clients see only those |
| D7 | F11 | Sort by posts (default), reach or engagement, for every viewer |
| D8 | F11 | A hidden author is hidden from the overview cards too |
| D9 | F12 | Trends stay typed; check staging first |
| D10 | F5 | The appendix carries over to clients with no new approval; Savannah can still edit it |
| D11 | F1, F13 | Every chart card on its own full-width row, no cards side by side |
| D12 | F15 | Savannah switches the industry theme widget to sentiment colours and re-exports |
| D13 | Phase 3 | Parked |
| D14 | Shape | Deliverable branch, one PR per unit |

Waiting on other people: tooltip text (Savannah's doc, F2), the industry keyword appendix (Paul, F5), the industry
widget change and re-export (F15), the team's YTD data sheet (list, F8, purpose to confirm).

The one-time reset (D4, D15) is three steps, each on my go: a read-only check that October's history row on staging
equals the final October deck; the migration for media counts and top authors on the history row; entering October's
values from the deck (privately checked; the numbers never enter the repo). From November the tab keeps its own record
(`LIB/compare.ts:111-114`), as long as the client's numbers come from the tab.

## 3. Decided later on 2026-11-24

| # | Question | Decision |
|---|---|---|
| Q2 | When a media type is new this month, its results were inside last month's Other. Should Other read n/a then? | Yes (`docs/social-listening/mock.template.html:759` records the September case) |
| Q3 | F13: Savannah's list removes the industry May-to-month chart, but both decks have it as its own slide ("Sentiment Over Time"). Remove it, or draw it as lines with the toggle? | Confirm with Savannah; until she answers, it stays and becomes lines with the toggle |
| Q4 | The decks' influencer table has "Reach per mention" and "Engagement per mention"; the tab has neither. Add them? | Yes |

Q4's columns are reach and engagement divided by posts. On the final October deck that reproduces both columns to
their rounding for every row (checked privately); the build checks it again against the export's own columns, if the
export carries them, before choosing which to show.

## 4. Units, in build order

Units A to C need none of the waiting inputs.

### Unit A: layout and copy (F1, F3, F4, F7, F13)

Files: `KIT/frames.tsx`, a new `SL/layout.module.css`, `SL/brand.tsx`, `SL/industry.tsx`.

1. `SlCard`: when `box` is given, render `<div data-export-block><div class=card>head, body, note</div>{box}</div>`; the
   card itself loses `data-export-block` in that case only, so the box stays on the chart's PDF page
   (`app/export/export-theme.css:24-26`). With no `box`, the markup is today's, character for character. The file
   header (`KIT/frames.tsx:1-3`) changes to say the box sits under the card, as the team asked on 2026-11-24.
2. No two-card rows: brand's two sentiment cards (`SL/brand.tsx:117-129`) and industry's share of sentiment
   (`SL/industry.tsx:39-47`) each take a full row. The donut and legend lay out for the wider card.
3. F4: `b-conv` and `i-conv` move into the Themes section with a small "Top conversation themes" label; the industry
   box still shows for staff with no upload.
4. F7: the owned note string at `SL/brand.tsx:124`.
5. F13: the industry month-by-month card stays until Savannah answers Q3, and becomes lines with the Line / Columns toggle (Unit C). If she confirms removal, the card goes and share of sentiment takes the full row.
6. F3: a reproduction attempt on the October data before the layout change (staff, client preview, 375px and 1400px).
   Result recorded in the unit's PR. No fix without a reproduction.

Tests (first): `SlCard` with a box puts the box outside the card and both inside one export block; without a box the
render equals a snapshot of today's markup; the kit YTD block's tests pass unchanged; no `.g2` grid holds a chart card
on either topic; the conversation box sits inside Themes; the new owned text; no industry YTD card.
`SL/section.snapshot.test.tsx` is updated on purpose and its diff read line by line.

### Unit B: tooltips (F2)

Files: a new `LIB/tooltips.ts` (the text table), `SL/brand.tsx`, `SL/industry.tsx`, `KIT/frames.tsx` (an optional
`tooltip` beside the card title, using the shared hover hint, `components/charts/hover-hint.tsx`).

Built with the table empty (a tile with no text draws no hint, exactly as today); the text lands in one commit once
Savannah's doc arrives, quoted word for word and pinned by a snapshot. Tests: every tile and card title looks up the
table; a missing entry draws nothing; the hint never prints in the PDF.

### Unit C: line views, the toggle, and the PDF (F8, F14)

Files: `KIT/charts.tsx` (two new charts: sentiment shares by month as three lines with gaps, and results per day by
sentiment as three lines), a new client component `SL/chart-toggle.tsx`, `SL/brand.tsx`, `SL/industry.tsx`,
`LIB/params.ts`, and the export path: `lib/export/request.ts`, `components/export-pdf-button.tsx`, and
`app/export/[clientSlug]/[section]/page.tsx`.

- The toggle shows the line first. A choice of columns is kept in the page URL (one short param listing the charts set
  to columns), the export button sends it, and the export page draws those charts as columns. That is the AEO tab's
  pattern (`lib/export/request.ts:16-19`, `:50-51`, `:59-60`, `:72-73`). The param is checked against the fixed list of
  toggle charts; anything else is ignored.
- Brand: Sentiment YTD and Reddit YTD toggle; Positive + neutral does not; all three full width, stacked.
- Industry: Sentiment over time (daily) toggles, and so does the month-by-month card while it stays (Q3).

Edge-case list for the commit body: the param comes from the browser, so an unknown chart id, a repeat, or an
oversized value is dropped, never echoed; a request with no param is the request of today.

Tests: the line charts break at a gap month and label each point; the toggle starts on line and switches; the columns
view is today's chart unchanged; the export page draws columns only for the charts the param names; every export
request without the param is byte-identical to today (`lib/export/request.test.ts`).

### Unit D: media types (F9, F10)

Files: `KIT/charts.tsx` (`MediaShare`, and a new sentiment-by-media chart), `LIB/compare.ts` (the deck baseline and
Q2's rule), `lib/db/schema.ts` and a migration (media type numbers on `social_listening_history`), `LIB/boxes.ts`
(one new box id at the end), `LIB/view-model.ts`, `SL/brand.tsx`.

1. Colour: drop `neutral` at `KIT/charts.tsx:215`, so a rise reads up and green with its sign, a drop down and red.
2. Deck baseline: a nullable media column on the history row (each type's result count as the deck shows it);
   `mediaChanges` reads last month's history row first and falls back to last month's presented upload, as
   `presentedValues` does (`LIB/compare.ts:111-138`). A history row without media behaves as today. October's counts are
   entered from the final October deck (they rebuild exactly from its charts), a database write on my go.
3. Q2: when a media type is new this month, Other reads n/a.
4. Slide 10's chart: one 100% bar per sentiment with its count, split by media type in the tab's media colours
   (`LIB/colors.ts:10-29`), shares printed in segments wide enough, a legend. Full width, its own analysis box.
5. The numbers check, once October's deck values are entered on my go: on staging, with a November test upload, every
   media change equals November against the October deck's counts, worked out by hand privately. Any difference comes
   back to me before the unit ships.

Tests: rise, drop, zero and missing baseline render as the tiles do; a history row's media numbers win over last
month's upload, and a history row without them falls back to the upload; the migration on PGlite; Q2's rule; the new chart's shares sum to 100 per
sentiment, an empty sentiment draws an empty bar, a media type absent from one sentiment has no segment there.

### Unit E: annotations (F6)

Waits for Unit C (it draws on the new line charts).

Files: `lib/organic-social/annotations.ts` (new chart values), the note input check, `app/actions/chart-notes.ts`
(accept the Social Listening channel and charts), a Social Listening notes reader, the new line charts and Results over
time (marks and hover). The note form and panel are imported, never edited (#517 changes them).

Edge-case list for the commit body: an unknown chart or channel value is refused before any read; a note before the
client's first reporting month is refused as today; a second save on the same day edits the open draft (the existing
unique index, `lib/db/schema.ts:446-448`); a failed save logs the client, chart and day, never the text.

Tests: a graph with no approved note renders identical to the same graph without notes; an approved note draws its
mark and hover in both toggle views; a draft shows to staff only; the action refuses a Social Listening chart under
another channel and the reverse.

### Unit F: authors the team picks (F11)

Files: `LIB/export-parse.ts` (`MAX_INFLUENCERS` 5 to 25), a new table and migration for the month's picks, `LIB/store.ts`,
an action in `app/actions/social-listening.ts`, `LIB/view-model.ts`, `SL/brand.tsx` (the table and cards get a client
component for sorting and the staff Show/Hide controls).

- Picks table: client, month (its 1st), what is picked (an author id, or an overview card), shown or hidden, by and at.
  A change is a new row; nothing is deleted.
- A month with no picks shows the first 5 authors to the client, as today.
- A hidden author also hides an overview card with the same name and network; staff can hide any card directly.
- Posts change against what the client saw: `authorChanges` reads last month's history row first (October's top five,
  entered with Unit D's media counts, matched to the October upload's author ids by name and network), then the upload.
- Q4: "Reach per mention" and "Engagement per mention" columns.

Edge-case list for the commit body: author ids come from an untrusted file and stay Map keys, never object keys
(`LIB/compare.ts:176-178`); the action checks the month is one staff can edit and the author or card is in that month's
upload; two staff picking at once both land (no lost update); a failed write logs the client, month and author id.

Tests: the parser keeps 25 and still refuses a widget missing a column; picks apply to their month only; clients see
only picked authors and never the controls; a month with no picks shows the first 5; hiding an author hides its card;
sorting changes order only; the PDF prints what the client sees in the order on screen. Migration tested on PGlite;
applied to dev and staging only on my go. The card name match is checked on a real export first.

### Unit G: keyword appendix carries over (F5)

Files: `SL/section.tsx` (the box read), a pure helper next to `lib/commentary/month.ts`.

Tests: a month with its own entry shows it; a month without one shows the newest earlier approved appendix, to the
client too; other boxes never carry over; nothing is written on read; editing a carried-over appendix saves this
month's own draft.

### Unit H: industry themes by sentiment (F15)

After Savannah's widget change and re-export. First read that export's theme colours (the stored upload, read-only)
and confirm they are the five sentiment colours brand uses (`LIB/colors.ts:35-37`). Then the industry cloud colours by
`themeTone`, shows the sentiment key, and the decoration note goes. If the colours differ, it comes back to me first.

### Unit I: trends (F12)

A read-only check of staging: does October have a trends row for the client. The answer goes to the team; the code
stays as is unless the check finds a fault, which then gets debugged on its own.

## 5. Done means

Every unit: its tests pass, the full suite and type check pass, the staging measurements differ only where intended,
Renaissance's golden tests are unchanged, the merge proofs in section 1 hold, pushed. Then #518's body, my self-review
comment and the `self-reviewed` label, and a look on staging with Jasmine and Savannah before production.
