# Plan: Social Listening feedback from 2026-11-24

Builds the items in `docs/superpowers/specs/2026-11-24-social-listening-feedback.md` (F1 to F15). That file holds the
map from each point to the code, with line citations, and my decisions. This plan holds only the build: what changes,
in what order, how each part is tested and what guards stay on. Status: **decided and reviewed, ready to build**. Nothing here is built yet. Two fresh-eyed review rounds ran on 2026-11-24 (round 1: 1 BLOCKER, 8 MAJOR fixed; round 2, changed lines only: 3 MAJOR, each with one fix and no choice, fixed; MINORs listed in section 5). No round 3.

Paths use the same prefixes as the feedback list: `SL/`, `KIT/`, `LIB/`.

## 1. Shape and rules

- **Shape.** `feat/social-listening-1124-feedback` (#518) is the deliverable branch. Each unit below is its own branch
  and its own PR into it. Several units edit the same files (`SL/brand.tsx`, `SL/industry.tsx`, `KIT/frames.tsx`,
  `KIT/charts.tsx`), so they go **in this order, each cut from #518 after the one before it has merged** (never stacked
  on an open PR): A, C, B, D, E, F, G, H. Unit I is a read-only check and can run any time. #518 then goes to dev as one
  reviewed unit.
- **Social Listening on staging is approved.** Before the first change, measure the October brand and industry views
  on staging (staff view and client preview): the box of every card, tile and analysis box through `getComputedStyle`,
  plus one PDF export. Saved privately in `~/.claude/organic-social-work/` (it is client data), never in this repo.
  After each unit, the same measurements locally, and every difference is one the unit meant to make.
- **Renaissance byte-identical.** The Organic Social golden and parity tests (`parts/*.golden.test.tsx`,
  `parts/version-parity.test.tsx`) pass unchanged. Any test change outside Social Listening stops the unit, with one
  exception: Units C and F add Social Listening cases to the export and report route tests (`lib/export/request.test.ts`,
  `lib/export/bulk.test.ts`, and the new `lib/organic-social/social-listening/routes.test.tsx`). Every existing assertion there stays as it is, and new
  tests prove every non-Social Listening page and request is unchanged.
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
| D2 | F8 | Positive + neutral: full width, with the toggle too, as Savannah's list asks (changed 2026-11-24; its columns view is positive + neutral under negative, a column a month) |
| D3 | F8, F14 | Clients get the toggle; the PDF prints whichever view is on screen |
| D4 | F9, F11 | Every comparison works against what the client saw. November's baseline is the delivered October deck, stored once on October's history row (media counts and top five authors added) |
| D15 | All | The client first sees the tab with November. October is a stored baseline, never a client page, so no October upload is swapped and September's media and authors are not needed |
| D5 | F10 | The chart is slide 10 of the October deck (screenshot kept privately) |
| D6 | F11 | The team picks which authors show, per month; clients see only those |
| D7 | F11 | Sort by posts (default), reach or engagement, for every viewer |
| D8 | F11 | A hidden author is hidden from the overview cards too |
| D9 | F12 | Trends stay typed; check staging first |
| D10 | F5 | The appendix carries over to clients with no new approval; Savannah can still edit it |
| D11 | F1, F13 | Every chart card on its own full-width row, except the brand donut pair (share of sentiment, without brand-owned), which stays side by side as on the approved tab with each box under its card and the row aligned (corrected 2026-11-24 after I saw the full-width donuts) |
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
on either topic; the conversation box sits inside Themes; the new owned text; the industry month-by-month card takes its
own full row.
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
`SL/section.tsx`, `LIB/params.ts`, and the path the AEO tab's settings already take: the two report routes
(`app/dashboard/[clientSlug]/reports/page.tsx`, `app/portal/[clientSlug]/reports/page.tsx`: they read the params, pass
them to the section, and build `serverExport`, dashboard `:140-145`, `:296-310`; they also rebuild the URL on every
redirect and keep `aeo`, `aeomin`, `sl` and `slview` there, dashboard `:238-250`, portal `:208-219` and `:242-251`, so
the new params are kept at those lines too; and they pass the `bulk` prop, dashboard `:324`, portal `:338`),
`components/export-pdf-button.tsx`, `lib/export/request.ts`, `lib/export/bulk.ts` (the `BulkRanges` fields, `:15-27`,
and the forwarding of the AEO values, `:44-45`), and `app/export/[clientSlug]/[section]/page.tsx`. The route tests go
in a new `lib/organic-social/social-listening/routes.test.tsx`, on the pattern of `lib/organic-social/aeo-tab/routes.test.tsx`.

- Mechanism: the toggle writes a page URL param, `slcols`, listing the charts set to columns, with `router.push`, the
  same way the topic pills change `sl` (`SL/pills.tsx:11-19`). The server re-renders, so the route has the value and
  passes it into `serverExport`; the button sends it; bulk export forwards it on the Social Listening page; the export
  page draws those charts as columns. Each step is spread only when the view is Social Listening, as the AEO values are
  (dashboard route `:309`), so every other page and request carries nothing new.
- Bad values, on purpose two rules: on the page, an unknown chart id or a repeat is dropped, so an old link still loads;
  in the export request, any value outside the fixed list makes the request invalid, as the AEO values do
  (`lib/export/request.ts:50-51`), since the button only ever sends what the route already cleaned.
- Brand: all three year to date graphs toggle (Positive + neutral too, per D2 and Savannah's list); all three full width, stacked.
- Industry: Sentiment over time (daily) toggles, and so does the month-by-month card while it stays (Q3).

Edge-case list for the commit body: the param comes from the browser, so an unknown chart id, a repeat, or an
oversized value is dropped on the page and refused in an export request, never echoed; a request with no param is the
request of today.

Tests: the line charts break at a gap month and label each point; the toggle starts on line and switches; the columns
view is today's chart unchanged; the export page draws columns only for the charts the param names; a bulk export of
the Social Listening page carries the param and every other page's body is unchanged (`lib/export/bulk.test.ts`); every
export request without the param is byte-identical to today (`lib/export/request.test.ts`); both routes pass the param
only on the Social Listening view; `slcols` (and Unit F's `slsort`) survive each of the three redirects.

### Unit D: media types (F9, F10)

Files: `KIT/charts.tsx` (`MediaShare`, and a new sentiment-by-media chart), `LIB/compare.ts` (the deck baseline and
Q2's rule), `lib/db/schema.ts` and **the one history migration** (both new history columns, media and authors; Unit F
reads the authors column and waits for this unit), `LIB/boxes.ts` (one new box id at the end), `LIB/view-model.ts`,
`SL/brand.tsx`.

1. Colour: drop `neutral` at `KIT/charts.tsx:215`, so a rise reads up and green with its sign, a drop down and red.
2. Deck baseline. Two nullable jsonb columns on `social_listening_history`: `media`, a list of `{ media: string,
   count: integer }`, and `authors`, a list of `{ authorId: string, name: string, network: string, posts: integer }`.
   Media names are stored exactly as the export spells them (the decks use the same Talkwalker names); entering a row
   refuses a name that is not in that month's upload, so a misspelling can never become a silent n/a. Author ids come
   from the month's upload, matched to the deck's rows by name and network, and a row that doesn't match is refused.
   `mediaChanges` reads last month's history `media` first and falls back to last month's presented upload, as
   `presentedValues` does (`LIB/compare.ts:111-138`), and stays keyed by exact name in a Map (`:170-172`). A history row
   without the columns behaves as today. October's values come from the final October deck (they rebuild exactly from
   its charts), a database write on my go.
3. Q2: when a media type is new this month (in this month's data, not in the baseline), the type named exactly
   `Other` reads n/a. `Online News Other` is a different type and is not affected (`LIB/colors.ts:18`, `:24`).
4. Slide 10's chart: one 100% bar per sentiment with its count, split by media type in the tab's media colours
   (`LIB/colors.ts:10-29`), shares printed in segments wide enough, a legend. Full width, its own analysis box.
5. The numbers check, once October's deck values are entered on my go: on staging, with a November test upload, every
   media change equals November against the October deck's counts, worked out by hand privately. Any difference comes
   back to me before the unit ships.

Tests: rise, drop, zero and missing baseline render as the tiles do; a history row's media numbers win over last
month's upload, and a history row without them falls back to the upload; entering a media name or author not in the
month's upload is refused; the migration on PGlite; Q2's rule touches only `Other`; the new chart's shares sum to 100
per sentiment, an empty sentiment draws an empty bar, a media type absent from one sentiment has no segment there.

### Unit E: annotations (F6)

Waits for Unit C (it draws on the new line charts).

Values: channel `SOCIAL_LISTENING`; charts `sl-b-daily` and `sl-i-daily` (day notes), `sl-b-ytd`, `sl-b-posneu`
and `sl-b-reddit` (month notes, stored on the month's 1st, as the YTD notes are, `lib/db/schema.ts:431`).

Files: a new `LIB/notes.ts` (the values above and their own key check), `app/actions/chart-notes.ts` (when the channel
is `SOCIAL_LISTENING`, the action branches **first**, before `validateNoteInput` (`:46`) and `notesOn` (`:51`): it
checks the input with the new Social Listening check and gates on `hasSocialListeningTab` (`LIB/setting.ts:67`) in
place of `notesOn`; every other channel takes today's path unchanged), a Social Listening
notes reader, the new line charts and Results over time (marks and hover). `CHANNELS` (`lib/organic-social/metrics.ts`),
`checkAnnotationChannel` (`lib/organic-social/annotation-hides/mutations.ts:15-16`), `ANNOTATION_CHARTS` and
`YTD_NOTE_CHARTS` (`lib/organic-social/annotations.ts:47`, `:52`) stay exactly as they are, so Renaissance's notes and
hides are untouched. The note form and panel are imported, never edited (#517 changes them).

Edge-case list for the commit body: an unknown chart or channel value is refused before any read; a Social Listening
chart under a Dash channel, or a Dash chart under `SOCIAL_LISTENING`, is refused; a note before the client's first
reporting month is refused as today; a second save on the same day edits the open draft (the existing
unique index, `lib/db/schema.ts:446-448`); a failed save logs the client, chart and day, never the text.

Tests: a graph with no approved note renders identical to the same graph without notes; an approved note draws its
mark and hover in both toggle views; a draft shows to staff only; the action refuses a Social Listening chart under
another channel and the reverse.

### Unit F: authors the team picks (F11)

Waits for Units C (the URL param path) and D (the history `authors` column).

Files: `LIB/export-parse.ts` (`MAX_INFLUENCERS` 5 to 25, `:37`, sliced at `:353`), a new table and migration for the
month's picks, `LIB/store.ts`, an action in `app/actions/social-listening.ts`, `LIB/view-model.ts`, `SL/brand.tsx`
(the table and cards get a client component for sorting and the staff Show/Hide controls), and Unit C's param path for
the sort.

- Picks table: client, month (its 1st), kind (`author` or `card`), key (the author id, or the card's label as the
  export gives it, such as "Most active author"), state (`shown` or `hidden`), by and at. A change is a new row; nothing
  is deleted.
- Read rule: for each item, the newest row for that month wins. An item with no row has a default: an author is shown
  if it is in the first 5 in export order (before any sorting), hidden otherwise; a card is shown. So a month with no
  picks looks as today, and a month with one hide shows the other four.
- A pick whose author is not in the month's current upload (a re-upload dropped it) is kept but ignored.
- A hidden author also hides an overview card with the same name and network; staff can hide any card directly.
- Sort: posts (default), reach or engagement, as a page URL param `slsort` through Unit C's path, so the PDF prints the
  order on screen.
- Posts change against what the client saw: `authorChanges` reads last month's history row first (October's top five,
  entered with Unit D's media counts, matched to the October upload's author ids by name and network), then the upload.
- Q4: "Reach per mention" and "Engagement per mention" columns.

Edge-case list for the commit body: author ids come from an untrusted file and stay Map keys, never object keys
(`LIB/compare.ts:176-178`); the action checks the month is one staff can edit and the author or card is in that month's
upload; two staff picking at once both land (no lost update); a failed write logs the client, month and author id.

Tests: the parser keeps 25 and still refuses a widget missing a column; picks apply to their month only; the newest
row wins; clients see only shown authors and never the controls; a month with no picks shows the first 5 in export
order; a month with only a hide shows the other four; a pick for an author the upload no longer has is ignored; hiding
an author hides its card; sorting changes order only; an unknown `slsort` falls back to posts; the PDF prints what the
client sees in the order on screen. Migration tested on PGlite;
applied to dev and staging only on my go. The card name match is checked on a real export first.

### Unit G: keyword appendix carries over (F5)

Files: `SL/section.tsx`, a new `SL/carried-appendix.tsx`, a pure helper in `LIB/` (the newest earlier approved
appendix for a box). `components/report-sections/commentary/monthly.tsx` is shared by every report and stays untouched:
it keeps only the served month's entries (`monthly.tsx:51`), so it can't carry anything over.

- For `b-keywords` and `i-keywords` only, when the served month has no entry of its own, `SL/section.tsx` renders the
  carried appendix through `SL/carried-appendix.tsx` instead of `monthlyCommentary`: `SlAnalysis` with the carried entry
  as its only entry. Staff see a "From <month>" note and an Edit that opens a **new draft for this month** prefilled with
  the carried text (a save with no id and this month's period, so last month's row is never changed); Approve and
  Revoke are not offered on a carried entry. A client and the PDF see the carried text.
- "An entry of its own" depends on the viewer. For a client and the PDF it is an approved entry a client would open on
  (`clientMonthEntry`, `lib/commentary/month.ts:25-29`), so a staff draft never hides the carried appendix from the
  client before it is approved. For staff it is any entry they can see, so their draft shows in place of the carried
  text, with the carried text still what the client sees until the draft is approved.
- The box's id goes into `approvedBoxes` when it carries over (`SL/section.tsx:80-82`), so `show.keywords` holds for a
  client (`LIB/view-model.ts:193`).

Tests: a month with its own entry shows it, through `monthlyCommentary` as today; a month without one shows the newest
earlier approved appendix, to the client too; the client sees the section; other boxes never carry over; nothing is
written on read; Edit on a carried appendix saves a new draft for this month and last month's row is unchanged; a
client viewing a month that holds only a staff draft still sees the carried appendix, and staff see their draft.

### Unit H: industry themes by sentiment (F15)

After Savannah's widget change and re-export. First read that export's theme colours (the stored upload, read-only)
and confirm they are the five sentiment colours brand uses (`LIB/colors.ts:35-37`). Then the industry cloud colours by
`themeTone`, shows the sentiment key, and the decoration note goes. If the colours differ, it comes back to me first.

### Unit I: trends (F12)

A read-only check of staging: does October have a trends row for the client. The answer goes to the team; the code
stays as is unless the check finds a fault, which then gets debugged on its own.

## 5. Minor findings from review round 1, handled in the build

- Unit D: the media card's label (`SL/brand.tsx:155`) changes from "Change vs the <month> export" to name the report,
  since the baseline becomes what the client saw.
- Unit C: Positive + neutral at full width draws on a 960-wide frame like the other charts, not the 480 it has today
  (`KIT/charts.tsx:276`), so it doesn't double in height.
- Unit B: the tooltip table is keyed by box id for charts and by a fixed tile id for tiles, never by title text.
- Unit C's two bad-value rules (drop on the page, refuse in the export request) are on purpose; section 4 says so.
- The map's influencer slice citation is corrected to `LIB/export-parse.ts:353`.

From review round 2 (no round 3; these are handled in the build):
- Unit E: the three Social Listening month charts use January of the first reporting month's year as their earliest
  month, as the YTD notes do (`app/actions/chart-notes.ts:59-62`); the day charts use the first reporting month.
- Unit E: a Social Listening note's `postIds` must be `[]` and is refused otherwise (`lib/db/schema.ts:434`).
- Unit F: "the newest row wins" breaks a tie on the row id.
- Unit D: the history values are entered by a script in `scripts/` that refuses any media name or author not in that
  month's upload, names each one it refuses, writes nothing then, and runs only on my go.
- Section 1's "two report routes' tests" are the new `lib/organic-social/social-listening/routes.test.tsx` (Unit C).
- Unit C's dashboard citation is `:140-145` (corrected above).

## 6. Done means

Every unit: its tests pass, the full suite and type check pass, the staging measurements differ only where intended,
Renaissance's golden tests are unchanged, the merge proofs in section 1 hold, pushed. Then #518's body, my self-review
comment and the `self-reviewed` label, and a look on staging with Jasmine and Savannah before production.
