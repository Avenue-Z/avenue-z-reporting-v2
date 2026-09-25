import { beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

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
    expect(within(card).getByRole('button', { name: 'Revoke' })).toBeTruthy()
    expect(within(card).getByRole('button', { name: 'Delete draft' })).toBeTruthy()
    approver.unmount()

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
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Hide from client', 'Edit note', 'Approve', 'Revoke', 'Delete draft'])
    const row = buttons[0].parentElement!
    expect(buttons.every((b) => b.parentElement === row)).toBe(true)
    expect(row.tagName).not.toBe('LI')
    expect(row.className).toContain('basis-full')
    expect(row.className).toContain('no-print')
    expect(screen.getByText('Draft: Went live Tuesday').className).not.toContain('line-clamp')
  })

  test('on a card, the same row, and the draft line is cut to one line (the form shows it whole)', () => {
    draw([{ ...PEAK, note: 'Old', noteEditor: ED }], CONTROLS, HIDES)
    const card = cardOf(PEAK.date)
    const buttons = [...card.querySelectorAll('button')]
    expect(buttons).toHaveLength(5)
    const row = buttons[0].parentElement!
    expect(buttons.every((b) => b.parentElement === row)).toBe(true)
    expect(row.className).toContain('basis-full')
    expect(within(card).getByText('Draft: Went live Tuesday').className).toContain('line-clamp-1')
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

  test('the pictures sit in one row that scrolls sideways when a month has many posts', () => {
    draw([PEAK], CONTROLS)
    open()
    expect(postButtons()[0].parentElement!.className).toContain('overflow-x-auto')
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
