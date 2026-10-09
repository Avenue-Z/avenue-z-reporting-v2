# Chart notes on days with no post, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The team can add a note on any day of the month up to today, including a day with no post (a PR hit, an announcement), and the client sees it as a text-only card once approved.

> **Corrected after Paul's review (2026-10-01):** "up to today" below is "up to the last complete UTC day": the live month's window ends there, as the chart does, so today is never offered. The code was right; the wording and S3/S7 were not. See the spec.

**Architecture:** The server already accepts and draws a note with no posts; only the Add annotation panel is limited to days with posts. The panel's day list (`withNotes`) offers every day up to today, and the form gets a Day list beside the existing picture row. Picking a picture works exactly as today.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest with Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-29-notes-without-posts-design.md` (reviewed twice; it wins where this plan differs; S1 to S7 and U1 to U9 below are its section 6). Source: Jasmine on the call, 2026-09-29 (17:44 to 18:36): "if there was a day that we didn't post but we had like either something perform really poorly or something perform really well, I am not able to add an annotation to that date ... sometimes even if we don't post, but we know like a PR announcement went live ... then we would want to be able to note that for the client." I committed to add it (18:36).

## What already works (read on `dev` 8502f40, nothing to change)
- Saving: `validateNoteInput` accepts `postIds: []` (`lib/organic-social/chart-notes/validate.ts:52-56`, pinned at `validate.test.ts:11`), and `saveChartNoteAction` requires no post (`app/actions/chart-notes.ts:39-69`).
- Drawing: a note on a day that is not a peak becomes its own item with the date as its label (`parts/chart-notes.ts:80-88`). When the series has a point for that day its dot sits on it; when it does not, the card goes in the row above the chart (`trends.tsx:99-102`). Whether Dash's daily answer has every day of the month is not provable by reading code, so Task 3 checks a no-post day on the local app.
- The card: no picks and no post that day means no picture (`cardThumbs`, `lib/organic-social/annotations.ts:183-185`; `toChartAnnotations`, `:202-204`), so the card is the date and the text. Pinned today by `chart-notes-ui.test.tsx` "a note-only day shows the date and the note, and no number".
- Editing a note from its card on a day with no post already works: the form shows "No posts went live this day" and saves the text alone (`note-form.tsx:147-150`, test `chart-notes-ui.test.tsx:379-389`).
- Clients, hides, approval, print: unchanged; a note on a day with no post is a note like any other.

## Global Constraints
- Notes exist only for clients on locked months (`parts/chart-notes.ts:59-61`, `app/actions/chart-notes.ts:50`). Renaissance is not, so it never sees any of this. No per-client key is needed: the feature is the notes feature.
- Picking a post by its picture behaves exactly as today, including the rule that undoing the last pick clears the day (`note-form.tsx:72`) and the day-moving rules (`:65-89`).
- When the posts fail to load, the panel offers no days, as today (`parts/chart-notes.ts:97`, test `chart-notes.test.ts:190-194`), so no new note is started on a day whose posts are unknown. Edit from a card still works.
- No day after today (`parts/chart-notes.ts:92`), and the server refuses one anyway (`validate.ts:46`).
- #283 (open) edits `note-form.tsx:19-20` (the `SavedNote` type) and `:106-108` (the save callback) and appends tests at the end of `chart-notes-ui.test.tsx`. This plan edits neither of those lines and inserts its tests in the middle of the file, so the two merge clean in either order (proved in Task 3).
- No dash characters outside code.
- Branch `feat/os-notes-without-posts`, cut from `dev` (8502f40), standalone. Checks: `DATABASE_URL=postgresql://ci:ci@db.invalid/ci make check`.

## Review Focus
1. A month with no posts at all: today the panel offers nothing and a new note cannot be saved. With this, every day is in the Day list and the line reads "No posts went live this month" until a day is chosen. Pinned in Task 2.
2. Choosing a day that already has a note loads it, with the same rules as reaching that day by a picture: its text unless the user typed, its picks kept, the "already has a draft" notice. Pinned in Task 2.
3. Choosing a day from the list and then undoing a pick must not throw the day away; a day set by a picture still clears when its last pick is undone, as today. Pinned in Task 2.
4. The select is dark like the month picker (`bg-bg-surface`), so its options are readable; a transparent select shows white text on the browser's white list.
5. A day with no posts is labelled "(no posts)" in the list, so a note meant for a post is not put on the wrong day by accident. Accepted limit: a briefly empty but well-formed Dash answer (`parts/chart-notes.ts:64` treats `[]` as real) would label every day "(no posts)"; a note saved then is text only and can be edited to add its posts once they load. Today such a month offers no Add annotation at all. The card's Edit already says "No posts went live this day" on the same evidence (`note-form.tsx:149`), so the wording stays consistent.

---

### Task 1: The panel offers every day up to today

**Files:**
- Modify: `components/report-sections/organic-social/parts/chart-notes.ts:91-102`
- Modify: `lib/organic-social/annotations.ts:105-109` (doc comment only)
- Test: `components/report-sections/organic-social/parts/chart-notes.test.ts`

**Interfaces:**
- Produces: `NoteControls.days` holds every day from the window's first day to the earlier of today and the window's last day, oldest first, each with that day's posts (possibly `[]`); `[]` when the posts could not load.

- [ ] **Step 1: Change the tests that pin "days with posts only".** These are deliberate: the rule they pin is the one Jasmine asked to change. In `parts/chart-notes.test.ts`:

In `'the team gets the draft, the ids and the controls, with that day\'s posts'` (`:93-104`), replace lines 99-100 (the comment `// Phase 2b: only the days with at least one post are offered.` and `expect(r.controls?.days).toHaveLength(1)`) with:

```ts
  // Every day of the window is offered (Jasmine, 2026-09-29); 8/10 carries its post.
  expect(r.controls?.days).toHaveLength(31)
```

(the `find` on `2026-08-10` below it stays as it is).

Replace the test `'in the live month the form offers no day after today'` (`:113-120`) with:

```ts
test('in the live month the form offers every day up to today and none after', async () => {
  const r = await withNotes({
    ...EDITOR, from: '2026-09-01', to: '2026-09-30', today: '2026-09-24', series: { channels: ['Instagram'], points: [] },
    posts: [post(7, '2026-09-24', 1), post(8, '2026-09-25', 1)],
  })
  const days = r.controls!.days.map((d) => d.day)
  expect([days.length, days[0], days[days.length - 1]]).toEqual([24, '2026-09-01', '2026-09-24'])
  expect(r.controls!.days.at(-1)!.posts.map((p) => p.id)).toEqual([7])
})
```

Replace the test `'the form is offered only the days with at least one post, oldest first'` (`:122-125`) with:

```ts
test('the form is offered every day of the window, oldest first, each with its posts or none', async () => {
  const r = await withNotes({ ...EDITOR, posts: [post(9, '2026-08-12', 1), post(5, '2026-08-10', 1), post(6, '2026-08-10', 2)] })
  const days = r.controls!.days
  expect([days.length, days[0].day, days[30].day]).toEqual([31, '2026-08-01', '2026-08-31'])
  expect(days.filter((d) => d.day >= '2026-08-10' && d.day <= '2026-08-12').map((d) => [d.day, d.posts.map((p) => p.id)]))
    .toEqual([['2026-08-10', [5, 6]], ['2026-08-11', []], ['2026-08-12', [9]]])
})

test('a month with no posts still offers every day, so a note needs no post', async () => {
  const r = await withNotes({ ...EDITOR, posts: [] })
  expect(r.controls!.days).toHaveLength(31)
  expect(r.controls!.days.every((d) => d.posts.length === 0)).toBe(true)
})

test('the live month on the 1st offers one day (S7)', async () => {
  const r = await withNotes({ ...EDITOR, from: '2026-09-01', to: '2026-09-30', today: '2026-09-01', series: { channels: ['Instagram'], points: [] } })
  expect(r.controls!.days.map((d) => d.day)).toEqual(['2026-09-01'])
})
```

In `"the panel's days list each day's posts in Dash's order, and a post with no date is on no day"` (`:202-206`), the grouping it pins is unchanged; only look at the days that have posts. Change its assertion to:

```ts
  expect(r.controls!.days.filter((d) => d.posts.length > 0).map((d) => [d.day, d.posts.map((p) => p.id)]))
    .toEqual([['2026-08-10', [12]], ['2026-08-14', [21, 20]]])
```

Leave `'when the posts could not load, the controls say so'` (`:190-194`) as it is: `days` stays `[]`.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run components/report-sections/organic-social/parts/chart-notes.test.ts`
Expected: FAIL on the first three changed tests, the new "a month with no posts" test and S7 (the 1st) (the server still offers only days with posts). The changed Dash-order test passes already (filtering to days with posts gives today's answer), and every other test passes.

- [ ] **Step 3: Implement.** In `parts/chart-notes.ts`, the controls block (`:91-102`) becomes:

```ts
    if (!caps.canEdit) return { items }
    const last = args.today < args.to ? args.today : args.to
    return {
      items,
      controls: {
        clientSlug: args.clientSlug, channel: args.channel, chart: args.chart, canApprove: caps.canApprove,
        ...(args.posts === null ? { postsFailed: true as const } : {}),
        // Every day up to today, each with its posts or none, so a note can go on a day with no post (a PR
        // hit, Jasmine 2026-09-29). None when the posts could not load: a day's posts are then unknown.
        days: args.posts === null ? [] : windowDays(args.from, last)
          .map((day) => ({ day, posts: postsOn(day).map((p) => ({ id: p.id, thumb: thumbOf(p) })) })),
      },
    }
```

In `lib/organic-social/annotations.ts`, the `days` doc comment (`:108`) becomes:

```ts
  /** The days a note may go on: every day of the window up to today, oldest first, each with that day's
   *  posts (possibly none). Empty when the posts could not load (`postsFailed`). */
```

- [ ] **Step 4: Run the file**

Run: `npx vitest run components/report-sections/organic-social/parts/chart-notes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/report-sections/organic-social/parts/chart-notes.ts components/report-sections/organic-social/parts/chart-notes.test.ts lib/organic-social/annotations.ts
git commit -m "feat(organic-social): The notes panel offers every day up to today, with or without posts"
```

### Task 2: A Day list in the Add annotation panel

**Files:**
- Modify: `components/report-sections/organic-social/note-form.tsx:31-36` (doc), `:58` (new state after it), `:65-89` (`pick`), `:112-151` (render)
- Test: `components/report-sections/organic-social/chart-notes-ui.test.tsx`

**Interfaces:**
- Consumes: `NoteControls.days` as Task 1 produces it.
- Produces: nothing new outside the form. The save call is unchanged: `saveChartNoteAction({ clientSlug, channel, chart, day, body, postIds })`, `postIds` possibly `[]`.

- [ ] **Step 1: Change the test that pins "no date list", and add the new tests.** In `chart-notes-ui.test.tsx`, the test `'only days with posts appear, oldest first, each picture with its date, and no date list'` (`:278-284`) becomes (deliberate: a Day list is now the way to reach a day with no post):

```tsx
  test('the pictures are only the days with posts, oldest first; every day is in the Day list', () => {
    draw([PEAK], CONTROLS)
    open()
    expect(postButtons().map((b) => b.getAttribute('aria-label'))).toEqual(['Post from 8/10', 'Post from 8/10', 'Post from 8/10', 'Post from 8/20'])
    expect(postButtons()[3].textContent).toContain('8/20')
    const list = within(panel()).getByLabelText('Day') as HTMLSelectElement
    expect([...list.options].map((o) => o.textContent)).toEqual(['Pick a day', '8/10', '8/14 (no posts)', '8/20'])
  })
```

The shared `CONTROLS` fixture (`:37-44`) gains the day with no post the server now sends, and its comment (`:39`) is rewritten. Its `days` becomes:

```tsx
  // What the server sends: every day of the window up to today, each with its posts or none (8/14 has none;
  // the real list has every day of the month, trimmed here to the three the tests use).
  days: [
    { day: '2026-08-10', posts: [{ id: 11, thumb: IMG(1) }, { id: 12, thumb: IMG(2) }, { id: 13, thumb: IMG(3) }] },
    { day: '2026-08-14', posts: [] },
    { day: '2026-08-20', posts: [{ id: 21, thumb: IMG(4) }] },
  ],
```

The picture row skips days with no posts (`note-form.tsx:47`), so every existing picture-index test, #283's appended ones included, is unaffected. Two more wording fixes so nothing in the file says the old rule:

the describe title `'the Add annotation panel: pick a post by its picture, days with posts only (Phase 2b)'` (`:262`) becomes `'the Add annotation panel: pick a post by its picture, or a day from the Day list (Phase 2b)'`, and the test `'a new note needs a picked post and text before it can be saved'` (`:336`) is renamed, body unchanged:

```tsx
  test('a new note needs a day (from a picture or the Day list) and text before it can be saved', () => {
```

Then insert a new `describe` right after the closing `})` of that `describe('the Add annotation panel: ...')` block (the `})` after the test `"a card's day with no post says 'No posts went live this day', and saves with the text alone"`, currently `:390`), before the comment block that opens `describe('after a save, one line says what happened; ...')`. Not at the end of the file: #283 appends there.

```tsx
// Jasmine, 2026-09-29: a note on a day with no post (a PR hit). The Day list reaches any day up to today.
// Test names carry the spec's ids (U1 to U9, section 6).
describe('the Day list: a note on any day, with or without a post', () => {
  const open = () => fireEvent.click(screen.getByRole('button', { name: 'Add annotation' }))
  const panel = () => screen.getByRole('group', { name: 'Note' })
  const postButtons = () => within(panel()).getAllByRole('button', { name: /^Post from / })
  const save = () => within(panel()).getByRole('button', { name: 'Save draft' }) as HTMLButtonElement
  const type = (value: string) => fireEvent.change(within(panel()).getByLabelText('Note text'), { target: { value } })
  const list = () => within(panel()).getByLabelText('Day') as HTMLSelectElement
  const choose = (day: string) => fireEvent.change(list(), { target: { value: day } })
  const text = () => (within(panel()).getByLabelText('Note text') as HTMLInputElement).value
  // postButtons()[3] is post 21, the one post of 8/20.
  const APPROVED_820 = QUIET({ date: '2026-08-20', label: '8/20', note: 'Event', noteEditor: { approvedId: 'aid', approvedPostIds: [21], draft: null } })
  const DRAFT_814 = QUIET({ noteEditor: { approvedId: null, approvedPostIds: [], draft: { id: 'd', text: 'Soon', postIds: [] } } })

  test('U1 a day with no posts is chosen from the list and saved with the text alone', async () => {
    draw([PEAK], CONTROLS)
    open()
    choose('2026-08-14')
    expect(within(panel()).getByText('No posts went live this day')).toBeTruthy()
    expect(save().disabled).toBe(true)
    type('PR coverage went live')
    fireEvent.click(save())
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(actions.saveChartNoteAction).toHaveBeenCalledWith({
      clientSlug: 'a-client', channel: 'INSTAGRAM', chart: 'engagements', day: '2026-08-14', body: 'PR coverage went live', postIds: [],
    })
  })

  test('U2 a picture moves the list to its day; a chosen day with posts says posts are optional', async () => {
    draw([PEAK], CONTROLS)
    open()
    fireEvent.click(postButtons()[3])
    expect(list().value).toBe('2026-08-20')
    choose('2026-08-10')
    expect(postButtons()[3].getAttribute('aria-pressed')).toBe('false')
    expect(within(panel()).getByText(`Pick up to 2 of this day's posts, or just write what happened`)).toBeTruthy()
    fireEvent.click(postButtons()[0])
    type('Launch')
    fireEvent.click(save())
    await waitFor(() => expect(actions.saveChartNoteAction).toHaveBeenCalledWith(expect.objectContaining({ day: '2026-08-10', postIds: [11] })))
  })

  test('U3 (a) a day chosen from the list stays when its pick is undone', () => {
    draw([PEAK], CONTROLS)
    open()
    choose('2026-08-10')
    fireEvent.click(postButtons()[0])
    fireEvent.click(postButtons()[0])
    expect(list().value).toBe('2026-08-10')
    type('Still this day')
    expect(save().disabled).toBe(false)
  })

  test('U3 (b) undoing the picks on a chosen day keeps its loaded note and its line together', () => {
    draw([PEAK, APPROVED_820], CONTROLS)
    open()
    choose('2026-08-20')
    expect(text()).toBe('Event')
    expect(postButtons()[3].getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(postButtons()[3])
    expect([list().value, text()]).toEqual(['2026-08-20', 'Event'])
    expect(within(panel()).getByText('8/20 already has an approved note. Saving drafts a change to it.')).toBeTruthy()
  })

  test('U3 (c) a picture from another day makes it a picture-set day, which clears when its pick is undone', () => {
    draw([PEAK], CONTROLS)
    open()
    type('My words')
    choose('2026-08-10')
    fireEvent.click(postButtons()[3])
    expect(list().value).toBe('2026-08-20')
    fireEvent.click(postButtons()[3])
    expect(list().value).toBe('')
    expect(save().disabled).toBe(true)
    expect(text()).toBe('My words')
  })

  test('U4 choosing a day with a note loads its text and picks, and says a save changes it', () => {
    draw([PEAK, APPROVED_820], CONTROLS)
    open()
    choose('2026-08-20')
    expect(text()).toBe('Event')
    expect(postButtons()[3].getAttribute('aria-pressed')).toBe('true')
    expect(within(panel()).getByText('8/20 already has an approved note. Saving drafts a change to it.')).toBeTruthy()
    choose('2026-08-14')
    expect(text()).toBe('')
    expect(postButtons().every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true)
  })

  test('U4 a draft on a chosen day loads with its own line', () => {
    draw([PEAK, DRAFT_814], CONTROLS)
    open()
    choose('2026-08-14')
    expect(text()).toBe('Soon')
    expect(within(panel()).getByText('8/14 already has a draft. Saving updates it.')).toBeTruthy()
  })

  test('U5 text already typed is never replaced by the chosen day\'s note', () => {
    draw([PEAK, APPROVED_820], CONTROLS)
    open()
    type('My own words')
    choose('2026-08-20')
    expect(text()).toBe('My own words')
  })

  test('U6 a month with no posts: every day is in the list, and the line says so until a day is chosen', () => {
    draw([PEAK], { ...CONTROLS, days: [{ day: '2026-08-13', posts: [] }, { day: '2026-08-14', posts: [] }] })
    open()
    expect(within(panel()).getByText('No posts went live this month')).toBeTruthy()
    choose('2026-08-13')
    expect(within(panel()).getByText('No posts went live this day')).toBeTruthy()
  })

  // With no days the button is not drawn at all (trends.tsx:162), so no new note starts on a day whose
  // posts are unknown; Edit from a card still opens, fixed to its day, with no Day list.
  test('U7 when the posts could not load, Add annotation is not offered, and Edit on a card has no Day list', () => {
    draw([QUIET({ note: 'Event', noteEditor: { approvedId: 'aid', approvedPostIds: [], draft: null } })], { ...CONTROLS, postsFailed: true, days: [] })
    expect(screen.queryByRole('button', { name: 'Add annotation' })).toBeNull()
    fireEvent.click(within(cardOf('2026-08-14')).getByRole('button', { name: 'Edit note' }))
    expect(within(panel()).queryByLabelText('Day')).toBeNull()
  })

  test('U8 Edit on a card has no Day list: it stays on its card\'s day', () => {
    draw([QUIET({ note: 'Event', noteEditor: { approvedId: 'aid', approvedPostIds: [], draft: null } })], CONTROLS)
    fireEvent.click(within(cardOf('2026-08-14')).getByRole('button', { name: 'Edit note' }))
    expect(within(panel()).queryByLabelText('Day')).toBeNull()
  })

  test('U9 the list is dark like the month picker, so its options are readable', () => {
    draw([PEAK], CONTROLS)
    open()
    expect(list().className).toContain('bg-bg-surface')
    expect(list().className).toContain('text-white')
  })
})
```

`QUIET`, `PEAK`, `CONTROLS`, `draw`, `cardOf`, `actions` and `refresh` are the file's existing fixtures (`chart-notes-ui.test.tsx:24-53`). `QUIET`'s day is 2026-08-14.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run components/report-sections/organic-social/chart-notes-ui.test.tsx`
Expected: FAIL on the changed test and on every new test that uses the Day list. Two new tests pass already, since they pin what must not change: U7 (posts failed) and U8 (Edit on a card). Every other test passes, including the existing ones with the new `CONTROLS` day (the picture row skips days with no posts).

- [ ] **Step 3: Implement.** In `note-form.tsx`:

The doc comment on `NoteForm` (`:31-36`) becomes:

```tsx
/** Add or edit a day's note (Phase 2b, the approved mockup). A new note starts from a post or a day: the
 *  month's posts as pictures with their dates, only days with posts, oldest first, in one row that scrolls
 *  sideways, and a Day list with every day up to today, including days with no post (Jasmine, 2026-09-29:
 *  a PR hit on a day with no post). Picking a picture sets the day, and up to NOTE_MAX_POSTS may be picked,
 *  all from that day (a pick from another day moves there and clears the rest). Editing from a card is
 *  fixed to that card's day: its posts, or the line "No posts went live this day". Saving always lands as
 *  a draft; the action re-checks everything. Staff only, and `no-print`, since Export PDF prints the page. */
```

After the `loaded` state (`:58`), add:

```tsx
  // Whether the day came from the Day list. A day set by picking a picture goes with its last pick, as
  // before; a day chosen from the list stays, since a note needs no post.
  const [chosen, setChosen] = useState(false)
```

In `pick` (`:65-89`), two lines change. The unpick branch (`:72`):

```tsx
      if (!fixedDay && !chosen && rest.length === 0) { setDay(null); setText(own); setLoaded(null) }
```

and the move-day branch sets the day from the picture, so right after `setDay(postDay)` (`:76`):

```tsx
      setChosen(false)
```

After `pick`, add:

```tsx
  // The Day list (new notes only). Same rules as reaching a day by its picture: a day's note loads, typed
  // text is kept, and filled-in text the user left as it was goes with its day.
  function chooseDay(next: string) {
    const own = loaded !== null && text === loaded ? '' : text
    if (!next) { setDay(null); setChosen(false); setPicked([]); setText(own); setLoaded(null); return }
    setDay(next)
    setChosen(true)
    const ex = notes?.[next]
    if (!ex) { setPicked([]); setText(own); setLoaded(null); return }
    setPicked(ex.postIds)
    if (own.trim()) { setText(own); setLoaded(null) } else { setText(ex.text); setLoaded(ex.text) }
  }
  const noPostsOnDay = !!day && !posts.some((p) => p.day === day)
```

In the render, directly inside the group `div` (`:113`) and before `{posts.length > 0 || unresolved.length > 0 ? (`, add the list:

```tsx
      {!fixedDay && controls.days.length > 0 && (
        <label className="flex items-center gap-2 text-[11px] text-text-muted">
          Day
          <select aria-label="Day" value={day ?? ''} disabled={pending} onChange={(e) => chooseDay(e.target.value)}
            className="rounded-md border border-white/[0.12] bg-bg-surface px-2 py-1 text-xs text-white">
            <option value="">Pick a day</option>
            {controls.days.map((d) => (
              <option key={d.day} value={d.day}>{d.posts.length > 0 ? dayLabel(d.day) : `${dayLabel(d.day)} (no posts)`}</option>
            ))}
          </select>
        </label>
      )}
```

The hint line (`:143-145`) becomes:

```tsx
          <p className="text-[11px] text-text-muted">
            {posts.length === 0 ? KEEPS_PICKS : full ? `Up to ${NOTE_MAX_POSTS} posts` : fixedDay ? `Pick up to ${NOTE_MAX_POSTS} of this day's posts` : noPostsOnDay ? (unresolved.length > 0 ? KEEPS_PICKS : 'No posts went live this day') : chosen ? `Pick up to ${NOTE_MAX_POSTS} of this day's posts, or just write what happened` : 'Pick a post, then write what happened'}
          </p>
```

and the no-pictures line (`:148-150`) becomes:

```tsx
        <p className="text-[11px] text-text-muted">
          {controls.postsFailed ? KEEPS_PICKS : fixedDay || day ? 'No posts went live this day' : 'No posts went live this month'}
        </p>
```

The comment above `canSave` (`:91-92`) becomes:

```tsx
  // A new note's day comes from picking a post or from the Day list; a day set by a post goes when its last
  // pick is undone. An edit is already on its card's day. Either way it also needs text; posts are optional.
```

`canSave` itself (`:93`) and `save` (`:95-110`) do not change: a day and text are enough, and `picked` may be empty.

- [ ] **Step 4: Run the file**

Run: `npx vitest run components/report-sections/organic-social/chart-notes-ui.test.tsx`
Expected: PASS, every test, including the unchanged ones that pin picking by picture (`:296-349`) and the Phase 2c day-loading tests (`:451-509`).

- [ ] **Step 5: Run everything the notes touch, and commit**

Run: `npx vitest run components/report-sections/organic-social/ lib/organic-social/ app/actions/`
Expected: PASS.

```bash
git add components/report-sections/organic-social/note-form.tsx components/report-sections/organic-social/chart-notes-ui.test.tsx
git commit -m "feat(organic-social): Add annotation has a Day list, so a note can go on a day with no post"
```

### Task 3: Prove it and hand it over

- [ ] Run `DATABASE_URL=postgresql://ci:ci@db.invalid/ci make check`. Expected: typecheck, every test, the RSC check and `next build` pass.
- [ ] Run `npx eslint` on the five changed files (`parts/chart-notes.ts`, `parts/chart-notes.test.ts`, `lib/organic-social/annotations.ts`, `note-form.tsx`, `chart-notes-ui.test.tsx`). Expected: clean.
- [ ] Merge proof, pair by pair and all together in both orders, against every open PR branch (#281, #282, #283, #284, #285, #286, #287 and `feat/os-newest-month-for-clients`). Expected: clean. #283 is the only one sharing files (`note-form.tsx`, `chart-notes-ui.test.tsx`); with it merged in, run `npx vitest run components/report-sections/organic-social/` on the combined tree too. Expected: PASS.
- [ ] Renaissance: not on locked months, so `withNotes` returns before reading notes (`parts/chart-notes.ts:61`) and it gets no controls; the test `'a client not on locked months, shaped like Renaissance, never reads notes and gets no controls'` passes unchanged.
- [ ] Look at it on the local app (dev database), as staff on an outline client: Add annotation shows the Day list; a day with no posts reads "(no posts)"; a note saved on it shows as a card with the date and the text, on a dot at that day if the graph has a point there, else in the row above the chart (note which, for the PR); approve it and it stays text only.
- [ ] Push, mark the PR ready, request Paul.
