# Notes on the YTD graphs, for every client

**Date:** 2026-10-06. **Branch:** `feat/os-ytd-notes`, off `dev` at `0b5a0a97`. **Status:** spec.
**Scope:** the Organic Social YTD Review graphs, every client. No other report or department changes.

## 1. The request
From the stakeholder's review of Renaissance on staging (2026-10-05), verbatim: "Can we add annotations to the YTD
graphs?" Asked whether this was for Renaissance or every client: "all clients pls". On the review call of 2026-10-02 the
stakeholder called the team's written notes on the daily graphs "the annotations on the graphs" (transcript 21:31), so
"annotations" here means those written notes, now on the YTD graphs. This is the second of three points; the other two
are PRs of their own (Renaissance's YTD months; graph dates as `9/16`).

## 2. What exists today (read in the code on `dev`)
**Notes on the daily graphs:**
- Stored in `chart_notes`: one row per client, platform, chart and day, with a body, picked post ids, a status
  (draft or approved) and soft delete (`lib/db/schema.ts:414-437`). `chart` is plain `text` with no database
  restriction (`drizzle/0025_chart_notes.sql:5`, only check `:18`); `day` is a `date` (`:6`); one open draft per
  client, platform, chart and day (`:23`).
- The charts a note may go on are the code allowlist `ANNOTATION_CHARTS = ['followers', 'engagements']`
  (`lib/organic-social/annotations.ts:45-47`), checked through `checkAnnotationKey`, which hides share
  (`lib/organic-social/annotation-hides/mutations.ts:14-21`; notes: `chart-notes/validate.ts:44`).
- Rules (`app/actions/chart-notes.ts`): saving always writes a draft (`:40-79`); approving needs
  `CHART_NOTES_APPROVERS` and must match what the approver was shown (`:85-100`); revoke and delete-draft (`:105-145`).
  Edit = a team role with an `@avenuez.com` email; approve = also on the approver list
  (`chart-notes/permissions.ts:10-21`). A day may not be in the future (`validate.ts:46`). For a client on locked
  months a day may not be before its first reporting month (`chart-notes.ts:56-60`).
- On for a client on locked months, or with `chartNotes: true` (`chart-notes/enabled.ts:6-10`): all six clients today.
- Reading: every live row for one client and platform (`chart-notes/select.ts:10-15`); `notesByDay` keeps one chart's
  rows in a date window; a viewer who cannot edit gets only the latest approved note per day, an editor also the draft
  and ids (`pick.ts:29-58`). A failed read shows no notes and logs the client, platform and chart (fail closed,
  `parts/chart-notes.ts:106-112`).
- On screen (daily graphs): a dot on a noted day, the approved note in the hover box (`LineChart` props `marks` and
  `notes`, `components/charts/line-chart.tsx:49-52`, used at `:370`, `:388-400`), and a card that opens from the dot on
  hover, focus or tap (`callouts`, `:53-55`; `trends.tsx:124-127`, `:229-236`) showing the day's post pictures, the note,
  and for editors the buttons (`annotation-callouts.tsx:141`, `note-actions.tsx`: Edit, Approve, Revoke, Delete draft).
  The Add annotation form opens above the chart (`note-form.tsx`).

**The YTD graphs:**
- Version 3 (Renaissance, `parts/ytd-review-live.tsx`) and version 2 (the five outline clients,
  `parts/ytd-review-sheet.tsx:23-62`) both end in `ytdReviewBlock(followers, views)` (`ytd-review-sheet.tsx:65-75`),
  which draws two cards, "Follower Growth, Year to Date" and "Views, Year to Date", each with `graph()` (`:79-92`):
  data `{ month: label, followers|views: value }`, a `LineChart` for two or more points, a `BarChart` for one
  (`:85-87`), and a gap line under the card (`:89`). Each point carries its month key (`YtdGraph`, `ytd.ts:87`).
- Nothing notes-related reaches them (`ytd-review-sheet.tsx:1-17`, `ytd-review-live.tsx:1-15`).
- Version 1 (`parts/ytd-review.tsx`) is the version 2 fallback when a client's sheet entry is missing or invalid
  (`ytd-review-sheet.tsx:38-41`). All five outline clients have a valid sheet entry today (staging data).

## 3. The change
A team member can write a note on any month of either YTD graph, on every platform tab, for every client, with the
same draft and approve rules as the daily graphs. Clients see approved notes only.

**Storage (no migration).** Two new chart values, `ytd-followers` and `ytd-views`, in their own allowlist
`YTD_NOTE_CHARTS`. A month's note is stored on that month's first day (`yyyy-mm-01`), so the existing `day` column,
index and one-open-draft rule apply unchanged. `ANNOTATION_CHARTS` is not changed, so hides never accept a YTD chart
and the daily graphs never read a YTD row (`pick.ts:33` filters by chart).

**Validation.** `validateNoteInput` checks a YTD chart with a new `checkNoteKey`: a known platform, a chart in
`ANNOTATION_CHARTS` or `YTD_NOTE_CHARTS`, a real day, and for a YTD chart a day that is the 1st of its month. Every
other rule is unchanged: not in the future (so the current month's 1st is allowed), 1 to 80 characters, one line, at
most 2 post ids (a YTD note always sends none). The save action keeps parsing `reportingMonths` for
every chart, and still refuses every chart when it is malformed (`chart-notes.ts:57-58`). Its first-reporting-month
rule (`:59`) stays for the daily charts; for a YTD chart on a client with locked months it becomes "not before January 1
of the first reporting month's year", because the five clients' YTD draws January onward from their sheet
(`ytd.ts:100-109`) and never an earlier year (`:58-59`, `:104`). A client without locked months (Renaissance) has no
first month, so a YTD note may go on any past month's 1st, as its daily notes may go on any past day (`chart-notes.ts:54-55`).
The form only offers the block's months, so other months are reachable only by a hand-made request, and stay invisible
to everyone. Approve, revoke and delete are by note id and do not change.

**Reading (server, both YTD parts).** After a part has its two graphs, and before it draws them, it reads the notes once
for the client and platform (`getChartNotes`, React-cached), only when `notesOn(client)`. The viewer's rights are
`noteCapabilities(ctx.role, ctx.email ?? null)` (`ctx.ts:13-17`, set at `index.tsx:51-60`). For each graph it builds,
with `notesByDay` over the window from the block's first month to its last month (1st to 1st):
- `notes`: approved note text by the point's label (what the hover box looks up), for months that have a point;
- `marks`: one dot per month with an approved note and a point;
- for the panel below the graph: every month with a note the viewer may see (approved; for an editor also drafts), with
  its label, approved text, and for an editor its draft and ids.
A failed read draws the graphs exactly as today, with no notes and no panel, and logs exactly one line,
`[organic-social] ytd notes unreadable slug=<slug> channel=<channel>; showing none`, never a note's text or the error
message (fail closed, as `parts/chart-notes.ts:106-112`). `notes` and `marks` are passed to a `LineChart` only when
non-empty (as `trends.tsx:123` does), so a graph with no approved note on a point gets neither prop and renders as today.

**Drawing.** `ytdReviewBlock` takes each graph's notes (optional; absent draws exactly as today):
- A `LineChart` graph gets `notes` and `marks` (both plain data, existing props). A viewer hovering (or tapping) a noted
  month sees the note under the value in the hover box; the month carries a dot.
- **Decision: no card on the YTD graphs.** The daily graphs' card exists to show the day's post pictures with the note
  (`annotation-callouts.tsx`); a YTD note carries no pictures (section 11), so a card would only repeat the hover box.
  Editors' buttons go in the panel below instead, which also lists drafts, which have no dot. The `callouts` prop stays
  unused here, so the chart elements stay server-rendered plain data.
- Under each graph, a small client panel (`YtdNotesPanel`):
  - for a client: the approved notes of months the chart cannot show on a point (a one-point `BarChart` year, or a
    month with no point), as "Jan: <note>" lines; nothing otherwise;
  - for an editor: an "Add annotation" button opening a form with a **Month** list (every month of the block, by label)
    and the note text (1 to 80 characters), "Save draft" and "Cancel"; and one line per month with a note: the label,
    the approved text, the draft if any, and the existing `NoteActions` buttons (Edit, Approve, Revoke, Delete draft),
    unchanged. `NoteActions` receives `annotation = { date: 'yyyy-mm-01', value: 0, label: <month label>, thumb: null,
    note: <approved text, if any>, noteEditor: <editor state> }`. Edit opens the same form fixed to that month,
    prefilled with the draft's text, else the approved text.
  - choosing a month that already has a note says "<Month> already has a draft. Saving updates it." or "<Month> already
    has an approved note. Saving drafts a change to it." (the daily form's rule, `note-form.tsx:205-210`).
  - after a save, one line: "Saved a draft for <Month>. Clients see it once it's approved." ("Updated the draft for
    <Month>." when one existed; "Clients keep seeing the approved note until this one is approved." when an approved
    note existed), plus "Approve it in the list below." for an approver.
  - the panel renders nothing when it has nothing to show (a client with no off-point notes, or a failed read), and only
    the editor parts use the router (`router.refresh()` after a save or an action, as `note-form.tsx:147`).
  - `no-print`, like the daily graphs' controls; the client lines print.
- The `BarChart` is not changed (it is shared with seven other departments); a one-point year's notes show in the panel.

**Version 1 fallback.** No notes (it shows only while a sheet entry is broken); notes stay stored and show again when
the entry is fixed.

## 4. Inputs and outputs
- **Save input:** `{ clientSlug, channel, chart: 'ytd-followers' | 'ytd-views', day: 'yyyy-mm-01', body, postIds: [] }`.
- **Read output per graph:** `{ notes: Record<label, string>, marks: { x: label }[], panel: { key, label, text: string | null, editor?: NoteEditorState }[] }`; editor fields only for someone who can edit (`noteCapabilities`).
- **Panel controls (editors only):** `{ clientSlug, channel, chart, canApprove, months: { key, label }[] }`.

## 5. Edge cases (all are tests)
| Case | Behaviour |
|---|---|
| Day not the 1st (`2026-08-15`) on a YTD chart | Refused: "invalid day" |
| A YTD chart on the hide action | Refused: "invalid chart" (hides unchanged) |
| A future month (`2026-11-01` on 2026-10-06) | Refused: "That day has not happened yet." |
| The current month's 1st | Allowed by validation; shown only if the block draws that month |
| A YTD note on an outline client between January 1 of its first reporting year and its first month | Allowed |
| A YTD note on an outline client before January 1 of its first reporting year | Refused |
| A malformed `reportingMonths` | Every chart refused, YTD included (unchanged) |
| A daily note before the first reporting month | Still refused (unchanged) |
| A month with a draft only | Editors see it in the panel; clients see nothing; no dot |
| A month with an approved note and a newer draft | Clients see the approved text; editors see both |
| A note on a month with no point (a gap) | No dot; listed in the panel for clients and editors |
| A one-point year (the graph draws a `BarChart`) | Notes listed in the panel |
| A graph with no points (its card shows "No data") | The panel still shows: editors can add a note; clients see approved notes as lines |
| Both graphs empty (the part returns "No data" before the block) | No notes and no controls, as today |
| A note on a month outside the block (another year, or after the month on screen) | Not shown |
| The "(live)" label (an outline client's team viewing the live month) | The note is matched by month key, not label |
| `notesOn(client)` false | No read, no panel, graphs as today |
| Notes read fails | Graphs as today, no panel, one log line without note text |
| A client role, or a team email not on `@avenuez.com` | No Add annotation, no buttons, approved notes only |
| Overview (no channel) | No YTD block today; unchanged |

## 6. Failure behaviour
Read failure: fail closed (section 3). Save, approve, revoke and delete failures: the existing action errors, shown on
the panel line or form (`note-actions.tsx:65`, `note-form.tsx:219` pattern). No new Dash request, no lock interaction.

## 7. Blast radius
- No change to `LineChart`, `BarChart` or any shared chart file: the YTD graphs use `LineChart`'s existing `notes` and
  `marks` props.
- `NoteActions`' `controls` prop is narrowed to the two fields it reads (`clientSlug`, `canApprove`), a type-only change.
- The daily graphs, hides, Top Content, tiles, locks and every other report are unchanged. No database migration.
- Version 3 tests (`parts/ytd-review-live.test.tsx`) use a client with notes off, so they need no change; this PR does
  not touch that file (open PR #322 does).

## 8. Files
- `lib/organic-social/annotations.ts`: `YtdNoteChart`, `YTD_NOTE_CHARTS`, `NoteChart` (the daily `NoteControls` is not
  changed; the panel has its own controls type).
- `lib/db/schema.ts`: the comment on `chart` (`:418`) lists the YTD values. Comment only.
- `lib/organic-social/chart-notes/validate.ts`: `checkNoteKey`; `validateNoteInput` uses it.
- `lib/organic-social/chart-notes/mutations.ts` and `pick.ts`: `NoteChart` in the key and filter types.
- `app/actions/chart-notes.ts`: the first-month rule by chart (section 3); the revoke cast (`:116`) to `NoteChart`.
  Its messages keep saying "day" ("A draft is already open on this day"), which reads acceptably for a month.
- `components/report-sections/organic-social/parts/ytd-notes.ts` (new, server): read and build per graph.
- `components/report-sections/organic-social/ytd-notes-panel.tsx` (new, client): the panel and the month form.
- `parts/ytd-review-sheet.tsx`: `ytdReviewBlock` takes optional notes; version 2 reads them.
- `parts/ytd-review-live.tsx`: version 3 reads them (one call before `ytdReviewBlock`).
- `note-actions.tsx`: the narrowed `controls` type.
- Tests (section 9).

## 9. Tests (written first, watched fail, then made to pass)
1. `chart-notes/validate.test.ts`: every validation row of section 5; daily charts unchanged. The parity test "hides and
   notes accept and refuse exactly the same…" (`:85-97`) is renamed to say they agree on daily charts, and gains YTD
   cases (notes accept, hides answer "invalid chart"). `checkNoteKey` reuses `checkAnnotationKey`'s platform and day
   checks, so the two cannot drift.
2. `lib/organic-social/annotation-hides/mutations.test.ts`: a YTD chart is refused by the hide key check.
3. `app/actions/chart-notes.test.ts`: on a locked client a YTD note in January of its first reporting year is saved, one
   before that year is refused, a daily note before the first month is still refused, and a malformed `reportingMonths`
   refuses a YTD note too.
4. `parts/ytd-notes.test.ts`: per graph, approved notes by label and marks only for months with a point; drafts only for
   editors; the window is the block's months; "(live)" matched by key; fail closed with one log line and no text;
   `notesOn` false reads nothing.
5. `ytd-notes-panel.test.tsx`: client lines only for months without a point or a one-point year; editor Add annotation
   with every month in the list; save sends `yyyy-mm-01`, no post ids; the panel lines carry `NoteActions`.
6. `parts/ytd-review-sheet.test.tsx`: version 2 passes notes and marks to its `LineChart`s (notes read mocked); without
   notes the charts get neither prop (today's output).
7. A new `parts/ytd-review-live.notes.test.tsx`: version 3 with `chartNotes: true` does the same; with it off, nothing.
   Its clock is 2026-10-15 and it asserts only on September (a finished month with or without #322), never on the
   month list, so it passes in either merge order.
8. Version 1 fallback renders no panel.
9. `parts/annotations-wiring.test.tsx`: `withNotes` given a `ytd-followers` row on 2026-08-01, inside an August window,
   returns no item for it (the daily graphs never show a YTD note).
10. The existing version 2 render tests (client role) still pass: the panel renders nothing for a client with no
    off-point notes, so no router is needed there; the notes read is mocked in that file.
The full suite, the type check, `check:rsc` and eslint must pass with the commands CI runs.

## 10. Verification
- **Locally (dev database, staff):** on one client's tab, add a note on a YTD month, see it as a draft in the panel,
  approve it, see the dot and the hover note; check a client login sees only the approved note.
- **After merge to staging:** the same on Renaissance and one outline client; the department gate (private snapshots of
  2026-10-06): the 24 non-Organic-Social staging pages and Paid Media's trend unchanged; the staging database changes
  only by the test notes written, in `chart_notes`.

## 11. Out of scope
Automatic high points, hides and post pictures on YTD notes; changing the daily graphs' notes; `BarChart`; Overview;
PDF or print changes beyond `no-print` on the controls; version 1's notes.

## 12. Conflicts
- Open PR #322 edits `parts/ytd-review-live.tsx` (a comment at `:19`) and its tests; this PR edits a different part of
  that file and not its tests. Before review: test merges both ways, and the full suite run on this branch alone, on it
  merged with #322, with #323, and with all open PRs together.
- Open PR #323 edits two lines in `parts/ytd-review-sheet.test.tsx`; this PR adds a mock near the top of that file.
  Proven by test merges both ways.
- Open PRs #314, #320 and #321 touch none of these files.
