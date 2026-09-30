# Chart notes on days with no post: design

Status: draft for review (spec step 2 of the regimen). Every claim is read on `origin/dev` 8502f40 (2026-09-29).
Plan: `docs/superpowers/plans/2026-09-29-notes-without-posts.md` (written first; reconciled to this spec after review,
and this spec wins where they differ).

## 1. Why
Jasmine on the call, 2026-09-29, 17:44 to 18:21: if a day had no post but something performed well or badly, "I am not
able to add an annotation to that date ... sometimes even if we don't post, but we know like a PR announcement went
live ... then we would want to be able to note that for the client." I said "I will add that" (18:36).

So: the team can add a note on any day of the month up to today, with or without a post, and the client sees it once
approved, like any other note.

## 2. What happens today
- Notes exist only for clients on locked months: the panel builder returns before reading notes for any other client
  (`components/report-sections/organic-social/parts/chart-notes.ts:59-61`), and every note action refuses them
  (`app/actions/chart-notes.ts:50,81,101,126`). Renaissance has no `reportingMonths`, so none of this reaches it.
- Saving accepts a note with no posts: `postIds` may be an empty array (`lib/organic-social/chart-notes/validate.ts:52-56`,
  pinned at `validate.test.ts:11`), and the save action requires none (`app/actions/chart-notes.ts:39-69`). A day after
  today is refused (`validate.ts:46`).
- Drawing: a note on a day that is not an automatic peak becomes its own item, labelled with the date, marked
  `noteOnly` (`parts/chart-notes.ts:80-88`). Its picture is the note's picks, else the day's top post, else none
  (`cardThumbs`, `lib/organic-social/annotations.ts:183-185`; `toChartAnnotations`, `:202-204`), so a note on a day with
  no post is the date and the text. A dot and card appear when the series has a point for that day; otherwise the card
  goes in the row above the chart (`trends.tsx:99-102`). The series has a point exactly for each day Dash returns
  (`lib/organic-social/trend-series.ts:22-41`). Whether Dash's daily answer includes every day of the month cannot be
  proven by reading code: UNVERIFIED, and both placements are already tested (`chart-notes-ui.test.tsx:207`).
- Clients get only approved notes (`lib/organic-social/chart-notes/pick.ts:43-55`: a draft-only day is skipped for them and editor state is attached only for editors), and hides are dropped on the server
  for clients (`lib/organic-social/annotation-hides/apply.ts:11-12`).
- The only limit is the Add annotation panel:
  - The day list it receives holds only days with at least one post (`parts/chart-notes.ts:98-101`), from the window's
    first day to the earlier of today and the window's last day (`:92`). When the posts failed to load (`posts === null`)
    `postsOn` is always empty, so the list is empty (`:64`, `:74`), with `postsFailed` set (`:97`).
  - The Add annotation button is drawn only when that list is non-empty (`trends.tsx:162`), so a month with no posts at
    all has no Add annotation today.
  - A new note's day is set only by picking a post's picture (`note-form.tsx:65-89`), and undoing the last pick clears
    the day (`:72`). Save needs a day and text (`:93`); posts are optional.
- Editing a note from its card is fixed to that card's day and already works on a day with no post: the form shows "No
  posts went live this day" and saves the text alone (`note-form.tsx:147-150`; `chart-notes-ui.test.tsx:379-389`).
- A deliberate earlier choice this reverses: the panel has no date list (Phase 2b), pinned by
  `chart-notes-ui.test.tsx:278-284` ("... and no date list"). The picture row cannot reach a day with no post, so a
  Day list is the smallest way in; picking by picture stays exactly as it is.

## 3. The change

### 3.1 Server: the panel's day list (`withNotes`)
- Output `NoteControls.days`: every day from the window's first day to the earlier of today and the window's last day
  (the same bounds as today, `parts/chart-notes.ts:92`), oldest first, each `{ day, posts }` where `posts` is that day's
  posts in Dash's order and may be `[]`.
- When the posts failed to load (`args.posts === null`): `[]`, as today, with `postsFailed` as today. So no new note is
  started on a day whose posts are unknown, and the Add annotation button stays hidden (`trends.tsx:162`).
- Effect: Add annotation now appears for any finished or live month on a locked-months client, even with no posts.
- Nothing else in `withNotes` changes (items, notes, peaks, controls' other fields).

### 3.2 The form: a Day list for a new note
- Shown only for a new note (no `fixedDay`) and only when `controls.days` is non-empty. A native `<select>` with
  `aria-label="Day"`, styled dark like the month picker (`bg-bg-surface`, `month-picker.tsx:34`) so its options stay
  readable. Options: "Pick a day", then each day oldest first, labelled `dayLabel(day)` (for example `8/14`), with
  " (no posts)" after days whose `posts` is empty.
- Choosing a day: that becomes the note's day and is remembered as chosen from the list. The day's existing note loads
  by the same rules as reaching that day by a picture (`note-form.tsx:75-86`): its picks; its text, unless the user has
  typed text of their own; the "already has a draft / approved note" line (`:152-157`). A day with no note clears the
  picks and keeps the user's own text (filled-in text the user left as it was goes, as at `:66-68`).
- Choosing "Pick a day": no day, no picks, not chosen; the user's own text stays.
- The picture row is unchanged. Picking a picture sets its day (and the list follows); a picture from another day moves
  the note there as today, and that day counts as set by a picture. Undoing the last pick clears the day only when the
  day was set by a picture (today's rule); a day chosen from the list stays.
- Save: unchanged (`note-form.tsx:93-110`): a day and text; `postIds` may be `[]`.
- The line under the pictures: a chosen day with no posts reads "No posts went live this day" (or the existing
  keeps-picks line if the note has picks Dash no longer returns); a chosen day with posts reads "Pick up to 2 of this
  day's posts, or just write what happened"; no day yet reads as today, "Pick a post, then write what happened". With no
  posts in the whole window and no day chosen: "No posts went live this month".
- Edit from a card: unchanged, no Day list.
- The comment above `canSave` (`:91-92`) is updated, since a new note's day no longer comes only from a post.

### 3.3 What does not change
The save action and its checks, the card, the chart's dots and row, approval, revoke, delete, hides, print rules, what
clients receive, and every client not on locked months.

## 4. Failure handling
- Posts failed to load: no Add annotation (as today); Edit from a card still opens, fixed to its day, with the keeps-picks
  line (`note-form.tsx:149`).
- A briefly empty but well-formed posts answer (`[]`, which `parts/chart-notes.ts:64` treats as real): every day reads
  "(no posts)" and a note saved then is text only; it can be edited to add posts once they load. Accepted: today such a
  month offers no Add annotation at all, and Edit already says "No posts went live this day" on the same evidence.
- A save refused (a day after today, too long, a race on the day's draft): unchanged messages (`app/actions/chart-notes.ts:45-66`).

## 5. Edge cases
| # | Case | Expected | Test |
|---|---|---|---|
| 1 | a finished month, posts on some days | every day offered; each day carries its posts or none | S1, S2 |
| 2 | the live month | every day up to today, none after | S3 |
| 3 | a month with no posts | every day offered, all "(no posts)"; Add annotation shown | S4, U6 |
| 4 | posts failed to load | no days, flag set, no Add annotation; Edit still works | S5, U7 |
| 5 | choose a no-post day, write, save | saved with `postIds: []` on that day | U1 |
| 6 | choose a day with posts, pick one | saved with that post | U2 |
| 7 | picture from another day after choosing | day moves; counts as set by a picture | U2 |
| 8 | undo the last pick on a chosen day | day stays | U3 |
| 9 | undo the last pick on a picture-set day | day clears (today) | U3 |
| 10 | choose a day that has a note | its text and picks load; the notice shows | U4 |
| 11 | typed text, then choose a day with a note | typed text stays | U5 |
| 12 | Edit from a card | no Day list | U8 |
| 13 | list styling | `bg-bg-surface` | U9 |
| 14 | hint on a chosen day with posts | "Pick up to 2 of this day's posts, or just write what happened" | U2 |
| 15 | Dash's order and undated posts | kept, as today | S6 |
| 16 | Renaissance / not on locked months | no notes, no controls | existing `parts/chart-notes.test.ts` ("shaped like Renaissance") |

## 6. Tests (written before the code)
Server, `components/report-sections/organic-social/parts/chart-notes.test.ts` (the tests pinning "days with posts only"
change on purpose):
- S1 the team gets the controls: `days` has 31 entries for August (window 2026-08-01 to 08-31, today 09-24), and 8/10
  carries its post.
- S2 every day of the window, oldest first: first `2026-08-01`, last `2026-08-31`; 8/10 `[5, 6]`, 8/11 `[]`, 8/12 `[9]`.
- S3 the live month (2026-09-01 to 09-30, today 09-24, posts on 09-24 and 09-25): 24 days, first 09-01, last 09-24,
  which carries post 7 only.
- S4 posts `[]`: 31 days, all with no posts.
- S5 posts `null`: `postsFailed` true and `days` `[]` (unchanged test).
- S6 Dash's order and undated posts: among days with posts, `[['2026-08-10', [12]], ['2026-08-14', [21, 20]]]`.

Form, `components/report-sections/organic-social/chart-notes-ui.test.tsx`, a new block placed after the Add annotation
block, not at the end of the file (#283 appends there); the "no date list" test becomes "every day is in the Day list",
with options `['Pick a day', '8/10', '8/14 (no posts)', '8/20']`:
- U1 choose 8/14 (no posts): "No posts went live this day"; Save disabled until text; saves `{ day: '2026-08-14', postIds: [] }`.
- U2 picture 8/20 sets the list to 8/20; choose 8/10: 8/20's pick clears, hint reads "Pick up to 2 of this day's posts,
  or just write what happened"; pick 11 and save `{ day: '2026-08-10', postIds: [11] }`.
- U3 choose 8/10, pick and unpick 11: the list stays on 8/10 and Save is enabled with text; choose "Pick a day", pick and
  unpick a picture on 8/20: the list returns to "Pick a day" and Save is disabled.
- U4 with an approved note on 8/14: choosing 8/14 loads "Event" and "8/14 already has an approved note. Saving drafts a
  change to it."; choosing 8/20 then clears the loaded text.
- U5 typed text is kept when choosing a day that has a note.
- U6 a window with no posts: "No posts went live this month" until a day is chosen, then "No posts went live this day".
- U7 posts failed: no Add annotation button; Edit on a card opens with no Day list.
- U8 Edit on a card: no Day list.
- U9 the list has `bg-bg-surface`.
Plus two wording-only updates in that file: the `CONTROLS` fixture's comment and the describe title no longer say the
server sends days with posts only, and "a new note needs a picked post and text" is renamed to "needs a day (from a
picture or the Day list) and text" (its body is unchanged and still passes).

## 7. Other open PRs
#283 (`fix/chart-state-follows-server`) edits `note-form.tsx` at the `SavedNote` type and the save callback, and appends
tests at the end of `chart-notes-ui.test.tsx`. This change edits neither of those lines and inserts its tests mid-file,
so the two merge clean in either order; the plan's last task proves it and runs the notes tests on the merged tree.
Whatever #283 keeps in the `notes` map after a save is what the Day list loads, by the same rules.

## 8. Out of scope
The save action, validation, the card, approval, hides, print, clients' view, any change for clients not on locked
months, and whether Dash returns every day (section 2, unverified).
