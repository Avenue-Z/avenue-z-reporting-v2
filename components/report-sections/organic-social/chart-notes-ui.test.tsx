import { beforeEach, describe, expect, test, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

// Recharts draws nothing in jsdom, so the chart is a stub that records its props.
vi.mock('@/components/charts/line-chart', () => ({ LineChart: vi.fn(() => null) }))
vi.mock('@/app/actions/organic-social', () => ({ setAnnotationHiddenAction: vi.fn(async () => ({ ok: true })) }))
const actions = vi.hoisted(() => ({
  saveChartNoteAction: vi.fn(async () => ({ ok: true })),
  approveChartNoteAction: vi.fn(async () => ({ ok: true })),
  revokeChartNoteAction: vi.fn(async () => ({ ok: true })),
  deleteChartNoteDraftAction: vi.fn(async () => ({ ok: true })),
}))
vi.mock('@/app/actions/chart-notes', () => actions)
const refresh = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

import { LineChart } from '@/components/charts/line-chart'
import { setAnnotationHiddenAction } from '@/app/actions/organic-social'
import { ChannelTrendChart } from './trends'
import { CARD_PILL, PILL } from './pill'
import type { AnnotationControls, ChartAnnotation, ChartThumb, NoteControls } from '@/lib/organic-social/annotations'
import type { TrendSeries } from '@/lib/organic-social/types'

// Every value is invented.
const SERIES: TrendSeries = {
  channels: ['Instagram'],
  points: ['2026-08-10', '2026-08-14', '2026-08-20', '2026-08-22'].map((date) => ({ date, Instagram: 5 })),
}
const IMG = (n: number): ChartThumb => ({
  creative: { kind: 'image', thumb: `https://cdn.example.com/t${n}.jpg`, full: `https://cdn.example.com/f${n}.jpg` },
  mediaType: 'IMAGE', url: `https://example.com/p/${n}`,
})
const PEAK: ChartAnnotation = { date: '2026-08-10', value: 50, label: '8/10 | 50 Engagements', hidden: false, thumb: IMG(1) }
const QUIET = (over: Partial<ChartAnnotation>): ChartAnnotation =>
  ({ date: '2026-08-14', value: -3, label: '8/14', hidden: false, thumb: null, noteOnly: true, ...over })
const DRAFT = { approvedId: null, approvedPostIds: [], draft: { id: 'd', text: 'Soon', postIds: [] } }
const CONTROLS: NoteControls = {
  clientSlug: 'a-client', channel: 'INSTAGRAM', chart: 'engagements', canApprove: true,
  // What the server sends since Phase 2b: only the days with at least one post.
  days: [
    { day: '2026-08-10', posts: [{ id: 11, thumb: IMG(1) }, { id: 12, thumb: IMG(2) }, { id: 13, thumb: IMG(3) }] },
    { day: '2026-08-20', posts: [{ id: 21, thumb: IMG(4) }] },
  ],
}
const HIDES: AnnotationControls = { clientSlug: 'a-client', channel: 'INSTAGRAM', chart: 'engagements' }
const chart = () => vi.mocked(LineChart).mock.lastCall![0]
// Phase 2b: a card lives in the chart's callouts and opens from its dot; render it to read it.
const callout = (x: string) => chart().callouts!.find((c) => c.x === x)!
const cardOf = (x: string) => render(<>{callout(x).content}</>).container
const draw = (annotations: ChartAnnotation[], noteControls?: NoteControls, annotationControls?: AnnotationControls) =>
  render(<ChannelTrendChart title="T" series={SERIES} annotations={annotations} noteControls={noteControls} annotationControls={annotationControls} />)

beforeEach(() => vi.clearAllMocks())

describe('the cards, opened from their dots (Phase 2b)', () => {
  test('an approved note sits on its own line under the date and number', () => {
    draw([{ ...PEAK, note: 'Influencer post went live' }])
    const card = cardOf(PEAK.date)
    const label = within(card).getByText('8/10 | 50 Engagements')
    const note = within(card).getByText('Influencer post went live')
    expect(label).not.toBe(note)
    expect(note.parentElement).toBe(label.parentElement)
  })

  test('a note-only day shows the date and the note, and no number', () => {
    draw([QUIET({ note: 'Event' })])
    const card = cardOf('2026-08-14')
    expect(within(card).getByText('8/14')).toBeTruthy()
    expect(within(card).getByText('Event')).toBeTruthy()
    expect(within(card).queryByText(/-3/)).toBeNull()
  })

  // Seen live: the card was the graph's own colour (#272727) with an 8% border, so it did not stand
  // apart. A card that opens over the graph takes the darker brand surface and a clearer border.
  test('a card stands apart from the graph: the darker brand surface and a clearer border', () => {
    draw([PEAK])
    const cls = cardOf(PEAK.date).firstElementChild!.className
    expect(cls).toContain('bg-bg-subtle')
    expect(cls).toContain('border-white/[0.14]')
    expect(cls).not.toContain('bg-white/[0.03]')
  })

  test('picked posts replace the top post on the card', () => {
    draw([{ ...PEAK, note: 'x', thumbs: [IMG(2), IMG(3)] }])
    expect([...cardOf(PEAK.date).querySelectorAll('img')].map((i) => i.getAttribute('src'))).toEqual([
      'https://cdn.example.com/t2.jpg', 'https://cdn.example.com/t3.jpg',
    ])
  })

  test('a dot marks top days and approved note days; a draft-only or hidden day gets none', () => {
    draw([PEAK, QUIET({ note: 'Event' }), QUIET({ date: '2026-08-20', noteEditor: DRAFT }), QUIET({ date: '2026-08-22', note: 'Hidden one', hidden: true })])
    expect(chart().marks).toEqual([{ x: '2026-08-10' }, { x: '2026-08-14' }])
  })

  test('the hover box gets approved notes on shown days only, and nothing when there are none', () => {
    const first = draw([PEAK, QUIET({ note: 'Event' }), QUIET({ date: '2026-08-22', note: 'Hidden one', hidden: true })])
    expect(chart().notes).toEqual({ '2026-08-14': 'Event' })
    first.unmount()
    draw([PEAK])
    expect(chart().notes).toBeUndefined()
  })

  test('a draft-only day is a faint dot and a faded card; an approved note-only day is a normal one', () => {
    draw([QUIET({ note: 'Event' }), QUIET({ date: '2026-08-20', label: '8/20', noteEditor: DRAFT })], CONTROLS)
    expect(chart().callouts!.map((c) => [c.x, !!c.muted])).toEqual([['2026-08-14', false], ['2026-08-20', true]])
    const draftCard = cardOf('2026-08-20')
    // Seen live: a see-through card showed the graph's line through it. It stays solid; only its
    // contents dim, and only a little: at 40% the draft was hard to read (seen live, 2026-09-24).
    const root = draftCard.firstElementChild!
    expect(root.className).toContain('[&>*]:opacity-80')
    expect(root.className).not.toContain('[&>*]:opacity-40')
    expect(root.className.split(' ')).not.toContain('opacity-80')
    expect(root.className.split(' ')).not.toContain('opacity-40')
    expect(root.className).toContain('no-print')
    expect(within(draftCard).getByText('Draft: Soon').className).toContain('no-print')
  })

  test('a hidden card keeps the stronger fade, with or without a draft', () => {
    draw([{ ...PEAK, hidden: true }, QUIET({ date: '2026-08-22', label: '8/22', hidden: true, noteEditor: DRAFT })], CONTROLS, HIDES)
    for (const day of ['2026-08-10', '2026-08-22']) {
      const cls = cardOf(day).firstElementChild!.className
      expect(cls).toContain('[&>*]:opacity-40')
      expect(cls).not.toContain('[&>*]:opacity-80')
    }
  })

  // Paul's review of #273 (C3): Approve sends the draft's picks, so the card shows them to the approver.
  test("the approver sees the draft's own picked posts on the card, the ones Approve sends", async () => {
    const ed = { approvedId: 'aid', approvedPostIds: [11], draft: { id: 'did', text: 'New', postIds: [12, 13] }, draftThumbs: [IMG(2), IMG(3)] }
    draw([{ ...PEAK, note: 'Old', thumbs: [IMG(1)], noteEditor: ed }], CONTROLS)
    const card = cardOf(PEAK.date)
    const pics = within(card).getByLabelText("Draft's posts")
    expect([...pics.querySelectorAll('img')].map((i) => i.getAttribute('src'))).toEqual(['https://cdn.example.com/t2.jpg', 'https://cdn.example.com/t3.jpg'])
    expect(pics.className).toContain('no-print')
    fireEvent.click(within(card).getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(actions.approveChartNoteAction).toHaveBeenCalledWith('a-client', 'did', { text: 'New', postIds: [12, 13] }))
  })

  test('a draft with no picked posts shows no draft pictures', () => {
    draw([{ ...PEAK, noteEditor: { approvedId: null, approvedPostIds: [], draft: { id: 'd', text: 'Soon', postIds: [] } } }], CONTROLS)
    expect(within(cardOf(PEAK.date)).queryByLabelText("Draft's posts")).toBeNull()
  })

  test('a client sees no buttons, no draft text and no faint dots', () => {
    draw([{ ...PEAK, note: 'Event' }])
    expect(cardOf(PEAK.date).querySelector('button')).toBeNull()
    expect(screen.queryByText(/^Draft:/)).toBeNull()
    expect(chart().callouts!.every((c) => !c.muted)).toBe(true)
    expect(screen.queryByRole('button', { name: 'Add annotation' })).toBeNull()
  })

  test('an approver gets Approve on a draft and Revoke on an approved note; an editor gets neither', async () => {
    const ed = { approvedId: 'aid', approvedPostIds: [], draft: { id: 'did', text: 'New', postIds: [] } }
    const approver = draw([{ ...PEAK, note: 'Old', noteEditor: ed }], CONTROLS)
    const card = cardOf(PEAK.date)
    fireEvent.click(within(card).getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(actions.approveChartNoteAction).toHaveBeenCalledWith('a-client', 'did', { text: 'New', postIds: [] }))
    // Paul's review of #273 (C9): revoke is refused while a draft is open on the day, so it is not
    // offered then (delete or approve the draft first).
    expect(within(card).queryByRole('button', { name: 'Revoke' })).toBeNull()
    expect(within(card).getByRole('button', { name: 'Delete draft' })).toBeTruthy()
    approver.unmount()

    const approvedOnly = draw([{ ...PEAK, note: 'Old', noteEditor: { approvedId: 'aid', approvedPostIds: [], draft: null } }], CONTROLS)
    const onlyCard = cardOf(PEAK.date)
    expect(within(onlyCard).getByRole('button', { name: 'Revoke' })).toBeTruthy()
    expect(within(onlyCard).queryByRole('button', { name: 'Approve' })).toBeNull()
    approvedOnly.unmount()

    draw([{ ...PEAK, note: 'Old', noteEditor: ed }], { ...CONTROLS, canApprove: false })
    const editorCard = cardOf(PEAK.date)
    expect(within(editorCard).queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(within(editorCard).queryByRole('button', { name: 'Revoke' })).toBeNull()
    expect(within(editorCard).getByRole('button', { name: 'Delete draft' })).toBeTruthy()
  })
})

describe('the graph: dots only, one card per callout on the series (Phase 2b)', () => {
  test('every callout on the series goes to the chart as a card named by its label; no row and no band', () => {
    draw([PEAK, QUIET({ note: 'Event' })])
    expect(chart().callouts!.map((c) => [c.x, c.label])).toEqual([['2026-08-10', '8/10 | 50 Engagements'], ['2026-08-14', '8/14']])
    expect(screen.queryByRole('list', { name: 'Annotations' })).toBeNull()
    expect('pins' in chart()).toBe(false)
  })

  test("the team's hidden and draft days are faint dots, and never get a real dot", () => {
    draw([PEAK, QUIET({ date: '2026-08-20', label: '8/20', noteEditor: DRAFT }), QUIET({ date: '2026-08-22', label: '8/22', note: 'Hidden one', hidden: true })], CONTROLS, HIDES)
    expect(chart().callouts!.map((c) => [c.x, !!c.muted])).toEqual([['2026-08-10', false], ['2026-08-20', true], ['2026-08-22', true]])
    expect(chart().marks).toEqual([{ x: '2026-08-10' }])
  })

  test("the team's buttons are on each card, and a client's card has none", () => {
    draw([PEAK], CONTROLS, HIDES)
    const card = cardOf(PEAK.date)
    expect(within(card).getByRole('button', { name: 'Hide from client' })).toBeTruthy()
    expect(within(card).getByRole('button', { name: 'Add note' })).toBeTruthy()
  })

  test('Hide on a card fades it, takes its dot at once, and makes one call', async () => {
    draw([PEAK], CONTROLS, HIDES)
    fireEvent.click(within(cardOf(PEAK.date)).getByRole('button', { name: 'Hide from client' }))
    expect(chart().marks).toEqual([])
    expect(chart().callouts!.map((c) => [c.x, !!c.muted])).toEqual([['2026-08-10', true]])
    await waitFor(() => expect(setAnnotationHiddenAction).toHaveBeenCalledWith({ ...HIDES, day: '2026-08-10', hidden: true }))
  })

  test('a callout whose day has no point goes in the row above the chart, since it has no dot', () => {
    draw([PEAK, QUIET({ date: '2026-08-31', label: '8/31', note: 'Late' })])
    expect(chart().callouts!.map((c) => c.x)).toEqual(['2026-08-10'])
    expect(within(screen.getByRole('list', { name: 'Annotations' })).getByText('Late')).toBeTruthy()
  })

  test('the Annotations button takes the cards and their dots away', () => {
    draw([PEAK])
    fireEvent.click(screen.getByRole('button', { name: 'Annotations' }))
    expect(chart().callouts).toBeUndefined()
    expect(chart().marks).toBeUndefined()
  })
})

// Found in the Task 10 review, measured in Chromium with the app's own CSS: beside the buttons the
// text column (flex-1, a zero starting width) shrank to a few pixels. The buttons belong on their own
// row under the picture and the text.
describe("the team's buttons sit on their own row, so the date, number and note keep their width", () => {
  const ED = { approvedId: 'aid', approvedPostIds: [], draft: { id: 'did', text: 'Went live Tuesday', postIds: [] } }

  test('in the row (a day with no point), every button of a card shares one full-width row that never prints', () => {
    draw([{ ...PEAK, date: '2026-08-31', note: 'Old', noteEditor: ED }], CONTROLS, HIDES)
    const buttons = screen.getAllByRole('button').filter((b) => b.closest('li'))
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Hide from client', 'Edit note', 'Approve', 'Delete draft'])
    const row = buttons[0].parentElement!
    expect(buttons.every((b) => b.parentElement === row)).toBe(true)
    expect(row.tagName).not.toBe('LI')
    expect(row.className).toContain('basis-full')
    expect(row.className).toContain('no-print')
    expect(screen.getByText('Draft: Went live Tuesday').className).not.toContain('line-clamp')
  })

  // Audit, 2026-09-25: a card opens at its natural height, and the hover box hides while it is open, so
  // a clamp hid the end of a note from the client and the end of a draft from the approver approving
  // it (measured in Chromium: an 80 character note needed 3 lines, the card showed 2; a draft, 1).
  test('on a card, the same row; the note and the draft show whole, never cut', () => {
    draw([{ ...PEAK, note: 'Old', noteEditor: ED }], CONTROLS, HIDES)
    const card = cardOf(PEAK.date)
    const buttons = [...card.querySelectorAll('button')]
    expect(buttons).toHaveLength(4)
    const row = buttons[0].parentElement!
    expect(buttons.every((b) => b.parentElement === row)).toBe(true)
    expect(row.className).toContain('basis-full')
    for (const line of [within(card).getByText('Draft: Went live Tuesday'), within(card).getByText('Old')]) {
      expect(line.className).not.toContain('line-clamp')
      expect(line.className).toContain('break-words')
    }
  })

  test("a client's card has no buttons row at all", () => {
    draw([{ ...PEAK, note: 'Event' }])
    expect(cardOf(PEAK.date).querySelector('.basis-full')).toBeNull()
  })
})

describe('the Add annotation panel: pick a post by its picture, days with posts only (Phase 2b)', () => {
  const open = () => fireEvent.click(screen.getByRole('button', { name: 'Add annotation' }))
  const panel = () => screen.getByRole('group', { name: 'Note' })
  const postButtons = () => within(panel()).getAllByRole('button', { name: /^Post from / })
  const save = () => within(panel()).getByRole('button', { name: 'Save draft' }) as HTMLButtonElement
  const type = (value: string) => fireEvent.change(within(panel()).getByLabelText('Note text'), { target: { value } })

  // It adds what the Annotations toggle beside it shows (my call, 2026-09-24). A card's own button
  // writes on an annotation that already exists, so it keeps its name.
  test('the button above the chart reads Add annotation; a card keeps its Note button', () => {
    draw([PEAK], CONTROLS)
    expect(screen.getByRole('button', { name: 'Add annotation' }).textContent).toBe('Add annotation')
    expect(screen.queryByRole('button', { name: 'Add note' })).toBeNull()
    expect(within(cardOf(PEAK.date)).getByRole('button', { name: 'Add note' }).textContent).toBe('Note')
  })

  test('only days with posts appear, oldest first, each picture with its date, and no date list', () => {
    draw([PEAK], { ...CONTROLS, days: [CONTROLS.days[0], { day: '2026-08-14', posts: [] }, CONTROLS.days[1]] })
    open()
    expect(postButtons().map((b) => b.getAttribute('aria-label'))).toEqual(['Post from 8/10', 'Post from 8/10', 'Post from 8/10', 'Post from 8/20'])
    expect(postButtons()[3].textContent).toContain('8/20')
    expect(within(panel()).queryByLabelText('Day')).toBeNull()
  })

  // Seen live: the browser's own scrollbar showed as a bright white bar under the pictures. The row
  // takes the site's dark scrollbar, the one the sidebars use (app/globals.css .scrollbar-dark).
  test('the pictures sit in one row that scrolls sideways, on the site\'s dark scrollbar', () => {
    draw([PEAK], CONTROLS)
    open()
    const row = postButtons()[0].parentElement!.className.split(' ')
    expect(row).toContain('overflow-x-auto')
    expect(row).toContain('scrollbar-dark')
  })

  test('Add annotation saves the picked day, up to 2 of its posts and the text, then refreshes the page', async () => {
    draw([PEAK], CONTROLS)
    open()
    fireEvent.click(postButtons()[0])
    fireEvent.click(postButtons()[1])
    expect(postButtons()[2]).toBeDisabled()
    expect(postButtons()[3]).not.toBeDisabled()
    type('Went live')
    fireEvent.click(save())
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(actions.saveChartNoteAction).toHaveBeenCalledWith({
      clientSlug: 'a-client', channel: 'INSTAGRAM', chart: 'engagements', day: '2026-08-10', body: 'Went live', postIds: [11, 12],
    })
  })

  test('a picked post shows as pressed and can be unpicked; with two picked the hint reads "Up to 2 posts"', () => {
    draw([PEAK], CONTROLS)
    open()
    expect(within(panel()).getByText('Pick a post, then write what happened')).toBeTruthy()
    fireEvent.click(postButtons()[0])
    expect(postButtons()[0].getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(postButtons()[1])
    expect(within(panel()).getByText('Up to 2 posts')).toBeTruthy()
    fireEvent.click(postButtons()[0])
    expect(postButtons()[0].getAttribute('aria-pressed')).toBe('false')
    expect(postButtons()[2]).not.toBeDisabled()
  })

  test('picking a post from another day moves the note to that day and clears the earlier picks', async () => {
    draw([PEAK], CONTROLS)
    open()
    fireEvent.click(postButtons()[0])
    fireEvent.click(postButtons()[1])
    fireEvent.click(postButtons()[3])
    expect(postButtons().map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'false', 'true'])
    type('Late one')
    fireEvent.click(save())
    await waitFor(() => expect(actions.saveChartNoteAction).toHaveBeenCalledWith(expect.objectContaining({ day: '2026-08-20', postIds: [21] })))
  })

  test('a new note needs a picked post and text before it can be saved', () => {
    draw([PEAK], CONTROLS)
    open()
    type('Went live')
    expect(save().disabled).toBe(true)
    fireEvent.click(postButtons()[0])
    expect(save().disabled).toBe(false)
    fireEvent.click(postButtons()[0])
    expect(save().disabled).toBe(true)
    fireEvent.click(postButtons()[0])
    type('   ')
    expect(save().disabled).toBe(true)
  })

  test('the counter shows how much of the 80 characters is used, and the box stops at 80', () => {
    draw([PEAK], CONTROLS)
    open()
    type('Went live')
    expect(within(panel()).getByText('9/80')).toBeTruthy()
    expect(within(panel()).getByLabelText('Note text').getAttribute('maxlength')).toBe('80')
  })

  test('a refused save shows the reason and does not refresh', async () => {
    actions.saveChartNoteAction.mockResolvedValueOnce({ ok: false, error: 'A draft is already open on this day. Reload to see it.' } as never)
    draw([PEAK], CONTROLS)
    open()
    fireEvent.click(postButtons()[0])
    type('x')
    fireEvent.click(save())
    expect((await screen.findByRole('alert')).textContent).toContain('A draft is already open on this day')
    expect(refresh).not.toHaveBeenCalled()
  })

  test("Edit on a card opens the panel fixed to that day: its posts with the draft's picks, and the draft text", () => {
    draw([{ ...PEAK, note: 'Old', noteEditor: { approvedId: 'aid', approvedPostIds: [11], draft: { id: 'did', text: 'New', postIds: [12] } } }], CONTROLS)
    fireEvent.click(within(cardOf(PEAK.date)).getByRole('button', { name: 'Edit note' }))
    expect((within(panel()).getByLabelText('Note text') as HTMLInputElement).value).toBe('New')
    expect(postButtons().map((b) => [b.getAttribute('aria-label'), b.getAttribute('aria-pressed')])).toEqual([
      ['Post from 8/10', 'false'], ['Post from 8/10', 'true'], ['Post from 8/10', 'false'],
    ])
    expect(panel().closest('li')).toBeNull()
  })

  test("a card's day with no post says 'No posts went live this day', and saves with the text alone", async () => {
    draw([QUIET({ note: 'Event', noteEditor: { approvedId: 'aid', approvedPostIds: [], draft: null } })], CONTROLS)
    fireEvent.click(within(cardOf('2026-08-14')).getByRole('button', { name: 'Edit note' }))
    expect(within(panel()).getByText('No posts went live this day')).toBeTruthy()
    expect(within(panel()).queryAllByRole('button', { name: /^Post from / })).toHaveLength(0)
    type('Event, updated')
    fireEvent.click(save())
    await waitFor(() => expect(actions.saveChartNoteAction).toHaveBeenCalledWith(expect.objectContaining({ day: '2026-08-14', postIds: [], body: 'Event, updated' })))
  })
})

// Phase 2c (my local QA, 2026-09-24). A save closed the panel and nothing said what happened; a second
// note on a day silently replaced the first, because each chart holds one note per day.
describe('after a save, one line says what happened; a day with a note loads it (Phase 2c)', () => {
  const open = () => fireEvent.click(screen.getByRole('button', { name: 'Add annotation' }))
  const panel = () => screen.getByRole('group', { name: 'Note' })
  const postButtons = () => within(panel()).getAllByRole('button', { name: /^Post from / })
  const save = () => within(panel()).getByRole('button', { name: 'Save draft' }) as HTMLButtonElement
  const type = (value: string) => fireEvent.change(within(panel()).getByLabelText('Note text'), { target: { value } })
  const text = () => (within(panel()).getByLabelText('Note text') as HTMLInputElement).value
  const status = () => screen.queryByRole('status')
  const WITH_DRAFT = { ...PEAK, noteEditor: { approvedId: null, approvedPostIds: [], draft: { id: 'd', text: 'Soon', postIds: [12] } } }
  const APPROVED_ONLY = QUIET({ date: '2026-08-20', label: '8/20', note: 'Event', noteEditor: { approvedId: 'a', approvedPostIds: [21], draft: null } })

  test('a new note: the panel closes and the line says a draft was saved, and how to approve it', async () => {
    draw([PEAK], CONTROLS)
    open(); fireEvent.click(postButtons()[0]); type('Went live'); fireEvent.click(save())
    await waitFor(() => expect(status()).toBeTruthy())
    expect(status()!.textContent).toBe("Saved a draft for 8/10. Clients see it once it's approved. Hover its dot to approve it.")
    expect(status()!.className).toContain('no-print')
    expect(screen.queryByRole('group', { name: 'Note' })).toBeNull()
    expect(refresh).toHaveBeenCalled()
  })

  test('an editor who cannot approve is not told to approve', async () => {
    draw([PEAK], { ...CONTROLS, canApprove: false })
    open(); fireEvent.click(postButtons()[0]); type('Went live'); fireEvent.click(save())
    await waitFor(() => expect(status()!.textContent).toBe("Saved a draft for 8/10. Clients see it once it's approved."))
  })

  test('a refused save shows no line', async () => {
    actions.saveChartNoteAction.mockResolvedValueOnce({ ok: false, error: 'Nope' } as never)
    draw([PEAK], CONTROLS)
    open(); fireEvent.click(postButtons()[0]); type('Went live'); fireEvent.click(save())
    await waitFor(() => expect(within(panel()).getByText('Nope')).toBeTruthy())
    expect(status()).toBeNull()
  })

  test('the line clears after 8 seconds, and when the panel is opened again', async () => {
    // Fake timers that also follow real time, so waitFor can poll. The clock starts with the save; the
    // checks sit well either side of 8s so a busy machine's drift cannot flip them.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      draw([PEAK], CONTROLS)
      open(); fireEvent.click(postButtons()[0]); type('Went live'); fireEvent.click(save())
      await waitFor(() => expect(status()).toBeTruthy())
      act(() => { vi.advanceTimersByTime(7000) })
      expect(status()).toBeTruthy()
      act(() => { vi.advanceTimersByTime(1500) })
      expect(status()).toBeNull()
      open(); fireEvent.click(postButtons()[0]); type('Again'); fireEvent.click(save())
      await waitFor(() => expect(status()).toBeTruthy())
      open()
      expect(status()).toBeNull()
      // Cancelling the reopened panel must not bring the old line back.
      fireEvent.click(within(panel()).getByRole('button', { name: 'Cancel' }))
      expect(status()).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  test('picking a post from a day with a draft loads that draft: its text and picks, then the new pick', () => {
    draw([WITH_DRAFT], CONTROLS)
    open(); fireEvent.click(postButtons()[0])
    expect(within(panel()).getByText('8/10 already has a draft. Saving updates it.')).toBeTruthy()
    expect(text()).toBe('Soon')
    expect(postButtons().slice(0, 3).map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'true', 'false'])
  })

  test('saving a loaded draft sends its picks with the new one, and the line says the draft was updated', async () => {
    draw([WITH_DRAFT], CONTROLS)
    open(); fireEvent.click(postButtons()[0]); fireEvent.click(save())
    await waitFor(() => expect(status()).toBeTruthy())
    expect(actions.saveChartNoteAction).toHaveBeenCalledWith(expect.objectContaining({ day: '2026-08-10', body: 'Soon', postIds: [12, 11] }))
    expect(status()!.textContent).toBe("Updated the draft for 8/10. Clients see it once it's approved. Hover its dot to approve it.")
  })

  test('a day with two picks already keeps them; the new pick is not added past 2', () => {
    draw([{ ...WITH_DRAFT, noteEditor: { ...WITH_DRAFT.noteEditor, draft: { id: 'd', text: 'Soon', postIds: [12, 13] } } }], CONTROLS)
    open(); fireEvent.click(postButtons()[0])
    expect(postButtons().slice(0, 3).map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'true'])
  })

  test('only an approved note: the notice says a save drafts a change; the approved note stays until approved', async () => {
    draw([APPROVED_ONLY], CONTROLS)
    open(); fireEvent.click(postButtons()[3])
    expect(within(panel()).getByText('8/20 already has an approved note. Saving drafts a change to it.')).toBeTruthy()
    expect(text()).toBe('Event')
    fireEvent.click(save())
    await waitFor(() => expect(status()).toBeTruthy())
    expect(status()!.textContent).toBe('Saved a draft for 8/20. Clients keep seeing the approved note until this one is approved. Hover its dot to approve it.')
  })

  test('text already typed is never replaced by the day\'s note', () => {
    draw([WITH_DRAFT], CONTROLS)
    open(); type('Mine'); fireEvent.click(postButtons()[0])
    expect(text()).toBe('Mine')
    expect(within(panel()).getByText('8/10 already has a draft. Saving updates it.')).toBeTruthy()
  })

  // Audit, 2026-09-25: the text the panel fills in belongs to its day. Moving to another day kept it,
  // so a save would have put one day's note on another (seen live: 8/22's note stayed on 8/19).
  test('moving to a day without a note drops the text the panel filled in', () => {
    draw([WITH_DRAFT], CONTROLS)
    open(); fireEvent.click(postButtons()[0])
    expect(text()).toBe('Soon')
    fireEvent.click(postButtons()[3])
    expect(text()).toBe('')
    expect(within(panel()).queryByText(/already has/)).toBeNull()
  })

  test('moving to another day keeps text the user wrote over the filled-in note', () => {
    draw([WITH_DRAFT], CONTROLS)
    open(); fireEvent.click(postButtons()[0]); type('Soon, and more')
    fireEvent.click(postButtons()[3])
    expect(text()).toBe('Soon, and more')
  })

  test("moving from one day with a note to another loads the second day's note", () => {
    draw([WITH_DRAFT, APPROVED_ONLY], CONTROLS)
    open(); fireEvent.click(postButtons()[0])
    expect(text()).toBe('Soon')
    fireEvent.click(postButtons()[3])
    expect(text()).toBe('Event')
    expect(within(panel()).getByText('8/20 already has an approved note. Saving drafts a change to it.')).toBeTruthy()
  })

  test('unpicking every post drops the filled-in text with the day', () => {
    draw([WITH_DRAFT], CONTROLS)
    open(); fireEvent.click(postButtons()[0])
    fireEvent.click(postButtons()[0]); fireEvent.click(postButtons()[1])
    expect(postButtons().map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'false', 'false'])
    expect(text()).toBe('')
  })

  // Paul's review of #273 (C4): with the posts failed to load, Edit said "No posts went live this day"
  // and saved the note without its picks.
  test("when the posts could not load, Edit keeps the note's picked posts and says so", async () => {
    const ed = { approvedId: 'aid', approvedPostIds: [11, 12], draft: null }
    draw([{ ...PEAK, note: 'Old', thumbs: [IMG(1), IMG(2)], noteEditor: ed }], { ...CONTROLS, days: [], postsFailed: true })
    fireEvent.click(within(cardOf(PEAK.date)).getByRole('button', { name: 'Edit note' }))
    expect(within(panel()).getByText('Posts could not load, so this note keeps its picked posts.')).toBeTruthy()
    expect(within(panel()).queryByText('No posts went live this day')).toBeNull()
    type('Old, fixed'); fireEvent.click(save())
    await waitFor(() => expect(actions.saveChartNoteAction).toHaveBeenCalledWith(expect.objectContaining({ body: 'Old, fixed', postIds: [11, 12] })))
  })

  // Paul's review of #273 (C11): the picker drew a raw image, so a purged Dash thumbnail showed a broken
  // image there while the card showed its placeholder. It now uses the card's own Picture.
  test("a post whose picture is gone shows the card's placeholder in the picker", () => {
    draw([PEAK], { ...CONTROLS, days: [{ day: '2026-08-10', posts: [{ id: 11, thumb: { creative: null, mediaType: 'IMAGE', url: null } }, { id: 12, thumb: IMG(2) }] }] })
    open()
    const [gone, ok] = postButtons()
    expect(within(gone).getByText('creative no longer available')).toBeTruthy()
    expect(ok.querySelector('img')!.getAttribute('src')).toBe('https://cdn.example.com/t2.jpg')
  })

  test('a picture that fails to load in the picker falls back to the placeholder', () => {
    draw([PEAK], CONTROLS)
    open()
    const first = postButtons()[0]
    fireEvent.error(first.querySelector('img')!)
    expect(within(first).getByText('creative no longer available')).toBeTruthy()
  })

  // Paul's review of #273 (C13): one pill style for every notes button, the card's also never printed.
  test("every button on a card and in the panel uses the one pill style", () => {
    draw([{ ...PEAK, note: 'Old', noteEditor: { approvedId: 'aid', approvedPostIds: [], draft: { id: 'd', text: 'New', postIds: [] } } }], CONTROLS, HIDES)
    const buttons = within(cardOf(PEAK.date)).getAllByRole('button')
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Hide from client', 'Edit note', 'Approve', 'Delete draft'])
    for (const b of buttons) expect(b.className).toBe(CARD_PILL)
    open()
    for (const name of ['Save draft', 'Cancel']) expect(within(panel()).getByRole('button', { name }).className).toBe(PILL)
  })

  test('a day without a note shows no notice and fills nothing', () => {
    draw([PEAK], CONTROLS)
    open(); fireEvent.click(postButtons()[0])
    expect(within(panel()).queryByText(/already has/)).toBeNull()
    expect(text()).toBe('')
  })

  test("Edit on a card's draft, saved, says the draft was updated", async () => {
    draw([WITH_DRAFT], CONTROLS)
    fireEvent.click(within(cardOf(PEAK.date)).getByRole('button', { name: 'Edit note' }))
    // Edit is already that day's note, so the Add panel's notice is not repeated here.
    expect(within(panel()).queryByText(/already has/)).toBeNull()
    type('Sooner'); fireEvent.click(save())
    await waitFor(() => expect(status()!.textContent).toBe("Updated the draft for 8/10. Clients see it once it's approved. Hover its dot to approve it."))
  })
})
