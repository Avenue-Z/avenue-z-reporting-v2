// The Insights and Recommendations boxes on the design kit (plan docs/superpowers/plans/2026-11-23-os-design-phase1.md,
// Task 11). CommentaryPanel is shared by every report with commentary, so without `look` it must render exactly as today:
// the snapshots below were recorded from the code before this change, for an approver (with and without the history
// open), an editor, a client and the PDF, on formatted entries (a list, a link, bold, a heading).
import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { RECOMMENDATIONS_LABELS } from '@/lib/commentary/labels'
import { CommentaryPanel } from './commentary-panel'
import { ExportModeProvider } from '@/components/export/export-mode'
import type { CommentaryCapabilities, CommentaryEntry, CommentaryPeriodHistory } from '@/lib/commentary/types'
import { expectSameValues, visibleValues } from '@/components/report-sections/organic-social/parts/version-parity'
import kit from '@/components/report-sections/organic-social/design/kit.module.css'
import bx from './commentary-kit.module.css'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

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
// Nothing written yet: the empty box an editor sees (round 3, Task 8 changes it under the kit only).
const EMPTY: Who = { caps: { canEdit: true, canApprove: true }, entries: [], history: [], initialId: null as unknown as string, clientEntryId: null }
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
    ['an editor with nothing written yet (recorded before round 3)', () => draw(panel(EMPTY))],
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
    // Round 3, Task 6: line height normal, as the artifact (the class only Organic Social's kit wrappers carry).
    expect(box.classList.contains(kit.tight)).toBe(true)
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

// Round 3, Task 8 (plan docs/superpowers/plans/2026-11-24-os-design-round3.md), an addition beyond round 2's approved
// scope: on the kit, a box with nothing written is only the artifact's dashed "+ Add" button (the same one Social
// Listening's empty box draws, kit.module.css .addAnalysis). A client never gets it: the server returns nothing for a
// client with nothing approved (index.tsx, monthly.tsx). Without the look the box is the snapshot recorded above.
describe('with look="kit", a box with nothing written is only the dashed add button', () => {
  const buttons = (c: HTMLElement) => [...c.querySelectorAll('button')]
  test('an editor sees one dashed "+ Add insights" button, in the kit\'s colours, and nothing else', () => {
    const c = draw(panel(EMPTY, { look: 'kit' }))
    expect(buttons(c).map((b) => [b.textContent, b.className])).toEqual([['+ Add insights', `${kit.tbtn} ${kit.addAnalysis}`]])
    expect(c.textContent).toBe('+ Add insights')
    const wrap = c.firstElementChild!
    expect(wrap.className).toBe(`mb-10 ${kit.root} ${kit.tight}`) // 40px below (the last look fixes, L2)
    expect(c.querySelector('section')).toBeNull()
  })
  test('the Recommendations box says its own words', () => {
    const c = draw(panel(EMPTY, { look: 'kit', labels: RECOMMENDATIONS_LABELS }))
    expect(buttons(c).map((b) => b.textContent)).toEqual(['+ Add recommendations'])
  })
  test('clicking it opens the editor exactly as Add does today', () => {
    const kitted = draw(panel(EMPTY, { look: 'kit' }))
    fireEvent.click(buttons(kitted)[0])
    const old = draw(panel(EMPTY))
    fireEvent.click(buttons(old).find((b) => b.textContent?.trim() === 'Add insights')!)
    expect(kitted.querySelector('section')!.textContent).toContain('Cancel')
    expectSameValues(old, kitted)
  })
  test('with history to open, an approver keeps the full panel', () => {
    const c = draw(panel({ ...EMPTY, history: HISTORY }, { look: 'kit' }))
    expect(c.querySelector('section')).not.toBeNull()
    expect(buttons(c).some((b) => b.textContent?.includes('History ('))).toBe(true)
  })
  test('an editor who cannot approve never sees history, so gets the dashed button', () => {
    const c = draw(panel({ ...EMPTY, caps: { canEdit: true, canApprove: false }, history: HISTORY }, { look: 'kit' }))
    expect(buttons(c).map((b) => b.textContent)).toEqual(['+ Add insights'])
  })
  test('with an entry written, the kit box is the full panel, as before', () => {
    expect(draw(panel(EDITOR, { look: 'kit' })).querySelector('section')).not.toBeNull()
  })
})

// The last look fixes, L4 (spec docs/superpowers/specs/2026-11-26-os-final-look.md): the team's box takes the artifact's
// staff frame (index.html:217, the kit's .comm at kit.module.css:166); a client, a preview and the PDF keep the neutral
// client frame (index.html:226-227), as Social Listening already does (social-listening/analysis.tsx:110).
describe('with look="kit", the staff frame', () => {
  const box = (c: Element) => c.querySelector('section')!
  test('an editor (approver or not) gets the staff frame', () => {
    for (const who of [APPROVER, EDITOR]) expect(box(draw(panel(who, { look: 'kit' }))).classList.contains(bx.boxStaff)).toBe(true)
  })
  test('a client and the PDF get the neutral frame only', () => {
    expect(box(draw(panel(CLIENT, { look: 'kit' }))).classList.contains(bx.boxStaff)).toBe(false)
    expect(box(draw(panel(APPROVER, { look: 'kit' }), true)).classList.contains(bx.boxStaff)).toBe(false)
    expect(box(draw(panel(APPROVER, { look: 'kit' }), true)).classList.contains(bx.box)).toBe(true)
  })
  test('the staff frame is the artifact\'s yellow border and fill, on top of the neutral box', () => {
    const css = readFileSync(join(__dirname, 'commentary-kit.module.css'), 'utf8')
    expect(css).toMatch(/\.box\.boxStaff\s*\{\s*border-color:\s*rgba\(255,\s*252,\s*96,\s*0\.22\);\s*background:\s*rgba\(255,\s*252,\s*96,\s*0\.035\);\s*\}/)
  })
})

// L2: on the kit a box sits 40px above the next block (the artifact's section gap, index.html:115); the old look keeps
// mb-8 (pinned in "without look").
describe('with look="kit", 40px below the box', () => {
  test('the full box and the empty dashed button each carry mb-10, never mb-8', () => {
    const full = draw(panel(APPROVER, { look: 'kit' })).querySelector('section')!
    expect(full.classList.contains('mb-10')).toBe(true)
    expect(full.classList.contains('mb-8')).toBe(false)
    const empty = draw(panel(EMPTY, { look: 'kit' })).firstElementChild!
    expect(empty.classList.contains('mb-10')).toBe(true)
    expect(empty.classList.contains('mb-8')).toBe(false)
  })
})
