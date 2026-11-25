// Notes on the Social Listening line graphs (plan docs/superpowers/plans/2026-11-24-social-listening-feedback.md, Unit E;
// spec F6). Made-up ids, days and text only (the repo is public).
import { describe, expect, test } from 'vitest'
import { buildSlChartNotes, checkSlNoteInput, isSlNoteChart, SL_NOTES_CHANNEL, slNoteEarliest } from './notes'

const OK = { channel: SL_NOTES_CHANNEL, chart: 'sl-b-daily', day: '2026-10-14', body: '  AMA went live  ', postIds: [] }
const TODAY = '2026-11-25'

describe('checkSlNoteInput', () => {
  test('a day note on a Results over time graph and a month note on a year to date graph pass', () => {
    expect(checkSlNoteInput(OK, TODAY)).toEqual({ ok: true })
    expect(checkSlNoteInput({ ...OK, chart: 'sl-i-daily' }, TODAY)).toEqual({ ok: true })
    for (const chart of ['sl-b-ytd', 'sl-b-posneu', 'sl-b-reddit']) expect(checkSlNoteInput({ ...OK, chart, day: '2026-10-01' }, TODAY)).toEqual({ ok: true })
  })

  test.each([
    ['a Dash channel', { ...OK, channel: 'INSTAGRAM' }, 'invalid channel'],
    ['a Dash chart under Social Listening', { ...OK, chart: 'followers' }, 'invalid chart'],
    ['a YTD Review chart under Social Listening', { ...OK, chart: 'ytd-followers', day: '2026-10-01' }, 'invalid chart'],
    ['an unknown chart', { ...OK, chart: 'sl-b-media' }, 'invalid chart'],
    ['a day that is not a day', { ...OK, day: '2026-02-30' }, 'invalid day'],
    ['a month note not on the 1st', { ...OK, chart: 'sl-b-ytd', day: '2026-10-14' }, 'invalid day'],
    ['a day after today', { ...OK, day: '2026-11-26' }, 'That day has not happened yet.'],
    ['an empty note', { ...OK, body: '   ' }, 'A note is 1 to 80 characters.'],
    ['a note over 80 characters', { ...OK, body: 'x'.repeat(81) }, 'A note is 1 to 80 characters.'],
    ['a note with a line break', { ...OK, body: 'one\ntwo' }, 'A note is one line of plain text.'],
    ['a note with picked posts', { ...OK, postIds: [11] }, 'A note on a Social Listening graph has no posts.'],
    ['post ids that are not a list', { ...OK, postIds: 'x' }, 'A note on a Social Listening graph has no posts.'],
    ['a body that is not text', { ...OK, body: 5 }, 'invalid note'],
  ])('refuses %s', (_name, input, error) => {
    expect(checkSlNoteInput(input as never, TODAY)).toEqual({ ok: false, error })
  })

  test('80 characters counted as characters, so an emoji counts once', () => {
    expect(checkSlNoteInput({ ...OK, body: '🙂'.repeat(80) }, TODAY)).toEqual({ ok: true })
  })
})

describe('isSlNoteChart', () => {
  test('the five Social Listening graphs and nothing else', () => {
    expect(['sl-b-daily', 'sl-i-daily', 'sl-b-ytd', 'sl-b-posneu', 'sl-b-reddit'].every(isSlNoteChart)).toBe(true)
    expect(['followers', 'engagements', 'ytd-followers', 'ytd-views', 'b-ytd', 5, null].some(isSlNoteChart)).toBe(false)
  })
})

describe('slNoteEarliest', () => {
  test('a day graph starts at the first reporting month; a year to date graph at January of that year', () => {
    expect(slNoteEarliest('sl-b-daily', '2026-08')).toBe('2026-08-01')
    expect(slNoteEarliest('sl-i-daily', '2026-08')).toBe('2026-08-01')
    expect(slNoteEarliest('sl-b-ytd', '2026-08')).toBe('2026-01-01')
    expect(slNoteEarliest('sl-b-reddit', '2026-08')).toBe('2026-01-01')
  })
})

const at = (iso: string) => new Date(iso)
type Row = Parameters<typeof buildSlChartNotes>[0][number]
const row = (over: Partial<Row>): Row => ({
  id: 'n0', chart: 'sl-b-daily', day: '2026-10-14', body: 'AMA went live', postIds: [], status: 'approved',
  approvedAt: at('2026-11-02T10:00:00Z'), updatedAt: at('2026-11-02T10:00:00Z'), deletedAt: null, ...over,
})
const DAYS = ['2026-10-01', '2026-10-02', '2026-10-14', '2026-10-31']
const NONE = { canEdit: false, canApprove: false }
const EDITOR = { canEdit: true, canApprove: true }

describe('buildSlChartNotes', () => {
  test('no notes: no marks, no rows, no controls for a client', () => {
    expect(buildSlChartNotes([], { chart: 'sl-b-daily', keys: DAYS, caps: NONE, clientSlug: 'a-client', today: TODAY })).toEqual({ marks: [], panel: [] })
  })

  test('approved notes on drawn days become numbered marks in day order; drafts never reach a client', () => {
    const rows = [
      row({ id: 'n2', day: '2026-10-31', body: 'Press release' }),
      row({ id: 'n1', day: '2026-10-02', body: 'Launch' }),
      row({ id: 'd1', day: '2026-10-14', body: 'Draft only', status: 'draft', approvedAt: null }),
    ]
    const n = buildSlChartNotes(rows, { chart: 'sl-b-daily', keys: DAYS, caps: NONE, clientSlug: 'a-client', today: TODAY })
    expect(n.marks).toEqual([
      { at: '2026-10-02', n: 1, label: 'Oct 2', text: 'Launch' },
      { at: '2026-10-31', n: 2, label: 'Oct 31', text: 'Press release' },
    ])
    expect(n.panel).toEqual([])
    expect(n.controls).toBeUndefined()
    expect(JSON.stringify(n)).not.toContain('Draft only')
  })

  test('a note on another chart, a deleted note, or a day the graph does not draw is left out', () => {
    const rows = [
      row({ id: 'a', chart: 'sl-i-daily' }),
      row({ id: 'b', deletedAt: at('2026-11-03T00:00:00Z'), status: 'draft', approvedAt: null }),
      row({ id: 'c', day: '2026-09-30' }),
    ]
    expect(buildSlChartNotes(rows, { chart: 'sl-b-daily', keys: DAYS, caps: NONE, clientSlug: 'a-client', today: TODAY }).marks).toEqual([])
  })

  test('a month graph reads the note on its 1st and keys it by month', () => {
    const rows = [row({ chart: 'sl-b-ytd', day: '2026-10-01', body: 'AMA month' }), row({ id: 'x', chart: 'sl-b-ytd', day: '2026-09-15' })]
    const n = buildSlChartNotes(rows, { chart: 'sl-b-ytd', keys: ['2026-08', '2026-09', '2026-10'], caps: NONE, clientSlug: 'a-client', today: TODAY })
    expect(n.marks).toEqual([{ at: '2026-10', n: 1, label: 'Oct', text: 'AMA month' }])
  })

  test('an editor gets every noted day with its draft and ids, the number of its mark, and the controls', () => {
    const rows = [
      row({ id: 'n1', day: '2026-10-02', body: 'Launch' }),
      row({ id: 'd1', day: '2026-10-14', body: 'Draft only', status: 'draft', approvedAt: null }),
    ]
    const n = buildSlChartNotes(rows, { chart: 'sl-b-daily', keys: DAYS, caps: EDITOR, clientSlug: 'a-client', today: TODAY })
    expect(n.panel).toEqual([
      { key: '2026-10-02', label: 'Oct 2', n: 1, text: 'Launch', editor: { approvedId: 'n1', approvedPostIds: [], draft: null } },
      { key: '2026-10-14', label: 'Oct 14', n: null, text: null, editor: { approvedId: null, approvedPostIds: [], draft: { id: 'd1', text: 'Draft only', postIds: [] } } },
    ])
    expect(n.controls).toEqual({
      clientSlug: 'a-client', chart: 'sl-b-daily', canApprove: true,
      options: DAYS.map((d) => ({ key: d, label: `Oct ${Number(d.slice(8))}` })),
    })
  })

  test("the editor's options stop at today, so the form never offers a day the action refuses", () => {
    const n = buildSlChartNotes([], { chart: 'sl-b-daily', keys: ['2026-11-24', '2026-11-25', '2026-11-26'], caps: EDITOR, clientSlug: 'a-client', today: TODAY })
    expect(n.controls!.options.map((o) => o.key)).toEqual(['2026-11-24', '2026-11-25'])
    const m = buildSlChartNotes([], { chart: 'sl-b-ytd', keys: ['2026-11', '2026-12'], caps: EDITOR, clientSlug: 'a-client', today: TODAY })
    expect(m.controls!.options.map((o) => o.key)).toEqual(['2026-11'])
  })
})
