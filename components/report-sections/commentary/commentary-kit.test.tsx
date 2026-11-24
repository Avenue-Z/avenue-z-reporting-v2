// The Insights and Recommendations boxes on the design kit (plan docs/superpowers/plans/2026-11-23-os-design-phase1.md,
// Task 11). CommentaryPanel is shared by every report with commentary, so without `look` it must render exactly as today:
// the snapshots below were recorded from the code before this change, for an approver (with and without the history
// open), an editor, a client and the PDF, on formatted entries (a list, a link, bold, a heading).
import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { CommentaryPanel } from './commentary-panel'
import { ExportModeProvider } from '@/components/export/export-mode'
import type { CommentaryCapabilities, CommentaryEntry, CommentaryPeriodHistory } from '@/lib/commentary/types'
import { expectSameValues, visibleValues } from '@/components/report-sections/organic-social/parts/version-parity'
import kit from '@/components/report-sections/organic-social/design/kit.module.css'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }))
vi.mock('@/app/actions/commentary', () => ({ approveCommentary: vi.fn(), revokeCommentary: vi.fn(), saveCommentary: vi.fn(), deleteCommentaryDraft: vi.fn() }))

// Made-up entries only, formatted as the live Organic Social entries are (all 69 use formatting, spec section 5).
const entry = (over: Partial<CommentaryEntry>): CommentaryEntry => ({
  id: 'e1', viewKey: 'organic-social:instagram', periodStart: '2026-10-01', periodEnd: '2026-10-31', status: 'approved',
  bodyHtml: '<h3>Highlights</h3><p>Reach grew <strong>18%</strong> on the back of two Reels.</p><ul><li>Saves doubled</li><li>Shares held</li></ul><p>See <a href="https://example.com/post">the top post</a>.</p>',
  updatedBy: 'writer@avenuez.com', updatedAt: '2026-11-03T15:00:00.000Z', approvedBy: 'approver@avenuez.com', approvedAt: '2026-11-04T16:30:00.000Z',
  deletedAt: null, deletedBy: null, ...over,
})
const APPROVED = entry({})
const DRAFT = entry({ id: 'e2', status: 'draft', approvedBy: null, approvedAt: null, updatedAt: '2026-11-10T09:00:00.000Z', bodyHtml: '<p>Draft: <em>Stories</em> slowed; <a href="https://example.com/s">details</a>.</p><ol><li>One</li><li>Two</li></ol>' })
const HISTORY: CommentaryPeriodHistory[] = [{
  periodStart: '2026-10-01', periodEnd: '2026-10-31',
  versions: [
    { entry: APPROVED, tag: 'live' },
    { entry: entry({ id: 'e0', bodyHtml: '<p>An older version.</p>', approvedAt: '2026-11-01T10:00:00.000Z' }), tag: 'superseded' },
    { entry: entry({ id: 'e9', status: 'draft', bodyHtml: '<p>Thrown away.</p>', deletedAt: '2026-11-02T10:00:00.000Z', deletedBy: 'writer@avenuez.com' }), tag: 'deleted' },
  ],
}]

type Who = { caps: CommentaryCapabilities; entries: CommentaryEntry[]; history: CommentaryPeriodHistory[]; initialId: string; clientEntryId: string | null }
const APPROVER: Who = { caps: { canEdit: true, canApprove: true }, entries: [DRAFT, APPROVED], history: HISTORY, initialId: DRAFT.id, clientEntryId: APPROVED.id }
const EDITOR: Who = { caps: { canEdit: true, canApprove: false }, entries: [DRAFT, APPROVED], history: [], initialId: DRAFT.id, clientEntryId: APPROVED.id }
const CLIENT: Who = { caps: { canEdit: false, canApprove: false }, entries: [APPROVED], history: [], initialId: APPROVED.id, clientEntryId: APPROVED.id }

export function panel(who: Who, extra: Record<string, unknown> = {}): ReactNode {
  return (
    <CommentaryPanel clientSlug="acme" viewKey="organic-social:instagram" entries={who.entries} initialId={who.initialId}
      clientEntryId={who.clientEntryId} capabilities={who.caps} history={who.history}
      entryNotes={{ [APPROVED.id]: 'Client sees from Nov 12' }} {...extra} />
  )
}
/** The panel's timestamps ("Nov 10, 2026, 9:00 AM", commentary-panel.tsx fmtDateTime) are formatted in the machine's own
 *  time zone, so a snapshot recorded in New York failed in CI's UTC. Everything else is compared byte for byte; each
 *  timestamp becomes one placeholder (the space before AM/PM may be a narrow no-break space in newer ICU). */
const clockFree = (html: string) => html.replace(/[A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2}[\s\u202f][AP]M/g, '<datetime>')
const draw = (node: ReactNode, exporting = false) => render(exporting ? <ExportModeProvider>{node}</ExportModeProvider> : <>{node}</>).container
const openHistory = (c: HTMLElement) => { const b = [...c.querySelectorAll('button')].find((x) => x.textContent?.startsWith('History')); if (b) fireEvent.click(b); return c }

describe('without look, the panel is exactly as before', () => {
  test.each([
    ['an approver, editor closed', () => draw(panel(APPROVER))],
    ['an approver, history open', () => openHistory(draw(panel(APPROVER)))],
    ['an editor who is not an approver', () => draw(panel(EDITOR))],
    ['a client', () => draw(panel(CLIENT))],
    ['the PDF export', () => draw(panel(APPROVER), true)],
  ])('%s', (_name, make) => {
    expect(clockFree(make().innerHTML)).toMatchSnapshot()
  })
})

describe('with look="kit", the panel reads and behaves exactly as before, on the kit', () => {
  const VIEWS = [
    ['an approver, editor closed', (look?: Record<string, unknown>) => draw(panel(APPROVER, look))],
    ['an approver, history open', (look?: Record<string, unknown>) => openHistory(draw(panel(APPROVER, look)))],
    ['an editor who is not an approver', (look?: Record<string, unknown>) => draw(panel(EDITOR, look))],
    ['a client', (look?: Record<string, unknown>) => draw(panel(CLIENT, look))],
    ['the PDF export', (look?: Record<string, unknown>) => draw(panel(APPROVER, look), true)],
  ] as const
  test.each(VIEWS)('%s', (_name, make) => {
    const old = make()
    const kitted = make({ look: 'kit' })
    expectSameValues(old, kitted)
    // The kit really drew: its colours on the box, the formatted body in the kit's body style, no old frame left.
    const box = kitted.querySelector('section')!
    expect(box.classList.contains(kit.root)).toBe(true)
    expect(kitted.querySelector(`.${kit.commBody}`)).not.toBeNull()
    expect(kitted.querySelector('section.rounded-lg.border')).toBeNull()
  })
  test('the buttons are the kit\'s and still do what they did: Approve approves, Edit opens the editor, the title collapses', async () => {
    const { approveCommentary } = await import('@/app/actions/commentary')
    const c = draw(panel(APPROVER, { look: 'kit' }))
    const button = (text: string) => [...c.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!
    for (const text of ['Add insights', 'Edit', 'Approve', 'Delete draft']) expect(button(text)?.classList.contains(kit.tbtn), text).toBe(true)
    fireEvent.click(button('Approve'))
    await new Promise((r) => setTimeout(r, 0))
    expect(approveCommentary).toHaveBeenCalledWith('acme', DRAFT.id)
    fireEvent.click(button('Edit'))
    expect(c.querySelector('section')!.textContent).toContain('Cancel')
    const titleOf = (x: HTMLElement) => [...x.querySelectorAll('button')].find((b) => b.textContent?.includes('Insights'))!
    const collapsed = draw(panel(CLIENT, { look: 'kit' }))
    fireEvent.click(titleOf(collapsed))
    const oldCollapsed = draw(panel(CLIENT))
    fireEvent.click(titleOf(oldCollapsed))
    expect(visibleValues(collapsed)).toEqual(visibleValues(oldCollapsed))
    expect(collapsed.querySelector(`.${kit.commBody}`)).toBeNull()
  })
  test('the badges are the kit\'s: approved green, draft the kit\'s draft tag, the client note the kit\'s note tag', () => {
    const approver = draw(panel({ ...APPROVER, initialId: APPROVED.id }, { look: 'kit' }))
    expect(approver.querySelector(`.${kit.approved}`)?.textContent).toBe('Approved')
    expect(approver.querySelector(`.${kit.edited}`)?.textContent).toBe('Client sees from Nov 12')
    expect(draw(panel(APPROVER, { look: 'kit' })).querySelector(`.${kit.whoTag}`)?.textContent).toBe('Draft')
  })
})
