# Chart notes on days with no post: design

Status: REVIEWED (two fresh-eyed rounds, 2026-09-29; no blocker or major open). Every claim is read on `origin/dev` 8502f40 (2026-09-29).
Plan: `docs/superpowers/plans/2026-09-29-notes-without-posts.md` (written first; reconciled to this spec after review,
and this spec wins where they differ).

## 1. Why
Jasmine on the call, 2026-09-29, 17:44 to 18:21: if a day had no post but something performed well or badly, "I am not
able to add an annotation to that date ... sometimes even if we don't post, but we know like a PR announcement went
live ... then we would want to be able to note that for the client." I said "I will add that" (18:36).

So: the team can add a note on any day of the month the chart shows (in the live month, up to yesterday: the chart's
window ends at the last complete UTC day, so today's event is noted tomorrow; corrected after Paul's review), with or
without a post, and the client sees it once
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
  proven by reading code: UNVERIFIED, and both placements are already tested (on the chart, `chart-notes-ui.test.tsx:179`;
  in the row, `:207`).
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
  posts went live this day" and saves the text alone (`note-form.tsx:147-150`; `chart-notes-ui.test.tsx:379-387`).
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
- Effect: Add annotation now appears whenever the graph itself renders for a locked-months client, even in a month
  with no posts. It still does not appear when the series is empty or the trend fetch fails (the button is inside the
  non-empty branch, `trends.tsx:116-172`; a failed fetch shows the fallback, `parts/engagement-trend.tsx:49` and `parts/follower-graph.tsx:62`), or when
  the window has no day (`windowDays` returns `[]`, `parts/chart-notes.ts:14-22`).
- Nothing else in `withNotes` changes (items, notes, peaks, controls' other fields), except the comment above `days`
  (`:98`, "only days with at least one post"), which is rewritten.

### 3.2 The form: a Day list for a new note
- Shown only for a new note (no `fixedDay`) and only when `controls.days` is non-empty. A native `<select>` inside a
  visible label "Day", with `aria-label="Day"`, styled dark like the month picker (`bg-bg-surface` and `text-white`,
  `month-picker.tsx:34`) so its options stay readable, and disabled while a save is pending (as the pictures are,
  `note-form.tsx:131`). Options: "Pick a day" (value `""`), then each day oldest first (value the `yyyy-mm-dd` day),
  labelled `dayLabel(day)` (for example `8/14`), with " (no posts)" after days whose `posts` is empty. Its value always
  shows the note's current day, however it was set (`""` when there is none).
- Keyboard: on a closed native select some browsers fire a change for every arrow step, so each step runs the rules
  below and a day stepped past loses its loaded picks. Accepted: nothing is saved until Save, and the user's own text is
  never dropped by a day change.
- Choosing a day: that becomes the note's day and is remembered as chosen from the list. The day's existing note loads
  by the same rules as reaching that day by a picture (`note-form.tsx:75-86`): its picks; its text, unless the user has
  typed text of their own; the "already has a draft / approved note" line (`:152-157`). A day with no note clears the
  picks and keeps the user's own text (filled-in text the user left as it was goes, as at `:66-68`).
- Choosing "Pick a day": no day, no picks, not chosen; the user's own text stays.
- The picture row is unchanged. Picking a picture sets its day (and the list follows); a picture from another day moves
  the note there as today, and that day counts as set by a picture from then on. Undoing the last pick on a day set by a
  picture clears the day, the loaded text and `loaded`, exactly as today (`note-form.tsx:72`). Undoing the last pick on a
  day chosen from the list changes only the picks: the day, the text and `loaded` all stay (so a loaded note's text
  and its "already has ..." line stay together).
- Save: unchanged (`note-form.tsx:93-110`): a day and text; `postIds` may be `[]`.
- The line under the pictures, first match wins (the first three are today's, `note-form.tsx:144`):
  1. no pictures on screen but picks kept: the keeps-picks line when the posts failed to load, else the gone-pick line
     ("A picked post did not come back from Dash this time; it stays picked until you remove it.");
  2. two posts picked: "Up to 2 posts";
  3. Edit from a card: "Pick up to 2 of this day's posts";
  4. a day chosen from the list that has no posts: the gone-pick line if the note has picks Dash no longer returns (the
     posts loaded, so "could not load" would be false and contradict "(no posts)"), else "No posts went live this day";
  5. a day chosen from the list that has posts: "Pick up to 2 of this day's posts, or just write what happened";
  6. otherwise (no day yet, or a day set by a picture): "Pick a post, then write what happened", as today.
  So the existing tests at `chart-notes-ui.test.tsx:314` and `:318` are unchanged. After Paul's review the keeps-picks
  line ("Posts could not load ...") is said only when the posts really failed (`controls.postsFailed`), and the rule is
  a `hint()` function with one `if` per case, in this order.
- The line when the window has no pictures at all (`note-form.tsx:147-150`): the keeps-picks line when posts failed (as
  today); "No posts went live this day" when there is a day (Edit, or a day chosen from the list); otherwise, new, "No
  posts went live this month".
- Under the Day list, one caption: "Days are UTC, as on the chart, so a post late in the Eastern evening is on the
  next day." The "(no posts)" claim is per UTC day and the team works in Eastern time (Paul's review).
- The save action re-checks the role and email, the client, the day (not in the future and, after Paul's review, not
  before the client's first reporting month), the text and the post ids' shape. It does not check that a picked
  post is from that day (only team members can call it; the worst case is an odd pick on a team draft).
- Edit from a card: unchanged, no Day list.
- Comments that become false are rewritten: the component's doc (`note-form.tsx:31-36`, "starts from a post ... only
  days with posts") and the comment above `canSave` (`:91-92`).

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
- A day the team has hidden is offered like any other, as the pictures already offer it; a note there stays hidden from
  clients until the day is unhidden (`annotation-hides/apply.ts:11-12`). Not new; the Day list only makes it easier to
  reach on a day with no post.
- There is no live month on the 1st (`liveExists`); on the 2nd the live month offers one day (the 1st). A window with
  no day offers none and draws no Add annotation.

## 5. Edge cases
| # | Case | Expected | Test |
|---|---|---|---|
| 1 | a finished month, posts on some days | every day offered; each day carries its posts or none | S1, S2 |
| 2 | the live month | every day up to the last complete UTC day (yesterday), never today | S3 |
| 3 | a month with no posts | every day offered, all "(no posts)"; Add annotation shown | S4, U6 |
| 4 | posts failed to load | no days, flag set, no Add annotation; Edit still works | S5, U7 |
| 5 | choose a no-post day, write, save | saved with `postIds: []` on that day | U1 |
| 6 | choose a day with posts, pick one | saved with that post | U2 |
| 7 | picture from another day after choosing | day moves; counts as set by a picture; undoing it clears the day | U3 |
| 8 | undo the last pick on a chosen day | day, text and loaded note stay | U3 |
| 9 | undo the last pick on a picture-set day | day clears (today) | U3 |
| 10 | choose a day that has a note | its text and picks load; the notice shows | U4 |
| 11 | typed text, then choose a day with a note | typed text stays | U5 |
| 12 | Edit from a card | no Day list | U8 |
| 13 | list styling | `bg-bg-surface` | U9 |
| 14 | hint on a chosen day with posts | "Pick up to 2 of this day's posts, or just write what happened" | U2 |
| 15 | Dash's order and undated posts | kept, as today | S6 |
| 16 | Renaissance / not on locked months | no notes, no controls | existing `parts/chart-notes.test.ts` ("shaped like Renaissance") |
| 17 | the live month on the 1st | one day offered | S7 |
| 18 | a draft note on a chosen day | its text and picks load; "already has a draft. Saving updates it." | U4 |

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
- S7 the live month on the 1st (window 2026-09-01 to 09-30, today 09-01): `days` is `[{ day: '2026-09-01', ... }]`.

Form, `components/report-sections/organic-social/chart-notes-ui.test.tsx`, a new block placed after the Add annotation
block, not at the end of the file (#283 appends there); the "no date list" test becomes "every day is in the Day list",
with options `['Pick a day', '8/10', '8/14 (no posts)', '8/20']`. The shared `CONTROLS` fixture (`chart-notes-ui.test.tsx:37-44`)
gains `{ day: '2026-08-14', posts: [] }` between its two days, the shape the server now sends. The picture row skips days
with no posts (`note-form.tsx:47`), so every existing picture-index test, #283's appended ones included, is unaffected:
- U1 choose 8/14 (no posts): "No posts went live this day"; Save disabled until text; saves `{ day: '2026-08-14', postIds: [] }`.
- U2 picture 8/20 sets the list to 8/20; choose 8/10: 8/20's pick clears, hint reads "Pick up to 2 of this day's posts,
  or just write what happened"; pick 11, type text and save `{ day: '2026-08-10', postIds: [11] }`.
- U3 (a) Choose 8/10, pick and unpick 11: the list stays on 8/10 and Save is enabled with text. (b) With an approved note "Event" on 8/20 with picks
  `[21]`: choose 8/20 (text "Event" loads, 21 pressed), unpick 21: the list stays on 8/20, the text is still "Event" and
  the "already has an approved note" line still shows. (c) With no notes on the chart: type text, choose 8/10 from the
  list, then pick picture 21 (8/20): the list shows 8/20; unpick 21: the list returns to "Pick a day" and Save is
  disabled even though there is text (no day), and the typed text is still there.
- U4 with an approved note "Event" on 8/20 with picks `[21]`: choosing 8/20 loads "Event", 21 is pressed, and "8/20
  already has an approved note. Saving drafts a change to it." shows; choosing 8/14 then clears the loaded text and the
  picks. With a draft "Soon" on 8/14 instead: choosing 8/14 loads "Soon" and "8/14 already has a draft. Saving updates it."
- U5 typed text is kept when choosing a day that has a note.
- U6 a window with no posts (`days: [{ day: '2026-08-13', posts: [] }, { day: '2026-08-14', posts: [] }]`): "No posts went
  live this month" until a day is chosen, then "No posts went live this day".
- U7 posts failed: no Add annotation button; Edit on a card opens with no Day list.
- U8 Edit on a card: no Day list.
- U9 the list has `bg-bg-surface`.
Plus two wording-only updates in that file: the `CONTROLS` fixture's comment (`:39`) and the describe title no longer say the
server sends days with posts only, and "a new note needs a picked post and text" is renamed to "needs a day (from a
picture or the Day list) and text" (its body is unchanged and still passes).

## 7. Other open PRs
#283 (`fix/chart-state-follows-server`) edits `note-form.tsx` at the `SavedNote` type and the save callback, and appends
tests at the end of `chart-notes-ui.test.tsx`. This change edits neither of those lines and inserts its tests mid-file,
so the two merge clean in either order; the plan's last task proves it and runs the notes tests on the merged tree.
#283 also edits `trends.tsx`, which this change does not touch. After a save, #283 merges the just-saved note into the
`notes` map as a draft, so choosing that day from the Day list loads it with "already has a draft. Saving updates it.",
which is correct.

## 8. Out of scope
The save action, validation, the card, approval, hides, print, clients' view, any change for clients not on locked
months, and whether Dash returns every day (section 2, unverified).
