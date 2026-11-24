# Plan: Social Listening feedback from 2026-11-24

Builds the items in `docs/superpowers/specs/2026-11-24-social-listening-feedback.md` (F1 to F15). That file holds the
map from each point to the code, with line citations. This plan holds only the build: what changes, in what order, how
each part is tested and what guards stay on. Status: **draft, waiting on my decisions in section 2**. Nothing here is
built yet. Review rounds (at most two, fresh-eyed, foreground) run after those decisions, not before.

Paths use the same prefixes as the feedback list: `SL/`, `KIT/`, `LIB/`.

## 1. Rules for every unit

- **Social Listening on staging is approved.** Before the first change, measure the October brand and industry views
  on staging (staff view and client preview): the box of every card, tile and analysis box through `getComputedStyle`,
  plus one PDF export. Saved privately in `~/.claude/organic-social-work/` (it is client data), never in this repo.
  After each unit, the same measurements locally, and every difference is one the unit meant to make.
- **Renaissance byte-identical.** The Organic Social golden and parity tests (`parts/*.golden.test.tsx`,
  `parts/version-parity.test.tsx`) pass unchanged. Nothing in this plan edits a Renaissance code path; any test change
  outside Social Listening stops the unit.
- **No conflicts with the open PRs.** #516 and #517 both edit `parts/ytd-kit.tsx`, and #517 edits
  `KIT/kit.module.css`, `ytd-notes-panel.tsx`, `note-form.tsx` and `note-actions.tsx`. This plan edits none of those.
  New styles go in a new CSS module next to the Social Listening components. Before the PR leaves draft: #518 merges
  clean with dev, with #516, with #517, and with both, each proved in a throwaway merge.
- **Test first.** Each unit's tests are written and fail before its code.
- **No database writes** anywhere without my go for that exact write. Migrations are written and tested on PGlite
  (`*.pglite.test.ts`, as `LIB/store.pglite.test.ts` does), and applied to dev and staging only on my go.
- **Approved text is never deleted.** No box id is renamed or removed (`LIB/boxes.ts:3-5`).
- **Commit and push each finished unit** on `feat/social-listening-1124-feedback`. `git add` by name.

## 2. Decisions I need to make first

| # | Item | Question | My recommendation |
|---|---|---|---|
| D1 | F3 | Which graph was the "jack-knife", and on which site (staging or dev)? | I name it; then reproduce before fixing |
| D2 | F8 | Positive + neutral is already a line. What does its toggle switch to? | No toggle on that one |
| D3 | F8, F14 | Toggle: does a client get it too, and what does the PDF print? | Everyone gets it; the PDF prints the line view |
| D4 | F9, F12 | September's baseline for media type changes (and trends, if worked out) | The September export the deck was built from, if the team kept it (no new table); never a fresh pull, since past months use what the client was shown |
| D5 | F10 | What slide 9 looks like | I send a screenshot of slide 9 (kept out of the repo) |
| D6 | F11 | How many authors a client sees, of 25 | Every author staff did not hide, top 10 by default |
| D7 | F11 | Sorting: a control for every viewer, or an order staff save? | Viewer control, default by posts as today; PDF prints the default |
| D8 | F11 | A hidden author who is also in an overview card: hide them there too? | No: the cards come from Talkwalker's own widget (Paul, 00:20:58) |
| D9 | F12 | Trends: keep typing them, or work them out from last month's themes? | Keep typing after the staging check shows whether October has a row |
| D10 | F5 | A carried-over keyword appendix: shown to the client without a new approval? | Yes, it was approved; editing starts this month's draft |
| D11 | F13 | Industry share of sentiment, alone in its row after F13: full width or half? | Full width |
| D12 | F15 | Who switches the Talkwalker industry theme widget to sentiment colours and re-exports? | Savannah, then I verify the colours on that file |
| D13 | Phase 3 | The call does not ask for boxes on the other Organic Social tabs. Where did "all boxes" come from? | Phase 3 stays parked until I confirm |
| D14 | Shape | One PR (#518) or #518 as the deliverable branch with one PR per unit into it? | Deliverable branch, one PR per unit (my multi-feature rule) |

Waiting on other people (no decision, just inputs): tooltip text (Savannah's doc, F2); the industry keyword appendix
(Paul, F5); the Talkwalker influencer widget widened to 25 and a new October export (F11); the industry theme widget
change (F15); the team's YTD data sheet (list, F8), purpose to confirm.

## 3. Units, in build order

Each unit is ready to build when its decisions are made and its inputs are in. Units A to C need none of the waiting
inputs.

### Unit A: layout and copy (F1, F4, F7, F13)

Files: `KIT/frames.tsx`, a new `SL/layout.module.css`, `SL/brand.tsx`, `SL/industry.tsx`.

1. `SlCard`: when `box` is given, render `<div class=item data-export-block><div class=card>head, body, note</div>{box}</div>`;
   the card itself loses `data-export-block` in that case only. With no `box`, the markup is today's, character for
   character. The file header (`KIT/frames.tsx:1-3`) says the box sits under the card, as the team asked on 2026-11-24.
2. Rows (`.g2`) line up: each item spans two grid rows on a subgrid, so cards in a row share a height and boxes start on
   one line. Single column (the narrow breakpoint, `KIT/kit.module.css:240`) stacks as today.
3. F4: `b-conv` and `i-conv` move into the Themes section with a small "Top conversation themes" label; the industry
   box still shows for staff with no upload.
4. F7: the owned note string at `SL/brand.tsx:124`.
5. F13: the industry YTD card goes; share of sentiment per D11.

Tests (first): `SlCard` with a box puts the box outside the card and both inside one export block; without a box the
render equals a snapshot of today's markup; the kit YTD block's tests pass unchanged; brand and industry render the
conversation box inside Themes, the new owned text, no industry YTD card; `SL/section.snapshot.test.tsx` updated on
purpose, diff reviewed line by line.

Trial before code (30 minutes, scratch only): does a subgrid row print in the PDF with the card and box together and
the cards equal height? If not, fall back to equal card heights with `align-items: stretch` on the card only.

### Unit B: tooltips (F2)

Files: a new `LIB/tooltips.ts` (the text table), `SL/brand.tsx`, `SL/industry.tsx`, `KIT/frames.tsx` (an optional
`tooltip` beside the card title, using the shared hover hint).

Built with the table empty (a tile with no text draws no hint, exactly as today), filled in one commit once Savannah's
doc arrives. Tests: every tile and card title looks up the table; a missing entry draws nothing; the hint never prints
in the PDF.

### Unit C: line views and the toggle (F8, F14)

Files: `KIT/charts.tsx` (two new charts: sentiment shares by month as three lines, with gaps; results per day by
sentiment as three lines), a new client component `SL/chart-toggle.tsx`, `SL/brand.tsx`, `SL/industry.tsx`.

- The toggle holds both server-drawn charts and shows the line first. Screen only; the PDF prints per D3.
- Brand: Sentiment YTD and Reddit YTD toggle; Positive + neutral per D2; all three full width, stacked.
- Industry: Sentiment over time toggles.

Tests: the line charts break at a gap month and label each point; the toggle starts on line, switches, and the export
mode renders only the line; the columns view is today's chart unchanged.

### Unit D: media type changes (F9, then F10)

Files: `KIT/charts.tsx` (`MediaShare`), and per D4 the baseline source.

- Colour: drop `neutral` at `KIT/charts.tsx:215` so the change reads as the tiles' change line.
- Baseline per D4. If it is September's uploaded export, no code change: `mediaChanges` already reads the previous
  month's presented upload (`LIB/compare.ts:171-174`); the upload path must accept a past month, to be checked in code
  first (`uploadMonth`, `app/actions/social-listening.ts:274`).
- F10 after D5.

Tests: a rise renders up and green with its sign, a drop down and red, a missing baseline "n/a".

### Unit E: annotations (F6)

Files: `lib/organic-social/annotations.ts` (new chart values), the note input check, `app/actions/chart-notes.ts`
(accept the Social Listening channel and charts), a Social Listening notes reader, the new line charts (marks and hover).
The note form and panel are imported, never edited (#517 changes them).

Edge-case list for this unit (goes in the commit body): an unknown chart or channel value from the browser is refused
before any read; a note before the client's first reporting month is refused as today; a second save on the same day
edits the open draft (the existing unique index, `lib/db/schema.ts:446-448`); a failed save logs the client, chart and
day, never the text.

Tests: a graph with no approved note renders identical to the same graph without notes; an approved note draws its
mark and hover; a draft shows to staff only; the action refuses a non-Social Listening chart value under the Social
Listening channel and the reverse.

### Unit F: influencers (F11)

Files: `LIB/export-parse.ts` (`MAX_INFLUENCERS` to 25), a new table and migration for month hides, `LIB/store.ts`,
an action in `app/actions/social-listening.ts`, `LIB/view-model.ts`, `SL/brand.tsx` (the table becomes a client
component for sorting and the staff Hide/Restore buttons).

Hides table: client, month (its 1st), author id, hidden by and at, restored by and at. A restore is a new state, never a
delete. Edge-case list for the commit body: author ids come from an untrusted file and stay Map keys, never object keys
(`LIB/compare.ts:176-178`); the action checks the month is one staff can edit and the author is in that month's
upload; two staff hiding at once both land (no lost update); a failed write logs the client, month and author id.

Tests: the parser keeps 25 and still refuses a widget missing a column; the view hides per month and shows the author
again the next month; clients never see hidden authors or the buttons; sorting changes order only; the PDF prints the
default order. Migration tested on PGlite; applied to dev and staging only on my go.

### Unit G: keyword appendix carries over (F5)

Files: `SL/section.tsx` (the box read), a pure helper next to `lib/commentary/month.ts`.

Tests: a month with its own entry shows it; a month without one shows the newest earlier approved appendix, per D10;
other boxes never carry over; nothing is written on read.

### Unit H: industry themes by sentiment (F15)

After the widget change. First read the new export's theme colours (the stored upload, read-only) and confirm they are
the five sentiment colours brand uses (`LIB/colors.ts:35-37`). Then the industry cloud colours by `themeTone`, shows the
sentiment key, and the decoration note goes. If the colours differ, it comes back to me before any code.

### Unit I: trends (F12)

First a read-only check of staging: does October have a trends row for the client. Then per D9. If typing stays, the
change is wording only (where the Edit trends button is). If they are worked out, it gets its own short spec.

## 4. Done means

Every unit: its tests pass, the full suite and type check pass, the staging measurements differ only where intended,
Renaissance's golden tests are unchanged, #518 merges clean as in section 1, pushed. Then the PR body, my self-review
comment and the `self-reviewed` label, and a look on staging with Jasmine and Savannah before production.
